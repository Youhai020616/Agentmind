# 分析引擎与因果推理

## 核心定位

分析引擎是 AgentMind 的"大脑"——从原始观察数据中提炼出有意义的学习成果。

```
观察数据（噪声多）──→ 分析引擎 ──→ 本能（信号纯净）
```

---

## 三大分析能力

```
┌─────────────────────────────────────────┐
│              分析引擎                    │
│                                         │
│  ┌───────────┐  ┌──────────┐  ┌──────┐ │
│  │ 模式检测   │  │ 因果推理  │  │ 画像 │ │
│  │ Pattern   │  │ Causal   │  │ User │ │
│  │ Detection │  │ Reasoning│  │Profile│ │
│  └─────┬─────┘  └────┬─────┘  └──┬───┘ │
│        │             │            │      │
│        └─────────────┼────────────┘      │
│                      ▼                   │
│              候选本能列表                 │
│        (带初始置信度和证据链)             │
└─────────────────────────────────────────┘
```

---

## 能力一：模式检测 (Pattern Detection)

### 1.1 序列模式检测

检测重复出现的工具调用序列。

```typescript
// pattern-detector.ts

interface SequencePattern {
  tools: string[];           // ["Grep", "Read", "Edit"]
  frequency: number;         // 出现次数
  avgInterval: number;       // 平均间隔(ms)
  contexts: string[];        // 出现的上下文类型
  firstSeen: string;
  lastSeen: string;
}

class SequenceDetector {
  /**
   * 使用 N-gram 方法检测重复的工具序列
   * 窗口大小从 2 到 maxLength
   */
  detect(events: ObservationEvent[], options: {
    minFrequency: number;    // 最少出现次数（默认 3）
    minLength: number;       // 最短序列长度（默认 2）
    maxLength: number;       // 最长序列长度（默认 6）
    timeWindow: number;      // 序列内最大时间间隔(ms)
  }): SequencePattern[] {
    const toolEvents = events
      .filter(e => e.layer === 'execution' && e.data.phase === 'start')
      .map(e => ({ tool: e.data.tool, ts: e.timestamp }));

    const patterns: Map<string, SequencePattern> = new Map();

    // 滑动窗口 N-gram 提取
    for (let len = options.minLength; len <= options.maxLength; len++) {
      for (let i = 0; i <= toolEvents.length - len; i++) {
        const window = toolEvents.slice(i, i + len);

        // 检查时间窗口约束
        const timeSpan = diff(window[len-1].ts, window[0].ts);
        if (timeSpan > options.timeWindow) continue;

        const key = window.map(w => w.tool).join('→');
        const existing = patterns.get(key);

        if (existing) {
          existing.frequency++;
          existing.lastSeen = window[len-1].ts;
        } else {
          patterns.set(key, {
            tools: window.map(w => w.tool),
            frequency: 1,
            avgInterval: timeSpan / (len - 1),
            contexts: [],
            firstSeen: window[0].ts,
            lastSeen: window[len-1].ts,
          });
        }
      }
    }

    return [...patterns.values()]
      .filter(p => p.frequency >= options.minFrequency)
      .sort((a, b) => b.frequency - a.frequency);
  }
}
```

### 1.2 纠正模式检测

检测用户反复纠正 Agent 的相同错误。

```typescript
interface CorrectionPattern {
  wrongAction: string;       // Agent 的错误行为
  correctAction: string;     // 用户期望的行为
  frequency: number;         // 纠正次数
  domain: string;            // 所属领域
  contexts: string[];        // 出现的上下文
}

class CorrectionDetector {
  detect(events: ObservationEvent[]): CorrectionPattern[] {
    const corrections = events
      .filter(e => e.layer === 'intent' && e.data.hasCorrection);

    // 按纠正模式分组
    const groups = groupBy(corrections, e => e.data.correction);

    return Object.entries(groups)
      .filter(([_, items]) => items.length >= 2) // 至少纠正过 2 次
      .map(([pattern, items]) => ({
        wrongAction: items[0].data.previousAction,
        correctAction: items[0].data.correctedTo,
        frequency: items.length,
        domain: inferDomain(pattern),
        contexts: items.map(i => i.data.intent),
      }));
  }
}
```

### 1.3 错误-解决模式检测

检测特定错误类型的解决方法。

```typescript
interface ErrorResolutionPattern {
  errorType: string;         // "TypeError" | "ImportError" | ...
  errorContext: string;      // 抽象化的错误上下文
  resolution: string[];      // 解决步骤序列
  successRate: number;       // 解决成功率
  avgResolutionTime: number; // 平均解决时间(ms)
}

class ErrorResolutionDetector {
  detect(events: ObservationEvent[]): ErrorResolutionPattern[] {
    // 1. 找到所有错误事件
    const errors = events.filter(e =>
      e.layer === 'execution' &&
      e.data.phase === 'complete' &&
      e.data.errorPattern
    );

    // 2. 对每个错误，追踪后续的解决步骤
    const resolutions: ErrorResolutionPattern[] = [];

    for (const error of errors) {
      const errorIdx = events.indexOf(error);
      const followUp = events.slice(errorIdx + 1, errorIdx + 10); // 后续 10 个事件

      // 检查是否成功解决（后续没有相同错误）
      const resolved = followUp.some(e =>
        e.layer === 'execution' &&
        e.data.success &&
        e.data.tool === error.data.tool
      );

      if (resolved) {
        const steps = followUp
          .filter(e => e.layer === 'execution' && e.data.phase === 'start')
          .map(e => e.data.tool);

        resolutions.push({
          errorType: error.data.errorPattern,
          errorContext: error.data.tool,
          resolution: steps,
          successRate: 1,
          avgResolutionTime: diff(followUp[followUp.length-1].timestamp, error.timestamp),
        });
      }
    }

    // 3. 聚合相同类型的解决方案
    return aggregateResolutions(resolutions);
  }
}
```

---

## 能力二：因果推理 (Causal Reasoning)

### 为什么需要因果推理？

纯频率统计的问题：

```
观察：用户总是在写代码后运行测试
统计结论：代码 → 测试 是一个模式（正确 ✅）

观察：用户总是在午饭后写代码
统计结论：午饭 → 写代码 是一个模式（荒谬 ❌）
```

因果推理帮助区分**真正的因果关系**和**偶然的时间相关**。

### 因果推理框架

```typescript
interface CausalLink {
  cause: string;         // 原因行为
  effect: string;        // 结果行为
  strength: number;      // 因果强度 (0-1)
  evidence: CausalEvidence;
  type: 'necessary' | 'sufficient' | 'contributing';
}

interface CausalEvidence {
  coOccurrence: number;      // 共同出现率
  temporalOrder: boolean;    // 是否有时间先后
  interventionEffect: number; // 干预效果（去掉 cause 后 effect 是否消失）
  alternativeExplanations: number; // 替代解释的数量
}
```

### 因果强度计算

```typescript
class CausalReasoner {
  /**
   * 使用简化版 Granger 因果检验思想
   * 核心问题：知道 A 发生了，是否能更好地预测 B？
   */
  assessCausality(
    events: ObservationEvent[],
    candidateCause: string,
    candidateEffect: string
  ): CausalLink {
    // 1. 共现率：A 发生后 B 跟着发生的概率
    const coOccurrence = this.calculateCoOccurrence(events, candidateCause, candidateEffect);

    // 2. 时间顺序：A 是否总是在 B 之前
    const temporalOrder = this.verifyTemporalOrder(events, candidateCause, candidateEffect);

    // 3. 反事实：不做 A 的时候，B 是否也发生？
    const counterfactual = this.assessCounterfactual(events, candidateCause, candidateEffect);

    // 4. 替代解释：是否有其他因素 C 同时解释了 A 和 B？
    const alternatives = this.findAlternativeExplanations(events, candidateCause, candidateEffect);

    // 综合因果强度
    const strength =
      coOccurrence * 0.3 +
      (temporalOrder ? 0.2 : 0) +
      (1 - counterfactual) * 0.3 +  // 反事实率越低，因果越强
      (1 / (1 + alternatives)) * 0.2; // 替代解释越少，因果越强

    return {
      cause: candidateCause,
      effect: candidateEffect,
      strength,
      evidence: {
        coOccurrence,
        temporalOrder,
        interventionEffect: 1 - counterfactual,
        alternativeExplanations: alternatives,
      },
      type: strength > 0.7 ? 'necessary' :
            strength > 0.4 ? 'contributing' : 'sufficient',
    };
  }

  /**
   * A 发生后，B 在 N 步内跟着发生的概率
   */
  private calculateCoOccurrence(
    events: ObservationEvent[],
    cause: string,
    effect: string,
    windowSize: number = 5
  ): number {
    let causeCount = 0;
    let coOccurCount = 0;

    for (let i = 0; i < events.length; i++) {
      if (this.matchesPattern(events[i], cause)) {
        causeCount++;
        const window = events.slice(i + 1, i + 1 + windowSize);
        if (window.some(e => this.matchesPattern(e, effect))) {
          coOccurCount++;
        }
      }
    }

    return causeCount > 0 ? coOccurCount / causeCount : 0;
  }

  /**
   * 不做 A 的时候，B 自然发生的比率
   * 如果很高，说明 A 不是 B 的真正原因
   */
  private assessCounterfactual(
    events: ObservationEvent[],
    cause: string,
    effect: string
  ): number {
    let noCauseCount = 0;
    let effectWithoutCauseCount = 0;

    for (let i = 0; i < events.length; i++) {
      if (this.matchesPattern(events[i], effect)) {
        // 检查前面 N 步是否有 cause
        const preceding = events.slice(Math.max(0, i - 5), i);
        if (!preceding.some(e => this.matchesPattern(e, cause))) {
          effectWithoutCauseCount++;
        }
      }
    }

    const totalEffects = events.filter(e => this.matchesPattern(e, effect)).length;
    return totalEffects > 0 ? effectWithoutCauseCount / totalEffects : 0;
  }
}
```

### LLM 辅助因果分析

对于统计方法难以判断的复杂模式，使用 LLM 辅助分析：

```typescript
class LLMCausalAnalyzer {
  /**
   * 使用小模型（Haiku/GPT-4o-mini）进行语义层面的因果分析
   * 成本约 $0.001/次分析
   */
  async analyzeCausality(
    pattern: SequencePattern,
    context: AnalysisContext
  ): Promise<CausalAssessment> {
    const prompt = `
      Analyze this behavioral pattern for causality:

      Pattern: ${pattern.tools.join(' → ')}
      Frequency: ${pattern.frequency} times
      Context: ${context.domain}

      Questions:
      1. Is there a logical reason why step 1 leads to step 2?
      2. Could these steps work independently?
      3. What would happen if the order changed?

      Respond in JSON: { causal: boolean, reason: string, strength: 0-1 }
    `;

    const result = await this.llm.complete(prompt, { model: 'haiku' });
    return JSON.parse(result);
  }
}
```

---

## 能力三：用户画像 (User Profile)

### 画像维度

```typescript
interface UserProfile {
  // 技术偏好
  techPreferences: {
    languages: Record<string, number>;       // { "TypeScript": 0.9, "Python": 0.3 }
    frameworks: Record<string, number>;      // { "React": 0.8, "Vue": 0.2 }
    patterns: Record<string, number>;        // { "functional": 0.7, "oop": 0.3 }
    tools: Record<string, number>;           // { "Grep": 0.8, "Bash": 0.6 }
  };

  // 工作习惯
  workHabits: {
    codeBeforeTest: boolean;                 // 先写代码还是先写测试
    searchBeforeEdit: boolean;               // 修改前是否先搜索
    commitFrequency: 'frequent' | 'batched'; // 提交频率
    commentStyle: 'minimal' | 'detailed';    // 注释风格
  };

  // 技术水平推断
  skillLevel: {
    overall: 'junior' | 'mid' | 'senior' | 'expert';
    byDomain: Record<string, string>;        // { "frontend": "senior", "devops": "junior" }
  };

  // 沟通风格
  communicationStyle: {
    language: string;                        // "zh-CN" | "en-US"
    verbosity: 'concise' | 'detailed';       // 偏好简洁还是详细
    formality: 'casual' | 'formal';          // 正式程度
  };

  // 更新记录
  lastUpdated: string;
  totalSessions: number;
  totalObservations: number;
}
```

### 画像更新算法

```typescript
class ProfileUpdater {
  /**
   * 指数移动平均（EMA）更新画像
   * 最近的行为权重更高，旧行为自然衰减
   */
  update(
    profile: UserProfile,
    newObservations: ObservationEvent[],
    alpha: number = 0.1  // 学习率
  ): UserProfile {
    // 提取本次会话的偏好信号
    const sessionSignals = this.extractSignals(newObservations);

    // EMA 更新每个维度
    for (const [key, newValue] of Object.entries(sessionSignals.techPreferences)) {
      const oldValue = profile.techPreferences[key] ?? 0.5;
      profile.techPreferences[key] = oldValue * (1 - alpha) + newValue * alpha;
    }

    // 更新工作习惯（布尔值用多数投票）
    profile.workHabits = this.updateHabits(
      profile.workHabits,
      sessionSignals.workHabits,
      profile.totalSessions
    );

    profile.totalSessions++;
    profile.totalObservations += newObservations.length;
    profile.lastUpdated = new Date().toISOString();

    return profile;
  }
}
```

---

## 分析调度

### 何时运行分析

```typescript
interface AnalysisSchedule {
  // 实时分析（轻量级）
  realtime: {
    trigger: 'every_observation';
    tasks: ['sequence_tracking', 'correction_detection'];
    maxLatency: '10ms';
  };

  // 会话级分析（中等）
  session: {
    trigger: 'session_end';
    tasks: ['pattern_detection', 'error_resolution', 'profile_update'];
    maxLatency: '5s';
  };

  // 深度分析（重量级）
  deep: {
    trigger: 'scheduled | observations_threshold';
    threshold: 100;  // 每 100 条观察触发一次
    tasks: ['causal_reasoning', 'cross_session_patterns', 'evolution_candidates'];
    maxLatency: '30s';
    model: 'haiku'; // 使用 LLM 辅助
  };
}
```

### 分析管道

```typescript
class AnalysisPipeline {
  async run(observations: ObservationEvent[]): Promise<AnalysisResult> {
    // Stage 1: 并行运行所有检测器
    const [sequences, corrections, errors] = await Promise.all([
      this.sequenceDetector.detect(observations),
      this.correctionDetector.detect(observations),
      this.errorResolutionDetector.detect(observations),
    ]);

    // Stage 2: 因果推理（依赖 Stage 1 的结果）
    const causalLinks = await this.causalReasoner.analyze(
      sequences,
      corrections,
      observations
    );

    // Stage 3: 生成候选本能
    const candidates = this.generateCandidateInstincts(
      sequences,
      corrections,
      errors,
      causalLinks
    );

    // Stage 4: 更新用户画像
    const profileUpdate = this.profileUpdater.computeUpdate(observations);

    return {
      patterns: [...sequences, ...corrections, ...errors],
      causalLinks,
      candidates,
      profileUpdate,
      metadata: {
        observationsProcessed: observations.length,
        patternsFound: sequences.length + corrections.length + errors.length,
        candidatesGenerated: candidates.length,
        analysisTime: Date.now() - startTime,
      }
    };
  }
}
```

---

## 从模式到本能

```typescript
/**
 * 将分析结果转化为候选本能
 */
function generateCandidateInstincts(
  patterns: Pattern[],
  causalLinks: CausalLink[]
): CandidateInstinct[] {
  return patterns.map(pattern => {
    // 查找该模式是否有因果支持
    const causal = causalLinks.find(c =>
      c.cause === pattern.trigger || c.effect === pattern.action
    );

    // 初始置信度计算
    const frequencyScore = Math.min(pattern.frequency / 10, 1) * 0.4;
    const causalScore = (causal?.strength ?? 0) * 0.4;
    const recencyScore = calculateRecency(pattern.lastSeen) * 0.2;

    return {
      trigger: pattern.trigger,
      action: pattern.action,
      domain: pattern.domain,
      initialConfidence: frequencyScore + causalScore + recencyScore,
      evidence: {
        frequency: pattern.frequency,
        causalStrength: causal?.strength,
        firstSeen: pattern.firstSeen,
        lastSeen: pattern.lastSeen,
      },
      source: 'analysis-engine',
    };
  });
}
```

---

## 相关文档

- [02-observation-layer](./02-observation-layer.md) — 分析引擎的数据来源
- [04-confidence-system](./04-confidence-system.md) — 候选本能如何进入记忆系统
- [05-evolution-system](./05-evolution-system.md) — 本能如何进化为更高级能力

返回 → [00-README](./00-README.md)
