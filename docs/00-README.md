# AgentMind — Agent 自学习记忆系统

> **让 AI Agent 拥有记忆、学会成长、越用越懂你。**

## 项目愿景

当前的 AI Agent（Claude Code、Cursor、Copilot 等）每次会话都是"失忆"的——上次犯过的错会重犯，上次学到的技巧会忘记。**AgentMind** 要解决的核心问题是：

> **让任何 AI Agent 具备跨会话的持续学习能力。**

就像人类新员工从第一天的生疏，到一个月后熟悉团队习惯，再到三个月后成为高效成员——AgentMind 让 Agent 走同样的成长路径。

---

## 核心理念

```
观察 → 理解 → 记忆 → 应用 → 验证 → 进化
  O       U       M       A       V       E
```

**OUMAVE 循环**——不只是记录模式（Observe），还要理解因果（Understand），形成可靠记忆（Memorize），在恰当时机应用（Apply），验证效果（Verify），最终进化为更高层级的能力（Evolve）。

---

## 产品定位

| 维度       | 描述                                         |
| -------- | ------------------------------------------ |
| **一句话**  | Agent 记忆与学习中间件                             |
| **目标用户** | AI Agent 开发者、使用 Claude Code / Cursor 的开发团队 |
| **核心价值** | Agent 不再失忆，越用越聪明                           |
| **交付形式** | SDK + CLI + Cloud Dashboard                |
| **竞争壁垒** | 多层观察 + 因果置信度 + 进化抽象 + 效果反馈闭环               |

---

## 与现有方案的差异

| 特性    | claude-reflect | CL v2 (Homunculus) | **AgentMind**       |     |
| ----- | -------------- | ------------------ | ------------------- | --- |
| 观察维度  | 用户消息           | 工具调用               | **四层全覆盖**           |     |
| 学习方式  | 人工审核           | 频率统计               | **因果推理 + 效果验证**     |     |
| 置信度来源 | 无              | 观察频率               | **复合评分（频率+效果+人工）**  |     |
| 进化能力  | 无              | 简单聚类               | **抽象提升 + 跨项目迁移**    |     |
| 反馈闭环  | 无              | 无                  | **应用后评估效果**         |     |
| 商业化   | 无              | 无                  | **SaaS + SDK + 市场** |     |

---

## 文档索引

| 文档 | 内容 |
|------|------|
| [01-system-architecture](./01-system-architecture.md) | 系统架构总览 |
| [02-observation-layer](./02-observation-layer.md) | 多层观察系统设计 |
| [03-analysis-engine](./03-analysis-engine.md) | 分析引擎与因果推理 |
| [04-confidence-system](./04-confidence-system.md) | 复合置信度评分系统 |
| [05-evolution-system](./05-evolution-system.md) | 进化与抽象机制 |
| [06-api-sdk-design](./06-api-sdk-design.md) | API / SDK 接口设计 |
| [07-commercialization](./07-commercialization.md) | 商业化方案与定价 |
| [08-implementation-roadmap](./08-implementation-roadmap.md) | 分阶段实施路线图 |
| [09-market-analysis](./09-market-analysis.md) | 深度市场分析：用户场景、竞品、差异化、开源参考 |
| [10-claude-code-plugin-guide](./10-claude-code-plugin-guide.md) | **Claude Code Plugin 开发规范与实施方案** |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **核心 SDK** | TypeScript, Node.js |
| **CLI 工具** | TypeScript, Commander.js |
| **Web Dashboard** | Next.js 14+, React 18+, Tailwind CSS, Shadcn/ui |
| **API 后端** | Next.js API Routes / Express |
| **数据库** | PostgreSQL (主存储) + Redis (缓存/实时) |
| **ORM** | Prisma |
| **向量存储** | pgvector (语义搜索) |
| **消息队列** | BullMQ (后台分析任务) |
| **LLM 分析** | Claude Haiku (成本优化) / GPT-4o-mini |
| **测试** | Vitest, Playwright |
| **部署** | Vercel (Dashboard) + Railway/Fly.io (API) |

---

## 快速理解

```
开发者使用 AI Agent 写代码
        │
        │  AgentMind SDK 嵌入
        ▼
┌─────────────────────────────────────┐
│  📡 四层观察                         │
│  意图 · 决策 · 执行 · 评估          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  🧠 分析引擎                         │
│  模式检测 · 因果推理 · 用户画像      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  📊 置信度系统                       │
│  频率分 · 效果分 · 人工分 → 复合分   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  💾 记忆存储                         │
│  本能库 · 规则库 · 进化产物          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  🧬 进化系统                         │
│  聚类 · 抽象 · 迁移 · 退化          │
└──────────────┬──────────────────────┘
               │
               ▼
       Agent 越来越懂你
```
