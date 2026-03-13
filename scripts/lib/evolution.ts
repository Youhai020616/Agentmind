// =============================================================================
// AgentMind - Evolution Engine
// Implements L0→L1 auto-clustering and L1→L2 strategy abstraction.
//
// Usage: npx tsx scripts/lib/evolution.ts <command>
//
// Commands:
//   cluster          — Run L0→L1 clustering on active instincts
//   abstract         — Run L1→L2 abstraction on mature patterns
//   degrade          — Check and apply degradation rules
//   run              — Run full evolution cycle (cluster + abstract + degrade)
//   status           — Show evolution status
// =============================================================================

import { LocalStorage } from "./storage.js";
import {
  calculateComposite,
  applyDecay,
  formatConfidence,
  getTier,
} from "./confidence.js";
import type {
  Instinct,
  Pattern,
  Strategy,
  ClusterType,
  CompositeConfidence,
  InstinctsStore,
} from "./types.js";

// Resolve plugin root
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
const storage = new LocalStorage(PLUGIN_ROOT);

// --- CLI Router ---

const [command] = process.argv.slice(2);

switch (command) {
  case "cluster":
    runClustering();
    break;
  case "abstract":
    runAbstraction();
    break;
  case "degrade":
    runDegradation();
    break;
  case "run":
    runFullCycle();
    break;
  case "status":
    showEvolutionStatus();
    break;
  default:
    runFullCycle();
}

// =============================================================================
// L0 → L1: Auto-Clustering
// =============================================================================

/**
 * Compute word-level similarity between two strings (Jaccard index).
 */
function wordSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  wordsA.forEach(w => { if (wordsB.has(w)) intersection++; });
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Compute composite similarity between two instincts.
 * Domain match = 0.5, trigger similarity = 0.25, action similarity = 0.25
 */
function instinctSimilarity(a: Instinct, b: Instinct): number {
  const domainScore = a.domain === b.domain ? 1.0 : 0.2;
  const triggerScore = wordSimilarity(a.trigger, b.trigger);
  const actionScore = wordSimilarity(a.action, b.action);
  return domainScore * 0.5 + triggerScore * 0.25 + actionScore * 0.25;
}

/**
 * Classify a cluster of instincts as sequential, parallel, or conditional.
 */
function classifyCluster(instincts: Instinct[]): ClusterType {
  // If triggers mention sequence words → sequential
  const sequenceWords = /follow|then|after|before|first|next|step|workflow|→/i;
  const hasSequence = instincts.some(
    i => sequenceWords.test(i.trigger) || sequenceWords.test(i.action)
  );
  if (hasSequence) return "sequential";

  // If triggers mention conditions → conditional
  const conditionWords = /when|if|unless|depending|case|while/i;
  const conditionCount = instincts.filter(
    i => conditionWords.test(i.trigger)
  ).length;
  if (conditionCount >= instincts.length * 0.7) return "conditional";

  // Default: parallel rules
  return "parallel";
}

/**
 * Generate a descriptive name for a cluster.
 */
function nameCluster(instincts: Instinct[], domain: string): string {
  // Use the most common meaningful words from triggers/actions
  const allText = instincts.map(i => `${i.trigger} ${i.action}`).join(" ");
  const words = allText.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  // Count word frequency, excluding stop words
  const stopWords = new Set([
    "when", "that", "this", "with", "from", "have", "been", "will",
    "about", "would", "should", "could", "before", "after", "using",
    "performing", "operation", "follow", "workflow",
  ]);
  const freq = new Map<string, number>();
  words.forEach(w => {
    if (!stopWords.has(w)) {
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  });

  // Top 2-3 keywords
  const keywords = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));

  if (keywords.length === 0) return `${domain} Pattern`;
  return `${keywords.join(" ")} ${domain} Pattern`;
}

/**
 * Greedy clustering: for each domain, group instincts by similarity.
 */
function clusterByDomain(instincts: Instinct[]): Map<string, Instinct[][]> {
  // Group by domain first
  const byDomain = new Map<string, Instinct[]>();
  instincts.forEach(i => {
    if (!byDomain.has(i.domain)) byDomain.set(i.domain, []);
    byDomain.get(i.domain)!.push(i);
  });

  const result = new Map<string, Instinct[][]>();

  byDomain.forEach((domainInstincts, domain) => {
    if (domainInstincts.length < 3) return; // Need 3+ for a cluster

    const clusters: Instinct[][] = [];
    const assigned = new Set<string>();

    // Sort by confidence descending — seed clusters from strongest instincts
    const sorted = [...domainInstincts].sort(
      (a, b) => b.confidence.composite - a.confidence.composite
    );

    for (const seed of sorted) {
      if (assigned.has(seed.id)) continue;

      const cluster: Instinct[] = [seed];
      assigned.add(seed.id);

      for (const candidate of sorted) {
        if (assigned.has(candidate.id)) continue;
        // Check similarity with all current cluster members
        const avgSim =
          cluster.reduce((sum, m) => sum + instinctSimilarity(m, candidate), 0) /
          cluster.length;
        if (avgSim >= 0.45) {
          cluster.push(candidate);
          assigned.add(candidate.id);
        }
      }

      if (cluster.length >= 3) {
        clusters.push(cluster);
      }
    }

    if (clusters.length > 0) {
      result.set(domain, clusters);
    }
  });

  return result;
}

function generatePatternId(): string {
  return "pat_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function runClustering(): void {
  const store = storage.loadStore();
  const active = store.instincts.filter(
    i => i.status === "active" && i.confidence.composite >= 0.4
  );

  if (active.length < 3) {
    process.stdout.write(
      `⏳ Not enough active instincts for clustering (have ${active.length}, need 3+).\n`
    );
    return;
  }

  // Find existing pattern instinct IDs to avoid re-clustering
  const alreadyClustered = new Set(store.patterns.flatMap(p => p.instinct_ids));

  const unclusteredActive = active.filter(i => !alreadyClustered.has(i.id));
  if (unclusteredActive.length < 3) {
    process.stdout.write(
      `⏳ All eligible instincts already clustered (${alreadyClustered.size} in patterns).\n`
    );
    return;
  }

  const domainClusters = clusterByDomain(unclusteredActive);
  let newPatterns = 0;

  domainClusters.forEach((clusters, domain) => {
    clusters.forEach(cluster => {
      const avgConfidence = cluster.reduce(
        (sum, i) => sum + i.confidence.composite, 0
      ) / cluster.length;

      if (avgConfidence < 0.4) return; // Skip low-confidence clusters

      const cohesion = calculateCohesion(cluster);
      const name = nameCluster(cluster, domain);
      const type = classifyCluster(cluster);

      const pattern: Pattern = {
        id: generatePatternId(),
        name,
        type,
        level: 1,
        instinct_ids: cluster.map(i => i.id),
        cohesion,
        domain,
        confidence: {
          frequency: avgConfidence,
          effectiveness: cluster.reduce((s, i) => s + i.confidence.effectiveness, 0) / cluster.length,
          human: cluster.reduce((s, i) => s + i.confidence.human, 0) / cluster.length,
          composite: 0,
        },
        created_at: new Date().toISOString(),
      };
      pattern.confidence.composite = calculateComposite(pattern.confidence);

      storage.savePattern(pattern);
      newPatterns++;

      process.stdout.write(
        `🔄 New Pattern: "${name}" (${type})\n` +
        `   Members: ${cluster.length} instincts | Cohesion: ${(cohesion * 100).toFixed(0)}%\n` +
        `   ${formatConfidence(pattern.confidence)}\n\n`
      );
    });
  });

  if (newPatterns === 0) {
    process.stdout.write("⏳ No new clusters found meeting threshold.\n");
  } else {
    process.stdout.write(`✅ Created ${newPatterns} new pattern(s).\n`);
  }
}

function calculateCohesion(cluster: Instinct[]): number {
  if (cluster.length <= 1) return 1;
  let totalSim = 0;
  let pairs = 0;
  for (let i = 0; i < cluster.length; i++) {
    for (let j = i + 1; j < cluster.length; j++) {
      totalSim += instinctSimilarity(cluster[i], cluster[j]);
      pairs++;
    }
  }
  return Math.round((totalSim / pairs) * 100) / 100;
}

// =============================================================================
// L1 → L2: Strategy Abstraction
// =============================================================================

function runAbstraction(): void {
  const store = storage.loadStore();
  const maturePatterns = store.patterns.filter(
    p => p.confidence.composite >= 0.6
  );

  // Skip patterns that already have strategies
  const existingStrategyPatterns = new Set(
    store.strategies.map(s => s.source_pattern_id)
  );
  const candidates = maturePatterns.filter(
    p => !existingStrategyPatterns.has(p.id)
  );

  if (candidates.length === 0) {
    process.stdout.write(
      "⏳ No mature patterns ready for abstraction " +
      `(need composite ≥ 0.6, have ${maturePatterns.length} mature, ` +
      `${existingStrategyPatterns.size} already abstracted).\n`
    );
    return;
  }

  let newStrategies = 0;

  candidates.forEach(pattern => {
    const memberInstincts = pattern.instinct_ids
      .map(id => store.instincts.find(i => i.id === id))
      .filter((i): i is Instinct => i !== undefined);

    if (memberInstincts.length < 2) return;

    // Generate principle by finding common theme
    const principle = abstractPrinciple(memberInstincts, pattern);
    const transferable = inferTransferableContexts(memberInstincts, pattern);

    const strategy: Strategy = {
      id: "strat_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: pattern.name.replace(" Pattern", " Strategy"),
      principle,
      level: 2,
      source_pattern_id: pattern.id,
      transferable_contexts: transferable,
      domain: pattern.domain,
      confidence: {
        frequency: pattern.confidence.frequency,
        effectiveness: pattern.confidence.effectiveness,
        human: pattern.confidence.human,
        // Abstraction penalty: 0.8x
        composite: Math.round(pattern.confidence.composite * 0.8 * 100) / 100,
      },
      created_at: new Date().toISOString(),
    };

    storage.saveStrategy(strategy);
    newStrategies++;

    process.stdout.write(
      `📋 New Strategy: "${strategy.name}"\n` +
      `   Principle: "${principle}"\n` +
      `   From pattern: ${pattern.name} (${pattern.instinct_ids.length} instincts)\n` +
      `   Transferable to: ${transferable.join(", ") || "none yet"}\n` +
      `   ${formatConfidence(strategy.confidence)}\n\n`
    );
  });

  if (newStrategies === 0) {
    process.stdout.write("⏳ No new strategies generated.\n");
  } else {
    process.stdout.write(`✅ Created ${newStrategies} new strategy(ies).\n`);
  }
}

/**
 * Extract a common principle from a group of instincts.
 * Uses keyword analysis (no LLM call — deterministic).
 */
function abstractPrinciple(instincts: Instinct[], pattern: Pattern): string {
  const actions = instincts.map(i => i.action);
  const triggers = instincts.map(i => i.trigger);

  // Find common action verbs/themes
  const allText = [...actions, ...triggers].join(" ").toLowerCase();
  const actionWords = allText.split(/\s+/);
  const freq = new Map<string, number>();
  const stopWords = new Set([
    "the", "and", "for", "use", "when", "with", "that", "this",
    "has", "have", "been", "are", "was", "not", "but", "from",
    "follow", "time", "times", "across", "session", "sessions",
    "over", "avoid", "prefer", "check", "first", "than",
  ]);
  actionWords.forEach(w => {
    // Strip trailing punctuation
    const clean = w.replace(/[^a-z]/g, "");
    if (clean.length > 3 && !stopWords.has(clean)) {
      freq.set(clean, (freq.get(clean) || 0) + 1);
    }
  });

  const topWords = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([w]) => w);

  // Generate principle based on pattern type
  switch (pattern.type) {
    case "sequential":
      return `Follow a structured ${topWords[0] || pattern.domain} workflow: ${topWords.slice(0, 3).join(" → ")} for consistency`;
    case "conditional":
      return `Adapt ${topWords[0] || pattern.domain} approach based on context: ${topWords.slice(0, 3).join(", ")}`;
    case "parallel":
    default:
      return `Apply consistent ${pattern.domain} standards: ${topWords.slice(0, 3).join(", ")} as guiding principles`;
  }
}

/**
 * Infer where a strategy's principle could transfer.
 */
function inferTransferableContexts(instincts: Instinct[], pattern: Pattern): string[] {
  const contexts: string[] = [];

  // Domain-based inference
  switch (pattern.domain) {
    case "code-style":
      contexts.push("Code review", "Documentation", "API design");
      break;
    case "workflow":
      contexts.push("CI/CD pipelines", "Automation scripts", "Task management");
      break;
    case "error-handling":
      contexts.push("Monitoring", "Testing", "Incident response");
      break;
    case "preference":
      contexts.push("Team collaboration", "Tool selection", "Communication style");
      break;
    case "tool-usage":
      contexts.push("IDE configuration", "CLI workflows", "Build tooling");
      break;
    default:
      contexts.push(`Other ${pattern.domain} contexts`);
  }

  return contexts;
}

// =============================================================================
// Degradation
// =============================================================================

function runDegradation(): void {
  const store = storage.loadStore();
  const now = new Date();
  let degraded = 0;
  let decayed = 0;
  let cleaned = 0;

  // 1. Decay instincts not seen recently
  store.instincts.forEach(inst => {
    if (inst.status === "deprecated") return;

    const lastSeen = new Date(inst.last_seen);
    const weeksSince = (now.getTime() - lastSeen.getTime()) / (7 * 24 * 60 * 60 * 1000);

    if (weeksSince >= 2) {
      const before = inst.confidence.composite;
      const decayedConf = applyDecay(inst.confidence, weeksSince);
      inst.confidence = decayedConf;

      if (before !== decayedConf.composite) {
        decayed++;
        process.stdout.write(
          `📉 Decay: "${inst.trigger.slice(0, 40)}..." ` +
          `(${(before * 100).toFixed(0)}% → ${(decayedConf.composite * 100).toFixed(0)}%)\n`
        );
      }
    }
  });

  // 2. Auto-degrade: 3+ failed applications → tentative
  store.instincts.forEach(inst => {
    if (inst.status !== "active") return;

    const failCount = inst.application_count - Math.round(inst.application_count * inst.success_rate);
    if (failCount >= 3 && inst.success_rate < 0.5) {
      inst.status = "tentative";
      degraded++;
      process.stdout.write(
        `⚠️ Degraded to tentative: "${inst.trigger.slice(0, 40)}..." ` +
        `(${failCount} failures, ${(inst.success_rate * 100).toFixed(0)}% success)\n`
      );
    }
  });

  // 3. Auto-deprecate: composite < 0.2
  store.instincts.forEach(inst => {
    if (inst.status === "deprecated") return;
    if (inst.confidence.composite < 0.2) {
      inst.status = "deprecated";
      degraded++;
      process.stdout.write(
        `🗑️ Deprecated: "${inst.trigger.slice(0, 40)}..." ` +
        `(composite ${(inst.confidence.composite * 100).toFixed(0)}%)\n`
      );
    }
  });

  // 4. Pattern degradation: confidence < 0.3 → dissolve
  store.patterns = store.patterns.filter(p => {
    if (p.confidence.composite < 0.3) {
      process.stdout.write(
        `💥 Dissolved pattern: "${p.name}" (composite ${(p.confidence.composite * 100).toFixed(0)}%)\n`
      );
      degraded++;
      return false;
    }
    // Check if >30% of source instincts are deprecated
    const memberStatuses = p.instinct_ids.map(id =>
      store.instincts.find(i => i.id === id)?.status
    );
    const deprecatedCount = memberStatuses.filter(s => s === "deprecated").length;
    if (deprecatedCount / p.instinct_ids.length > 0.3) {
      process.stdout.write(
        `💥 Dissolved pattern: "${p.name}" (${deprecatedCount}/${p.instinct_ids.length} members deprecated)\n`
      );
      degraded++;
      return false;
    }
    return true;
  });

  // 5. Clean deprecated instincts older than 30 days
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const before = store.instincts.length;
  store.instincts = store.instincts.filter(inst => {
    if (inst.status === "deprecated") {
      const lastSeen = new Date(inst.last_seen);
      if (lastSeen < thirtyDaysAgo) {
        cleaned++;
        return false;
      }
    }
    return true;
  });

  // Save
  storage.saveStore(store);

  if (decayed + degraded + cleaned === 0) {
    process.stdout.write("✅ No degradation needed — all instincts healthy.\n");
  } else {
    process.stdout.write(
      `\n📊 Degradation summary: ${decayed} decayed, ${degraded} degraded/dissolved, ${cleaned} cleaned.\n`
    );
  }
}

// =============================================================================
// Full Cycle
// =============================================================================

function runFullCycle(): void {
  process.stdout.write("🔄 Running full evolution cycle...\n\n");

  process.stdout.write("--- Phase 1: Degradation Check ---\n");
  runDegradation();

  process.stdout.write("\n--- Phase 2: L0→L1 Clustering ---\n");
  runClustering();

  process.stdout.write("\n--- Phase 3: L1→L2 Abstraction ---\n");
  runAbstraction();

  process.stdout.write("\n✅ Evolution cycle complete.\n");
}

// =============================================================================
// Status
// =============================================================================

function showEvolutionStatus(): void {
  const store = storage.loadStore();
  const stats = storage.getStats();

  let output = "# Evolution Status\n\n";

  // Overview
  output += `## Instincts: ${stats.totalInstincts}\n`;
  output += `- Active: ${stats.activeInstincts} (avg conf: ${(stats.avgConfidence * 100).toFixed(0)}%)\n`;
  output += `- Tentative: ${stats.tentativeInstincts}\n`;
  output += `- Deprecated: ${stats.deprecatedInstincts}\n\n`;

  // Patterns
  output += `## Patterns (L1): ${store.patterns.length}\n`;
  store.patterns.forEach(p => {
    output += `- 🔄 ${p.name} [${p.type}] — ${p.instinct_ids.length} instincts, cohesion ${(p.cohesion * 100).toFixed(0)}%\n`;
    output += `  ${formatConfidence(p.confidence)}\n`;
  });
  if (store.patterns.length === 0) output += "- (none yet)\n";
  output += "\n";

  // Strategies
  output += `## Strategies (L2): ${store.strategies.length}\n`;
  store.strategies.forEach(s => {
    output += `- 📋 ${s.name}: "${s.principle}"\n`;
    output += `  Transferable: ${s.transferable_contexts.join(", ")}\n`;
    output += `  ${formatConfidence(s.confidence)}\n`;
  });
  if (store.strategies.length === 0) output += "- (none yet)\n";
  output += "\n";

  // Evolution readiness
  const clusterCandidates = store.instincts.filter(
    i => i.status === "active" && i.confidence.composite >= 0.4
  );
  const alreadyClustered = new Set(store.patterns.flatMap(p => p.instinct_ids));
  const unclustered = clusterCandidates.filter(i => !alreadyClustered.has(i.id));

  output += `## Readiness\n`;
  output += `- Clustering: ${unclustered.length} unclustered active instincts`;
  output += unclustered.length >= 3 ? " ✅ ready\n" : " ⏳ need 3+\n";

  const maturePatterns = store.patterns.filter(p => p.confidence.composite >= 0.6);
  const existingStrategyPatterns = new Set(store.strategies.map(s => s.source_pattern_id));
  const abstractable = maturePatterns.filter(p => !existingStrategyPatterns.has(p.id));
  output += `- Abstraction: ${abstractable.length} patterns ready`;
  output += abstractable.length > 0 ? " ✅ ready\n" : " ⏳ need pattern conf ≥ 0.6\n";

  process.stdout.write(output);
}
