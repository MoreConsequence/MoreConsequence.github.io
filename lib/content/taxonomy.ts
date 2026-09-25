import type { CompiledPost, PostSource } from "./types";

export type PillarId =
  | "ai-systems"
  | "distributed-systems"
  | "kernel-performance"
  | "network-iot"
  | "architecture-practice";

export interface PillarInfo {
  id: PillarId;
  name: string;
  nameEn: string;
  icon: string;
  color: string;
  description: string;
  keyTopics: string[];
  seriesList: string[];
}

export const PILLARS: Record<PillarId, PillarInfo> = {
  "ai-systems": {
    id: "ai-systems",
    name: "大模型与智能体系统",
    nameEn: "AI Systems & Agents",
    icon: "🔮",
    color: "#7c3aed",
    description:
      "穿透大模型炒作迷雾，直击显存虚拟化（PagedAttention）、推测解码、高并发流式网关、RAG 混合检索、自动化评估门禁、代码执行沙箱与自主智能体状态机。",
    keyTopics: ["LLM", "Agent", "AI网关", "vLLM", "RAG", "推测解码", "评估门禁", "MCP协议", "Prompt Caching"],
    seriesList: [
      "前沿大模型训练与全栈 Infra 解密",
      "面向大模型与 Agent 的 AI 网关实战",
      "大模型安全防御与对抗攻防实战",
      "面向后端工程师的 AI 架构与工程实战",
      "Pi Agent 通才教程",
      "大模型后端架构与推理加速",
      "Agent 的方方面面",
      "DeepSeek DSH 架构全解",
      "ORACT 架构全解",
      "AI 工程",
      "LLM 评测的科学",
    ],
  },
  "distributed-systems": {
    id: "distributed-systems",
    name: "分布式系统与高可用存储",
    nameEn: "Distributed Systems & Storage",
    icon: "🏛️",
    color: "#2563eb",
    description:
      "攻克分布式状态与系统韧性难题：共识算法（Paxos/Raft）、事务故障模型（2PC/SAGA）、数据复制、LSM-Tree 与 B-Tree 存储引擎、Postgres HOT 元组与 Redis 深度解密。",
    keyTopics: ["分布式系统", "Raft", "高并发", "存储引擎", "PostgreSQL", "Redis", "MySQL", "ClickHouse"],
    seriesList: [
      "分布式共识与高可用容错",
      "分布式系统的故障模型",
      "数据库原理手记",
      "数据库与存储",
    ],
  },
  "kernel-performance": {
    id: "kernel-performance",
    name: "Linux 内核与系统底层工程",
    nameEn: "Linux Kernel & Systems Engineering",
    icon: "🐧",
    color: "#059669",
    description:
      "打破操作系统黑盒，直击单机千万级吞吐背后的内核原语：eBPF/XDP 驱动层包处理、内存分页与脏页回写停顿、EEVDF 调度器、无锁环形队列与万兆网络极限测速。",
    keyTopics: ["Linux内核", "eBPF", "性能优化", "内存分页", "无锁队列", "调度器", "测速工程"],
    seriesList: [
      "Linux 内核网络与 eBPF 性能工程",
      "硬核底层原理",
      "网络测速与极限吞吐工程",
      "LibreSpeed Go 源码行纪",
    ],
  },
  "network-iot": {
    id: "network-iot",
    name: "网络协议与云网协同平台",
    nameEn: "Network Protocols & IoT Platform",
    icon: "🌐",
    color: "#d97706",
    description:
      "专为网络设备制造与云网协同打造：从底层物理协议（TCP/BGP/LLDP）到云端 C10M 长连接、防变砖两阶段回滚、YANG/OpenConfig 统一建模、Batfish 形式化验证与 IPFIX 微突发流遥测。",
    keyTopics: ["网络协议", "IoT Platform", "Network Devices", "ZTP", "YANG", "Batfish", "IPFIX", "CDN"],
    seriesList: [
      "物联网与网络设备云平台架构实战",
      "现代 CDN 与边缘加速架构",
      "网络协议",
      "浏览器原理",
      "前端全景手记",
    ],
  },
  "architecture-practice": {
    id: "architecture-practice",
    name: "系统架构设计与资深实战",
    nameEn: "System Design & Architecture Practice",
    icon: "🏗️",
    color: "#dc2626",
    description:
      "资深与架构师职级分水岭：Go/TypeScript 语言边界与并发模型、一线大厂千万级高频系统设计真题深度拆解、不可变 API 演进、代码重构艺术与生产排障方法论。",
    keyTopics: ["系统设计", "面试题", "Go", "TypeScript", "Node.js", "架构演进", "并发模型"],
    seriesList: [
      "Kubernetes 架构内核与生产实战",
      "资深工程师面试深度拆解",
      "系统设计手记",
      "Go 的设计边界",
      "从 Go 到 TypeScript",
      "把原理变成服务",
      "架构原则",
      "Go 的设计哲学",
      "造轮子手记",
    ],
  },
};

export function getAllPillars(): PillarInfo[] {
  return Object.values(PILLARS);
}

export function getPostPillarId(
  slug: string,
  series?: string,
  tags: string[] = [],
): PillarId {
  // 1. 优先根据 series 匹配所属板块
  if (series) {
    for (const pillar of Object.values(PILLARS)) {
      if (pillar.seriesList.some((s) => s === series || series.includes(s) || s.includes(series))) {
        return pillar.id;
      }
    }
  }

  // 2. 根据 slug 规则匹配
  if (/^iot-netdev-/.test(slug)) return "network-iot";
  if (/^ai-gateway-|^ai-agent-gateway-|^ai-backend-|^llm-|^mcp-|^agent-|^pi-agent|^a2a-/.test(slug)) return "ai-systems";
  if (/^interview-/.test(slug)) return "architecture-practice";
  if (/^k8s-|^kubernetes-/.test(slug)) return "architecture-practice";
  if (/^kernel-|^bpf-|^linux-|^speedtest-/.test(slug)) return "kernel-performance";
  if (/^consensus-|^raft-|^postgres-|^redis-|^db-|^sqlite-/.test(slug)) return "distributed-systems";
  if (/^go-|^node-|^typescript-|^service-/.test(slug)) return "architecture-practice";

  // 3. 根据标签包含内容降级匹配
  const tagStr = tags.join(" ").toLowerCase();
  if (/llm|agent|rag|大模型|ai/.test(tagStr)) return "ai-systems";
  if (/分布式|共识|raft|数据库|postgres|redis|mysql|存储/.test(tagStr)) return "distributed-systems";
  if (/内核|ebpf|linux|性能|调度|内存/.test(tagStr)) return "kernel-performance";
  if (/网络|协议|iot|ztp|yang|tcp|http|cdn/.test(tagStr)) return "network-iot";
  if (/面试|系统设计|架构|go|typescript|node/.test(tagStr)) return "architecture-practice";

  return "architecture-practice";
}

export function getPostPillar(post: PostSource | CompiledPost): PillarInfo {
  const pillarId = getPostPillarId(
    post.slug,
    post.meta.series,
    post.meta.tags,
  );
  return PILLARS[pillarId];
}

export interface TagCategory {
  pillarId: PillarId;
  pillarName: string;
  icon: string;
  tags: { name: string; count: number }[];
}

export const TOP_CURATED_TAGS = [
  // AI 智能体
  "LLM",
  "Agent",
  "AI网关",
  "AI后端工程",
  "vLLM",
  "RAG",
  "推测解码",
  // 分布式与存储
  "分布式系统",
  "高并发",
  "数据库",
  "Redis",
  "MySQL",
  "存储引擎",
  "ClickHouse",
  // 内核底层
  "Linux内核",
  "eBPF",
  "性能优化",
  "并发",
  // 网络与 IoT
  "网络协议",
  "IoT Platform",
  "Network Devices",
  "CDN",
  // 架构与实践
  "系统设计",
  "面试题",
  "Go",
  "TypeScript",
  "Node.js",
  "工程实践",
  "架构",
];
