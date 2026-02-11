# 进化与抽象机制

## 设计哲学

> **本能是碎片，进化让碎片成为体系。**

CL v2 的 `/evolve` 只做简单聚类（3 个相关本能拼成一个 Skill）。AgentMind 的进化系统增加了**抽象提升**和**效果验证**，让学习成果不仅聚合，还能**升维**。

---

## 四级进化模型

```
Level 0: 原子本能 (Instinct)
    │    "用 Grep 搜索后再 Edit"
    │    单一触发 → 单一动作
    │
    ▼ 聚类 (3+ 相关本能)
Level 1: 行为模式 (Pattern)
    │    "搜索→确认→修改 工作流"
    │    多步骤有序序列
    │
    ▼ 抽象 (提炼原则)
Level 2: 策略 (Strategy)
    │    "修改前先理解上下文"
    │    可迁移的决策原则
    │
    ▼ 体系化 (领域能力)
Level 3: 专家系统 (Expert)
         "代码重构专家"
         完整领域能力集
```

---

## Level 0 → Level 1：聚类进化

### 聚类算法

```typescript
interface Cluster {
  instincts: Instinct[];
  type: 'sequential' | 'parallel' | 'conditional';
  cohesion: number;        // 内聚度 (0-1)
  name: string;            // 自动生成的名称
  suggestedOutput: 'pattern' | 'workflow' | 'command';
}

class InstinctClusterer {
  /**
   * 基于三维相似度的聚类
   */
  cluster(instincts: Instinct[]): Cluster[] {
    const similarity = this.buildSimilarityMatrix(instincts);
    const clusters = this.hierarchicalClustering(similarity, {
      minClusterSize: 3,
      maxClusterSize: 8,
      threshold: 0.5,  // 相似度阈值
    });

    return clusters.map(c => this.enrichCluster(c));
  }

  /**
   * 三维相似度：领域 × 触发 × 动作
   */
  private calculateSimilarity(a: Instinct, b: Instinct): number {
    const domainSim = a.domain === b.domain ? 1.0 : 0.2;
    const triggerSim = this.semanticSimilarity(a.trigger, b.trigger);
    const actionSim = this.semanticSimilarity(a.action, b.action);

    return domainSim * 0.3 + triggerSim * 0.4 + actionSim * 0.3;
  }

  /**
   * 判断聚类类型
   */
  private classifyClusterType(instincts: Instinct[]): Cluster['type'] {
    // 检测是否有时间顺序关系
    const hasSequence = this.detectSequentialRelation(instincts);
    if (hasSequence) return 'sequential';

    // 检测是否有条件分支
    const hasCondition = instincts.some(i => i.trigger.includes('if') || i.trigger.includes('when'));
    if (hasCondition) return 'conditional';

    return 'parallel';
  }
}
```

### 聚类输出示例

```
输入本能:
  ├── "写新组件时用 TypeScript"         (code-style, 0.8)
  ├── "props 用 interface 定义"         (code-style, 0.7)
  ├── "state 用 useState hook"          (code-style, 0.75)
  └── "避免 any 类型"                   (code-style, 0.65)

聚类结果:
  Pattern: "TypeScript React 组件规范"
  Type: parallel (并行规则，非序列)
  Cohesion: 0.82
  Suggested: pattern (自动应用的行为模式)
```

---

## Level 1 → Level 2：抽象提升

**这是 AgentMind 最核心的创新**——从具体模式中提炼出可迁移的抽象原则。

### 抽象引擎

```typescript
class AbstractionEngine {
  /**
   * 使用 LLM 从具体模式中提炼抽象原则
   */
  async abstract(pattern: Pattern): Promise<Strategy> {
    const prompt = `
    I have a behavioral pattern consisting of these specific rules:
    ${pattern.instincts.map(i => `- Trigger: "${i.trigger}" → Action: "${i.action}"`).join('\n')}

    Domain: ${pattern.domain}
    Combined confidence: ${pattern.avgConfidence}

    Tasks:
    1. What ABSTRACT PRINCIPLE do these specific rules embody?
    2. In what OTHER contexts could this principle apply?
    3. Express the principle in ONE sentence.

    Respond in JSON:
    {
      "principle": "one sentence abstract principle",
      "transferableContexts": ["context1", "context2", ...],
      "abstractionLevel": "low|medium|high"
    }
    `;

    const result = await this.llm.complete(prompt, { model: 'haiku' });
    const parsed = JSON.parse(result);

    return {
      name: generateStrategyName(parsed.principle),
      principle: parsed.principle,
      sourcePattern: pattern.id,
      transferableContexts: parsed.transferableContexts,
      confidence: pattern.avgConfidence * 0.8, // 抽象降低 20% 置信度
      level: 2,
    };
  }
}
```

### 抽象示例

```
Pattern (Level 1):
  "搜索→确认→修改 工作流"
  包含: grep-before-edit, read-before-write, check-before-delete

    │
    ▼ 抽象提升

Strategy (Level 2):
  原则: "在修改任何东西之前，先完全理解当前状态"
  可迁移到:
    - 数据库迁移前先备份
    - 重构前先写测试
    - 部署前先检查配置
    - 做决策前先收集信息
```

### 迁移验证

抽象后的策略在新场景中应用时，需要验证是否有效：

```typescript
class TransferValidator {
  async validate(
    strategy: Strategy,
    newContext: string
  ): Promise<TransferResult> {
    // 1. 检查新上下文是否与策略原则匹配
    const relevance = await this.assessRelevance(strategy.principle, newContext);

    if (relevance < 0.5) {
      return { applicable: false, reason: 'context mismatch' };
    }

    // 2. 生成具体化的本能
    const concreteInstinct = await this.concretize(strategy, newContext);

    // 3. 以低置信度（0.3）引入
    return {
      applicable: true,
      newInstinct: {
        ...concreteInstinct,
        confidence: { frequency: 0.3, effectiveness: 0.5, human: 0.5 },
        source: `transferred from strategy: ${strategy.name}`,
      }
    };
  }
}
```

---

## Level 2 → Level 3：体系化

当一个领域积累了足够多的策略，可以组合成"专家系统"。

```typescript
interface ExpertSystem {
  name: string;              // "React 前端专家"
  domain: string;            // "frontend-react"
  strategies: Strategy[];    // 包含的策略
  patterns: Pattern[];       // 包含的模式
  instincts: Instinct[];    // 包含的本能
  totalConfidence: number;   // 体系整体置信度

  // 专家系统可以注入为完整的 System Prompt
  generateSystemPrompt(): string;

  // 或者作为独立 Agent
  generateAgentSpec(): AgentSpecification;
}

class ExpertSystemBuilder {
  /**
   * 当某个领域达到以下条件时，可以构建专家系统：
   * - 3+ 策略（Level 2）
   * - 5+ 模式（Level 1）
   * - 15+ 本能（Level 0）
   * - 平均置信度 > 0.6
   */
  canBuild(domain: string): boolean {
    const stats = this.getDomainStats(domain);
    return (
      stats.strategies >= 3 &&
      stats.patterns >= 5 &&
      stats.instincts >= 15 &&
      stats.avgConfidence > 0.6
    );
  }

  async build(domain: string): Promise<ExpertSystem> {
    const strategies = await this.getStrategies(domain);
    const patterns = await this.getPatterns(domain);
    const instincts = await this.getInstincts(domain);

    // 使用 LLM 组织成连贯的专家系统
    const systemPrompt = await this.generateCoherentPrompt(
      strategies,
      patterns,
      instincts
    );

    return {
      name: `${domain} Expert`,
      domain,
      strategies,
      patterns,
      instincts,
      totalConfidence: this.calculateSystemConfidence(strategies, patterns, instincts),
      generateSystemPrompt: () => systemPrompt,
      generateAgentSpec: () => this.toAgentSpec(systemPrompt, domain),
    };
  }
}
```

---

## 退化机制

进化不是单向的——如果效果不好，需要能**退化回退**。

```typescript
class DegradationChecker {
  /**
   * 检查进化产物是否应该退化
   */
  check(evolved: Pattern | Strategy | ExpertSystem): DegradationAction {
    // 进化产物的整体置信度低于阈值
    if (evolved.totalConfidence < 0.3) {
      return {
        action: 'dissolve',
        reason: 'confidence too low',
        // 将进化产物拆回源本能
        result: evolved.sourceInstincts.map(i => ({
          ...i,
          confidence: recalculateAfterDissolution(i),
        })),
      };
    }

    // 源本能中有超过 30% 已 deprecated
    const deprecatedRatio = evolved.sourceInstincts
      .filter(i => i.status === 'deprecated').length / evolved.sourceInstincts.length;

    if (deprecatedRatio > 0.3) {
      return {
        action: 'rebuild',
        reason: 'too many deprecated source instincts',
        result: 'trigger re-clustering with remaining active instincts',
      };
    }

    return { action: 'none' };
  }
}
```

---

## 进化可视化

### 进化树视图

```
🧬 你的学习进化树
═══════════════════

📁 frontend-react (Expert System, 0.78)
├── 📋 TypeScript 严格模式 (Strategy, 0.82)
│   ├── 🔄 TS React 组件规范 (Pattern, 0.80)
│   │   ├── 💡 用 interface 定义 props (0.85)
│   │   ├── 💡 避免 any 类型 (0.75)
│   │   └── 💡 使用 useState hook (0.80)
│   └── 🔄 类型安全模式 (Pattern, 0.77)
│       ├── 💡 用 Zod 做运行时验证 (0.70)
│       └── 💡 API 返回值类型断言 (0.72)
│
├── 📋 先理解后修改 (Strategy, 0.75)
│   └── 🔄 搜索确认修改流 (Pattern, 0.73)
│       ├── 💡 Grep → Read → Edit (0.80)
│       └── 💡 读文件后再编辑 (0.70)
│
└── 📋 组件组合优于继承 (Strategy, 0.68)
    └── 🔄 Compound Component 模式 (Pattern, 0.65)
        ├── 💡 用 Context 共享状态 (0.70)
        └── 💡 子组件用 displayName (0.60)

📁 workflow (5 instincts, no patterns yet)
├── 💡 commit 前跑测试 (0.72)
├── 💡 PR 描述写变更原因 (0.55)
├── 💡 feature branch 命名规范 (0.48)
├── 💡 小步提交 (0.45)
└── 💡 code review 前自测 (0.40)
```

---

## 跨项目迁移

```typescript
interface MigrationCandidate {
  strategy: Strategy;
  sourceProject: string;
  targetProject: string;
  relevanceScore: number;
  adjustedConfidence: number;
}

class CrossProjectMigrator {
  /**
   * 评估策略是否可以从项目 A 迁移到项目 B
   */
  async assessMigration(
    strategy: Strategy,
    sourceProject: ProjectProfile,
    targetProject: ProjectProfile
  ): Promise<MigrationCandidate> {
    // 技术栈重叠度
    const stackOverlap = calculateOverlap(
      sourceProject.techStack,
      targetProject.techStack
    );

    // 领域相关度
    const domainRelevance = strategy.transferableContexts
      .some(ctx => targetProject.domains.includes(ctx)) ? 0.8 : 0.3;

    const relevance = stackOverlap * 0.5 + domainRelevance * 0.5;

    return {
      strategy,
      sourceProject: sourceProject.name,
      targetProject: targetProject.name,
      relevanceScore: relevance,
      // 迁移时置信度打折
      adjustedConfidence: strategy.confidence * relevance * 0.7,
    };
  }
}
```

---

## 相关文档

- [03-analysis-engine](./03-analysis-engine.md) — 本能如何产生
- [04-confidence-system](./04-confidence-system.md) — 进化的置信度要求
- [07-commercialization](./07-commercialization.md) — 进化产物的市场化

返回 → [00-README](./00-README.md)
