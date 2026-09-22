#!/usr/bin/env python3
"""
experiments/interview-ebpf-sockops/sim.py

Deterministic simulation suite for:
1. Iptables O(N) rule scan vs eBPF BPF Hash Map O(1) service lookup.
2. Kernel Network Path comparison:
   - Path A: kube-proxy iptables + veth + netfilter (full 12-layer stack)
   - Path B: eBPF connect-time DNAT (sock_addr)
   - Path C: eBPF sockops + sk_msg socket-to-socket bypass
3. SOCKHASH lifecycle state machine (3-way handshake to FIN/RST teardown).
"""

import time
import math
from typing import Dict, List, Tuple, Optional

# ==============================================================================
# 1. Service Lookup Complexity Simulator
# ==============================================================================

class IptablesEngine:
    def __init__(self, num_services: int):
        self.num_services = num_services
        # Rules sequentially checked in KUBE-SERVICES chain
        self.rules = [f"svc_{i}.cluster.local" for i in range(num_services)]

    def lookup(self, svc_name: str) -> Tuple[int, float]:
        """Returns (rule_checks_count, relative_time_us)."""
        checks = 0
        for r in self.rules:
            checks += 1
            if r == svc_name:
                break
        # Each iptables rule check takes ~0.08 microseconds of CPU time
        time_us = checks * 0.08
        return checks, time_us


class EBPFServiceMap:
    def __init__(self, num_services: int):
        self.bpf_map = {f"svc_{i}.cluster.local": f"10.244.{i//256}.{i%256}" for i in range(num_services)}

    def lookup(self, svc_name: str) -> Tuple[int, float]:
        """Bpf hash map lookup: O(1) bucket probe."""
        # Single BPF map lookup takes ~0.05 us constant time
        found = svc_name in self.bpf_map
        return 1, 0.05


# ==============================================================================
# 2. Kernel Network Stack Path Profiler
# ==============================================================================

STACK_LAYERS = {
    "syscall_send": 10,
    "tcp_sendmsg": 45,
    "tcp_push_one": 35,
    "ip_queue_xmit": 25,
    "netfilter_prerouting_conntrack": 80,
    "iptables_dnat_eval": 120,
    "ip_route_output": 30,
    "veth_xmit_driver": 50,
    "linux_bridge_forward": 40,
    "veth_rcv_driver": 50,
    "netfilter_postrouting": 60,
    "ip_local_deliver": 25,
    "tcp_v4_rcv": 45,
    "sk_receive_queue_enqueue": 15,
    "bpf_sockops_redirect": 20,
}

def profile_path_a_kube_proxy() -> int:
    """Path A: Full Linux stack with iptables DNAT and conntrack."""
    layers = [
        "syscall_send", "tcp_sendmsg", "tcp_push_one", "ip_queue_xmit",
        "netfilter_prerouting_conntrack", "iptables_dnat_eval", "ip_route_output",
        "veth_xmit_driver", "linux_bridge_forward", "veth_rcv_driver",
        "netfilter_postrouting", "ip_local_deliver", "tcp_v4_rcv", "sk_receive_queue_enqueue"
    ]
    return sum(STACK_LAYERS[l] for l in layers)

def profile_path_b_ebpf_connect_dnat() -> int:
    """Path B: eBPF connect-time translation (skips netfilter DNAT & conntrack)."""
    layers = [
        "syscall_send", "tcp_sendmsg", "tcp_push_one", "ip_queue_xmit",
        "ip_route_output", "veth_xmit_driver", "linux_bridge_forward",
        "veth_rcv_driver", "ip_local_deliver", "tcp_v4_rcv", "sk_receive_queue_enqueue"
    ]
    return sum(STACK_LAYERS[l] for l in layers)

def profile_path_c_sockops_sk_msg() -> int:
    """Path C: sockops + sk_msg socket direct bypass."""
    layers = [
        "syscall_send", "bpf_sockops_redirect", "sk_receive_queue_enqueue"
    ]
    return sum(STACK_LAYERS[l] for l in layers)


# ==============================================================================
# 3. SOCKHASH State Machine
# ==============================================================================

class SocketHashEngine:
    def __init__(self):
        # Maps 4-tuple (src_ip, src_port, dst_ip, dst_port) -> socket descriptor
        self.sock_hash: Dict[Tuple[str, int, str, int], str] = {}
        self.redirected_messages: int = 0

    def on_tcp_established(self, quad: Tuple[str, int, str, int], sock_desc: str):
        """Hooked on BPF_SOCK_OPS_ACTIVE_ESTABLISHED_CB & PASSIVE_ESTABLISHED_CB."""
        self.sock_hash[quad] = sock_desc

    def on_sendmsg(self, quad: Tuple[str, int, str, int], msg_payload: bytes) -> bool:
        """sk_msg hook calling bpf_msg_redirect_hash()."""
        # Look for reverse 4-tuple to find the receiving socket
        reverse_quad = (quad[2], quad[3], quad[0], quad[1])
        if reverse_quad in self.sock_hash:
            self.redirected_messages += 1
            return True  # Directly injected into peer socket receive queue
        return False  # Falls back to regular TCP/IP stack

    def on_tcp_close(self, quad: Tuple[str, int, str, int]):
        """Hooked on TCP FIN/RST to prevent dangling pointers."""
        self.sock_hash.pop(quad, None)


# ==============================================================================
# Test Suite
# ==============================================================================

def run_tests():
    print("=== [Test 1: Iptables Linear Scan vs eBPF Hash Map O(1)] ===")
    service_scale = [100, 1000, 5000, 10000]
    for n in service_scale:
        iptables = IptablesEngine(n)
        ebpf = EBPFServiceMap(n)

        # Lookup last service (worst-case lookup)
        target = f"svc_{n-1}.cluster.local"
        checks_ipt, time_ipt = iptables.lookup(target)
        checks_bpf, time_bpf = ebpf.lookup(target)

        print(f"Scale: {n:5d} Services | iptables: {checks_ipt:5d} checks, {time_ipt:7.2f} us | eBPF: {checks_bpf} check, {time_bpf:.2f} us (Speedup: {time_ipt/time_bpf:6.1f}x)")
        assert checks_bpf == 1, "eBPF lookup must be O(1)"

    assert time_ipt > 50.0, "Large iptables scale must exhibit high latency"
    print("✓ Test 1 Passed: eBPF maintains strict O(1) lookup regardless of cluster scale.\n")

    print("=== [Test 2: Kernel Network Path Traversal Cost] ===")
    cost_a = profile_path_a_kube_proxy()
    cost_b = profile_path_b_ebpf_connect_dnat()
    cost_c = profile_path_c_sockops_sk_msg()

    reduction_b = (1.0 - cost_b / cost_a) * 100
    reduction_c = (1.0 - cost_c / cost_a) * 100

    print(f"Path A (kube-proxy iptables):       {cost_a} instruction cost units (100%)")
    print(f"Path B (eBPF connect-time DNAT):    {cost_b} instruction cost units (saved {reduction_b:.1f}%)")
    print(f"Path C (eBPF sockops + sk_msg):     {cost_c} instruction cost units (saved {reduction_c:.1f}%)")

    assert cost_c < cost_b < cost_a, "Path C must be faster than Path B and Path A"
    assert reduction_c > 85.0, f"Path C should save > 85% instructions, got {reduction_c:.1f}%"
    print("✓ Test 2 Passed: Socket-level bypass eliminates over 85% of kernel stack layers.\n")

    print("=== [Test 3: SOCKHASH Lifecycle State Machine] ===")
    engine = SocketHashEngine()
    client_quad = ("10.244.1.2", 45678, "10.244.1.3", 8080)
    server_quad = ("10.244.1.3", 8080, "10.244.1.2", 45678)

    # 1. Handshake establishes
    engine.on_tcp_established(client_quad, "sock_client_fd")
    engine.on_tcp_established(server_quad, "sock_server_fd")
    assert len(engine.sock_hash) == 2

    # 2. Data transmission via sk_msg
    delivered = engine.on_sendmsg(client_quad, b"GET /metrics HTTP/1.1\r\n")
    assert delivered is True, "Message should be directly redirected via SOCKHASH"
    assert engine.redirected_messages == 1

    # 3. Connection teardown (FIN)
    engine.on_tcp_close(client_quad)
    assert client_quad not in engine.sock_hash
    # Further message fails redirect and falls back to normal stack
    delivered_after = engine.on_sendmsg(server_quad, b"HTTP/1.1 200 OK\r\n")
    assert delivered_after is False, "Should fall back after peer socket is closed"
    print("✓ Test 3 Passed: SOCKHASH correctly manages connection lifecycle and avoids dangling redirects.\n")

    print("ALL TESTS PASSED SUCCESSFULLY.")

if __name__ == "__main__":
    run_tests()
