import { describe, expect, it } from "vitest";
import path from "node:path";
import * as postPipeline from "@/lib/content/posts";
import {
  filterPublished,
  getPostSources,
  parsePostSource,
  sortPosts,
} from "@/lib/content/posts";
import {
  collectSeries,
  decodeSeries,
  getPostsForSeries,
} from "@/lib/content/series";
import { compileMarkdown } from "@/lib/content/markdown";

const article = `---
title: "理解 Go Context 的边界"
description: "把取消信号放回它应该在的位置。"
publishedAt: "2026-07-20"
tags: ["Go", "并发"]
featured: true
---

## 为什么需要 Context

正文。

### 取消不是清理

\`\`\`go
select {
case <-ctx.Done():
  return ctx.Err()
}
\`\`\`
`;

describe("Markdown content pipeline", () => {
  it("discovers repository Markdown with a portable filesystem loader", () => {
    expect(postPipeline).toHaveProperty("readPostSources");

    const posts = postPipeline.readPostSources(
      path.join(process.cwd(), "content", "posts"),
      "production",
    );

    expect(posts.map((post) => post.slug)).toEqual([
      "node-async-iterators-cleanup",
      "node-cluster-ipc",
      "node-eventemitter-pubsub",
      "node-shared-memory-atomics",
      "sqlite-index-two-shapes",
      "cell-based-architecture-bulkhead",
      "consensus-07-raft-membership-changes-joint-consensus",
      "event-sourcing-cqrs",
      "interview-01-realtime-leaderboard-system-design",
      "k8s-137-dra-gang-scheduling",
      "kernel-07-bpf-ring-buffer-vs-perf-buffer",
      "kernel-08-linux-page-cache-dirty-writeback-stall",
      "kernel-09-linux-cfs-to-eevdf-cpu-scheduler",
      "llm-13-chunked-prefill-and-pd-disaggregation",
      "lockfree-cas-aba-problem",
      "lsm-compaction-strategies",
      "node-als-tracing",
      "node-graceful-shutdown",
      "pg19-delayed-note",
      "phi-accrual-failure-detector",
      "postgres-hot-tuples-page-pruning",
      "promise-allsettled-partial-failure",
      "redis-threaded-io-architecture",
      "two-generals-idempotency-state-machine",
      "etcd-37-upgrade-checklist",
      "kafka-queues-share-groups",
      "llm-16-model-silent-reroute",
      "redis-valkey-fork",
      "a2a-discovery-delegation",
      "agent-tooloop-fuse",
      "capability-map-interview",
      "crdt-gcounter-merge",
      "go-encoding-json-v2-goroutineleak",
      "go-generic-methods-interface-boundary",
      "go-runtime-trio-127",
      "go-stdlib-uuid-mldsa",
      "go-test-synctest-fuzz",
      "gossip-rounds-infection",
      "http-four-mechanisms",
      "llm-12-eval-estimation-gates",
      "llm-15-context-eviction",
      "llm-error-shape-feeds-model",
      "node-concurrency-context-cpu",
      "node-permission-model-boundary",
      "node-sqlite-builtin",
      "node-structured-clone-semantics",
      "read-your-write-session",
      "resilience-window-retry",
      "schema-breaking-detector",
      "service-config-hot-reload",
      "service-pagination-cursor",
      "service-payment-callback-design",
      "service-webhook-hmac",
      "slo-burn-rate-alert",
      "sqlite-wal-checkpoint",
      "typescript-71-beta-native-check",
      "llm-09-mcp-stateless-core",
      "llm-10-model-bill-sensitivity",
      "llm-11-mcp-tasks-extension",
      "abstraction-leaks-failure-modes",
      "dependency-upgrade-resource-signature",
      "health-check-semantics-special-request",
      "hidden-defaults-architecture-decisions",
      "legacy-code-as-information-compression",
      "log-level-irreversible-information-destruction",
      "monitoring-vs-forensics",
      "observer-effect-monitoring-as-load",
      "rollback-observed-side-effects",
      "distributed-clock-ordering-hlc-truetime",
      "consensus-01-raft-state-machine-replication",
      "consensus-02-quorum-read-write-cap-pacelc",
      "consensus-03-distributed-transactions-2pc-saga-outbox",
      "consensus-04-logical-clocks-vector-spanner-truetime",
      "consensus-05-chaos-engineering-jepsen-linearizability",
      "consensus-06-distributed-locks-redlock-etcd-fencing",
      "kernel-01-packet-rx-tx-ring-buffer-napi",
      "kernel-02-ebpf-virtual-machine-verifier-jit",
      "kernel-03-xdp-line-rate-packet-bypass",
      "kernel-04-ebpf-kprobe-tracepoint-observability",
      "kernel-05-tc-bbr-qdisc-traffic-shaping",
      "kernel-06-linux-memory-paging-tlb-hugepages",
      "llm-01-kv-cache-paged-attention",
      "llm-02-continuous-batching-scheduler",
      "llm-03-speculative-decoding-inference-speedup",
      "llm-04-streaming-gateway-sse-backpressure",
      "llm-05-semantic-cache-vector-rag-jitter",
      "llm-06-api-protocol-evolution",
      "llm-07-model-context-protocol-mcp",
      "llm-08-llm-as-a-judge-eval-engineering",
      "cdn-01-anycast-bgp-routing",
      "cdn-02-edge-cache-consistent-hashing",
      "cdn-03-dynamic-acceleration-smart-routing",
      "cdn-04-edge-security-waf-ddos",
      "cdn-05-edge-computing-serverless-runtime",
      "speedtest-01-physical-essence",
      "speedtest-02-zero-copy-downlink",
      "speedtest-03-zero-alloc-uplink",
      "speedtest-04-jitter-bufferbloat",
      "speedtest-05-protocol-overhead",
      "speedtest-06-edge-scheduling",
      "speedtest-07-10g-cost-architecture",
      "speedtest-go-deep-dive-whitepaper",
      "librespeed-go-01-overview",
      "librespeed-go-03-client-ip",
      "librespeed-go-04-contract",
      "librespeed-go-05-interface",
      "dsh-01-architecture-overview",
      "dsh-02-turn-step-lifecycle",
      "dsh-03-session-log-and-projection",
      "dsh-04-capability-seams-and-sandbox",
      "dsh-05-llm-streaming-and-compaction",
      "dsh-06-plugin-development-and-mcp",
      "oract-01-durable-agent-kernel",
      "oract-02-reliable-effects-and-outbox",
      "oract-03-security-boundary-and-bubblewrap",
      "oract-04-journal-projection-and-playback",
      "oract-05-distributed-lease-and-fencing",
      "oract-06-reliability-lab-and-chaos-testing",
      "abort-signal-tool-side-effects",
      "agent-session-budget",
      "characterization-test-refactor-safety-net",
      "eval-set-leakage",
      "lamport-vector-clocks",
      "latency-attribution",
      "pi-advanced-01-rpc-sdk",
      "pi-advanced-02-subagents",
      "pi-advanced-03-mcp-gateway",
      "pi-advanced-04-tui-markdown-cjk",
      "pi-advanced-05-kv-cache-deep",
      "pi-advanced-06-enterprise-evals",
      "pi-advanced-07-mini-pi-project",
      "pi-tutorial-01-minimal-loop",
      "pi-tutorial-02-streaming-tui",
      "pi-tutorial-03-diff-edit",
      "pi-tutorial-04-compaction-budget",
      "pi-tutorial-05-session-tree",
      "pi-tutorial-06-provider-gateway",
      "pi-tutorial-07-extension-system",
      "pi-tutorial-08-sandbox-security",
      "pi-tutorial-09-evals-telemetry",
      "rebuild-incident-evidence-chain",
      "review-idempotent-pr-concurrency",
      "speedtest-service-architecture",
      "sqlite-two-writers-busy",
      "two-phase-commit-vs-saga-outbox",
      "app-speed-test-architecture-cost",
      "select-poll-epoll-deep-dive",
      "agent-engine-context",
      "agent-engine-economics",
      "agent-engine-extensions",
      "agent-engine-layers",
      "agent-engine-loop",
      "agent-engine-provider",
      "agent-engine-security",
      "agent-engine-session",
      "agent-engine-tools",
      "benchmark-one-variable",
      "esm-cjs-dual-package",
      "evidence-engineering-raw-output",
      "git-bisect-regression-hunt",
      "go-context-vs-abortsignal",
      "histogram-bucket-design",
      "memory-metrics-rss-heapused",
      "mysql-statistics-drift-plan",
      "p99-sample-size-confidence",
      "redis-eviction-policy",
      "redis-intset-encoding-memory",
      "go-append-slice-growth",
      "go-closure-escape",
      "go-errors-is-unwrap-cost",
      "go-nethttp-connection-reuse",
      "go-netpoll-wakeup-scheduling",
      "jwt-session-oauth2-revocation",
      "k8s-iptables-ebpf-service",
      "kafka-rebalance-stop-the-world",
      "llm-as-judge-evals",
      "llm-continuous-batching-throughput",
      "llm-embedding-retrieval",
      "llm-hallucination-measurable",
      "llm-kv-cache-memory-budget",
      "llm-sampling-reproducibility",
      "llm-token-economics",
      "llm-tool-calling-contract",
      "mini-lsm-write-amplification",
      "mysql-online-ddl-mdl-lock",
      "mysql-optimizer-explain-cost",
      "optimistic-vs-pessimistic-lock",
      "outbox-cdc-dual-write-atomicity",
      "postgres-bloat-autovacuum",
      "raft-linearizable-read-leases",
      "redis-persistence-rdb-aof",
      "seckill-inventory-atomic-gates",
      "service-api-shape",
      "service-ci-cd",
      "service-design-adr",
      "service-incident-drama",
      "service-observability-slo",
      "service-release-checklist",
      "service-testing-strategy",
      "sharding-partition-key-migration",
      "sse-vs-websocket-streaming",
      "typescript-agent-production",
      "typescript-agent-state-machine",
      "typescript-dto-boundary",
      "typescript-errors-result-throw",
      "typescript-event-loop-vs-gmp",
      "typescript-interface-schema-zod",
      "typescript-streams-backpressure",
      "typescript-toolchain-rules",
      "typescript-type-gymnastics",
      "vector-index-hnsw-ivf-pq",
      "go-benchmark-pitfalls",
      "go-interface-boxing",
      "go-slice-subslice-hold",
      "go-sync-map-boundary",
      "go-sync-pool-design",
      "tcp-nagle-delayed-ack",
      "typescript-llm-tool-loop",
      "go-atomic-vs-mutex",
      "go-defer-panic-cost",
      "go-goroutine-stack-growth",
      "go-mallocgc-allocator",
      "typescript-pitfalls-for-go-backend-developers",
      "go-map-hmap-cost",
      "go-string-byte-conversion",
      "go-channel-hchan-cost",
      "go-select-selectgo-cost",
      "go-goroutine-leak-pprof",
      "go-timeafter-hidden-cost",
      "btree-page-split-write-amplification",
      "buffer-pool-lru-dirty-pages",
      "connection-pool-math-timeout",
      "go-memory-leak-pprof",
      "go-scheduler-gmp-preemption",
      "http2-head-of-line-blocking",
      "js-async-await-promise-timing",
      "k8s-scheduler-resource-ledger",
      "tcp-syn-queue-backlog",
      "ai-agent-protocol-stack",
      "browser-frame-16ms-budget",
      "distributed-lock-fence-lease",
      "dns-ttl-negative-cache",
      "go-happens-before",
      "go-lock-cost-futex-rwlock",
      "k8s-requests-limits-cgroup",
      "package-manager-history-and-comparison",
      "consistent-hashing-minimal-remap",
      "covering-index-avoid-back-to-table",
      "deployment-canary-blue-green",
      "distributed-id-snowflake-segment",
      "epoll-c10k-c10m",
      "go-gc-gctrace-account",
      "http-cache-control-etag",
      "k8s-controller-watch-etcd",
      "mesi-cache-coherence-false-sharing",
      "mysql-redo-undo-binlog",
      "redis-as-mq-consume-groups",
      "tree-shaking-comparison-costs",
      "database-deadlock-wait-graph",
      "distributed-transactions-2pc-saga",
      "exactly-once-message-delivery",
      "frontend-framework-history",
      "frontend-framework-taxonomy",
      "fsync-group-commit",
      "js-ecosystem-layers",
      "kubernetes-graceful-termination",
      "lsm-vs-btree-io-amplification",
      "mvcc-isolation-snapshot",
      "quic-http3-connection-migration",
      "raft-consensus-term-log-replication",
      "socket-backpressure-slow-consumer",
      "tcp-retransmit-timeout-rto",
      "time-wait-connection-reuse",
      "distributed-tracing-otel",
      "rate-limiting-circuit-breaker",
      "tcp-congestion-control-bbr",
      "tls-handshake-deep-dive",
      "virtual-memory-page-fault",
      "clock-skew-distributed-systems",
      "graceful-shutdown-in-go",
      "idempotency-engineering",
      "perf-flamegraph-sampling",
      "replication-lag-read-paths",
      "zero-copy-sendfile-io-uring",
      "ai-backend-no-magic",
      "cache-consistency",
      "wal-crash-recovery",
      "building-a-markdown-blog",
      "inside-my-markdown-blog-architecture",
      "understanding-context-switching-from-cpu-to-goroutines",
      "go-context-patterns",
      "iot-netdev-15-flow-telemetry-microburst-monitoring",
      "iot-netdev-14-intent-based-networking-batfish-validation",
      "iot-netdev-13-lldp-network-topology-graph-engine",
      "iot-netdev-12-yang-openconfig-unified-data-modeling",
      "iot-netdev-11-ztp-zero-touch-provisioning-dhcp-option",
      "iot-netdev-10-zero-trust-device-identity-mtls-tpm",
      "iot-netdev-09-distributed-connection-cluster-session-migration",
      "understanding-event-loops",
      "iot-netdev-08-device-shadow-desired-reported-state-machine",
      "k8s-30-observability-logging-fluentbit-vector",
      "iot-netdev-07-config-sync-incremental-reconciliation",
      "k8s-29-sandbox-containers-gvisor-kata",
      "iot-netdev-06-firmware-ota-ab-partition-rollback",
      "k8s-28-api-priority-and-fairness-apf-flowcontrol",
      "iot-netdev-05-nat-traversal-reverse-shell-tunnel",
      "k8s-27-node-problem-detector-draino-descheduler",
      "iot-netdev-04-streaming-telemetry-tsdb-pipeline",
      "k8s-26-chaos-engineering-chaos-mesh-kernel-fault-injection",
      "iot-netdev-03-atomic-config-rollback-commit-confirmed",
      "k8s-25-gitops-argocd-state-reconciliation",
      "iot-netdev-02-c10m-connection-gateway-keepalive",
      "k8s-24-multi-tenancy-virtual-clusters-vcluster",
      "iot-netdev-01-architecture-blueprint-southbound-protocols",
      "k8s-23-wasm-webassembly-runwasi-spinkube",
      "ai-backend-22-ci-cd-llm-testing-mocking-evaluation",
      "k8s-22-gateway-api-inference-extension-prefix-cache",
      "ai-backend-21-multi-tenant-token-metering-finops",
      "k8s-21-ai-llm-batch-scheduling-kueue-gang",
      "ai-backend-20-prompt-engineering-backend-code",
      "k8s-20-security-container-escape-ebpf-falco",
      "ai-backend-19-pgvector-relational-engineers-guide",
      "k8s-19-finops-vpa-in-place-pod-resize",
      "ai-backend-18-async-job-queues-temporal-webhooks",
      "k8s-18-edge-computing-kubeedge-openyurt",
      "k8s-17-multi-cluster-clustermesh-submariner",
      "llm-infra-01-3d-parallelism-megatron-deepspeed",
      "ai-backend-17-long-context-rope-attention-sinks",
      "k8s-16-service-mesh-ambient-sidecarless-cilium-ebpf",
      "ai-backend-16-paged-attention-kv-cache-virtual-memory",
      "k8s-15-gpu-virtualization-mig-dra-dynamic-resource-allocation",
      "ai-backend-15-llm-routing-and-fallback-cascade",
      "k8s-14-admission-webhook-opa-gatekeeper-kyverno",
      "ai-backend-14-agent-tool-use-self-healing-loop",
      "k8s-13-hpa-v2-keda-autoscaling-karpenter",
      "ai-backend-13-speculative-decoding-production-serving",
      "k8s-12-coredns-5s-delay-ndots-conntrack-race",
      "ai-backend-12-multi-agent-orchestration-consensus",
      "k8s-11-cri-containerd-shim-v2-process-lifecycle",
      "ai-backend-11-agent-memory-systems-architecture",
      "k8s-10-production-ha-cluster-graceful-shutdown-troubleshooting",
      "ai-backend-10-llm-as-a-judge-eval-engineering",
      "k8s-09-deployment-crd-operator-reconciliation",
      "ai-backend-09-genai-observability-opentelemetry",
      "k8s-08-storage-csi-pv-pvc-volume-mount-internals",
      "ai-backend-08-deterministic-agent-state-machine",
      "k8s-07-service-kube-proxy-iptables-ingress-gateway-api",
      "ai-backend-07-agent-code-execution-sandbox",
      "k8s-06-network-cni-flannel-calico-cilium-ebpf",
      "ai-backend-06-mcp-protocol-engineering",
      "k8s-05-kube-scheduler-framework-plugins",
      "ai-backend-05-prompt-caching-finops-engineering",
      "k8s-04-resource-requests-limits-cgroups-oom-killer",
      "ai-backend-04-semantic-cache-architecture",
      "k8s-03-client-go-informer-reflector-deltafifo",
      "ai-backend-03-enterprise-rag-hybrid-search-rerank",
      "k8s-02-architecture-declarative-api-control-loop",
      "ai-backend-02-streaming-gateway-sse-backpressure",
      "k8s-01-container-namespaces-cgroups-pod-first-principles",
      "ai-backend-01-constrained-decoding-structured-outputs",
      "ai-backend-00-architecture-blueprint",
      "interview-55-async-task-pipeline-dead-letter-retry",
      "interview-54-lakehouse-acid-iceberg-delta-lake",
      "interview-53-high-performance-rpc-grpc-flatbuffers",
      "interview-52-distributed-coordination-etcd-zookeeper",
      "interview-51-memory-allocator-jemalloc-mimalloc-ptmalloc",
      "interview-50-webrtc-sfu-mcu-gcc-congestion-control",
      "interview-49-llm-flash-attention-paged-attention-mla",
      "interview-48-lsm-tree-rocksdb-nvme-ssd-tuning",
      "interview-47-multi-region-cell-based-architecture",
      "interview-46-cloud-native-service-mesh-ambient-ebpf",
      "interview-45-distributed-vector-database-scale",
      "interview-44-edge-computing-cdn-request-collapsing",
      "interview-43-distributed-graph-database-supernode",
      "interview-42-realtime-bidding-ad-exchange-rtb",
      "interview-41-distributed-file-system-gfs-hdfs-ceph",
      "interview-40-realtime-recommendation-engine-architecture",
      "interview-39-distributed-consensus-paxos-raft-multiraft",
      "interview-38-cloud-native-api-gateway-envoy-apisix",
      "interview-37-live-streaming-danmaku-system-design",
      "interview-36-database-sharding-online-migration",
      "interview-35-distributed-transactions-2pc-tcc-saga-local-message",
      "interview-34-distributed-tracing-dapper-opentelemetry",
      "interview-33-ride-sharing-dispatch-h3-geospatial",
      "interview-32-hyperloglog-count-min-sketch-cardinality",
      "interview-31-distributed-lock-redlock-fencing-token",
      "interview-30-notification-system-architecture",
      "interview-29-collaborative-editing-ot-crdt-system-design",
      "interview-28-distributed-task-scheduler-system-design",
      "interview-27-url-shortener-system-design",
      "interview-26-distributed-web-crawler-system-design",
      "interview-25-metrics-monitoring-alerting-system-design",
      "interview-24-cloud-drive-file-sync-system-design",
      "interview-23-video-streaming-system-design",
      "interview-22-search-autocomplete-system-design",
      "interview-21-consistent-hashing-system-design",
      "interview-20-news-feed-system-design",
      "interview-19-distributed-key-value-store",
      "interview-18-distributed-rate-limiter",
      "interview-17-distributed-unique-id-generator",
      "interview-16-hotel-reservation-system",
      "interview-15-payment-system-architecture",
      "interview-14-ad-click-event-aggregation",
      "interview-13-chat-system-architecture",
      "interview-12-proximity-nearby-friends-system-design",
      "interview-11-distributed-message-queue-system-design",
      "interview-10-s3-object-storage-system-design",
      "interview-09-distributed-digital-wallet-system-design",
      "interview-08-stock-exchange-matching-engine",
      "interview-07-gpu-cluster-training-system-design",
      "interview-06-speculative-decoding-system-design",
      "interview-05-truetime-vs-hlc-distributed-transactions",
      "interview-04-ebpf-sockops-kube-proxy-bypass",
      "interview-03-filtered-vector-search-hnsw",
      "interview-02-llm-agent-gateway-system-design",
    ]);
    expect(getPostSources("production")).toEqual(posts);
    expect(posts.every((post) => !post.meta.draft)).toBe(true);
  });

  it("parses and validates frontmatter", () => {
    const post = parsePostSource("go-context.md", article);

    expect(post.slug).toBe("go-context");
    expect(post.meta.title).toBe("理解 Go Context 的边界");
    expect(post.meta.publishedAt).toBe("2026-07-20");
  });

  it("rejects incomplete frontmatter", () => {
    expect(() =>
      parsePostSource(
        "broken.md",
        `---
title: "缺少摘要"
publishedAt: "2026-07-20"
tags: ["测试"]
---
`,
      ),
    ).toThrow(/broken\.md/);
  });

  it("rejects impossible calendar dates", () => {
    expect(() =>
      parsePostSource(
        "bad-date.md",
        article.replace("2026-07-20", "2026-99-99"),
      ),
    ).toThrow(/publishedAt/);
  });

  it("sorts newest posts first", () => {
    const oldPost = parsePostSource(
      "old.md",
      article.replace("2026-07-20", "2026-01-01"),
    );
    const newPost = parsePostSource(
      "new.md",
      article.replace("2026-07-20", "2026-07-25"),
    );

    expect(sortPosts([oldPost, newPost]).map((post) => post.slug)).toEqual([
      "new",
      "old",
    ]);
  });

  it("hides drafts in production", () => {
    const published = parsePostSource("published.md", article);
    const draft = parsePostSource(
      "draft.md",
      article.replace("featured: true", "featured: false\ndraft: true"),
    );

    expect(filterPublished([published, draft], "production")).toEqual([
      published,
    ]);
    expect(filterPublished([published, draft], "development")).toHaveLength(2);
  });

  it("compiles headings, reading time and highlighted code", async () => {
    const result = await compileMarkdown(article.split("---\n").at(-1) ?? "");

    expect(result.toc.map((item) => item.id)).toEqual([
      "为什么需要-context",
      "取消不是清理",
    ]);
    expect(result.readingTimeMinutes).toBeGreaterThanOrEqual(1);
    expect(result.html).toContain('id="为什么需要-context"');
    expect(result.html).toContain("shiki");
  });

  it("uses the final HTML heading ids in the table of contents", async () => {
    const result = await compileMarkdown("# 重复标题\n\n## 重复标题");

    expect(result.toc).toEqual([
      { id: "重复标题-1", title: "重复标题", depth: 2 },
    ]);
    expect(result.html).toContain('id="重复标题-1"');
  });

  it("keeps footnote accessibility headings out of the visible TOC", async () => {
    const result = await compileMarkdown(
      "## 正文章节\n\n这里有一条脚注。[^1]\n\n[^1]: 脚注内容。",
    );

    expect(result.toc).toEqual([
      { id: "正文章节", title: "正文章节", depth: 2 },
    ]);
    expect(result.html).toContain('class="sr-only"');
    expect(result.html).not.toContain('href="#footnote-label"');
  });

  it("groups posts into series and filters by name", () => {
    const withSeries = article.replace(
      "featured: true",
      'featured: true\nseries: "Go 系列"',
    );
    const first = parsePostSource("first.md", withSeries);
    const second = parsePostSource(
      "second.md",
      withSeries
        .replace("2026-07-20", "2026-07-25")
        .replace("featured: true", "featured: false"),
    );
    const standalone = parsePostSource(
      "standalone.md",
      article.replace("2026-07-20", "2026-07-30"),
    );

    const series = collectSeries([first, second, standalone]);

    expect(series).toEqual([
      {
        name: "Go 系列",
        count: 2,
        latestPublishedAt: "2026-07-25",
      },
    ]);
    expect(getPostsForSeries([first, second], "Go 系列").map((p) => p.slug)).toEqual([
      "first",
      "second",
    ]);
    expect(getPostsForSeries([first, second], decodeSeries("Go%20%E7%B3%BB%E5%88%97"))).toHaveLength(2);
    expect(getPostsForSeries([first, second], "不存在")).toHaveLength(0);
  });
});
