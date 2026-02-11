import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import type { Instinct, CompositeConfidence, InstinctsStore } from "../types.js";

// --- Test Setup ---

const TEST_ROOT = join(import.meta.dirname, ".test-manager-" + process.pid);

function makeConfidence(composite = 0.5): CompositeConfidence {
  return {
    frequency: 0.5,
    effectiveness: 0.5,
    human: 0.5,
    composite,
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

function createStoreFile(instincts: Instinct[] = [], extra: Partial<InstinctsStore> = {}): void {
  const store: InstinctsStore = {
    instincts,
    patterns: extra.patterns || [],
    strategies: extra.strategies || [],
    experts: extra.experts || [],
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

function runManager(command: string): string {
  const tsFile = join(import.meta.dirname, "..", "instinct-manager.ts");
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

// --- Tests ---

describe("instinct-manager status command", () => {
  it("shows overview with totals", () => {
    createStoreFile([
      makeInstinct({ status: "active" }),
      makeInstinct({ status: "tentative" }),
    ]);

    const output = runManager("status");
    expect(output).toContain("AgentMind Learning Status");
    expect(output).toContain("Total instincts: 2");
    expect(output).toContain("Active: 1");
    expect(output).toContain("Tentative: 1");
  });

  it("shows empty state gracefully", () => {
    createStoreFile([]);
    const output = runManager("status");
    expect(output).toContain("Total instincts: 0");
  });

  it("filters by domain when provided", () => {
    createStoreFile([
      makeInstinct({ domain: "workflow", status: "active" }),
      makeInstinct({ domain: "testing", status: "active" }),
    ]);
    const output = runManager("status workflow");
    expect(output).toContain("workflow");
  });
});

describe("instinct-manager list command", () => {
  it("lists active instincts by default", () => {
    createStoreFile([
      makeInstinct({ status: "active", trigger: "When editing files" }),
      makeInstinct({ status: "tentative", trigger: "When debugging" }),
    ]);

    const output = runManager("list");
    expect(output).toContain("When editing files");
    // tentative should not appear in default (active) list
    expect(output).not.toContain("When debugging");
  });

  it("filters by domain", () => {
    createStoreFile([
      makeInstinct({ domain: "workflow", status: "active" }),
      makeInstinct({ domain: "testing", status: "active" }),
    ]);

    const output = runManager("list --domain workflow");
    expect(output).toContain("workflow");
  });

  it("shows empty message when no matches", () => {
    createStoreFile([]);
    const output = runManager("list");
    expect(output).toContain("No instincts found");
  });
});

describe("instinct-manager pending command", () => {
  it("shows tentative candidates for review", () => {
    createStoreFile([
      makeInstinct({ status: "tentative", trigger: "Pending trigger", action: "Pending action" }),
    ]);

    const output = runManager("pending");
    expect(output).toContain("Pending Review");
    expect(output).toContain("Pending trigger");
    expect(output).toContain("Pending action");
  });

  it("shows no pending message when empty", () => {
    createStoreFile([makeInstinct({ status: "active" })]);
    const output = runManager("pending");
    expect(output).toContain("No pending");
  });
});

describe("instinct-manager evolve-candidates command", () => {
  it("shows domains with 3+ instincts", () => {
    createStoreFile([
      makeInstinct({ domain: "workflow", status: "active", confidence: makeConfidence(0.7) }),
      makeInstinct({ domain: "workflow", status: "active", confidence: makeConfidence(0.6) }),
      makeInstinct({ domain: "workflow", status: "active", confidence: makeConfidence(0.8) }),
    ]);

    const output = runManager("evolve-candidates");
    expect(output).toContain("Evolution Candidates");
    expect(output).toContain("workflow");
  });

  it("shows insufficient instincts message", () => {
    createStoreFile([
      makeInstinct({ domain: "workflow", status: "active", confidence: makeConfidence(0.7) }),
    ]);

    const output = runManager("evolve-candidates");
    expect(output).toContain("Not enough");
  });
});

describe("instinct-manager dashboard-data command", () => {
  it("outputs valid JSON with expected structure", () => {
    createStoreFile([
      makeInstinct({ status: "active" }),
    ]);

    const output = runManager("dashboard-data");
    const data = JSON.parse(output);
    expect(data).toHaveProperty("stats");
    expect(data).toHaveProperty("sessions");
    expect(data).toHaveProperty("topInstincts");
    expect(data).toHaveProperty("evolution");
    expect(data.stats).toHaveProperty("totalInstincts");
  });
});

describe("instinct-manager search command", () => {
  it("finds instincts by keyword in trigger", () => {
    createStoreFile([
      makeInstinct({ trigger: "When editing TypeScript files", action: "Use strict mode" }),
      makeInstinct({ trigger: "When running tests", action: "Use vitest" }),
    ]);

    const output = runManager("search typescript");
    expect(output).toContain("TypeScript");
    expect(output).toContain("1 matches");
  });

  it("finds instincts by keyword in action", () => {
    createStoreFile([
      makeInstinct({ trigger: "When testing", action: "Always use vitest framework" }),
    ]);

    const output = runManager("search vitest");
    expect(output).toContain("vitest");
  });

  it("shows no results message for unmatched keyword", () => {
    createStoreFile([makeInstinct()]);
    const output = runManager("search nonexistent_keyword_xyz");
    expect(output).toContain("No instincts found");
  });

  it("shows usage when no keyword provided", () => {
    createStoreFile([]);
    const output = runManager("search");
    expect(output).toContain("Usage");
  });
});

describe("instinct-manager export command", () => {
  it("exports instincts to stdout when no file provided", () => {
    createStoreFile([
      makeInstinct({ trigger: "Export trigger" }),
    ]);

    const output = runManager("export");
    const data = JSON.parse(output);
    expect(data).toHaveProperty("instincts");
    expect(data).toHaveProperty("exported_at");
    expect(data.instincts).toHaveLength(1);
    expect(data.instincts[0].trigger).toBe("Export trigger");
  });

  it("exports instincts to a file", () => {
    createStoreFile([makeInstinct()]);
    const exportPath = join(TEST_ROOT, "export.json");
    runManager(`export ${exportPath}`);

    expect(existsSync(exportPath)).toBe(true);
    const data = JSON.parse(readFileSync(exportPath, "utf8"));
    expect(data.instincts).toHaveLength(1);
  });
});

describe("instinct-manager import command", () => {
  it("imports instincts from a file", () => {
    createStoreFile([]);

    const importFile = join(TEST_ROOT, "import.json");
    const importData = {
      instincts: [
        makeInstinct({ id: "inst_import_1", trigger: "Imported trigger" }),
      ],
    };
    writeFileSync(importFile, JSON.stringify(importData));

    const output = runManager(`import ${importFile}`);
    expect(output).toContain("Imported 1");
  });

  it("skips duplicates during import", () => {
    const inst = makeInstinct({ id: "inst_existing" });
    createStoreFile([inst]);

    const importFile = join(TEST_ROOT, "import.json");
    writeFileSync(importFile, JSON.stringify({ instincts: [inst] }));

    const output = runManager(`import ${importFile}`);
    expect(output).toContain("1 skipped");
  });

  it("shows usage when no file provided", () => {
    createStoreFile([]);
    const output = runManager("import");
    expect(output).toContain("Usage");
  });
});
