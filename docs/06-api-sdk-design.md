# API / SDK 接口设计

## SDK 总览

```
@agentmind/sdk          ← 核心 SDK (TypeScript)
@agentmind/cli          ← CLI 工具
@agentmind/adapter-claude  ← Claude Code 适配器
@agentmind/adapter-cursor  ← Cursor 适配器
@agentmind/adapter-langchain ← LangChain 适配器
@agentmind/dashboard    ← Web Dashboard (Next.js)
```

---

## 核心 SDK API

### 初始化

```typescript
import { AgentMind } from '@agentmind/sdk';

const mind = new AgentMind({
  // 存储模式
  storage: 'local',          // 'local' | 'cloud' | 'hybrid'
  storagePath: '~/.agentmind', // 本地存储路径

  // 分析配置
  analysis: {
    model: 'haiku',           // 分析用的 LLM
    schedule: 'session-end',  // 分析时机
    minObservations: 10,      // 最少观察数才触发分析
  },

  // 置信度配置
  confidence: {
    weights: { frequency: 0.35, effectiveness: 0.40, human: 0.25 },
    autoApplyThreshold: 0.8,  // 自动应用阈值
    decayRate: 0.02,          // 周衰减率
  },

  // 隐私配置
  privacy: {
    storeRawContent: false,   // 不存储原始内容
    anonymize: true,          // 匿名化处理
  },

  // 适配器
  adapter: 'claude-code',     // 目标 Agent 平台
});
```

### 观察 API

```typescript
// 记录观察
await mind.observe({
  layer: 'intent',
  event: 'user_prompt',
  data: { intent: 'refactor auth', hasCorrection: false }
});

await mind.observe({
  layer: 'execution',
  event: 'tool_use',
  data: { tool: 'Grep', success: true, duration: 450 }
});

// 批量记录
await mind.observeBatch([
  { layer: 'decision', event: 'tool_chosen', data: { tool: 'Grep' } },
  { layer: 'execution', event: 'tool_start', data: { tool: 'Grep' } },
]);
```

### 记忆查询 API

```typescript
// 获取所有活跃本能
const instincts = await mind.instincts.list({
  status: 'active',
  minConfidence: 0.5,
  domain: 'code-style',
});

// 语义搜索相关本能
const relevant = await mind.instincts.search(
  'writing a new React component',
  { topK: 5, minConfidence: 0.4 }
);

// 获取应该注入上下文的本能
const toInject = await mind.instincts.getForContext({
  currentTask: 'create login page',
  techStack: ['react', 'typescript', 'tailwind'],
  threshold: 0.6,
});
```

### 反馈 API

```typescript
// 记录应用结果
await mind.feedback.record({
  instinctId: 'inst_abc123',
  outcome: 'positive',
  signals: {
    userAccepted: true,
    taskCompleted: true,
    noErrors: true,
  }
});

// 用户显式审核
await mind.feedback.humanReview({
  instinctId: 'inst_abc123',
  approved: true,
  comment: '这个模式确实有用',
});
```

### 进化 API

```typescript
// 分析进化候选
const candidates = await mind.evolve.analyze({
  minClusterSize: 3,
  domain: 'frontend',
});

// 执行进化
const evolved = await mind.evolve.execute(candidates[0].id);

// 查看进化树
const tree = await mind.evolve.getTree({
  domain: 'frontend',
  maxDepth: 3,
});
```

---

## CLI 工具

```bash
# 安装
npm install -g @agentmind/cli

# 初始化（为当前 Agent 平台生成 Hook 配置）
agentmind init --adapter claude-code

# 查看本能状态
agentmind status
agentmind status --domain code-style
agentmind status --low-confidence

# 手动触发分析
agentmind analyze
agentmind analyze --deep  # 深度分析（包含因果推理）

# 进化管理
agentmind evolve           # 分析进化候选
agentmind evolve --execute # 执行进化
agentmind evolve --tree    # 显示进化树

# 人工审核
agentmind reflect           # 类似 /reflect，审核待处理的学习
agentmind reflect --approve-all  # 全部批准
agentmind reflect --skip         # 跳过

# 导入导出
agentmind export --domain frontend > frontend-instincts.json
agentmind import teammate-instincts.json --trust 0.6

# Dashboard
agentmind dashboard  # 启动 Web Dashboard (localhost:3847)
```

### `agentmind init` 生成的 Hook 配置

```json
// 自动写入 ~/.claude/settings.json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "agentmind observe --layer intent --hook UserPromptSubmit"
      }]
    }],
    "PreToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "agentmind observe --layer execution --hook PreToolUse"
      }]
    }],
    "PostToolUse": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "agentmind observe --layer execution --hook PostToolUse"
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "agentmind analyze --on-session-end"
      }]
    }]
  }
}
```

---

## REST API（Cloud 版本）

### 认证

```bash
# API Key 认证
curl -H "Authorization: Bearer am_key_xxxxx" \
  https://api.agentmind.dev/v1/instincts
```

### 端点

```yaml
# 本能管理
GET    /v1/instincts                    # 列出本能
POST   /v1/instincts                    # 创建本能
GET    /v1/instincts/:id                # 获取单个
PATCH  /v1/instincts/:id                # 更新
DELETE /v1/instincts/:id                # 删除
POST   /v1/instincts/search             # 语义搜索

# 观察
POST   /v1/observations                 # 提交观察
POST   /v1/observations/batch           # 批量提交

# 分析
POST   /v1/analyze                      # 触发分析
GET    /v1/analyze/status/:jobId        # 分析状态

# 反馈
POST   /v1/feedback                     # 提交反馈
GET    /v1/feedback/stats/:instinctId   # 反馈统计

# 进化
GET    /v1/evolution/candidates          # 进化候选
POST   /v1/evolution/execute             # 执行进化
GET    /v1/evolution/tree                # 进化树

# 团队
GET    /v1/team/instincts               # 团队共享本能
POST   /v1/team/share                   # 分享本能
GET    /v1/team/members                  # 团队成员

# 用户画像
GET    /v1/profile                       # 用户画像
GET    /v1/profile/insights              # 画像洞察

# Dashboard 数据
GET    /v1/dashboard/overview            # 总览数据
GET    /v1/dashboard/confidence-trends   # 置信度趋势
GET    /v1/dashboard/domain-breakdown    # 领域分布
```

### 请求/响应示例

```bash
# 语义搜索相关本能
POST /v1/instincts/search
{
  "query": "writing a React component with TypeScript",
  "topK": 5,
  "minConfidence": 0.5,
  "domains": ["frontend", "code-style"]
}

# 响应
{
  "results": [
    {
      "id": "inst_001",
      "trigger": "when creating React components",
      "action": "use functional components with TypeScript interface for props",
      "confidence": { "frequency": 0.8, "effectiveness": 0.75, "human": 0.9, "composite": 0.81 },
      "domain": "frontend",
      "relevanceScore": 0.92
    },
    {
      "id": "inst_002",
      "trigger": "when defining component props",
      "action": "use interface over type for better extensibility",
      "confidence": { "frequency": 0.7, "effectiveness": 0.6, "human": 0.5, "composite": 0.60 },
      "domain": "code-style",
      "relevanceScore": 0.85
    }
  ],
  "totalMatches": 2,
  "queryTime": "12ms"
}
```

---

## Webhook 事件

```typescript
// 当置信度发生显著变化时通知
interface WebhookEvent {
  type: 'instinct.created' | 'instinct.updated' | 'instinct.deprecated'
      | 'evolution.candidate' | 'evolution.completed'
      | 'confidence.threshold_crossed';
  data: Record<string, unknown>;
  timestamp: string;
}

// 配置
agentmind webhooks add https://your-app.com/hooks/agentmind \
  --events instinct.created,evolution.completed
```

---

## Agent 上下文注入格式

SDK 可以生成注入 Agent System Prompt 的学习上下文：

```typescript
const context = await mind.generateContext({
  task: 'build authentication module',
  maxTokens: 500,     // 不超过 500 tokens
  format: 'markdown', // 'markdown' | 'json' | 'yaml'
});

// 生成结果示例：
`
## Your Learning Context (AgentMind)

### Strong Preferences (confidence > 0.8):
- When writing auth code: always use bcrypt for password hashing, never md5/sha256
- When creating API routes: include rate limiting middleware

### Patterns (confidence 0.6-0.8):
- Before modifying code: search → read → edit workflow
- After writing features: write tests immediately

### Suggestions (confidence 0.4-0.6):
- Consider using Zod for request validation
`
```

---

## 相关文档

- [01-system-architecture](./01-system-architecture.md) — 整体架构
- [07-commercialization](./07-commercialization.md) — 定价与分层
- [08-implementation-roadmap](./08-implementation-roadmap.md) — 实施计划

返回 → [00-README](./00-README.md)
