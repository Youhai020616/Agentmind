// =============================================================================
// AgentMind - Instinct Manager
// CLI-callable entry point for instinct operations.
//
// Usage: npx tsx scripts/lib/instinct-manager.ts <command> [args]
//
// Commands:
//   status [domain]         — Show learning status overview
//   list [--domain X]       — List instincts
//   pending                 — Show pending review candidates
//   evolve-candidates       — Show evolution candidates
//   tree                    — Show evolution tree
//   save                    — Force save current store
//   dashboard-data          — Output dashboard JSON data
// =============================================================================

import { readFileSync, writeFileSync } from "fs";
import { LocalStorage } from "./storage.js";
import { formatConfidence } from "./confidence.js";
import type { Instinct, InstinctsStore } from "./types.js";

// Resolve plugin root
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
const storage = new LocalStorage(PLUGIN_ROOT);

// --- CLI Command Router ---

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "status":
    showStatus(args[0]);
    break;
  case "list":
    listInstincts(args);
    break;
  case "pending":
    showPending();
    break;
  case "evolve-candidates":
    showEvolveCandidates();
    break;
  case "tree":
    showEvolutionTree();
    break;
  case "save":
    forceSave();
    break;
  case "dashboard-data":
    outputDashboardData();
    break;
  case "search":
    searchInstincts(args);
    break;
  case "export":
    exportInstincts(args[0]);
    break;
  case "import":
    importInstincts(args[0]);
    break;
  default:
    showStatus();
}

// --- Command Implementations ---

function showStatus(domain?: string): void {
  const stats = storage.getStats();
  const sessions = storage.getSessions(5);

  let output = "";
  output += `# AgentMind Learning Status\n\n`;
  output += `## Overview\n`;
  output += `- Total instincts: ${stats.totalInstincts}\n`;
  output += `  - Active: ${stats.activeInstincts}\n`;
  output += `  - Tentative: ${stats.tentativeInstincts}\n`;
  output += `  - Deprecated: ${stats.deprecatedInstincts}\n`;
  output += `- Average confidence: ${(stats.avgConfidence * 100).toFixed(0)}%\n`;
  output += `- Sessions analyzed: ${stats.totalSessions}\n`;
  output += `- Total observations: ${stats.totalObservations}\n\n`;

  // Domain breakdown
  output += `## Domains\n`;
  const domains = Object.entries(stats.domains).sort((a, b) => b[1] - a[1]);
  if (domains.length > 0) {
    domains.forEach(([d, count]) => {
      if (!domain || d === domain) {
        output += `- ${d}: ${count} instincts\n`;
      }
    });
  } else {
    output += `- No domains yet (start coding to build up patterns)\n`;
  }
  output += "\n";

  // Top instincts
  const topInstincts = storage
    .getInstincts({ status: "active", domain })
    .slice(0, 5);

  if (topInstincts.length > 0) {
    output += `## Top Instincts\n`;
    topInstincts.forEach((inst, i) => {
      output += `${i + 1}. **${inst.trigger}**: ${inst.action}\n`;
      output += `   ${formatConfidence(inst.confidence)}\n`;
    });
  }
  output += "\n";

  // Recent sessions
  if (sessions.length > 0) {
    output += `## Recent Sessions\n`;
    sessions.forEach((s) => {
      output += `- ${s.timestamp.split("T")[0]}: ${s.observation_count} observations, ${s.patterns_detected} patterns\n`;
    });
  }

  process.stdout.write(output);
}

function listInstincts(args: string[]): void {
  const filters: { status?: string; domain?: string; minConfidence?: number } =
    {};

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--domain" && args[i + 1]) {
      filters.domain = args[++i];
    } else if (args[i] === "--status" && args[i + 1]) {
      filters.status = args[++i];
    } else if (args[i] === "--min-confidence" && args[i + 1]) {
      const parsed = parseFloat(args[++i]);
      if (!isNaN(parsed)) filters.minConfidence = parsed;
    }
  }

  if (!filters.status) filters.status = "active";

  const instincts = storage.getInstincts(filters);

  if (instincts.length === 0) {
    process.stdout.write("No instincts found matching filters.\n");
    return;
  }

  let output = `| ID | Trigger | Action | Confidence | Domain | Status |\n`;
  output += `|-----|---------|--------|------------|--------|--------|\n`;

  instincts.forEach((inst) => {
    const conf = `${(inst.confidence.composite * 100).toFixed(0)}%`;
    const trigger =
      inst.trigger.length > 40
        ? inst.trigger.slice(0, 37) + "..."
        : inst.trigger;
    const action =
      inst.action.length > 40 ? inst.action.slice(0, 37) + "..." : inst.action;
    output += `| ${inst.id.slice(-8)} | ${trigger} | ${action} | ${conf} | ${inst.domain} | ${inst.status} |\n`;
  });

  process.stdout.write(output);
}

function showPending(): void {
  const tentative = storage.getInstincts({ status: "tentative" });

  if (tentative.length === 0) {
    process.stdout.write("No pending instinct candidates to review.\n");
    process.stdout.write("Use /agentmind:status to see current instincts.\n");
    return;
  }

  let output = `# Pending Review: ${tentative.length} candidates\n\n`;

  tentative.forEach((inst, i) => {
    output += `## Candidate ${i + 1}: ${inst.id}\n`;
    output += `- **Trigger**: ${inst.trigger}\n`;
    output += `- **Action**: ${inst.action}\n`;
    output += `- **Domain**: ${inst.domain}\n`;
    output += `- **Confidence**: ${formatConfidence(inst.confidence)}\n`;
    output += `- **Evidence**: ${inst.evidence_count} observations\n`;
    output += `- **Source**: ${inst.source}\n`;
    output += `- **First seen**: ${inst.created_at}\n\n`;
  });

  process.stdout.write(output);
}

function showEvolveCandidates(): void {
  const active = storage.getInstincts({ status: "active", minConfidence: 0.5 });

  if (active.length < 3) {
    process.stdout.write(
      `Not enough high-confidence instincts for evolution (need 3+, have ${active.length}).\n`,
    );
    return;
  }

  // Group by domain
  const byDomain = new Map<string, Instinct[]>();
  active.forEach((inst) => {
    if (!byDomain.has(inst.domain)) byDomain.set(inst.domain, []);
    byDomain.get(inst.domain)!.push(inst);
  });

  let output = `# Evolution Candidates\n\n`;
  let hasCandidates = false;

  byDomain.forEach((instincts, domain) => {
    if (instincts.length >= 3) {
      hasCandidates = true;
      const avgConf =
        instincts.reduce((s, i) => s + i.confidence.composite, 0) /
        instincts.length;

      output += `## Domain: ${domain} (${instincts.length} instincts, avg conf: ${(avgConf * 100).toFixed(0)}%)\n\n`;
      output += `Candidate cluster for Level 1 Pattern:\n`;
      instincts.forEach((inst) => {
        output += `  - [${(inst.confidence.composite * 100).toFixed(0)}%] ${inst.trigger}: ${inst.action}\n`;
      });
      output += `\n`;
    }
  });

  if (!hasCandidates) {
    output += `No evolution candidates yet. Need 3+ instincts in the same domain with confidence > 0.5.\n`;
  }

  process.stdout.write(output);
}

function showEvolutionTree(): void {
  const store = storage.loadStore();

  let output = `# Evolution Tree\n\n`;

  if (store.experts.length > 0) {
    store.experts.forEach((exp) => {
      output += `📁 ${exp.name} (Expert System, L3)\n`;
    });
  }

  if (store.strategies.length > 0) {
    store.strategies.forEach((strat) => {
      output += `📋 ${strat.name} (Strategy, L2, ${(strat.confidence.composite * 100).toFixed(0)}%)\n`;
      output += `   Principle: "${strat.principle}"\n`;
    });
  }

  if (store.patterns.length > 0) {
    store.patterns.forEach((pat) => {
      output += `🔄 ${pat.name} (Pattern, L1, ${(pat.confidence.composite * 100).toFixed(0)}%)\n`;
      pat.instinct_ids.forEach((id) => {
        const inst = store.instincts.find((i) => i.id === id);
        if (inst) {
          output += `   💡 ${inst.trigger}: ${inst.action} (${(inst.confidence.composite * 100).toFixed(0)}%)\n`;
        }
      });
    });
  }

  // Ungrouped instincts
  const groupedIds = new Set([
    ...store.patterns.flatMap((p) => p.instinct_ids),
  ]);
  const ungrouped = store.instincts.filter(
    (i) => i.status === "active" && !groupedIds.has(i.id),
  );

  if (ungrouped.length > 0) {
    output += `\n📂 Ungrouped Instincts (${ungrouped.length})\n`;
    ungrouped.forEach((inst) => {
      output += `   💡 ${inst.trigger}: ${inst.action} (${(inst.confidence.composite * 100).toFixed(0)}%)\n`;
    });
  }

  if (store.instincts.length === 0) {
    output += `Tree is empty. Start coding sessions to build up instincts.\n`;
  }

  process.stdout.write(output);
}

function forceSave(): void {
  const store = storage.loadStore();
  storage.saveStore(store);
  process.stdout.write("Store saved successfully.\n");
}

function outputDashboardData(): void {
  const stats = storage.getStats();
  const sessions = storage.getSessions(10);
  const topInstincts = storage.getInstincts({ status: "active" }).slice(0, 10);
  const store = storage.loadStore();

  const data = {
    stats,
    sessions,
    topInstincts: topInstincts.map((i) => ({
      id: i.id,
      trigger: i.trigger,
      action: i.action,
      confidence: i.confidence,
      domain: i.domain,
    })),
    evolution: {
      patterns: store.patterns.length,
      strategies: store.strategies.length,
      experts: store.experts.length,
    },
  };

  process.stdout.write(JSON.stringify(data, null, 2));
}

function searchInstincts(args: string[]): void {
  const keyword = args.join(" ").toLowerCase().trim();
  if (!keyword) {
    process.stdout.write("Usage: search <keyword>\n");
    return;
  }

  const all = storage.getInstincts();
  const matches = all.filter(
    (i) =>
      i.trigger.toLowerCase().includes(keyword) ||
      i.action.toLowerCase().includes(keyword) ||
      i.domain.toLowerCase().includes(keyword) ||
      (i.tags && i.tags.some((t) => t.toLowerCase().includes(keyword))),
  );

  if (matches.length === 0) {
    process.stdout.write(`No instincts found matching "${keyword}".\n`);
    return;
  }

  let output = `# Search Results: "${keyword}" (${matches.length} matches)\n\n`;
  matches.forEach((inst, i) => {
    output += `${i + 1}. **${inst.trigger}**: ${inst.action}\n`;
    output += `   ${formatConfidence(inst.confidence)} | ${inst.domain} | ${inst.status}\n`;
  });

  process.stdout.write(output);
}

function exportInstincts(filePath?: string): void {
  const store = storage.loadStore();
  const exportData = {
    version: store.metadata.version,
    exported_at: new Date().toISOString(),
    instincts: store.instincts,
    patterns: store.patterns,
    strategies: store.strategies,
  };

  if (filePath) {
    writeFileSync(filePath, JSON.stringify(exportData, null, 2));
    process.stdout.write(`Exported ${store.instincts.length} instincts to ${filePath}\n`);
  } else {
    process.stdout.write(JSON.stringify(exportData, null, 2));
  }
}

function importInstincts(filePath?: string): void {
  if (!filePath) {
    process.stdout.write("Usage: import <file-path>\n");
    return;
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    process.stderr.write(`Error: Could not read file ${filePath}\n`);
    return;
  }

  let importData: { instincts?: Instinct[]; patterns?: InstinctsStore["patterns"]; strategies?: InstinctsStore["strategies"] };
  try {
    importData = JSON.parse(raw);
  } catch {
    process.stderr.write("Error: Invalid JSON in import file.\n");
    return;
  }

  if (!importData.instincts || !Array.isArray(importData.instincts)) {
    process.stderr.write("Error: Import file must contain an 'instincts' array.\n");
    return;
  }

  let imported = 0;
  let skipped = 0;

  importData.instincts.forEach((inst) => {
    const existing = storage.getInstinctById(inst.id);
    if (existing) {
      skipped++;
    } else {
      storage.upsertInstinct({
        ...inst,
        source: "imported" as Instinct["source"],
      });
      imported++;
    }
  });

  process.stdout.write(`Imported ${imported} instincts (${skipped} skipped as duplicates).\n`);
}
