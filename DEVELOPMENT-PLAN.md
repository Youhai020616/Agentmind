# AgentMind 产品开发规划

## 当前代码盘点

### 已完成（Phase 0 + 0.5）

| 模块 | 文件 | 行数 | 状态 | 能力 |
|------|------|------|------|------|
| 类型定义 | `types.ts` | 164 | ✅ 完整 | Observation/Instinct/Pattern/Strategy/ExpertSystem 全类型 |
| 置信度引擎 | `confidence.ts` | 166 | ✅ 完整 | 三维评分 + Wilson 区间 + 衰减 + 格式化 |
| 模式检测 | `detector.ts` | 232 | ✅ 基础可用 | N-gram 序列检测 + 纠正检测 + 错误模式 + 候选生成 |
| 存储引擎 | `storage.ts` | 233 | ✅ 完整 | JSON/JSONL 原子写入 + CRUD + 统计 |
| 上下文生成 | `context-generator.ts` | 163 | ✅ 完整 | 分层注入（Strong/Pattern/Suggestion）+ token 预算控制 |
| Instinct 管理 | `instinct-manager.ts` | 407 | ✅ 完整 | status/list/pending/evolve/tree/search/export/import |
| 意图观测 | `observe-intent.sh` | 90 | ✅ 可用 | 纠正检测（3类）+ prompt 分类（6类） |
| 执行观测 | `observe-execution.sh` | 129 | ✅ 可用 | 工具抽象化（隐私安全）+ pre/post 双阶段 |
| 评估观测 | `observe-evaluation.sh` | 77 | ✅ 可用 | 错误分类（7类）+ 中断过滤 |
| 会话分析 | `analyze-session.sh` | 241 | ✅ 可用 | N-gram 检测 + 候选生成 + 原子写入 |
| 上下文注入 | `inject-context.sh` | 47 | ✅ 可用 | SessionStart 注入学到的偏好 |
| 紧急保存 | `pre-compact-save.sh` | 57 | ✅ 可用 | PreCompact 时保存关键数据 |
| 进化 Agent | `evolution-engine.md` | 97 | ✅ 设计完 | L0→L1→L2→L3 进化协议 |
| 分析 Agent | `learning-analyst.md` | 80 | ✅ 设计完 | 深度分析协议 |
| 测试套件 | `__tests__/*.ts` | 1851 | ✅ 115/115 通过 | detector/confidence/storage/instinct-manager/context-generator/integration |
| Commands | `commands/*.md` | 5 个 | ✅ 骨架 | status/instincts/reflect/evolve/dashboard |

### 未完成（Phase 1-4）

| 缺失 | 严重程度 | 说明 |
|------|----------|------|
| 进化引擎实际执行 | 🔴 核心 | evolution-engine.md 只是 prompt，没有代码实现 L0→L1 聚类 |
| 有效性反馈闭环 | 🔴 核心 | instinct 被应用后没有追踪成功/失败 |
| 人类反馈机制 | 🟡 重要 | human confidence 维度永远是 0.5，没有收集入口 |
| Dashboard 可视化 | 🟡 重要 | dashboard-data 有 JSON 输出，但没有渲染 UI |
| 中文 prompt 支持 | 🟡 重要 | observe-intent.sh 的 grep 关键词全是英文 |
| 跨 session 分析 | 🟡 重要 | analyze-session.sh 只看当天同 session 数据 |
| 偏好检测 | 🟡 重要 | detector.ts 有 sequence/correction/error 但缺 preference_detection |
| 过期清理 | 🟢 优化 | 没有定期清理低置信度 instinct 的逻辑 |
| MCP/外部工具观测 | 🟢 扩展 | observe-execution.sh 对 MCP 工具只记录 "other" |

---

## 与已学习框架的对比分析

### vs GSD (get-shit-done, 28.6K ⭐)

| 维度 | GSD | AgentMind | 差距 & 启发 |
|------|-----|-----------|-------------|
| 状态管理 | STATE.md（YAML frontmatter + markdown） | instincts.json（纯 JSON） | GSD 的双格式更适合人读+机器读。**建议**：加 `STATUS.md` 人类可读视图 |
| 偏差处理 | R1-R4 偏差规则 + 3 次安全阀 | 无 | **建议**：instinct 应用失败 3 次自动降级 |
| 上下文控制 | 35%/25% 阈值 + debounce | 2000 字符硬上限 | GSD 更智能。**建议**：按 instinct 重要性动态分配 token |
| 并行执行 | Wave 模式（依赖图→并行组） | 无 | 暂不需要 |
| Agent 分工 | opus/sonnet/haiku 按角色选模型 | 单一 Agent | **建议**：分析用大模型，观测用轻量脚本（已做到） |

**核心启发**：GSD 的 "plan = prompt" 哲学。AgentMind 的 instinct 本质上就是动态生成的 prompt 片段——应该更显式地把 instinct 当作 Agent 的自我修改型 prompt。

### vs Viral Writer Skill（11 维度创作框架）

| 维度 | Viral Writer | AgentMind | 启发 |
|------|-------------|-----------|------|
| 知识结构 | 11 个固定维度 | 动态学习的 instinct | Viral Writer 是**人工设计的专家知识**，AgentMind 是**自动提取的行为知识** |
| 域迁移 | 跨平台适配（公众号/小红书/抖音） | domain 标签分类 | **建议**：instinct 也应有 "适用平台/场景" 标签 |
| 层级 | 维度→模板→成品 | L0→L1→L2→L3 | 理念相似。Viral Writer 证明了分层知识结构的有效性 |
| 输出控制 | 不展示分析过程，只出成品 | context injection 也是隐式 | ✅ 一致——学到的知识默默生效，不打扰用户 |

**核心启发**：AgentMind 目前只学 **编程行为**。如果扩展到 **内容创作行为**（用户的写作风格、常用表达、偏好结构），就变成"会自动学习的 Viral Writer"。

### vs OpenClaw 记忆系统（MEMORY.md + memory/*.md）

| 维度 | OpenClaw | AgentMind | 差距 |
|------|----------|-----------|------|
| 存储形式 | Markdown 文件（人类可读） | JSON（机器可读） | **建议**：加 Markdown 导出视图 |
| 更新方式 | Agent 手动写入 | Hook 自动观测 | ✅ AgentMind 更自动化 |
| 回忆方式 | 语义搜索（memory_search） | 按 confidence 排序注入 | OpenClaw 更灵活。**建议**：加语义匹配——根据当前任务动态选 instinct |
| 层级 | 日志（原始）+ MEMORY.md（精炼） | observation（原始）+ instinct（精炼）+ pattern/strategy（抽象） | ✅ AgentMind 层级更丰富 |
| 跨 session | ✅ memory_search 跨文件 | ❌ 只看当天 | **关键缺陷**：必须支持跨日分析 |

**核心启发**：OpenClaw 的 `memory_search` 是**按需回忆**（query-driven），AgentMind 是**主动注入**（push-based）。最理想的方案是**两者结合**——高置信度 instinct 主动注入，低置信度的等被问到再出来。

### vs 口袋硅基新媒体办公室（PM + 8 员工）

| 维度 | 新媒体办公室 | AgentMind | 启发 |
|------|-------------|-----------|------|
| 协作模式 | PM 外派 → 员工回报 | 单 Agent 自学习 | 如果 AgentMind 能让**每个员工**都有记忆，PM 分配任务时可以说"designer 上次用这个风格你很满意" |
| 知识传递 | PM 手动原文转发 | 自动 context injection | **组合机会**：AgentMind 做新媒体办公室的"团队记忆层" |
| 专业化 | 固定角色 + 固定 prompt | 动态学习的 domain | AgentMind 能让通用 Agent 逐渐变成专家 |

**核心启发**：AgentMind 不只是个人工具，可以是**多 Agent 系统的共享记忆基础设施**。

---

## 产品开发规划

### Phase 1: 核心闭环（1-2 周）

**目标**：让 "观测→学习→应用→反馈" 完整跑通

#### 1.1 有效性反馈闭环 🔴
当前 instinct 被注入后，不知道是否真的有用。

```
新增 Hook: PostToolUse
当 context 中注入了某 instinct，且后续操作成功 → effectiveness +0.05
当 context 中注入了某 instinct，且后续操作失败 → effectiveness -0.1
```

实现方式：
- `inject-context.sh` 输出时记录当前注入的 instinct ID 列表到 `data/active-instincts.json`
- `observe-execution.sh` post 阶段检查 `active-instincts.json`，根据成功/失败更新 effectiveness

#### 1.2 人类反馈入口 🔴
当前 human 维度永远 0.5。

方案 A（轻量）：
- `/agentmind:reflect` 命令展示 pending instinct，用户说 "approve" / "reject"
- 已有 `showPending()` 函数，加 approve/reject 操作即可

方案 B（自然）：
- 当 Agent 做了基于 instinct 的行为，用户纠正时，自动降低该 instinct 的 human score
- 复用 `observe-intent.sh` 的 correction 检测，关联到最近应用的 instinct

**建议两个都做**：A 是显式反馈，B 是隐式反馈。

#### 1.3 跨日分析 🟡
当前 `analyze-session.sh` 只看当天 `.jsonl`。

修改：加载最近 7 天的 observation 文件做 N-gram 分析，跨 session 的重复模式才是真正的偏好。

#### 1.4 中文 prompt 支持 🟡
`observe-intent.sh` 的纠正检测只认英文关键词。

加入中文模式：
```bash
# 中文纠正信号
if echo "$PROMPT" | grep -qE "(不对|错了|不是这样|重新|换一个|别这样|我要的是)"; then
  HAS_CORRECTION=true
  CORRECTION_TYPE="explicit_rejection"
fi
```

---

### Phase 2: 进化引擎实现（第 3-4 周）

**目标**：instinct 自动聚类成 pattern/strategy

#### 2.1 L0→L1 自动聚类
`evolution-engine.md` 已设计了完整协议，需要代码实现：

新建 `scripts/lib/evolution.ts`：
```typescript
export function clusterInstincts(instincts: Instinct[]): Pattern[] {
  // 1. 按 domain 分组
  // 2. 同 domain 内按 trigger 相似度聚类
  // 3. 3+ 个相关 instinct → 生成 Pattern
  // 4. 计算 cohesion 和 confidence
}
```

触发时机：
- `analyze-session.sh --final` 执行后
- 或 `/agentmind:evolve` 手动触发

#### 2.2 L1→L2 策略抽象
当 Pattern confidence > 0.6 时，调用 LLM 生成抽象 principle：

```
输入：Pattern "TypeScript React Component Standards"
  - instinct 1: "When creating component, use interface not type"
  - instinct 2: "When naming props, use ComponentNameProps convention"
  - instinct 3: "When exporting, prefer named export over default"

输出：Strategy
  principle: "Prioritize explicit, self-documenting code contracts"
  transferable_contexts: ["Python type hints", "Go interfaces", "API schema design"]
```

这一步需要 LLM 调用——可以在 `/agentmind:evolve` 命令中用 Claude 自身能力完成（不需要外部 API）。

#### 2.3 降级机制
- 2 周未见 → frequency 衰减（已有 `applyDecay`，需定期调用）
- 3 次应用失败 → status 降为 tentative
- composite < 0.2 → status 降为 deprecated
- 每月清理 deprecated instinct

---

### Phase 3: 智能上下文（第 5-6 周）

**目标**：从"全量注入"到"按需匹配"

#### 3.1 任务感知注入
当前 `inject-context.sh` 把所有高置信度 instinct 都注入。

改为：根据当前工作目录/文件类型/任务类型动态选择：
```
用户在 .tsx 文件工作 → 只注入 domain=react 的 instinct
用户在调试 → 只注入 domain=debugging 的 instinct
用户在写测试 → 只注入 domain=testing 的 instinct
```

实现方式：`SessionStart` hook 输入包含 `cwd`，用 `package.json` / 文件结构推断项目类型。

#### 3.2 动态 token 预算
当前硬上限 2000 字符。

改为按 instinct 重要性动态分配：
```
core (≥0.8):     每个 instinct 最多 100 字符
strong (0.6-0.8): 每个 instinct 最多 60 字符
moderate (0.4-0.6): 每个 instinct 最多 40 字符（一句话）
总预算: 取决于模型上下文窗口的 2%
```

#### 3.3 偏好检测器（新模块）
当前只检测 sequence/correction/error。

新增 preference_detection：
- 代码风格偏好（Tab vs Space、引号、分号）
- 工具选择偏好（grep 还是 find、vim 还是 nano）
- 工作流偏好（先测试还是先实现、PR 大小）

从 `observe-execution.sh` 的 `abstract` 字段中提取。

---

### Phase 4: 多平台 + 多 Agent（第 7-10 周）

#### 4.1 OpenClaw Skill 适配
核心 TS 模块不依赖 Claude Code Plugin API。封装为 OpenClaw Skill：

```
~/.openclaw/skills/agentmind/
  SKILL.md           # 触发描述
  scripts/lib/       # 复用现有核心代码
  data/              # 本地存储
```

OpenClaw 没有 Plugin Hook，改为：
- SessionStart → 用 BOOTSTRAP.md 注入
- 观测 → 后台 cron 分析 memory/ 日志
- 反馈 → 用户在聊天中说 "记住这个偏好"

#### 4.2 npm 包发布
```
@agentmind/core — 核心模块（detector/confidence/storage/evolution）
@agentmind/cli  — CLI 工具（instinct-manager 命令行）
```

让其他 Agent 框架也能用 AgentMind 的记忆能力。

#### 4.3 多 Agent 共享记忆
场景：口袋硅基新媒体办公室。

```
AgentMind 作为共享记忆层：
- PM 学到："老板喜欢先看数据再看方案"
- Designer 学到："老板偏好蓝金配色、水彩风"
- Copywriter 学到："老板不喜欢感叹号太多"

→ 新任务来时，每个员工自动调用各自 domain 的 instinct
→ PM 还能调用全局 instinct 做分配决策
```

实现：`instincts.json` 加 `agent_id` 字段，支持 per-agent 和 global 两级。

---

## 里程碑 & 验收标准

| 里程碑 | 时间 | 验收标准 |
|--------|------|----------|
| M1: 闭环跑通 | 第 2 周末 | 真实使用 2 周产生 20+ instinct，effectiveness 有数据（不全是 0.5） |
| M2: 进化可用 | 第 4 周末 | 至少 1 个 Pattern 自动生成，evolve-candidates 有输出 |
| M3: 智能注入 | 第 6 周末 | 不同项目注入不同 instinct，token 占用 < 模型上下文 2% |
| M4: 多平台 | 第 10 周末 | npm 包发布 + OpenClaw Skill 可用 + 多 Agent 演示 |

## 技术债务

1. **Shell → TypeScript 迁移**：observe-*.sh 用 bash+jq 写的，跨平台兼容性差（GNU vs BSD sed/grep/date）。长期应迁移到 TS（用 `run.sh` 作为 shim 已有基础）。
2. **JSON → SQLite**：instincts.json 在 1000+ instinct 时会有性能问题。storage.ts 已预留了接口抽象，可无缝切换。
3. **原子写入竞争**：多个 async hook 同时写 `.jsonl` 可能丢数据。需要 file lock 或改用 SQLite WAL。
