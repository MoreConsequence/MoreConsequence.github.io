#!/usr/bin/env python3
"""Lock-free CAS: ABA problem demonstration with version counter fix."""

import threading
import time


class SimulatedCAS:
    """Simulated CAS register with ABA vulnerability."""

    def __init__(self):
        self.value = "A"
        self.version = 0
        self._lock = threading.Lock()

    def cas(self, expected_value, new_value):
        with self._lock:
            if self.value == expected_value:
                self.value = new_value
                self.version += 1
                return True
            return False


class VersionedCAS:
    """CAS with version counter: ABA-proof."""

    def __init__(self):
        self.value = "A"
        self.version = 0
        self._lock = threading.Lock()

    def cas(self, expected_value, expected_version, new_value):
        with self._lock:
            if self.value == expected_value and self.version == expected_version:
                self.value = new_value
                self.version = expected_version + 1
                return True
            return False


def demonstrate_aba():
    print("=== ABA Problem Demo ===")
    cas = SimulatedCAS()

    # Thread 1: read A, prepare to CAS A→B
    # Thread 2: A→B→A (ABA)
    results = []

    def thread1():
        time.sleep(0.01)  # let thread 2 execute ABA first
        ok = cas.cas("A", "B")  # CAS passes because value is A again
        results.append(("thread1", ok, cas.value, cas.version))

    def thread2():
        cas.cas("A", "B")  # A → B
        time.sleep(0.005)
        cas.cas("B", "A")  # B → A (ABA complete)

    t1 = threading.Thread(target=thread1)
    t2 = threading.Thread(target=thread2)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    ok, value, version = results[0][1], results[0][2], results[0][3]
    print(f"  CAS passed: {ok}")
    print(f"  Current value: {value}, version: {version}")
    print(f"  Bug: CAS passed but state changed (version went from 0 to {version})")
    assert ok == True, "ABA: CAS should pass (this IS the bug)"
    print("  ✓ ABA confirmed: CAS checked value but not version")


def demonstrate_version_fix():
    print("\n=== Version Counter Fix ===")
    cas = VersionedCAS()

    results = []

    def thread1():
        time.sleep(0.01)
        # With versioned CAS, we need to know the version we read
        # In real code, this would be: old = atomic_load(); cas(old.value, old.version, new_value)
        # Here we simulate reading stale version 0
        ok = cas.cas("A", 0, "B")  # version 0 expected, but actual is 2
        results.append(("thread1", ok))

    def thread2():
        cas.cas("A", 0, "B")  # version 0→1
        time.sleep(0.005)
        cas.cas("B", 1, "A")  # version 1→2 (ABA)

    t1 = threading.Thread(target=thread1)
    t2 = threading.Thread(target=thread2)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    ok = results[0][1]
    print(f"  CAS passed: {ok}")
    print(f"  Current version: {cas.version}")
    print(f"  Fix: CAS rejected because version mismatch (expected 0, actual 2)")
    assert ok == False, "Versioned CAS should reject (version mismatch)"
    print("  ✓ ABA prevented: version counter caught the interleaving")


def main():
    demonstrate_aba()
    demonstrate_version_fix()
    print("\n✓ All assertions passed")


if __name__ == "__main__":
    main()
