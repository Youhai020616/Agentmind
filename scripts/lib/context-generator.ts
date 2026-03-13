// =============================================================================
// AgentMind - Context Generator (Phase 3: Smart Context)
//
// Features:
//   3.1 Task-aware injection — filters instincts by workspace/file context
//   3.2 Dynamic token budget — allocates chars by confidence tier
//   3.3 Strategy/Pattern-aware — includes evolved knowledge
//
// Usage: npx tsx scripts/lib/context-generator.ts <generate|guide> [--cwd /path]
// =============================================================================

import { LocalStorage } from "./storage.js";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import type { Instinct, Pattern, Strategy } from "./types.js";

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
const storage = new LocalStorage(PLUGIN_ROOT);

// --- Parse CLI args ---
const args = process.argv.slice(2);
let command = "generate";
let cwd = process.env.AGENTMIND_CWD || "";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--cwd" && args[i + 1]) {
    cwd = args[++i];
  } else if (!args[i].startsWith("-")) {
    command = args[i];
  }
}

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

// =============================================================================
// 3.1 Task-Aware: Detect workspace context
// =============================================================================

interface WorkspaceContext {
  languages: string[];     // e.g. ["typescript", "python"]
  frameworks: string[];    // e.g. ["react", "express"]
  taskType: string;        // e.g. "frontend", "backend", "fullstack", "devops", "unknown"
  projectName: string;     // from package.json name or directory
}

function detectWorkspace(dir: string): WorkspaceContext {
  const ctx: WorkspaceContext = {
    languages: [],
    frameworks: [],
    taskType: "unknown",
    projectName: basename(dir) || "project",
  };

  if (!dir || !existsSync(dir)) return ctx;

  // Check package.json
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      ctx.projectName = pkg.name || ctx.projectName;

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      if (allDeps) {
        // Detect languages
        if (allDeps.typescript || allDeps["ts-node"] || allDeps.tsx) ctx.languages.push("typescript");
        if (!ctx.languages.includes("typescript")) ctx.languages.push("javascript");

        // Detect frameworks
        if (allDeps.react || allDeps["react-dom"]) ctx.frameworks.push("react");
        if (allDeps.vue) ctx.frameworks.push("vue");
        if (allDeps.next) ctx.frameworks.push("nextjs");
        if (allDeps.express) ctx.frameworks.push("express");
        if (allDeps.fastify) ctx.frameworks.push("fastify");
        if (allDeps.vitest || allDeps.jest) ctx.frameworks.push("testing");
        if (allDeps.tailwindcss) ctx.frameworks.push("tailwind");
        if (allDeps.prisma || allDeps["@prisma/client"]) ctx.frameworks.push("prisma");
        if (allDeps.electron) ctx.frameworks.push("electron");
      }

      // Infer task type
      if (ctx.frameworks.some(f => ["react", "vue", "nextjs", "tailwind"].includes(f))) {
        ctx.taskType = ctx.frameworks.some(f => ["express", "fastify", "prisma"].includes(f)) ? "fullstack" : "frontend";
      } else if (ctx.frameworks.some(f => ["express", "fastify", "prisma"].includes(f))) {
        ctx.taskType = "backend";
      }
    } catch { /* ignore parse errors */ }
  }

  // Check for Python
  if (existsSync(join(dir, "pyproject.toml")) || existsSync(join(dir, "setup.py")) || existsSync(join(dir, "requirements.txt"))) {
    ctx.languages.push("python");
    if (ctx.taskType === "unknown") ctx.taskType = "backend";
  }

  // Check for Rust
  if (existsSync(join(dir, "Cargo.toml"))) {
    ctx.languages.push("rust");
    if (ctx.taskType === "unknown") ctx.taskType = "backend";
  }

  // Check for Go
  if (existsSync(join(dir, "go.mod"))) {
    ctx.languages.push("go");
    if (ctx.taskType === "unknown") ctx.taskType = "backend";
  }

  // Check for DevOps
  if (existsSync(join(dir, "Dockerfile")) || existsSync(join(dir, ".github"))) {
    if (ctx.taskType === "unknown") ctx.taskType = "devops";
  }

  // Scan top-level file extensions for additional language detection
  try {
    const files = readdirSync(dir).slice(0, 50);
    const extSet = new Set<string>();
    files.forEach(f => {
      try {
        if (statSync(join(dir, f)).isFile()) {
          const ext = f.split(".").pop()?.toLowerCase();
          if (ext) extSet.add(ext);
        }
      } catch { /* skip */ }
    });
    if (extSet.has("ts") || extSet.has("tsx")) {
      if (!ctx.languages.includes("typescript")) ctx.languages.push("typescript");
    }
    if (extSet.has("py")) {
      if (!ctx.languages.includes("python")) ctx.languages.push("python");
    }
    if (extSet.has("rs")) {
      if (!ctx.languages.includes("rust")) ctx.languages.push("rust");
    }
    if (extSet.has("go")) {
      if (!ctx.languages.includes("go")) ctx.languages.push("go");
    }
    if (extSet.has("sh") || extSet.has("bash")) {
      if (!ctx.languages.includes("shell")) ctx.languages.push("shell");
    }
  } catch { /* skip */ }

  return ctx;
}

/**
 * Score how relevant an instinct is to the current workspace.
 * Returns 0-1 multiplier.
 */
function relevanceScore(instinct: Instinct, ctx: WorkspaceContext): number {
  let score = 0.5; // baseline for all instincts

  const text = `${instinct.trigger} ${instinct.action} ${instinct.domain}`.toLowerCase();
  const tags = (instinct.tags || []).map(t => t.toLowerCase());

  // Language match
  for (const lang of ctx.languages) {
    if (text.includes(lang) || tags.includes(lang)) {
      score += 0.3;
      break;
    }
  }

  // Framework match
  for (const fw of ctx.frameworks) {
    if (text.includes(fw) || tags.includes(fw)) {
      score += 0.2;
      break;
    }
  }

  // Domain match with task type
  const domainTaskMap: Record<string, string[]> = {
    "frontend": ["ui", "css", "component", "style", "layout", "react", "vue"],
    "backend": ["api", "database", "server", "auth", "query", "route"],
    "devops": ["docker", "ci", "deploy", "pipeline", "config"],
    "fullstack": ["ui", "api", "database", "component", "route"],
  };

  const taskKeywords = domainTaskMap[ctx.taskType] || [];
  if (taskKeywords.some(kw => text.includes(kw) || tags.includes(kw))) {
    score += 0.15;
  }

  // Universal domains always relevant
  if (["workflow", "preference", "error-handling"].includes(instinct.domain)) {
    score += 0.1;
  }

  return Math.min(score, 1.0);
}

// =============================================================================
// 3.2 Dynamic Token Budget
// =============================================================================

interface TokenBudget {
  core: number;      // chars per instinct for composite ≥ 0.8
  strong: number;    // chars per instinct for 0.6-0.8
  moderate: number;  // chars per instinct for 0.4-0.6
  total: number;     // total chars budget
}

function calculateBudget(instinctCount: number): TokenBudget {
  // Base: 2000 chars. Scale up slightly for more instincts, cap at 3000.
  const total = Math.min(2000 + instinctCount * 30, 3000);
  return {
    core: 120,      // full trigger + action
    strong: 80,     // trigger + action (may truncate)
    moderate: 50,   // action only (one line)
    total,
  };
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

// =============================================================================
// Main: Generate Context
// =============================================================================

function generateContext(): void {
  const allInstincts = storage.getInstincts({
    status: "active",
    minConfidence: 0.4,
  });

  if (allInstincts.length === 0) return;

  // Detect workspace context
  const wsCtx = detectWorkspace(cwd);

  // Score and sort by relevance × confidence
  const scored = allInstincts.map(inst => ({
    instinct: inst,
    relevance: relevanceScore(inst, wsCtx),
    finalScore: inst.confidence.composite * relevanceScore(inst, wsCtx),
  })).sort((a, b) => b.finalScore - a.finalScore);

  // Budget
  const budget = calculateBudget(scored.length);
  let charsUsed = 0;

  const core = scored.filter(s => s.instinct.confidence.composite >= 0.8 && s.relevance >= 0.5);
  const strong = scored.filter(s => s.instinct.confidence.composite >= 0.6 && s.instinct.confidence.composite < 0.8 && s.relevance >= 0.4);
  const moderate = scored.filter(s => s.instinct.confidence.composite >= 0.4 && s.instinct.confidence.composite < 0.6 && s.relevance >= 0.5);

  let output = "";

  // Include evolved knowledge first (strategies + patterns)
  const store = storage.loadStore();
  if (store.strategies.length > 0) {
    const relevantStrategies = store.strategies
      .filter(s => {
        const text = `${s.name} ${s.principle} ${s.domain}`.toLowerCase();
        return wsCtx.languages.some(l => text.includes(l)) ||
               wsCtx.frameworks.some(f => text.includes(f)) ||
               s.domain === "workflow" || s.domain === "preference" ||
               wsCtx.taskType === "unknown"; // unknown → include all
      })
      .sort((a, b) => b.confidence.composite - a.confidence.composite)
      .slice(0, 3);

    if (relevantStrategies.length > 0) {
      output += "### Principles:\n";
      relevantStrategies.forEach(s => {
        const line = `- ${s.principle}\n`;
        if (charsUsed + line.length <= budget.total) {
          output += line;
          charsUsed += line.length;
        }
      });
      output += "\n";
    }
  }

  // Core instincts
  if (core.length > 0) {
    output += "### Apply these:\n";
    for (const s of core.slice(0, 10)) {
      const line = `- ${truncate(s.instinct.trigger, 50)}: ${truncate(s.instinct.action, budget.core - 55)}\n`;
      if (charsUsed + line.length > budget.total) break;
      output += line;
      charsUsed += line.length;
    }
    output += "\n";
  }

  // Strong instincts
  if (strong.length > 0) {
    output += "### Prefer these:\n";
    for (const s of strong.slice(0, 8)) {
      const line = `- ${truncate(s.instinct.trigger, 40)}: ${truncate(s.instinct.action, budget.strong - 45)}\n`;
      if (charsUsed + line.length > budget.total) break;
      output += line;
      charsUsed += line.length;
    }
    output += "\n";
  }

  // Moderate instincts (action only, compact)
  if (moderate.length > 0 && charsUsed < budget.total * 0.85) {
    output += "### Consider:\n";
    for (const s of moderate.slice(0, 5)) {
      const line = `- ${truncate(s.instinct.action, budget.moderate)}\n`;
      if (charsUsed + line.length > budget.total) break;
      output += line;
      charsUsed += line.length;
    }
    output += "\n";
  }

  // Footer: workspace hint (helps Claude understand context)
  if (wsCtx.languages.length > 0 || wsCtx.frameworks.length > 0) {
    const ctxLine = `_Context: ${wsCtx.projectName}` +
      (wsCtx.languages.length > 0 ? ` [${wsCtx.languages.join(", ")}]` : "") +
      (wsCtx.frameworks.length > 0 ? ` (${wsCtx.frameworks.join(", ")})` : "") +
      `_\n`;
    if (charsUsed + ctxLine.length <= budget.total) {
      output += ctxLine;
    }
  }

  process.stdout.write(output);
}

// =============================================================================
// Guide: Higher-level knowledge
// =============================================================================

function generateGuide(): void {
  const store = storage.loadStore();

  if (store.strategies.length === 0 && store.patterns.length === 0) {
    const topInstincts = storage.getInstincts({
      status: "active",
      minConfidence: 0.6,
    });
    if (topInstincts.length === 0) return;

    let output = "### Established Patterns:\n";
    topInstincts.slice(0, 5).forEach((i) => {
      output += `- ${i.action}\n`;
    });
    process.stdout.write(output);
    return;
  }

  let output = "";

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

  const stats = storage.getStats();
  const topDomains = Object.entries(stats.domains)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (topDomains.length > 0) {
    output += `### Active Domains: ${topDomains.map(([d, c]) => `${d} (${c})`).join(", ")}\n`;
  }

  if (output.length > 2000) {
    output =
      output.substring(0, 1900) +
      "\n...(use /agentmind:status for full details)\n";
  }

  process.stdout.write(output);
}
