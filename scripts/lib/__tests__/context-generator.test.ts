import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import type { Instinct, CompositeConfidence, InstinctsStore, Pattern, Strategy } from "../types.js";

// --- Test Setup ---

const TEST_ROOT = join(import.meta.dirname, ".test-context-gen-" + process.pid);

function makeConfidence(composite: number, overrides: Partial<CompositeConfidence> = {}): CompositeConfidence {
  return {
    frequency: overrides.frequency ?? 0.5,
    effectiveness: overrides.effectiveness ?? 0.5,
    human: overrides.human ?? 0.5,
    composite,
    ...overrides,
  };
}

function makeInstinct(overrides: Partial<Instinct> = {}): Instinct {
  return {
    id: "inst_" + Math.random().toString(36).slice(2, 8),
    trigger: "When testing",
    action: "Run vitest",
    domain: "testing",
    status: "active",
    confidence: makeConfidence(0.7),
    evidence_count: 5,
    source: "sequence_detection",
    created_at: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    application_count: 0,
    success_rate: 0,
    ...overrides,
  };
}

function createStoreFile(
  instincts: Instinct[] = [],
  extra: { patterns?: Pattern[]; strategies?: Strategy[] } = {},
): void {
  const store: InstinctsStore = {
    instincts,
    patterns: extra.patterns || [],
    strategies: extra.strategies || [],
    experts: [],
    metadata: {
      version: "0.1.0",
      last_analysis: new Date().toISOString(),
      total_sessions_analyzed: 3,
      total_observations: 50,
      created_at: new Date().toISOString(),
    },
  };
  const dataDir = join(TEST_ROOT, "data");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "instincts.json"), JSON.stringify(store, null, 2));
}

function runGenerator(command: string): string {
  const tsFile = join(import.meta.dirname, "..", "context-generator.ts");
  try {
    return execSync(`npx --yes tsx "${tsFile}" ${command}`, {
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: TEST_ROOT },
      encoding: "utf8",
      timeout: 30000,
    });
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    return (err.stdout || "") + (err.stderr || "");
  }
}

beforeEach(() => {
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true });
  }
  mkdirSync(TEST_ROOT, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true });
  }
});

// --- generate command ---

describe("context-generator generate", () => {
  it("produces no output for empty store", () => {
    createStoreFile([]);
    const output = runGenerator("generate");
    expect(output.trim()).toBe("");
  });

  it("produces no output when all instincts below threshold", () => {
    createStoreFile([
      makeInstinct({ status: "active", confidence: makeConfidence(0.2) }),
    ]);
    const output = runGenerator("generate");
    expect(output.trim()).toBe("");
  });

  it("groups instincts by confidence tier", () => {
    createStoreFile([
      makeInstinct({ trigger: "Strong trigger", action: "Strong action", confidence: makeConfidence(0.85) }),
      makeInstinct({ trigger: "Moderate trigger", action: "Moderate action", confidence: makeConfidence(0.65) }),
      makeInstinct({ trigger: "Tentative trigger", action: "Tentative action", confidence: makeConfidence(0.45) }),
    ]);

    const output = runGenerator("generate");
    expect(output).toContain("Strong Preferences");
    expect(output).toContain("Strong trigger");
    expect(output).toContain("Patterns");
    expect(output).toContain("Moderate trigger");
    expect(output).toContain("Suggestions");
    expect(output).toContain("Tentative action");
  });

  it("only includes active instincts", () => {
    createStoreFile([
      makeInstinct({ status: "active", trigger: "Active one", confidence: makeConfidence(0.7) }),
      makeInstinct({ status: "tentative", trigger: "Tentative one", confidence: makeConfidence(0.7) }),
      makeInstinct({ status: "deprecated", trigger: "Deprecated one", confidence: makeConfidence(0.7) }),
    ]);

    const output = runGenerator("generate");
    expect(output).toContain("Active one");
    expect(output).not.toContain("Tentative one");
    expect(output).not.toContain("Deprecated one");
  });

  it("truncates output when exceeding token budget", () => {
    const instincts: Instinct[] = [];
    for (let i = 0; i < 50; i++) {
      instincts.push(
        makeInstinct({
          trigger: `Long trigger description number ${i} that takes up space in the output buffer`,
          action: `Detailed action ${i} with a lot of descriptive text to fill the output`,
          confidence: makeConfidence(0.85),
        }),
      );
    }
    createStoreFile(instincts);

    const output = runGenerator("generate");
    // Output should be truncated but not empty
    expect(output.length).toBeGreaterThan(0);
    expect(output.length).toBeLessThanOrEqual(2200); // ~2000 + truncation message
  });
});

// --- guide command ---

describe("context-generator guide", () => {
  it("shows top instincts when no patterns/strategies exist", () => {
    createStoreFile([
      makeInstinct({ action: "Use TypeScript strict mode", confidence: makeConfidence(0.7) }),
    ]);

    const output = runGenerator("guide");
    expect(output).toContain("Established Patterns");
    expect(output).toContain("Use TypeScript strict mode");
  });

  it("produces no output when no qualifying instincts", () => {
    createStoreFile([
      makeInstinct({ status: "active", confidence: makeConfidence(0.3) }),
    ]);
    const output = runGenerator("guide");
    expect(output.trim()).toBe("");
  });

  it("shows strategies when available", () => {
    const strategies: Strategy[] = [
      {
        id: "strat_1",
        name: "Read Before Edit",
        principle: "Always read a file before modifying it",
        level: 2,
        source_pattern_id: "pat_1",
        transferable_contexts: ["code-editing"],
        domain: "workflow",
        confidence: makeConfidence(0.8),
        created_at: new Date().toISOString(),
      },
    ];

    createStoreFile([], { strategies });

    const output = runGenerator("guide");
    expect(output).toContain("Guiding Principles");
    expect(output).toContain("Read Before Edit");
    expect(output).toContain("Always read a file");
  });

  it("shows patterns when available", () => {
    const inst = makeInstinct({ action: "Run grep first" });
    const patterns: Pattern[] = [
      {
        id: "pat_1",
        name: "Search-Read-Edit",
        type: "sequential",
        level: 1,
        instinct_ids: [inst.id],
        cohesion: 0.85,
        domain: "workflow",
        confidence: makeConfidence(0.7),
        created_at: new Date().toISOString(),
      },
    ];

    createStoreFile([inst], { patterns });

    const output = runGenerator("guide");
    expect(output).toContain("Workflow Patterns");
    expect(output).toContain("Search-Read-Edit");
  });

  it("shows both strategies and patterns together", () => {
    const inst = makeInstinct({ action: "Check tests first" });
    const strategies: Strategy[] = [
      {
        id: "strat_1",
        name: "Test First",
        principle: "Always run tests before committing",
        level: 2,
        source_pattern_id: "pat_1",
        transferable_contexts: ["development"],
        domain: "testing",
        confidence: makeConfidence(0.8),
        created_at: new Date().toISOString(),
      },
    ];
    const patterns: Pattern[] = [
      {
        id: "pat_1",
        name: "Test-Commit Workflow",
        type: "sequential",
        level: 1,
        instinct_ids: [inst.id],
        cohesion: 0.8,
        domain: "testing",
        confidence: makeConfidence(0.7),
        created_at: new Date().toISOString(),
      },
    ];

    createStoreFile([inst], { strategies, patterns });

    const output = runGenerator("guide");
    expect(output).toContain("Guiding Principles");
    expect(output).toContain("Workflow Patterns");
  });
});
