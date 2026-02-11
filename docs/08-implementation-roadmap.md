# 分阶段实施路线图

## 总览

```
Phase 0        Phase 1          Phase 2          Phase 3
MVP            核心产品          团队版            企业版
2 周            6 周             8 周              12 周
─────────────────────────────────────────────────────────→

核心观察       分析引擎          团队共享          SSO/审计
本地存储       置信度系统        Dashboard         自托管
CLI 基础       进化基础          本能市场          行业方案
              Pro 发布          Team 发布          Enterprise
```

---

## Phase 0: MVP（2 周）

> **目标**：最小可用版本，验证核心价值

### Week 1: 基础框架

```
Day 1-2: 项目初始化
├── TypeScript monorepo (turborepo)
├── packages/core     — 核心 SDK
├── packages/cli      — CLI 工具
├── packages/adapters — Agent 适配器
└── 基础 CI/CD

Day 3-4: 观察层 MVP
├── 执行层观察器（PreToolUse/PostToolUse）
├── 意图层观察器（UserPromptSubmit）
├── JSONL 本地存储
└── Claude Code 适配器

Day 5: CLI MVP
├── agentmind init
├── agentmind observe
└── agentmind status
```

### Week 2: 分析 + 本能

```
Day 6-7: 基础分析
├── 序列模式检测（N-gram）
├── 纠正模式检测
└── 频率置信度

Day 8-9: 本能管理
├── 本能创建/读取/更新
├── 本地 JSON 存储
├── agentmind instincts list
└── agentmind instincts show <id>

Day 10: 集成测试 + 文档
├── 端到端测试流程
├── README + Quick Start
└── npm 发布 alpha
```

### MVP 交付物

```
@agentmind/core@0.1.0-alpha
@agentmind/cli@0.1.0-alpha
@agentmind/adapter-claude@0.1.0-alpha

功能:
✅ 观察工具调用和用户消息
✅ 基础模式检测（序列 + 纠正）
✅ 本地本能存储
✅ CLI 状态查看
✅ Claude Code Hook 自动配置
```

---

## Phase 1: 核心产品（6 周）

> **目标**：完整的个人版产品，可以发布 Pro

### Week 3-4: 分析引擎增强

```
分析引擎 v1:
├── 因果推理模块
│   ├── 共现率计算
│   ├── 反事实分析
│   └── LLM 辅助因果判断
│
├── 错误-解决模式检测
│   ├── 错误类型分类
│   └── 解决步骤提取
│
├── 用户画像模块
│   ├── 技术偏好提取
│   ├── 工作习惯推断
│   └── EMA 更新算法
│
└── 分析调度
    ├── 实时轻量分析
    ├── 会话级中等分析
    └── 定时深度分析
```

### Week 5-6: 置信度系统

```
置信度 v1:
├── 三维评分实现
│   ├── 频率分
│   ├── 效果分（Wilson 置信区间）
│   └── 人工分（贝叶斯更新）
│
├── 复合评分引擎
│   ├── 加权计算
│   ├── 降级惩罚
│   └── 应用策略分层
│
├── 反馈收集
│   ├── 自动检测（用户是否纠正）
│   ├── 显式审核 (agentmind reflect)
│   └── 效果信号采集
│
└── 衰减系统
    ├── 周衰减任务
    ├── Deprecated 标记
    └── 自动清理
```

### Week 7-8: 进化系统 + 数据库

```
进化 v1:
├── 聚类算法
│   ├── 三维相似度
│   ├── 层次聚类
│   └── 类型判断（sequential/parallel/conditional）
│
├── 基础抽象
│   └── LLM 辅助原则提炼
│
├── PostgreSQL 迁移
│   ├── Prisma schema
│   ├── 迁移脚本
│   └── 从 JSON 迁移工具
│
└── Pro 功能
    ├── 云同步基础
    └── API Key 认证
```

### Phase 1 交付物

```
@agentmind/core@0.5.0
@agentmind/cli@0.5.0
@agentmind/adapter-claude@0.5.0

新增:
✅ 因果推理分析
✅ 三维置信度评分
✅ 效果反馈验证
✅ 基础进化（聚类 + 抽象）
✅ PostgreSQL 存储
✅ agentmind reflect 命令
✅ agentmind evolve 命令
✅ Pro 版 API Key 认证

可以发布:
→ npm 公开包 (Free 版)
→ Pro 订阅 ($12/月)
```

---

## Phase 2: 团队版（8 周）

> **目标**：团队功能 + Dashboard + 本能市场

### Week 9-12: Web Dashboard

```typescript
// Next.js 14 App Router

app/
├── (auth)/
│   ├── login/
│   └── register/
├── (dashboard)/
│   ├── overview/          // 总览：本能数量、置信度趋势、领域分布
│   ├── instincts/         // 本能列表、搜索、筛选
│   │   └── [id]/          // 单个本能详情、置信度历史、证据链
│   ├── evolution/         // 进化树可视化
│   ├── profile/           // 用户画像洞察
│   ├── team/              // 团队管理
│   │   ├── members/
│   │   ├── shared/        // 共享本能
│   │   └── review/        // 审核队列
│   └── settings/
├── api/
│   └── v1/               // REST API
└── components/
    ├── confidence-radar/   // 三维雷达图
    ├── evolution-tree/     // 进化树组件
    ├── instinct-card/      // 本能卡片
    └── trend-chart/        // 趋势图表
```

### Week 13-14: 团队功能

```
团队 v1:
├── 团队创建与管理
├── 本能共享机制
│   ├── 个人 → 团队 发布
│   ├── 团队 → 个人 继承
│   └── 继承时置信度折扣 (×0.7)
│
├── 审核流程
│   ├── 成员提交 → Leader 审核 → 团队本能
│   └── 自动审核（置信度 > 0.8 的跳过审核）
│
├── 新成员入职
│   └── 自动继承团队活跃本能（置信度 > 0.6）
│
└── 团队 Dashboard
    ├── 团队本能概览
    ├── 成员学习进度
    └── 团队最佳实践
```

### Week 15-16: 本能市场 Beta

```
市场 v1:
├── 本能包发布
│   ├── 打包格式 (.ampack)
│   ├── 描述 + 预览 + 评分
│   └── 版本管理
│
├── 发现与搜索
│   ├── 分类浏览
│   ├── 关键词搜索
│   └── 推荐算法
│
├── 安装与导入
│   ├── agentmind install <pack>
│   ├── 一键导入为 inherited 本能
│   └── 初始置信度设定
│
└── 支付 (Stripe)
    ├── 免费包
    ├── 付费包 ($5-$50)
    └── 创作者分成 (70/30)
```

### Phase 2 交付物

```
新包:
@agentmind/dashboard@1.0.0
@agentmind/api@1.0.0

功能:
✅ Web Dashboard (Next.js)
✅ 团队创建与管理
✅ 本能共享 + 审核
✅ 本能市场 Beta
✅ Stripe 支付集成
✅ REST API 完整版
✅ Webhook 事件

可以发布:
→ Team 订阅 ($8/用户/月)
→ 本能市场 Beta
```

---

## Phase 3: 企业版（12 周）

> **目标**：企业级功能 + 规模化

### 核心功能

```
企业 v1:
├── SSO 集成 (SAML/OIDC)
├── 审计日志
│   ├── 所有操作记录
│   ├── 导出功能
│   └── 合规报告
│
├── 自托管方案
│   ├── Docker Compose
│   ├── Kubernetes Helm Chart
│   └── 安装向导
│
├── 高级安全
│   ├── 端到端加密
│   ├── 数据驻留选择
│   └── IP 白名单
│
├── 高级分析
│   ├── 跨项目迁移评估
│   ├── ROI 计算报告
│   └── 团队效率洞察
│
└── 更多适配器
    ├── Cursor 适配器
    ├── LangChain 适配器
    ├── CrewAI 适配器
    └── 自定义适配器 SDK
```

---

## 技术架构演进

```
Phase 0 (MVP)               Phase 1 (Core)             Phase 2+ (Scale)
───────────────              ──────────────             ─────────────────
本地 JSON                    PostgreSQL                 PostgreSQL + Redis
  │                            │                          │
同步分析                     BullMQ 队列                 分布式分析
  │                            │                          │
CLI only                     CLI + API                  CLI + API + Dashboard
  │                            │                          │
单适配器                     多适配器                    适配器 SDK
```

---

## 里程碑 Checklist

### M0: MVP 可用 (Week 2)
- [ ] 观察器正常捕获 Claude Code 工具调用
- [ ] 模式检测能识别 3 种以上模式
- [ ] CLI 能显示本能列表和状态
- [ ] 在自己的开发中 dogfood 1 周

### M1: Pro 发布 (Week 8)
- [ ] 三维置信度正常运作
- [ ] 效果验证反馈闭环工作
- [ ] 进化能产出有意义的 Pattern
- [ ] npm 公开发布
- [ ] ProductHunt 发布
- [ ] 10+ 外部用户

### M2: Team 发布 (Week 16)
- [ ] Dashboard 完成核心页面
- [ ] 团队本能共享工作正常
- [ ] 本能市场能发布/安装
- [ ] 3+ 团队用户
- [ ] MRR > $500

### M3: Enterprise Ready (Week 28)
- [ ] SSO 集成测试通过
- [ ] 自托管部署文档完成
- [ ] 1+ 企业客户 PoC
- [ ] SOC2 Type 1 启动

---

## 资源需求

### 单人开发 (Phase 0-1)

```
角色：全栈开发者（就是你）
时间：2 个月全职
成本：
├── LLM API (分析用)：$20/月
├── Vercel (hosting)：$0 (Hobby)
├── PostgreSQL (Neon)：$0 (Free tier)
├── 域名：$12/年
└── 总计：≈ $50/月
```

### 扩展团队 (Phase 2+)

```
需要增加：
├── 前端开发 (Dashboard)：1 人
├── 设计师 (UX)：兼职/外包
└── 运营/市场：兼职

成本增加：
├── Vercel Pro：$20/月
├── PostgreSQL：$50/月
├── Redis：$30/月
├── Stripe：交易 2.9%
└── 总计：≈ $200-500/月
```

---

## MVP 快速启动指南

```bash
# Day 1: 项目初始化
mkdir agentmind && cd agentmind
npx create-turbo@latest
# 创建 packages/core, packages/cli, packages/adapter-claude

# Day 2: 核心观察模块
# 实现 observe.ts, writers/jsonl-writer.ts

# Day 3: Claude Code 适配器
# 实现 adapter-claude.ts, hook-generator.ts

# Day 4: 模式检测
# 实现 detectors/sequence.ts, detectors/correction.ts

# Day 5: CLI
# 实现 commands/init.ts, commands/status.ts, commands/instincts.ts

# Day 6-7: 本能存储 + 管理
# 实现 storage/local.ts, instinct-manager.ts

# Day 8-9: 集成测试
# 自己用 Claude Code 开发，同时让 AgentMind 观察

# Day 10: 发布 alpha
npm publish --tag alpha
```

---

## 相关文档

- [07-commercialization](./07-commercialization.md) — 商业化策略
- [06-api-sdk-design](./06-api-sdk-design.md) — API/SDK 设计
- [01-system-architecture](./01-system-architecture.md) — 系统架构

返回 → [00-README](./00-README.md)
