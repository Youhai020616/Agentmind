# 多层观察系统设计

## 设计哲学

> **"你无法改善你无法观察的东西。"**

现有系统（CL v2 只看工具调用，/reflect 只看用户消息）的根本问题是**观察维度不够**。AgentMind 采用四层观察模型，覆盖 Agent 行为的完整生命周期。

---

## 四层观察模型

```
┌─────────────────────────────────────────────┐
│  Layer 1: Intent（意图层）                    │
│  "用户想做什么"                               │
│  ← UserPromptSubmit Hook                     │
├─────────────────────────────────────────────┤
│  Layer 2: Decision（决策层）                   │
│  "Agent 选择了什么方案"                       │
│  ← Agent 推理拦截 / Planning 输出            │
├─────────────────────────────────────────────┤
│  Layer 3: Execution（执行层）                  │
│  "实际调用了什么工具"                         │
│  ← PreToolUse / PostToolUse Hook             │
├─────────────────────────────────────────────┤
│  Layer 4: Evaluation（评估层）                 │
│  "结果如何，用户满意吗"                       │
│  ← 任务完成信号 + 用户反馈检测               │
└─────────────────────────────────────────────┘
```

---

## Layer 1: Intent Observer（意图观察器）

### 捕获内容

| 信号 | 说明 | 示例 |
|------|------|------|
| 用户请求 | 原始需求描述 | "帮我写一个登录页面" |
| 纠正信号 | 用户对 Agent 输出的修正 | "不要用 class，改成函数式" |
| 偏好表达 | 明确表达的技术偏好 | "我更喜欢 Tailwind" |
| 上下文暗示 | 隐含的项目约定 | 提到 "按照我们的规范..." |

### Hook 实现

```typescript
// intent-observer.ts
import { ObserverPlugin } from '@agentmind/sdk';

export const intentObserver: ObserverPlugin = {
  name: 'intent-observer',
  hook: 'UserPromptSubmit',

  async capture(event) {
    const { message, sessionId, timestamp } = event;

    // 1. 检测是否包含纠正信号
    const correction = detectCorrection(message);

    // 2. 检测是否包含偏好表达
    const preference = detectPreference(message);

    // 3. 提取意图关键词
    const intent = extractIntent(message);

    return {
      layer: 'intent',
      sessionId,
      timestamp,
      data: {
        messageHash: hash(message),    // 不存原文，只存哈希
        intent: intent.summary,         // "重构认证模块"
        intentType: intent.type,        // "refactor" | "create" | "fix" | "explain"
        hasCorrection: !!correction,
        correction: correction?.pattern, // "class → functional"
        hasPreference: !!preference,
        preference: preference?.value,   // "prefer: tailwind"
      }
    };
  }
};
```

### 纠正信号检测

```typescript
// correction-detector.ts
const CORRECTION_PATTERNS = [
  // 直接否定
  { pattern: /^(不|别|不要|不是|错了|wrong)/i, weight: 0.9 },
  // 替代建议
  { pattern: /(用|改成|换成|应该是|instead|use)\s+\S+/i, weight: 0.7 },
  // 重做请求
  { pattern: /(重新|重来|再试|redo|again|retry)/i, weight: 0.6 },
  // 修正语气
  { pattern: /(其实|实际上|actually|但是|however)/i, weight: 0.4 },
];

interface CorrectionSignal {
  pattern: string;       // "class → functional"
  confidence: number;    // 0.4 - 0.9
  previousAction: string; // Agent 之前做了什么
  correctedTo: string;    // 用户希望改成什么
}

function detectCorrection(
  message: string,
  previousAgentAction?: string
): CorrectionSignal | null {
  for (const { pattern, weight } of CORRECTION_PATTERNS) {
    if (pattern.test(message)) {
      return {
        pattern: extractCorrectionPattern(message),
        confidence: weight,
        previousAction: previousAgentAction ?? 'unknown',
        correctedTo: extractDesiredAction(message),
      };
    }
  }
  return null;
}
```

---

## Layer 2: Decision Observer（决策观察器）

### 捕获内容

| 信号 | 说明 | 示例 |
|------|------|------|
| 方案选择 | Agent 在多个方案中选了哪个 | 选择了 Zustand 而非 Redux |
| 推理路径 | Agent 的思考过程 | "考虑到项目规模，选择轻量方案" |
| 工具选择 | 选择了哪个工具组合 | Grep → Read → Edit 而非直接 Edit |
| 放弃方案 | 考虑过但没选的方案 | 考虑过 class 组件但选了函数组件 |

### Hook 实现

```typescript
// decision-observer.ts
export const decisionObserver: ObserverPlugin = {
  name: 'decision-observer',
  hook: 'PreToolUse',

  async capture(event) {
    const { tool, input, sessionId, timestamp } = event;

    // 推断 Agent 的决策上下文
    const decisionContext = inferDecisionContext(tool, input);

    return {
      layer: 'decision',
      sessionId,
      timestamp,
      data: {
        toolChosen: tool,
        toolCategory: categorize(tool),  // "search" | "read" | "write" | "execute"
        inputPattern: abstractInput(input), // 抽象化，不存实际内容
        sequencePosition: getSequencePosition(sessionId), // 在当前序列中的位置
        previousTool: getPreviousTool(sessionId),
        decisionPattern: decisionContext.pattern, // "search-before-modify"
      }
    };
  }
};

// 工具序列追踪
class ToolSequenceTracker {
  private sequences: Map<string, string[]> = new Map();

  recordTool(sessionId: string, tool: string) {
    const seq = this.sequences.get(sessionId) ?? [];
    seq.push(tool);

    // 只保留最近 20 个工具调用
    if (seq.length > 20) seq.shift();
    this.sequences.set(sessionId, seq);
  }

  // 检测重复序列
  detectRepeatingSequences(sessionId: string): string[][] {
    const seq = this.sequences.get(sessionId) ?? [];
    const patterns: string[][] = [];

    // 滑动窗口检测 2-5 长度的重复模式
    for (let len = 2; len <= 5; len++) {
      for (let i = 0; i <= seq.length - len * 2; i++) {
        const pattern = seq.slice(i, i + len);
        const next = seq.slice(i + len, i + len * 2);
        if (JSON.stringify(pattern) === JSON.stringify(next)) {
          patterns.push(pattern);
        }
      }
    }
    return patterns;
  }
}
```

---

## Layer 3: Execution Observer（执行观察器）

### 捕获内容

| 信号 | 说明 | 示例 |
|------|------|------|
| 工具输入 | 工具调用参数（抽象化） | `Edit: auth.ts, line 42` |
| 工具输出 | 执行结果摘要 | `成功 / 失败 / 部分完成` |
| 错误信息 | 错误类型和模式 | `TypeError: Cannot read property` |
| 执行时间 | 工具执行耗时 | `1200ms` |
| 重试次数 | 工具是否被重试 | `重试 2 次后成功` |

### Hook 实现

```typescript
// execution-observer.ts
export const executionObserver: ObserverPlugin = {
  name: 'execution-observer',
  hooks: ['PreToolUse', 'PostToolUse'],

  async capturePreTool(event) {
    const startTime = Date.now();

    return {
      layer: 'execution',
      phase: 'start',
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      data: {
        tool: event.tool,
        inputAbstract: abstractToolInput(event.tool, event.input),
        // 例如：Grep → { pattern: "auth.*handler", fileScope: "src/" }
        // 例如：Edit → { file: "auth.ts", lineRange: "40-50", changeType: "replace" }
      },
      _startTime: startTime,  // 内部字段，用于计算耗时
    };
  },

  async capturePostTool(event) {
    return {
      layer: 'execution',
      phase: 'complete',
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      data: {
        tool: event.tool,
        success: !event.output?.includes('Error'),
        outputType: classifyOutput(event.output), // "match_found" | "file_modified" | "error" | "empty"
        errorPattern: extractErrorPattern(event.output), // "TypeError" | "SyntaxError" | null
        duration: Date.now() - event._startTime,
      }
    };
  }
};

// 工具输入抽象化——关键隐私保护
function abstractToolInput(tool: string, input: any): Record<string, unknown> {
  switch (tool) {
    case 'Grep':
      return {
        patternType: classifyPattern(input.pattern),  // "import" | "function" | "variable" | "error"
        scope: input.path ? 'directory' : 'project',
        hasGlob: !!input.glob,
      };
    case 'Edit':
      return {
        fileExtension: getExtension(input.file_path),  // ".ts" | ".tsx" | ".py"
        changeSize: estimateChangeSize(input.old_string, input.new_string), // "small" | "medium" | "large"
        changeType: classifyChange(input.old_string, input.new_string), // "rename" | "refactor" | "add" | "remove"
      };
    case 'Read':
      return {
        fileExtension: getExtension(input.file_path),
        isPartialRead: !!(input.offset || input.limit),
      };
    case 'Bash':
      return {
        commandCategory: classifyCommand(input.command), // "git" | "npm" | "test" | "build" | "other"
        hasTimeout: !!input.timeout,
      };
    default:
      return { tool, abstract: true };
  }
}
```

---

## Layer 4: Evaluation Observer（评估观察器）

### 捕获内容

| 信号 | 说明 | 权重 |
|------|------|------|
| 显式正面 | 用户说"好的"、"可以"、"做得好" | +0.3 |
| 显式负面 | 用户说"不对"、"重新来" | -0.5 |
| 隐式正面 | 用户继续下一个任务（没纠正） | +0.1 |
| 隐式负面 | 用户撤销/修改了 Agent 的输出 | -0.3 |
| 任务完成 | 任务流程走完，没有错误 | +0.2 |
| 任务失败 | 出现错误或用户放弃 | -0.4 |

### Hook 实现

```typescript
// evaluation-observer.ts
export const evaluationObserver: ObserverPlugin = {
  name: 'evaluation-observer',
  hooks: ['UserPromptSubmit', 'Stop'],

  async captureUserPrompt(event) {
    const sentiment = analyzeSentiment(event.message);
    const isFollowUp = detectFollowUpType(event.message);

    return {
      layer: 'evaluation',
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      data: {
        sentiment: sentiment.label,      // "positive" | "negative" | "neutral"
        sentimentScore: sentiment.score,  // -1.0 to 1.0
        followUpType: isFollowUp,        // "continue" | "correct" | "undo" | "new_task"
        // "continue" = 隐式正面（用户接受了输出，继续推进）
        // "correct" = 显式负面（用户纠正）
        // "undo" = 强负面（用户要求撤销）
        // "new_task" = 中性（开始新任务）
      }
    };
  },

  async captureSessionEnd(event) {
    const sessionStats = computeSessionStats(event.sessionId);

    return {
      layer: 'evaluation',
      type: 'session_summary',
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      data: {
        totalTools: sessionStats.toolCount,
        errorCount: sessionStats.errorCount,
        correctionCount: sessionStats.correctionCount,
        positiveSignals: sessionStats.positiveCount,
        negativeSignals: sessionStats.negativeCount,
        overallSentiment: sessionStats.netSentiment, // -1.0 to 1.0
        taskCompletionRate: sessionStats.completionRate, // 0 to 1
        instinctsApplied: sessionStats.appliedInstincts,
        instinctsEffective: sessionStats.effectiveInstincts,
      }
    };
  }
};
```

---

## 数据存储格式

### 观察事件 (JSONL)

```jsonl
{"id":"obs_001","ts":"2026-02-10T10:30:00Z","session":"s_abc","layer":"intent","data":{"intent":"refactor auth","intentType":"refactor","hasCorrection":false}}
{"id":"obs_002","ts":"2026-02-10T10:30:01Z","session":"s_abc","layer":"decision","data":{"toolChosen":"Grep","toolCategory":"search","sequencePosition":0}}
{"id":"obs_003","ts":"2026-02-10T10:30:02Z","session":"s_abc","layer":"execution","phase":"start","data":{"tool":"Grep","inputAbstract":{"patternType":"function","scope":"directory"}}}
{"id":"obs_004","ts":"2026-02-10T10:30:03Z","session":"s_abc","layer":"execution","phase":"complete","data":{"tool":"Grep","success":true,"outputType":"match_found","duration":450}}
{"id":"obs_005","ts":"2026-02-10T10:30:15Z","session":"s_abc","layer":"evaluation","data":{"sentiment":"positive","sentimentScore":0.6,"followUpType":"continue"}}
```

### 存储策略

| 阶段 | 存储位置 | 格式 | 保留期 |
|------|---------|------|--------|
| 实时捕获 | 内存缓冲 | 事件对象 | 会话内 |
| 会话内 | 本地 JSONL | 追加写入 | 7 天 |
| 分析后 | 本地 SQLite / PostgreSQL | 结构化 | 30 天 |
| 提炼结果 | 本能文件 / DB | Markdown / JSON | 永久 |

---

## 适配器系统

为不同 Agent 平台提供适配器：

```typescript
// adapters/claude-code.ts
import { AgentAdapter } from '@agentmind/sdk';

export const claudeCodeAdapter: AgentAdapter = {
  name: 'claude-code',

  // 映射 Claude Code 的 Hook 系统
  hookMapping: {
    'intent':    'UserPromptSubmit',
    'decision':  'PreToolUse',       // 通过工具选择推断决策
    'execution': ['PreToolUse', 'PostToolUse'],
    'evaluation': ['UserPromptSubmit', 'Stop'],
  },

  // 生成 settings.json Hook 配置
  generateHookConfig() {
    return {
      UserPromptSubmit: [{
        matcher: '',
        hooks: [{ type: 'command', command: 'agentmind observe intent' }]
      }],
      PreToolUse: [{
        matcher: '*',
        hooks: [{ type: 'command', command: 'agentmind observe pre-tool' }]
      }],
      PostToolUse: [{
        matcher: '*',
        hooks: [{ type: 'command', command: 'agentmind observe post-tool' }]
      }],
      Stop: [{
        hooks: [{ type: 'command', command: 'agentmind observe session-end' }]
      }]
    };
  }
};

// adapters/cursor.ts
export const cursorAdapter: AgentAdapter = {
  name: 'cursor',
  // Cursor 的 Hook 系统不同，需要适配...
};

// adapters/langchain.ts
export const langchainAdapter: AgentAdapter = {
  name: 'langchain',
  // LangChain 使用回调系统...
  hookMapping: {
    'intent':    'onChainStart',
    'decision':  'onLLMStart',
    'execution': ['onToolStart', 'onToolEnd'],
    'evaluation': 'onChainEnd',
  }
};
```

---

## 性能约束

| 指标 | 目标 | 方法 |
|------|------|------|
| Hook 延迟 | < 5ms | 异步写入，不阻塞 Agent |
| 内存占用 | < 50MB | 环形缓冲，定期刷盘 |
| 磁盘写入 | < 1MB/会话 | 抽象化存储，不存原始内容 |
| CPU 占用 | < 1% | 批量处理，非实时分析 |

```typescript
// 高性能异步写入
class ObservationWriter {
  private buffer: ObservationEvent[] = [];
  private readonly FLUSH_INTERVAL = 5000; // 5 秒
  private readonly FLUSH_SIZE = 50;       // 50 条

  async write(event: ObservationEvent) {
    this.buffer.push(event);

    if (this.buffer.length >= this.FLUSH_SIZE) {
      await this.flush();
    }
  }

  private async flush() {
    const events = this.buffer.splice(0);
    if (events.length === 0) return;

    // 批量追加写入 JSONL
    const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
    await fs.appendFile(this.filePath, lines);
  }
}
```

---

## 隐私保护设计

```
原始数据                    →    存储的数据
────────────────────────────────────────────────
"重构 src/auth/login.ts"    →    { intent: "refactor", fileType: ".ts", domain: "auth" }
"const password = '123'"    →    ❌ 不存储代码内容
"TypeError at line 42"      →    { errorType: "TypeError", location: "abstract" }
用户邮箱 admin@test.com     →    ❌ 不存储 PII
"用 bcrypt 替换 md5"        →    { correction: "crypto_upgrade", from: "weak", to: "strong" }
```

**核心原则**：存储的是**行为模式**，而非**具体内容**。

---

## 相关文档

- [01-system-architecture](./01-system-architecture.md) — 系统架构总览
- [03-analysis-engine](./03-analysis-engine.md) — 分析引擎如何处理观察数据
- [06-api-sdk-design](./06-api-sdk-design.md) — SDK 中的观察器 API

返回 → [00-README](./00-README.md)
