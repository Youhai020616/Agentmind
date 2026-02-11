// =============================================================================
// AgentMind - Context Generator
// Generates learning context for injection into Claude's system prompt.
//
// Usage: npx tsx scripts/lib/context-generator.ts <generate|guide>
// =============================================================================

import { LocalStorage } from "./storage.js";
import type { Instinct } from "./types.js";

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
const storage = new LocalStorage(PLUGIN_ROOT);

const command = process.argv[2] || "generate";

switch (command) {
  case "generate":
    generateContext();
    break;
  case "guide":
    generateGuide();
    break;
  default:
    generateContext();
}

/**
 * Generate the main learning context for SessionStart injection.
 * Output is kept concise (~300 tokens max) to preserve context budget.
 */
function generateContext(): void {
  const instincts = storage.getInstincts({
    status: "active",
    minConfidence: 0.4,
  });

  if (instincts.length === 0) {
    // No learned context yet
    process.exit(0);
  }

  const strong = instincts.filter((i) => i.confidence.composite >= 0.8);
  const moderate = instincts.filter(
    (i) => i.confidence.composite >= 0.6 && i.confidence.composite < 0.8,
  );
  const tentative = instincts.filter(
    (i) => i.confidence.composite >= 0.4 && i.confidence.composite < 0.6,
  );

  let output = "";

  if (strong.length > 0) {
    output += "### Strong Preferences (apply these):\n";
    strong.slice(0, 10).forEach((i) => {
      output += `- ${i.trigger}: ${i.action}\n`;
    });
    output += "\n";
  }

  if (moderate.length > 0) {
    output += "### Patterns (prefer these when applicable):\n";
    moderate.slice(0, 8).forEach((i) => {
      output += `- ${i.trigger}: ${i.action}\n`;
    });
    output += "\n";
  }

  if (tentative.length > 0) {
    output += "### Suggestions (consider these):\n";
    tentative.slice(0, 5).forEach((i) => {
      output += `- Consider: ${i.action}\n`;
    });
    output += "\n";
  }

  // Enforce token budget (~2000 chars ≈ 500 tokens)
  if (output.length > 2000) {
    output =
      output.substring(0, 1900) +
      "\n...(additional patterns available via /agentmind:instincts)\n";
  }

  process.stdout.write(output);
}

/**
 * Generate a behavioral guide based on evolved patterns and strategies.
 * This provides higher-level guidance than individual instincts.
 */
function generateGuide(): void {
  const store = storage.loadStore();

  if (store.strategies.length === 0 && store.patterns.length === 0) {
    // No evolved knowledge yet — fall back to top instincts
    const topInstincts = storage.getInstincts({
      status: "active",
      minConfidence: 0.6,
    });
    if (topInstincts.length === 0) process.exit(0);

    let output = "### Established Patterns:\n";
    topInstincts.slice(0, 5).forEach((i) => {
      output += `- ${i.action}\n`;
    });
    process.stdout.write(output);
    return;
  }

  let output = "";

  // Strategies first (highest-level knowledge)
  if (store.strategies.length > 0) {
    output += "### Guiding Principles:\n";
    store.strategies
      .sort((a, b) => b.confidence.composite - a.confidence.composite)
      .slice(0, 5)
      .forEach((s) => {
        output += `- **${s.name}**: ${s.principle}\n`;
        if (s.transferable_contexts.length > 0) {
          output += `  Applies to: ${s.transferable_contexts.join(", ")}\n`;
        }
      });
    output += "\n";
  }

  // Patterns
  if (store.patterns.length > 0) {
    output += "### Workflow Patterns:\n";
    store.patterns
      .sort((a, b) => b.confidence.composite - a.confidence.composite)
      .slice(0, 5)
      .forEach((p) => {
        const instincts = p.instinct_ids
          .map((id) => store.instincts.find((i) => i.id === id))
          .filter((i): i is Instinct => Boolean(i));

        output += `- **${p.name}** (${p.type}):\n`;
        instincts.slice(0, 3).forEach((i) => {
          output += `  - ${i.action}\n`;
        });
      });
    output += "\n";
  }

  // Domain expertise
  const stats = storage.getStats();
  const topDomains = Object.entries(stats.domains)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (topDomains.length > 0) {
    output += `### Active Domains: ${topDomains.map(([d, c]) => `${d} (${c})`).join(", ")}\n`;
  }

  // Token budget
  if (output.length > 2000) {
    output =
      output.substring(0, 1900) +
      "\n...(use /agentmind:status for full details)\n";
  }

  process.stdout.write(output);
}
