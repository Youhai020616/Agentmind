// =============================================================================
// AgentMind - Preference Detector (Phase 3.3)
//
// Detects user preferences from observation data:
//   - Tool selection preferences (grep vs find, vim vs nano)
//   - Code style preferences (from file extensions + patterns)
//   - Workflow preferences (test-first vs implement-first)
//
// Usage: npx tsx scripts/lib/preference-detector.ts <detect|status> [--days 7]
// =============================================================================

import { LocalStorage } from "./storage.js";
import type { Observation, Instinct, CompositeConfidence } from "./types.js";
import { DEFAULT_WEIGHTS } from "./types.js";

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
const storage = new LocalStorage(PLUGIN_ROOT);

// --- CLI ---
const args = process.argv.slice(2);
let command = "detect";
let days = 7;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--days" && args[i + 1]) {
    days = parseInt(args[++i], 10) || 7;
  } else if (!args[i].startsWith("-")) {
    command = args[i];
  }
}

switch (command) {
  case "detect":
    detectPreferences();
    break;
  case "status":
    showPreferenceStatus();
    break;
  default:
    detectPreferences();
}

// =============================================================================
// Preference Categories
// =============================================================================

interface PreferenceSignal {
  category: string;    // e.g. "tool-choice", "code-style", "workflow"
  key: string;         // e.g. "grep-over-find", "typescript-strict"
  description: string; // human-readable
  count: number;       // how many times observed
  sessions: Set<string>;
}

/**
 * Load observations from last N days.
 */
function localDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function loadRecentObservations(numDays: number): Observation[] {
  const observations: Observation[] = [];
  const now = new Date();

  for (let i = 0; i < numDays; i++) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = localDateStr(date);
    const dayObs = storage.getObservations(dateStr);
    observations.push(...dayObs);
  }

  return observations;
}

/**
 * Detect tool selection preferences.
 * Looks at which tools are used most frequently and in what combinations.
 */
function detectToolPreferences(observations: Observation[]): PreferenceSignal[] {
  const signals: PreferenceSignal[] = [];

  // Count tool usage
  const toolCounts = new Map<string, { count: number; sessions: Set<string> }>();
  observations
    .filter(o => o.layer === "execution" && o.data?.phase === "pre")
    .forEach(o => {
      const tool = o.data.tool_name as string;
      if (!toolCounts.has(tool)) {
        toolCounts.set(tool, { count: 0, sessions: new Set() });
      }
      const entry = toolCounts.get(tool)!;
      entry.count++;
      entry.sessions.add(o.session_id);
    });

  // Detect preferences from relative usage patterns
  const read = toolCounts.get("Read")?.count || 0;
  const grep = toolCounts.get("Grep")?.count || 0;
  const glob = toolCounts.get("Glob")?.count || 0;
  const bash = toolCounts.get("Bash")?.count || 0;
  const edit = toolCounts.get("Edit")?.count || 0;
  const write = toolCounts.get("Write")?.count || 0;

  // Read-heavy vs Write-heavy
  if (read > write * 2 && read >= 5) {
    signals.push({
      category: "workflow",
      key: "read-before-write",
      description: "User prefers reading/understanding code before modifying it",
      count: read,
      sessions: toolCounts.get("Read")?.sessions || new Set(),
    });
  }

  // Grep preference
  if (grep > 3) {
    signals.push({
      category: "tool-choice",
      key: "uses-grep-frequently",
      description: "User frequently uses Grep for code search",
      count: grep,
      sessions: toolCounts.get("Grep")?.sessions || new Set(),
    });
  }

  // Bash preference (vs using built-in tools)
  if (bash > edit * 1.5 && bash >= 5) {
    signals.push({
      category: "tool-choice",
      key: "prefers-bash-commands",
      description: "User prefers Bash commands over built-in edit tools",
      count: bash,
      sessions: toolCounts.get("Bash")?.sessions || new Set(),
    });
  }

  // Edit vs Write (surgical vs full-file)
  if (edit > write * 2 && edit >= 5) {
    signals.push({
      category: "tool-choice",
      key: "prefers-surgical-edits",
      description: "User prefers surgical Edit operations over full Write",
      count: edit,
      sessions: toolCounts.get("Edit")?.sessions || new Set(),
    });
  } else if (write > edit * 2 && write >= 5) {
    signals.push({
      category: "tool-choice",
      key: "prefers-full-writes",
      description: "User prefers full file Write operations over surgical Edit",
      count: write,
      sessions: toolCounts.get("Write")?.sessions || new Set(),
    });
  }

  return signals;
}

/**
 * Detect code style preferences from file extension patterns.
 */
function detectStylePreferences(observations: Observation[]): PreferenceSignal[] {
  const signals: PreferenceSignal[] = [];

  // Collect file extensions from execution observations
  const extCounts = new Map<string, { count: number; sessions: Set<string> }>();
  observations
    .filter(o => o.layer === "execution" && o.data?.abstract)
    .forEach(o => {
      const ext = (o.data.abstract as Record<string, unknown>).file_extension as string;
      if (ext && ext.length > 0 && ext.length < 10) {
        if (!extCounts.has(ext)) {
          extCounts.set(ext, { count: 0, sessions: new Set() });
        }
        const entry = extCounts.get(ext)!;
        entry.count++;
        entry.sessions.add(o.session_id);
      }
    });

  // TypeScript over JavaScript
  const tsCount = (extCounts.get("ts")?.count || 0) + (extCounts.get("tsx")?.count || 0);
  const jsCount = (extCounts.get("js")?.count || 0) + (extCounts.get("jsx")?.count || 0);
  if (tsCount > jsCount * 2 && tsCount >= 5) {
    signals.push({
      category: "code-style",
      key: "prefers-typescript",
      description: "User strongly prefers TypeScript over JavaScript",
      count: tsCount,
      sessions: extCounts.get("ts")?.sessions || new Set(),
    });
  }

  // Python detection
  const pyCount = extCounts.get("py")?.count || 0;
  if (pyCount >= 5) {
    signals.push({
      category: "code-style",
      key: "uses-python",
      description: "User frequently works with Python files",
      count: pyCount,
      sessions: extCounts.get("py")?.sessions || new Set(),
    });
  }

  // Shell script detection
  const shCount = (extCounts.get("sh")?.count || 0) + (extCounts.get("bash")?.count || 0);
  if (shCount >= 3) {
    signals.push({
      category: "code-style",
      key: "uses-shell-scripts",
      description: "User works with shell scripts",
      count: shCount,
      sessions: extCounts.get("sh")?.sessions || new Set(),
    });
  }

  return signals;
}

/**
 * Detect workflow preferences from action sequences.
 */
function detectWorkflowPreferences(observations: Observation[]): PreferenceSignal[] {
  const signals: PreferenceSignal[] = [];

  // Check for test-first patterns: Read → Test → Edit (vs Edit → Test)
  const toolSeq = observations
    .filter(o => o.layer === "execution" && o.data?.phase === "pre")
    .map(o => ({
      tool: o.data.tool_name as string,
      session: o.session_id,
    }));

  let testFirst = 0;
  let editFirst = 0;

  for (let i = 0; i < toolSeq.length - 2; i++) {
    const [a, b, c] = [toolSeq[i], toolSeq[i + 1], toolSeq[i + 2]];
    if (a.tool === "Bash" && b.tool === "Edit") editFirst++;
    if (a.tool === "Bash" && b.tool === "Read" && c.tool === "Edit") testFirst++;
    if (a.tool === "Read" && b.tool === "Read" && c.tool === "Edit") testFirst++;
  }

  if (testFirst > editFirst && testFirst >= 3) {
    signals.push({
      category: "workflow",
      key: "test-first-approach",
      description: "User tends to read/test before editing",
      count: testFirst,
      sessions: new Set(toolSeq.map(t => t.session)),
    });
  }

  // Check for correction frequency (high corrections → user wants more control)
  const corrections = observations.filter(
    o => o.layer === "intent" && o.data?.has_correction === true
  );
  if (corrections.length >= 5) {
    const totalPrompts = observations.filter(o => o.layer === "intent").length;
    const correctionRate = corrections.length / Math.max(totalPrompts, 1);
    if (correctionRate > 0.15) {
      signals.push({
        category: "workflow",
        key: "wants-confirmation",
        description: "User frequently corrects agent — prefer asking before acting",
        count: corrections.length,
        sessions: new Set(corrections.map(c => c.session_id)),
      });
    }
  }

  return signals;
}

// =============================================================================
// Convert signals to instinct candidates
// =============================================================================

function signalToInstinct(signal: PreferenceSignal): Omit<Instinct, "id" | "created_at" | "last_seen"> {
  const triggerMap: Record<string, string> = {
    "read-before-write": "When modifying code files",
    "uses-grep-frequently": "When searching for code patterns",
    "prefers-bash-commands": "When performing file operations",
    "prefers-surgical-edits": "When updating existing files",
    "prefers-full-writes": "When creating or updating files",
    "prefers-typescript": "When writing new code",
    "uses-python": "When choosing implementation language",
    "uses-shell-scripts": "When automating tasks",
    "test-first-approach": "Before implementing changes",
    "wants-confirmation": "Before making significant changes",
  };

  const frequencyScore = Math.min(signal.count / 15, 0.6);

  const confidence: CompositeConfidence = {
    frequency: Math.round(frequencyScore * 100) / 100,
    effectiveness: 0.5,
    human: 0.5,
    composite: 0,
  };
  confidence.composite = Math.round(
    (confidence.frequency * DEFAULT_WEIGHTS.frequency +
     confidence.effectiveness * DEFAULT_WEIGHTS.effectiveness +
     confidence.human * DEFAULT_WEIGHTS.human) * 100
  ) / 100;

  return {
    trigger: triggerMap[signal.key] || `When ${signal.category} context applies`,
    action: signal.description,
    domain: signal.category,
    status: "tentative",
    confidence,
    evidence_count: signal.count,
    source: "preference_detection",
    application_count: 0,
    success_rate: 0,
    tags: [signal.key, signal.category],
  };
}

// =============================================================================
// Main functions
// =============================================================================

function detectPreferences(): void {
  const observations = loadRecentObservations(days);

  if (observations.length < 10) {
    process.stdout.write(`⏳ Not enough observations (have ${observations.length}, need 10+).\n`);
    return;
  }

  const toolSignals = detectToolPreferences(observations);
  const styleSignals = detectStylePreferences(observations);
  const workflowSignals = detectWorkflowPreferences(observations);

  const allSignals = [...toolSignals, ...styleSignals, ...workflowSignals];

  if (allSignals.length === 0) {
    process.stdout.write("⏳ No clear preferences detected yet. Keep using the agent!\n");
    return;
  }

  // Check existing instincts to avoid duplicates
  const existing = storage.getInstincts();
  const existingKeys = new Set(
    existing.flatMap(i => i.tags || [])
  );

  let newCount = 0;
  allSignals.forEach(signal => {
    if (existingKeys.has(signal.key)) {
      process.stdout.write(`⏭️ Already tracked: ${signal.description}\n`);
      return;
    }

    const candidate = signalToInstinct(signal);
    const id = "inst_pref_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    storage.upsertInstinct({
      ...candidate,
      id,
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
    } as Instinct);

    newCount++;
    process.stdout.write(
      `🔍 New preference: ${signal.description}\n` +
      `   Category: ${signal.category} | Evidence: ${signal.count} observations | ${signal.sessions.size} sessions\n`
    );
  });

  process.stdout.write(`\n✅ Detected ${allSignals.length} preferences, ${newCount} new.\n`);
}

function showPreferenceStatus(): void {
  const prefInstincts = storage.getInstincts().filter(
    i => i.source === "preference_detection"
  );

  if (prefInstincts.length === 0) {
    process.stdout.write("No preferences detected yet. Run 'detect' first.\n");
    return;
  }

  let output = `# Detected Preferences (${prefInstincts.length})\n\n`;

  const byCategory = new Map<string, Instinct[]>();
  prefInstincts.forEach(i => {
    const cat = i.domain;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(i);
  });

  byCategory.forEach((instincts, category) => {
    output += `## ${category} (${instincts.length})\n`;
    instincts.forEach(i => {
      output += `- ${i.action} [${i.status}, ${(i.confidence.composite * 100).toFixed(0)}%]\n`;
    });
    output += "\n";
  });

  process.stdout.write(output);
}
