# Claude Code Plugin 开发规范与实施方案

> **基于官方文档（2026-02-10 最新版）的完整技术规范，将 AgentMind 实现为 Claude Code Plugin。**

---

## 一、Claude Code 插件体系总览

### 1.1 六种扩展机制

Claude Code 提供六种扩展方式，它们可以独立使用也可以组合打包为 Plugin：

| 机制 | 触发方式 | 能力 | 文件格式 |
|------|---------|------|---------|
| **Skills** | 自动激活（匹配描述）或 `/name` 手动调用 | 注入指令到 Agent 上下文 | `skills/<name>/SKILL.md` |
| **Commands** | `/name` 手动调用 | 同 Skills（旧格式） | `commands/<name>.md` |
| **Hooks** | 系统事件自动触发 | 拦截/观察 Agent 生命周期 | `hooks/hooks.json` |
| **Agents** | Claude 自动委派或手动调用 | 独立子 Agent 执行专门任务 | `agents/<name>.md` |
| **MCP Servers** | Agent 运行时自动可用 | 连接外部工具和服务 | `.mcp.json` |
| **LSP Servers** | 编辑文件时自动激活 | 代码智能（诊断、跳转、补全） | `.lsp.json` |

### 1.2 Plugin = 打包分发单元

```
Plugin 是将上述所有机制打包在一起的分发格式。
安装 Plugin 后，其中的 Skills/Hooks/Agents/MCP 全部自动生效。

独立配置（.claude/ 目录）  vs  Plugin
├── 个人使用，快速实验        ├── 团队分享，社区分发
├── 短 Skill 名: /hello      ├── 命名空间: /plugin-name:hello
└── 手动复制分享              └── marketplace 一键安装
```

### 1.3 Plugin 目录结构（官方规范）

```
plugin-name/
├── .claude-plugin/           ← 元数据目录（仅 plugin.json）
│   └── plugin.json             ← 插件清单（必需）
├── skills/                   ← Agent Skills（SKILL.md 格式）
│   ├── skill-a/
│   │   └── SKILL.md
│   └── skill-b/
│       ├── SKILL.md
│       └── reference.md
├── commands/                 ← 斜杠命令（.md 文件）
│   ├── status.md
│   └── reflect.md
├── agents/                   ← 子 Agent 定义
│   └── analyzer.md
├── hooks/                    ← 事件钩子
│   └── hooks.json
├── .mcp.json                 ← MCP 服务器配置（可选）
├── .lsp.json                 ← LSP 服务器配置（可选）
├── scripts/                  ← Hook 调用的脚本
│   ├── observe.ts
│   └── analyze.ts
├── README.md                 ← 插件文档
└── CHANGELOG.md              ← 版本历史
```

> **关键规则**：`commands/`、`agents/`、`skills/`、`hooks/` 必须在插件根目录，**不能**放在 `.claude-plugin/` 里面。只有 `plugin.json` 放在 `.claude-plugin/` 中。

---

## 二、plugin.json 完整规范

### 2.1 完整 Schema

```json
{
  "name": "agentmind",                    // 必需：唯一标识符（kebab-case）
  "version": "0.1.0",                     // 语义版本号
  "description": "Agent 自学习记忆系统",    // 简要描述
  "author": {
    "name": "AgentMind Team",
    "email": "dev@agentmind.dev",
    "url": "https://github.com/agentmind"
  },
  "homepage": "https://agentmind.dev",    // 文档 URL
  "repository": "https://github.com/agentmind/agentmind-plugin",
  "license": "MIT",
  "keywords": ["learning", "memory", "agent", "instinct"],

  // 组件路径（补充默认位置，非替换）
  "commands": "./commands/",              // string | array
  "agents": "./agents/",
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json",          // string | array | object（可内联）
  "mcpServers": "./.mcp.json",            // string | array | object（可内联）
  "lspServers": "./.lsp.json"
}
```

### 2.2 关键字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `name` | string | Yes | 唯一标识，也是命名空间前缀（`/agentmind:xxx`） |
| `version` | string | 推荐 | 语义版本，MAJOR.MINOR.PATCH |
| `description` | string | 推荐 | 插件管理器中显示 |
| `commands` | string\|array | 否 | 自定义命令路径，补充 `commands/` 目录 |
| `hooks` | string\|object | 否 | 可以引用文件路径，也可以直接内联 JSON |
| `mcpServers` | string\|object | 否 | 可以引用 `.mcp.json`，也可以内联 |

### 2.3 环境变量

| 变量 | 说明 |
|------|------|
| `${CLAUDE_PLUGIN_ROOT}` | 插件安装目录的绝对路径（核心！所有脚本引用必须用这个） |
| `$CLAUDE_PROJECT_DIR` | 用户项目根目录 |
| `$CLAUDE_SESSION_ID` | 当前会话 ID |
| `$CLAUDE_ENV_FILE` | 仅 SessionStart Hook 可用，写入环境变量持久化 |

---

## 三、Hooks 完整规范

### 3.1 所有 Hook 事件

```
Session Lifecycle:
  SessionStart ─→ UserPromptSubmit ─→ [Agentic Loop] ─→ Stop ─→ SessionEnd
                                         │
Agentic Loop:                            │
  PreToolUse → PermissionRequest → PostToolUse/PostToolUseFailure
                                         │
Subagent Events:                         │
  SubagentStart → SubagentStop           │
                                         │
Other Events:                            │
  Notification, PreCompact, TeammateIdle, TaskCompleted
```

| 事件 | 触发时机 | 匹配字段 | 可阻止？ | AgentMind 用途 |
|------|---------|---------|---------|---------------|
| **SessionStart** | 会话开始/恢复 | source: startup\|resume\|clear\|compact | No | 注入学习上下文 |
| **UserPromptSubmit** | 用户提交提示词 | 无 | Yes | 意图层观察 |
| **PreToolUse** | 工具执行前 | tool_name | Yes(allow/deny/ask) | 决策层观察 |
| **PostToolUse** | 工具成功执行后 | tool_name | No(已执行) | 执行层观察 |
| **PostToolUseFailure** | 工具执行失败 | tool_name | No | 错误模式收集 |
| **PermissionRequest** | 权限弹窗时 | tool_name | Yes(allow/deny) | - |
| **Stop** | Agent 完成响应 | 无 | Yes | 会话结束分析 |
| **SubagentStart** | 子 Agent 启动 | agent_type | No | - |
| **SubagentStop** | 子 Agent 结束 | agent_type | Yes | - |
| **Notification** | 发送通知 | notification_type | No | - |
| **PreCompact** | 上下文压缩前 | trigger: manual\|auto | No | 保存关键学习 |
| **SessionEnd** | 会话结束 | reason | No | 持久化数据 |
| **TeammateIdle** | 队友空闲 | 无 | Yes | - |
| **TaskCompleted** | 任务标记完成 | 无 | Yes | - |

### 3.2 hooks.json 格式

```json
{
  "description": "AgentMind 观察与学习钩子",
  "hooks": {
    "EventName": [
      {
        "matcher": "regex_pattern",      // 正则匹配（可选，部分事件不支持）
        "hooks": [
          {
            "type": "command",           // "command" | "prompt" | "agent"
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/xxx.sh",
            "timeout": 30,               // 超时秒数（command默认600, prompt默认30, agent默认60）
            "statusMessage": "正在观察...", // 加载提示
            "async": false               // 仅 command 类型可用，true=后台运行
          }
        ]
      }
    ]
  }
}
```

### 3.3 Hook 输入（stdin JSON）

所有 Hook 都会收到以下公共字段：

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/Users/.../project",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse"
}
```

各事件附加字段：

| 事件 | 附加字段 |
|------|---------|
| **SessionStart** | `source`, `model`, `agent_type?` |
| **UserPromptSubmit** | `prompt` |
| **PreToolUse** | `tool_name`, `tool_input`, `tool_use_id` |
| **PostToolUse** | `tool_name`, `tool_input`, `tool_response`, `tool_use_id` |
| **PostToolUseFailure** | `tool_name`, `tool_input`, `tool_use_id`, `error`, `is_interrupt?` |
| **Stop** | `stop_hook_active` (防止无限循环) |
| **SessionEnd** | `reason` |
| **PreCompact** | `trigger`, `custom_instructions` |
| **Notification** | `message`, `title?`, `notification_type` |

### 3.4 Hook 输出控制

**退出码：**
- `exit 0` → 允许，stdout 中的 JSON 会被解析
- `exit 2` → 阻止，stderr 内容反馈给 Claude
- 其他退出码 → 非阻塞错误，stderr 仅记录

**JSON 输出（exit 0 时）：**

```json
{
  // 通用字段
  "continue": true,                    // false = 完全停止 Claude
  "stopReason": "Build failed",        // continue=false 时显示给用户
  "suppressOutput": false,             // 是否隐藏 stdout
  "systemMessage": "Warning: ...",     // 警告消息

  // PreToolUse 专用
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",     // "allow" | "deny" | "ask"
    "permissionDecisionReason": "...",
    "updatedInput": { ... },           // 修改工具输入
    "additionalContext": "..."         // 注入上下文
  },

  // UserPromptSubmit / SessionStart 专用
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "..."         // 注入上下文到对话
  },

  // PostToolUse / Stop 专用
  "decision": "block",                // "block" 阻止
  "reason": "..."                     // 阻止原因
}
```

### 3.5 三种 Hook 类型

| 类型 | 触发方式 | 使用场景 |
|------|---------|---------|
| **command** | 执行 shell 命令 | 确定性规则（观察、验证、格式化） |
| **prompt** | 单次 LLM 调用评估 | 需要判断力的决策（内容审查） |
| **agent** | 多轮 Agent 验证 | 需要检查文件/运行命令的验证 |

Prompt/Agent Hook 返回格式：
```json
{ "ok": true }                        // 允许
{ "ok": false, "reason": "..." }      // 阻止
```

---

## 四、Skills 完整规范

### 4.1 SKILL.md 格式

```yaml
---
name: skill-name                        # 可选，默认用目录名
description: "技能描述，Claude 用此判断何时使用"  # 推荐
argument-hint: "[参数提示]"              # 可选，自动补全时显示
disable-model-invocation: true           # 仅手动调用，Claude 不自动触发
user-invocable: false                    # 仅 Claude 自动调用，用户看不到
allowed-tools: Read, Grep, Glob          # 限制可用工具
model: sonnet                            # 指定模型
context: fork                            # 在独立子 Agent 中运行
agent: Explore                           # context=fork 时使用的 Agent 类型
hooks:                                   # Skill 生命周期内的 Hook
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/check.sh"
---

Skill 的实际指令内容（Markdown 格式）...

可用变量替换：
- $ARGUMENTS — 用户传入的所有参数
- $ARGUMENTS[0], $1 — 按位置访问参数
- ${CLAUDE_SESSION_ID} — 会话 ID
- !`shell command` — 预处理：执行命令并替换为输出
```

### 4.2 Skill 优先级

```
Enterprise > Personal (~/.claude/skills/) > Project (.claude/skills/) > Plugin (命名空间隔离)
```

### 4.3 Skill 调用控制矩阵

| 设置 | 用户可调用 | Claude 可调用 | 何时加载 |
|------|-----------|-------------|---------|
| 默认 | Yes | Yes | 描述始终在上下文，调用时加载全文 |
| `disable-model-invocation: true` | Yes | No | 描述不在上下文，用户调用时加载 |
| `user-invocable: false` | No | Yes | 描述始终在上下文，Claude 调用时加载 |

---

## 五、Agents 规范

### 5.1 Agent 文件格式

```yaml
---
name: agent-name
description: "Agent 专长和调用时机"
---

Agent 的系统提示词...
```

Agent 出现在 `/agents` 界面中，Claude 可以根据任务自动委派。

---

## 六、Plugin 开发与测试

### 6.1 本地开发

```bash
# 使用 --plugin-dir 加载本地插件
claude --plugin-dir ./agentmind-plugin

# 可以同时加载多个插件
claude --plugin-dir ./plugin-a --plugin-dir ./plugin-b
```

### 6.2 调试

```bash
# 调试模式查看插件加载详情
claude --debug

# 在运行中切换详细模式
Ctrl+O  # 显示 Hook 输出
```

### 6.3 发布为 Marketplace

```json
// .claude-plugin/marketplace.json
{
  "name": "agentmind-marketplace",
  "owner": { "name": "AgentMind Team" },
  "plugins": [
    {
      "name": "agentmind",
      "source": "./",
      "description": "Agent 自学习记忆系统",
      "version": "0.1.0"
    }
  ]
}
```

用户安装：
```bash
/plugin marketplace add github-user/agentmind-plugin
/plugin install agentmind@agentmind-marketplace
```

### 6.4 分发方式

| 方式 | 适用场景 | 命令 |
|------|---------|------|
| GitHub repo | 推荐，最简单 | `/plugin marketplace add owner/repo` |
| Git URL | GitLab/自托管 | `/plugin marketplace add https://gitlab.com/...` |
| npm 包 | npm 生态 | `source: { "source": "npm", "package": "@agentmind/plugin" }` |
| 本地路径 | 开发测试 | `/plugin marketplace add ./path` |

---

## 七、AgentMind Plugin 具体实施方案

### 7.1 最终目录结构

```
agentmind-plugin/
├── .claude-plugin/
│   ├── plugin.json                    ← 插件清单
│   └── marketplace.json               ← Marketplace 定义
│
├── skills/
│   ├── agentmind-context/             ← 自动注入学习上下文
│   │   └── SKILL.md
│   └── agentmind-guide/              ← 行为最佳实践指导
│       └── SKILL.md
│
├── commands/
│   ├── status.md                      ← /agentmind:status
│   ├── reflect.md                     ← /agentmind:reflect
│   ├── evolve.md                      ← /agentmind:evolve
│   ├── instincts.md                   ← /agentmind:instincts
│   └── dashboard.md                   ← /agentmind:dashboard
│
├── agents/
│   ├── learning-analyst.md            ← 深度分析专用 Agent
│   └── evolution-engine.md            ← 进化执行专用 Agent
│
├── hooks/
│   └── hooks.json                     ← 四层观察 + 上下文注入
│
├── scripts/
│   ├── observe-intent.sh              ← 意图层观察
│   ├── observe-execution.sh           ← 执行层观察
│   ├── observe-evaluation.sh          ← 评估层观察
│   ├── inject-context.sh              ← 会话开始注入学习上下文
│   ├── analyze-session.sh             ← 会话结束触发分析
│   ├── pre-compact-save.sh            ← 压缩前保存关键数据
│   └── lib/                           ← 核心逻辑库
│       ├── storage.ts                 ← 本地存储引擎（SQLite/JSON）
│       ├── detector.ts                ← 模式检测器
│       ├── confidence.ts              ← 置信度计算
│       ├── instinct-manager.ts        ← 本能管理
│       ├── context-generator.ts       ← 上下文生成
│       └── types.ts                   ← TypeScript 类型
│
├── data/                              ← 运行时数据（.gitignore）
│   ├── observations/                  ← 观察记录
│   ├── instincts.json                 ← 本能存储
│   └── profile.json                   ← 用户画像
│
├── README.md
├── CHANGELOG.md
├── package.json                       ← npm 依赖（jq 的 Node 替代等）
└── tsconfig.json
```

### 7.2 hooks.json 设计

```json
{
  "description": "AgentMind - Agent 自学习记忆系统观察钩子",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/inject-context.sh",
            "timeout": 5,
            "statusMessage": "Loading learning context..."
          }
        ]
      }
    ],

    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/observe-intent.sh",
            "timeout": 3,
            "async": true
          }
        ]
      }
    ],

    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/observe-execution.sh --phase pre",
            "timeout": 2,
            "async": true
          }
        ]
      }
    ],

    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/observe-execution.sh --phase post",
            "timeout": 3,
            "async": true
          }
        ]
      }
    ],

    "PostToolUseFailure": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/observe-evaluation.sh --type error",
            "timeout": 3,
            "async": true
          }
        ]
      }
    ],

    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/analyze-session.sh",
            "timeout": 30,
            "async": true
          }
        ]
      }
    ],

    "PreCompact": [
      {
        "matcher": "auto|manual",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/pre-compact-save.sh",
            "timeout": 5
          }
        ]
      }
    ],

    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/analyze-session.sh --final",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**设计要点：**

1. **观察 Hooks 全部设为 `async: true`** — 不阻塞 Agent 执行，后台记录
2. **SessionStart 注入同步执行** — 必须在 Agent 处理前完成上下文注入
3. **PreToolUse 不做阻止** — 仅观察，不干扰工作流（`async: true`）
4. **Stop + SessionEnd 双保险** — Stop 是 async 后台分析，SessionEnd 是最终保存
5. **PreCompact 保存关键数据** — 压缩前确保重要观察不丢失
6. **timeout 严格控制** — 观察 2-3s，分析最多 30s

### 7.3 核心 Skills 设计

#### agentmind-context（自动注入学习上下文）

```yaml
---
name: agentmind-context
description: >
  Automatically injects relevant learning context from AgentMind into the
  conversation. Activates when Claude starts working on any coding task to
  provide learned preferences, patterns, and best practices.
user-invocable: false
---

## Your Learning Context (AgentMind)

The following preferences and patterns have been learned from previous sessions.
Apply them when relevant to the current task.

!`${CLAUDE_PLUGIN_ROOT}/scripts/lib/context-generator.ts generate`

If no context was loaded above, proceed normally without any special preferences.
```

#### agentmind-guide（背景知识）

```yaml
---
name: agentmind-guide
description: >
  Background knowledge about user's coding patterns and preferences.
  Applied automatically when writing or reviewing code.
user-invocable: false
---

When working on this codebase, be aware of these learned patterns:

!`${CLAUDE_PLUGIN_ROOT}/scripts/lib/context-generator.ts guide`
```

### 7.4 核心 Commands 设计

#### /agentmind:status

```yaml
---
name: status
description: Show AgentMind learning status and instinct overview
disable-model-invocation: true
argument-hint: "[domain]"
---

Show the AgentMind learning status. Run the status command and display results.

!`${CLAUDE_PLUGIN_ROOT}/scripts/lib/instinct-manager.ts status $ARGUMENTS`

Format the output clearly showing:
1. Total instincts count by status (active, tentative, deprecated)
2. Top 5 highest-confidence instincts
3. Recent learning activity
4. Domain breakdown
```

#### /agentmind:reflect

```yaml
---
name: reflect
description: Review and approve pending learnings from recent sessions
disable-model-invocation: true
context: fork
agent: general-purpose
---

# AgentMind Learning Review

Review the pending learnings and instinct candidates.

!`${CLAUDE_PLUGIN_ROOT}/scripts/lib/instinct-manager.ts pending`

For each candidate:
1. Show the trigger, action, and current confidence score
2. Show the evidence (observation count, contexts seen in)
3. Ask the user to Approve, Reject, or Modify
4. Update the instinct status based on user decision

After review, show a summary of changes made.
```

#### /agentmind:evolve

```yaml
---
name: evolve
description: Analyze instincts for evolution candidates and execute evolution
disable-model-invocation: true
context: fork
allowed-tools: Read, Grep, Glob, Bash
---

# AgentMind Evolution Analysis

Analyze current instincts for evolution opportunities.

!`${CLAUDE_PLUGIN_ROOT}/scripts/lib/instinct-manager.ts evolve-candidates`

For each evolution candidate:
1. Show the cluster of related instincts
2. Propose the evolved pattern/strategy
3. Show the abstract principle
4. Ask user to approve evolution

Execute approved evolutions and show the updated evolution tree.
```

### 7.5 Agent 设计

#### learning-analyst

```yaml
---
name: learning-analyst
description: >
  Deep analysis agent for AgentMind. Analyzes observation data to detect
  patterns, identify causal relationships, and generate instinct candidates.
  Use when performing deep analysis of coding sessions.
---

You are AgentMind's Learning Analyst. Your job is to analyze observation data
and extract meaningful learning patterns.

## Analysis Protocol

1. **Read observations**: Load recent observation data from the data directory
2. **Detect patterns**: Look for repeated sequences, corrections, preferences
3. **Assess causality**: Determine if patterns have causal relationships
4. **Generate candidates**: Create instinct candidates with evidence
5. **Score confidence**: Calculate initial confidence scores

## Output Format

For each detected pattern, output:
- Trigger condition (when does this apply?)
- Recommended action (what should be done?)
- Evidence strength (how many observations support this?)
- Suggested domain (what category?)
- Initial confidence score

Be conservative. Only suggest patterns with strong evidence (3+ observations).
```

### 7.6 关键脚本设计

#### observe-intent.sh（意图观察）

```bash
#!/bin/bash
# 从 stdin 读取 Hook 输入
INPUT=$(cat)

# 提取用户意图
PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# 检测是否包含纠正信号
HAS_CORRECTION=false
if echo "$PROMPT" | grep -iqE "no,|wrong|not that|instead|actually|don't|shouldn't|fix this"; then
  HAS_CORRECTION=true
fi

# 写入观察记录
OBSERVATION=$(jq -n \
  --arg sid "$SESSION_ID" \
  --arg ts "$TIMESTAMP" \
  --arg prompt "$PROMPT" \
  --argjson correction "$HAS_CORRECTION" \
  '{
    layer: "intent",
    session_id: $sid,
    timestamp: $ts,
    event: "user_prompt",
    data: {
      prompt_length: ($prompt | length),
      has_correction: $correction,
      prompt_hash: ($prompt | @base64)
    }
  }')

# 追加到 JSONL 文件
echo "$OBSERVATION" >> "${CLAUDE_PLUGIN_ROOT}/data/observations/$(date +%Y-%m-%d).jsonl"

exit 0
```

#### inject-context.sh（上下文注入）

```bash
#!/bin/bash
# SessionStart Hook - 同步执行，stdout 注入上下文

INSTINCTS_FILE="${CLAUDE_PLUGIN_ROOT}/data/instincts.json"

if [ ! -f "$INSTINCTS_FILE" ]; then
  exit 0  # 无学习数据，正常启动
fi

# 生成注入上下文
# 读取高置信度本能并格式化
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$INSTINCTS_FILE', 'utf8'));

const active = data.instincts
  .filter(i => i.status === 'active' && i.confidence.composite >= 0.5)
  .sort((a, b) => b.confidence.composite - a.confidence.composite);

if (active.length === 0) process.exit(0);

const strong = active.filter(i => i.confidence.composite >= 0.8);
const moderate = active.filter(i => i.confidence.composite >= 0.6 && i.confidence.composite < 0.8);
const tentative = active.filter(i => i.confidence.composite >= 0.5 && i.confidence.composite < 0.6);

let output = '';

if (strong.length > 0) {
  output += '### Strong Preferences (confidence >= 0.8):\n';
  strong.forEach(i => { output += '- ' + i.trigger + ': ' + i.action + '\n'; });
  output += '\n';
}

if (moderate.length > 0) {
  output += '### Patterns (confidence 0.6-0.8):\n';
  moderate.forEach(i => { output += '- ' + i.trigger + ': ' + i.action + '\n'; });
  output += '\n';
}

if (tentative.length > 0) {
  output += '### Suggestions (confidence 0.5-0.6):\n';
  tentative.slice(0, 5).forEach(i => { output += '- Consider: ' + i.action + '\n'; });
}

process.stdout.write(output);
"

exit 0
```

---

## 八、分阶段实施计划

### Phase 0: Plugin MVP（1 周）

```
Day 1: 项目结构搭建
├── 创建 plugin 目录结构
├── 编写 plugin.json
├── 编写 hooks.json（全部 Hook 注册）
└── 基础脚本框架（空壳 + 正确的 stdin/stdout 协议）

Day 2-3: 观察层实现
├── observe-intent.sh（意图层 - UserPromptSubmit）
├── observe-execution.sh（执行层 - Pre/PostToolUse）
├── observe-evaluation.sh（评估层 - PostToolUseFailure）
├── JSONL 写入器
└── 数据目录管理

Day 4-5: 上下文注入 + 本能存储
├── inject-context.sh（SessionStart 注入）
├── instinct-manager.ts（本能 CRUD）
├── 基础模式检测（序列 + 纠正）
└── instincts.json 存储格式

Day 6-7: Commands + 测试
├── /agentmind:status 命令
├── /agentmind:instincts 命令
├── 端到端自测（用 --plugin-dir 加载）
└── README 文档
```

### Phase 1: 核心功能（2 周）

```
Week 2: 分析 + 置信度
├── 深度模式检测
├── 纠正模式追踪
├── 频率置信度计算
├── /agentmind:reflect 命令
└── analyze-session.sh 实现

Week 3: 进化 + Skills
├── 聚类算法
├── /agentmind:evolve 命令
├── agentmind-context Skill（自动注入）
├── agentmind-guide Skill（行为指导）
└── learning-analyst Agent
```

### Phase 2: Marketplace 发布（1 周）

```
Week 4: 打包 + 发布
├── 创建 GitHub 仓库
├── marketplace.json 配置
├── README + 截图 + 使用说明
├── 提交到 claude-plugins-official
└── ProductHunt / Hacker News 发布
```

---

## 九、开发注意事项

### 9.1 性能约束

| 约束 | 限制 | 对策 |
|------|------|------|
| Hook 超时 | 默认 600s（建议 <5s） | 观察 Hook 全部 async |
| stdin 读取 | JSON 数据可能很大 | 只提取需要的字段 |
| 文件 I/O | 频繁写入影响性能 | 批量缓冲写入 |
| 上下文预算 | Skill 描述占 2% 上下文窗口 | 保持描述简洁 |

### 9.2 安全要求

```
必须做：
├── 不存储原始代码内容（只存行为模式）
├── 引用脚本路径始终用 ${CLAUDE_PLUGIN_ROOT}
├── Shell 变量加双引号 "$VAR"
├── 检查路径遍历 (..)
├── 只在 data/ 目录写入数据

绝不能做：
├── 在 Hook 中执行用户代码
├── 将密码/密钥写入观察数据
├── 修改用户项目文件
└── 向外部发送数据（Free 版）
```

### 9.3 Plugin 缓存机制

```
安装时：Plugin 目录被复制到 ~/.claude/ 下的缓存位置
影响：
├── 不能引用插件目录外的文件（../xxx 不工作）
├── 必须用 ${CLAUDE_PLUGIN_ROOT} 引用自身文件
├── 符号链接会被跟随复制
└── 更新需要 /plugin update
```

### 9.4 常见错误排查

| 问题 | 原因 | 解决 |
|------|------|------|
| Plugin 不加载 | plugin.json 无效 | `claude plugin validate .` |
| Commands 不显示 | 目录放在 .claude-plugin/ 内 | 移到插件根目录 |
| Hook 不触发 | 脚本无执行权限 | `chmod +x script.sh` |
| MCP 失败 | 路径未用 ${CLAUDE_PLUGIN_ROOT} | 替换为变量引用 |
| 路径错误 | 用了绝对路径 | 改为 `./` 相对路径 |
| JSON 解析失败 | shell profile 有 echo | 用 `[[ $- == *i* ]]` 包裹 |

---

## 十、与 SDK 方案的关系

```
AgentMind 产品架构：

Layer 1: Claude Code Plugin（本文档）
├── 免费核心功能
├── 本地观察 + 分析 + 本能管理
├── CLI 命令 + Skills + Hooks
└── 用户直接安装使用

Layer 2: @agentmind/sdk（独立 npm 包）
├── 供其他 Agent 平台集成
├── Cursor / LangChain / CrewAI 适配器
└── 标准化 API

Layer 3: AgentMind Cloud（SaaS）
├── 云同步 + Dashboard
├── 团队功能 + 本能市场
├── Pro/Team/Enterprise 订阅
└── 调用 SDK 核心功能

策略：先做 Plugin（最快触达用户）→ 提炼 SDK → 构建 Cloud
```

---

## 相关文档

- [01-system-architecture](./01-system-architecture.md) — 系统架构设计
- [06-api-sdk-design](./06-api-sdk-design.md) — SDK/API 设计
- [08-implementation-roadmap](./08-implementation-roadmap.md) — 总体路线图
- [07-commercialization](./07-commercialization.md) — 商业化方案

返回 → [00-README](./00-README.md)
