# 系统架构总览

## 设计原则

| 原则 | 含义 | 体现 |
|------|------|------|
| **Agent 无关** | 不绑定特定 Agent 平台 | SDK 适配器模式，支持 Claude Code / Cursor / 自定义 |
| **渐进式信任** | 学习结果从试探到确信 | 复合置信度系统 |
| **反馈闭环** | 学了要验证有没有用 | Apply → Verify 循环 |
| **隐私优先** | 只存模式，不存代码 | 本地优先 + 可选云同步 |
| **成本可控** | 学习不应比工作更贵 | 小模型后台分析，批量处理 |
| **可组合** | 每层独立可用 | 只用观察层也有价值 |

---

## 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Runtime 层                          │
│  Claude Code / Cursor / Custom Agent / LangChain / CrewAI   │
└───────────┬─────────────────────────────────────┬───────────┘
            │ SDK Adapter                         │ Context Injection
            ▼                                     ▲
┌───────────────────────────────────────────────────────────────┐
│                    AgentMind Core                              │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ Observer  │→│ Analyzer │→│ Memory   │→│ Applicator   │  │
│  │ 观察层    │  │ 分析层    │  │ 记忆层   │  │ 应用层       │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────┬───────┘  │
│       ▲                                           │           │
│       │              ┌──────────┐                 │           │
│       │              │ Verifier │←────────────────┘           │
│       │              │ 验证层    │                             │
│       │              └────┬─────┘                             │
│       │                   │                                   │
│       │              ┌────▼─────┐                             │
│       └──────────────│ Evolver  │                             │
│                      │ 进化层    │                             │
│                      └──────────┘                             │
└───────────────────────────────────────────────────────────────┘
            │                                     ▲
            ▼                                     │
┌───────────────────────────────────────────────────────────────┐
│                    Storage Layer                               │
│  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Local FS  │  │ PostgreSQL│ │ Redis    │  │ pgvector   │  │
│  │ 本地文件   │  │ 持久存储  │  │ 实时缓存 │  │ 语义搜索   │  │
│  └───────────┘  └──────────┘  └──────────┘  └────────────┘  │
└───────────────────────────────────────────────────────────────┘
            │
            ▼ (可选)
┌───────────────────────────────────────────────────────────────┐
│                    Cloud Sync Layer                            │
│  团队共享 · 跨设备同步 · Dashboard · Analytics                │
└───────────────────────────────────────────────────────────────┘
```

---

## 六层架构详解

### Layer 1: Observer（观察层）→ [02-observation-layer](./02-observation-layer.md)

**职责**：捕获 Agent 运行时的四层数据

```typescript
interface ObservationEvent {
  id: string;
  timestamp: string;
  sessionId: string;
  layer: 'intent' | 'decision' | 'execution' | 'evaluation';
  event: string;
  data: Record<string, unknown>;
  metadata?: {
    projectId?: string;
    userId?: string;
    agentType?: string;
  };
}
```

| 子层 | 观察什么 | 数据来源 |
|------|---------|---------|
| 意图层 | 用户说了什么、要做什么 | UserPrompt Hook |
| 决策层 | Agent 选择了什么方案 | Agent 推理日志 |
| 执行层 | 调用了什么工具、什么参数 | PreToolUse/PostToolUse Hook |
| 评估层 | 结果是否符合预期 | 任务完成状态 + 用户反馈 |

### Layer 2: Analyzer（分析层）→ [03-analysis-engine](./03-analysis-engine.md)

**职责**：从观察数据中提取有意义的模式

```typescript
interface AnalysisResult {
  patterns: Pattern[];          // 检测到的模式
  causalLinks: CausalLink[];    // 因果关系
  userProfile: ProfileUpdate;    // 用户画像更新
  anomalies: Anomaly[];          // 异常行为
}
```

三大分析能力：
1. **模式检测** — 统计重复出现的行为序列
2. **因果推理** — 判断行为之间是否有因果关系（而非仅仅相关）
3. **画像更新** — 更新用户的技术偏好、编码风格、工作习惯

### Layer 3: Memory（记忆层）→ [04-confidence-system](./04-confidence-system.md)

**职责**：存储学习成果，管理置信度

```typescript
interface Instinct {
  id: string;
  trigger: string;           // 何时触发
  action: string;            // 做什么
  confidence: CompositeScore; // 复合置信度
  domain: string;            // 领域标签
  evidence: Evidence[];      // 证据链
  createdAt: string;
  lastApplied?: string;
  lastVerified?: string;
  applicationCount: number;
  successRate: number;        // 应用成功率
}

interface CompositeScore {
  frequency: number;    // 频率分 (0-1)
  effectiveness: number; // 效果分 (0-1)
  humanApproval: number; // 人工分 (0-1)
  composite: number;     // 加权综合分
  weights: { frequency: number; effectiveness: number; human: number };
}
```

### Layer 4: Applicator（应用层）

**职责**：在恰当时机将记忆注入 Agent 上下文

```typescript
interface ApplicationContext {
  currentTask: string;
  relevantInstincts: Instinct[];  // 语义匹配的相关本能
  injectionMethod: 'system_prompt' | 'context_prepend' | 'tool_guidance';
  confidenceThreshold: number;     // 只注入超过阈值的
}
```

应用策略：
- **置信度 ≥ 0.8** → 自动注入 System Prompt
- **置信度 0.5-0.8** → 作为建议提供
- **置信度 < 0.5** → 仅在被问到时提供

### Layer 5: Verifier（验证层）

**职责**：评估学习成果的实际效果

```typescript
interface VerificationResult {
  instinctId: string;
  applied: boolean;
  outcome: 'positive' | 'negative' | 'neutral';
  signals: {
    userAccepted: boolean;      // 用户没有纠正
    taskSucceeded: boolean;     // 任务成功完成
    timeImproved: boolean;      // 完成时间缩短
    errorReduced: boolean;      // 错误减少
  };
  confidenceAdjustment: number; // 置信度调整值
}
```

### Layer 6: Evolver（进化层）→ [05-evolution-system](./05-evolution-system.md)

**职责**：将原子本能进化为更高层级的能力

进化路径：
```
原子本能 (Instinct)
    │
    ├─→ 行为模式 (Pattern)     — 3+ 相关本能聚类
    ├─→ 工作流 (Workflow)      — 有序步骤序列
    ├─→ 策略 (Strategy)        — 抽象决策原则
    └─→ 专家系统 (Expert)      — 完整领域能力
```

---

## 数据流

```
时间轴 ──────────────────────────────────────────────────→

用户:  "帮我重构这个认证模块"
         │
Observer: [intent: "重构认证"]
         │
Agent:   选择 Grep → Read → 分析 → Edit
         │
Observer: [decision: "先搜索再修改"]
         [execution: Grep("auth"), Read("auth.ts"), Edit("auth.ts")]
         │
Analyzer: 检测到 "Grep→Read→Edit" 模式 (第 5 次)
         │
Memory:  更新 "grep-before-edit" 置信度 0.5 → 0.55
         │
用户:   "做得好" (正面反馈)
         │
Observer: [evaluation: positive]
         │
Verifier: grep-before-edit 应用成功，效果正面
         │
Memory:  效果分 +0.1，综合置信度 → 0.65

─── 下一个会话 ───

Agent 需要修改代码
         │
Applicator: 发现相关本能 "grep-before-edit" (0.65)
         → 建议: "修改代码前先用搜索定位"
```

---

## 部署架构

### 模式一：纯本地（免费版 / 个人开发者）

```
开发者机器
├── Agent (Claude Code / Cursor)
├── AgentMind CLI
├── 本地 SQLite / JSON 存储
└── 本地分析 (LLM API 调用)
```

### 模式二：本地 + 云（团队版）

```
开发者机器                        Cloud
├── Agent                    ┌──────────────┐
├── AgentMind SDK ──sync──→ │ AgentMind API│
├── 本地缓存                  │ PostgreSQL   │
└── 本地分析                  │ Dashboard    │
                             │ Team Sharing │
                             └──────────────┘
```

### 模式三：全云托管（企业版）

```
开发者机器                        Cloud (Managed)
├── Agent                    ┌──────────────────┐
└── AgentMind SDK ──────→   │ AgentMind Cloud  │
    (轻量客户端)              │ ├── 分析引擎     │
                             │ ├── 记忆存储     │
                             │ ├── 进化系统     │
                             │ ├── 权限管理     │
                             │ └── 审计日志     │
                             └──────────────────┘
```

---

## 安全与隐私

| 层面       | 措施                  |
| -------- | ------------------- |
| **数据采集** | 只记录行为模式，不记录代码内容     |
| **本地存储** | 默认本地优先，加密存储         |
| **云同步**  | 可选，端到端加密            |
| **团队共享** | 只共享脱敏后的本能/模式        |
| **合规**   | GDPR 数据删除权，SOC2 可审计 |

---

## 相关文档

- [02-observation-layer](./02-observation-layer.md) — 观察层详细设计
- [03-analysis-engine](./03-analysis-engine.md) — 分析引擎详细设计
- [04-confidence-system](./04-confidence-system.md) — 置信度系统详细设计
- [05-evolution-system](./05-evolution-system.md) — 进化系统详细设计
- [06-api-sdk-design](./06-api-sdk-design.md) — API/SDK 接口设计
- [07-commercialization](./07-commercialization.md) — 商业化方案
- [08-implementation-roadmap](./08-implementation-roadmap.md) — 实施路线图

返回 → [00-README](./00-README.md)
