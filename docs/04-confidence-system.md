# 复合置信度评分系统

## 核心创新

现有系统只用**频率**衡量置信度（观察了几次）。AgentMind 使用**三维复合评分**：

```
                    频率分
                   (观察了多少次)
                     /
                    /
    复合置信度 ────
                    \
                     \
               效果分           人工分
           (用了有没有用)    (用户认不认可)
```

---

## 三维评分模型

### 维度一：频率分 (Frequency Score)

基于模式被观察到的次数。

```typescript
function calculateFrequencyScore(observations: number, contradictions: number): number {
  // 基础频率分
  const base =
    observations <= 2 ? 0.3 :
    observations <= 5 ? 0.5 :
    observations <= 10 ? 0.7 :
    observations <= 20 ? 0.85 :
    0.95;

  // 矛盾惩罚
  const contradictionPenalty = contradictions * 0.1;

  // 时间衰减（在外层处理）
  return Math.max(0, base - contradictionPenalty);
}
```

| 观察次数 | 基础分 | 含义 |
|---------|--------|------|
| 1-2 | 0.30 | 试探性 — 可能是偶然 |
| 3-5 | 0.50 | 中等 — 有一定规律 |
| 6-10 | 0.70 | 较强 — 明显模式 |
| 11-20 | 0.85 | 强 — 确定性高 |
| 21+ | 0.95 | 核心行为 |

### 维度二：效果分 (Effectiveness Score)

基于本能被应用后的实际效果。**这是 AgentMind 的核心差异化**。

```typescript
interface ApplicationRecord {
  instinctId: string;
  appliedAt: string;
  outcome: 'positive' | 'negative' | 'neutral';
  signals: OutcomeSignals;
}

interface OutcomeSignals {
  userAccepted: boolean;       // 用户没有纠正
  taskCompleted: boolean;      // 任务成功完成
  noErrorsIntroduced: boolean; // 没有引入新错误
  timeSaved: number;           // 相比平均节省的时间(ms)
}

function calculateEffectivenessScore(records: ApplicationRecord[]): number {
  if (records.length === 0) return 0.5; // 无数据，中性默认

  const positiveCount = records.filter(r => r.outcome === 'positive').length;
  const negativeCount = records.filter(r => r.outcome === 'negative').length;
  const total = records.length;

  // Wilson 置信区间下界（处理小样本偏差）
  // 比简单的 positive/total 更稳健
  const z = 1.96; // 95% 置信水平
  const p = positiveCount / total;
  const denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator;

  return Math.max(0, Math.min(1, center - margin));
}
```

### 维度三：人工分 (Human Approval Score)

基于用户显式认可或拒绝。

```typescript
function calculateHumanScore(
  approvals: number,
  rejections: number,
  reflectApproved: boolean  // 是否通过 /reflect 审核
): number {
  if (reflectApproved) return 0.95; // /reflect 审核通过，最高信任

  if (approvals + rejections === 0) return 0.5; // 无人工数据

  // 贝叶斯更新：先验 0.5，每次审核更新
  let score = 0.5;
  const learningRate = 0.15;

  for (let i = 0; i < approvals; i++) {
    score = score + learningRate * (1 - score);
  }
  for (let i = 0; i < rejections; i++) {
    score = score - learningRate * score;
  }

  return score;
}
```

### 复合评分

```typescript
interface ConfidenceWeights {
  frequency: number;      // 默认 0.35
  effectiveness: number;  // 默认 0.40（最重要）
  human: number;          // 默认 0.25
}

function calculateCompositeConfidence(
  frequency: number,
  effectiveness: number,
  human: number,
  weights: ConfidenceWeights = { frequency: 0.35, effectiveness: 0.40, human: 0.25 }
): number {
  const composite =
    frequency * weights.frequency +
    effectiveness * weights.effectiveness +
    human * weights.human;

  // 如果任一维度极低（< 0.2），触发降级
  const minScore = Math.min(frequency, effectiveness, human);
  if (minScore < 0.2) {
    return composite * 0.7; // 惩罚 30%
  }

  return Math.max(0, Math.min(1, composite));
}
```

---

## 置信度生命周期

```
┌──────────────────────────────────────────────────────────────┐
│                       置信度生命周期                           │
│                                                              │
│  诞生        成长        成熟        衰退        消亡        │
│   │          │           │           │           │           │
│  0.3 ──→   0.5 ──→    0.7 ──→    0.5 ──→    0.2 → 删除    │
│   │          │           │           │           │           │
│  初次       重复         效果        长期        无价值       │
│  观察       确认         验证        未用        淘汰         │
│             +因果        +人工审核                            │
│             支持                                              │
└──────────────────────────────────────────────────────────────┘
```

### 置信度变化规则

```typescript
interface ConfidenceUpdate {
  trigger: string;
  frequencyDelta: number;
  effectivenessDelta: number;
  humanDelta: number;
}

const UPDATE_RULES: ConfidenceUpdate[] = [
  // 正面信号
  { trigger: 'pattern_observed_again',  frequencyDelta: +0.05, effectivenessDelta: 0,     humanDelta: 0 },
  { trigger: 'applied_successfully',     frequencyDelta: 0,     effectivenessDelta: +0.08, humanDelta: 0 },
  { trigger: 'user_accepted',           frequencyDelta: 0,     effectivenessDelta: +0.05, humanDelta: +0.10 },
  { trigger: 'reflect_approved',        frequencyDelta: 0,     effectivenessDelta: 0,     humanDelta: +0.30 },
  { trigger: 'causal_link_confirmed',   frequencyDelta: +0.10, effectivenessDelta: 0,     humanDelta: 0 },

  // 负面信号
  { trigger: 'pattern_contradicted',    frequencyDelta: -0.10, effectivenessDelta: 0,     humanDelta: 0 },
  { trigger: 'applied_failed',          frequencyDelta: 0,     effectivenessDelta: -0.15, humanDelta: 0 },
  { trigger: 'user_corrected',          frequencyDelta: 0,     effectivenessDelta: -0.10, humanDelta: -0.15 },
  { trigger: 'reflect_rejected',        frequencyDelta: 0,     effectivenessDelta: 0,     humanDelta: -0.30 },

  // 时间衰减
  { trigger: 'weekly_decay',            frequencyDelta: -0.02, effectivenessDelta: -0.01, humanDelta: -0.005 },
];
```

---

## 应用阈值策略

```typescript
interface ApplicationPolicy {
  tier: string;
  confidenceRange: [number, number];
  action: string;
  injectionMethod: string;
}

const POLICIES: ApplicationPolicy[] = [
  {
    tier: 'core',
    confidenceRange: [0.8, 1.0],
    action: '自动注入 System Prompt',
    injectionMethod: 'system_prompt_prepend',
  },
  {
    tier: 'strong',
    confidenceRange: [0.6, 0.8],
    action: '上下文相关时自动建议',
    injectionMethod: 'context_suggestion',
  },
  {
    tier: 'moderate',
    confidenceRange: [0.4, 0.6],
    action: '仅在被询问时提供',
    injectionMethod: 'on_demand',
  },
  {
    tier: 'tentative',
    confidenceRange: [0.2, 0.4],
    action: '静默观察，不应用',
    injectionMethod: 'none',
  },
  {
    tier: 'deprecated',
    confidenceRange: [0, 0.2],
    action: '标记删除，下次清理移除',
    injectionMethod: 'none',
  },
];
```

可视化：

```
置信度  行为
  1.0 ┤ ████████████████████ 核心行为 - 自动注入
  0.8 ┤ ████████████████ 强 - 上下文相关时建议
  0.6 ┤ ████████████ 中等 - 被问到时提供
  0.4 ┤ ████████ 试探 - 静默观察
  0.2 ┤ ████ 弱 - 标记删除
  0.0 ┤ 已删除
```

---

## 数据库 Schema

```sql
-- 本能表
CREATE TABLE instincts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_text TEXT NOT NULL,
  action_text  TEXT NOT NULL,
  domain      VARCHAR(50) NOT NULL,

  -- 三维置信度
  freq_score  DECIMAL(4,3) NOT NULL DEFAULT 0.30,
  eff_score   DECIMAL(4,3) NOT NULL DEFAULT 0.50,
  human_score DECIMAL(4,3) NOT NULL DEFAULT 0.50,
  composite   DECIMAL(4,3) GENERATED ALWAYS AS (
    freq_score * 0.35 + eff_score * 0.40 + human_score * 0.25
  ) STORED,

  -- 统计
  observation_count  INT NOT NULL DEFAULT 1,
  application_count  INT NOT NULL DEFAULT 0,
  success_count      INT NOT NULL DEFAULT 0,
  contradiction_count INT NOT NULL DEFAULT 0,

  -- 时间
  first_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_applied TIMESTAMPTZ,
  last_verified TIMESTAMPTZ,

  -- 来源
  source      VARCHAR(50) NOT NULL DEFAULT 'observation',
  project_id  UUID REFERENCES projects(id),
  user_id     UUID REFERENCES users(id) NOT NULL,

  -- 状态
  status      VARCHAR(20) NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'deprecated', 'evolved', 'archived')),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_instincts_user_domain ON instincts(user_id, domain);
CREATE INDEX idx_instincts_composite ON instincts(composite DESC);
CREATE INDEX idx_instincts_status ON instincts(status) WHERE status = 'active';

-- 应用记录表
CREATE TABLE instinct_applications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instinct_id UUID REFERENCES instincts(id) ON DELETE CASCADE,
  session_id  UUID NOT NULL,
  outcome     VARCHAR(20) NOT NULL CHECK (outcome IN ('positive', 'negative', 'neutral')),
  signals     JSONB NOT NULL DEFAULT '{}',
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 证据链表
CREATE TABLE instinct_evidence (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instinct_id UUID REFERENCES instincts(id) ON DELETE CASCADE,
  event_type  VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  session_id  UUID,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 置信度历史表（用于趋势分析）
CREATE TABLE confidence_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instinct_id UUID REFERENCES instincts(id) ON DELETE CASCADE,
  freq_score  DECIMAL(4,3) NOT NULL,
  eff_score   DECIMAL(4,3) NOT NULL,
  human_score DECIMAL(4,3) NOT NULL,
  composite   DECIMAL(4,3) NOT NULL,
  reason      VARCHAR(100),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 置信度衰减调度

```typescript
// 每周运行一次的衰减任务
class ConfidenceDecayJob {
  async run() {
    // 1. 对所有活跃本能应用时间衰减
    await db.query(`
      UPDATE instincts
      SET
        freq_score = GREATEST(0, freq_score - 0.02),
        eff_score = GREATEST(0, eff_score - 0.01),
        human_score = GREATEST(0, human_score - 0.005),
        updated_at = NOW()
      WHERE status = 'active'
        AND last_seen < NOW() - INTERVAL '7 days'
    `);

    // 2. 标记低于阈值的本能为 deprecated
    await db.query(`
      UPDATE instincts
      SET status = 'deprecated', updated_at = NOW()
      WHERE status = 'active'
        AND (freq_score * 0.35 + eff_score * 0.40 + human_score * 0.25) < 0.2
    `);

    // 3. 删除已 deprecated 超过 30 天的
    await db.query(`
      DELETE FROM instincts
      WHERE status = 'deprecated'
        AND updated_at < NOW() - INTERVAL '30 days'
    `);

    // 4. 记录清理统计
    console.log(`Decay job complete: ${result.decayed} decayed, ${result.deprecated} deprecated, ${result.deleted} deleted`);
  }
}
```

---

## Dashboard 可视化

置信度三维雷达图：

```
        频率分
         1.0
          │
     0.8  │  ·
          │ / \
     0.6  │/   \
          ·─────·
    效果分         人工分

    综合: 0.72 (强 - 上下文相关时建议)
```

置信度趋势图：

```
分数
1.0 ┤
    │              ·──·──·
0.8 ┤         ·──·         ·──·
    │    ·──·                    ·──·
0.6 ┤ ·                              ·──·
    │·
0.4 ┤
    └─────────────────────────────────────→ 时间
     W1  W2  W3  W4  W5  W6  W7  W8
```

---

## 相关文档

- [03-analysis-engine](./03-analysis-engine.md) — 候选本能如何产生
- [05-evolution-system](./05-evolution-system.md) — 高置信度本能如何进化
- [06-api-sdk-design](./06-api-sdk-design.md) — 置信度 API

返回 → [00-README](./00-README.md)
