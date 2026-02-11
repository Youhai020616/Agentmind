import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LocalStorage } from "../storage.js";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import type { Instinct, CompositeConfidence, Observation } from "../types.js";

// --- Test Setup ---

const TEST_ROOT = join(import.meta.dirname, ".test-data-" + process.pid);

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

let storage: LocalStorage;

beforeEach(() => {
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true });
  }
  mkdirSync(TEST_ROOT, { recursive: true });
  storage = new LocalStorage(TEST_ROOT);
});

afterEach(() => {
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true });
  }
});

// --- Tests ---

describe("LocalStorage constructor", () => {
  it("creates data and observations directories", () => {
    expect(existsSync(join(TEST_ROOT, "data"))).toBe(true);
    expect(existsSync(join(TEST_ROOT, "data", "observations"))).toBe(true);
  });
});

describe("loadStore / saveStore", () => {
  it("returns empty store when no file exists", () => {
    const store = storage.loadStore();
    expect(store.instincts).toEqual([]);
    expect(store.patterns).toEqual([]);
    expect(store.strategies).toEqual([]);
    expect(store.experts).toEqual([]);
    expect(store.metadata.version).toBe("0.1.0");
  });

  it("persists and loads store data", () => {
    const store = storage.loadStore();
    const inst = makeInstinct();
    store.instincts.push(inst);
    storage.saveStore(store);

    const loaded = storage.loadStore();
    expect(loaded.instincts).toHaveLength(1);
    expect(loaded.instincts[0].id).toBe(inst.id);
  });
});

describe("Instinct CRUD", () => {
  it("upserts a new instinct", () => {
    const inst = makeInstinct();
    storage.upsertInstinct(inst);

    const found = storage.getInstinctById(inst.id);
    expect(found).toBeDefined();
    expect(found!.trigger).toBe(inst.trigger);
  });

  it("updates an existing instinct", () => {
    const inst = makeInstinct();
    storage.upsertInstinct(inst);

    inst.action = "Run vitest --watch";
    storage.upsertInstinct(inst);

    const found = storage.getInstinctById(inst.id);
    expect(found!.action).toBe("Run vitest --watch");

    // Should not duplicate
    expect(storage.getInstincts().length).toBe(1);
  });

  it("deletes an instinct", () => {
    const inst = makeInstinct();
    storage.upsertInstinct(inst);
    expect(storage.deleteInstinct(inst.id)).toBe(true);
    expect(storage.getInstinctById(inst.id)).toBeUndefined();
  });

  it("returns false when deleting non-existent instinct", () => {
    expect(storage.deleteInstinct("nonexistent")).toBe(false);
  });

  it("filters instincts by status", () => {
    storage.upsertInstinct(makeInstinct({ status: "active" }));
    storage.upsertInstinct(makeInstinct({ status: "tentative" }));
    storage.upsertInstinct(makeInstinct({ status: "deprecated" }));

    const active = storage.getInstincts({ status: "active" });
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe("active");
  });

  it("filters instincts by domain", () => {
    storage.upsertInstinct(makeInstinct({ domain: "workflow" }));
    storage.upsertInstinct(makeInstinct({ domain: "testing" }));

    const testing = storage.getInstincts({ domain: "testing" });
    expect(testing).toHaveLength(1);
  });

  it("filters instincts by minConfidence", () => {
    storage.upsertInstinct(makeInstinct({ confidence: makeConfidence(0.9) }));
    storage.upsertInstinct(makeInstinct({ confidence: makeConfidence(0.3) }));

    const high = storage.getInstincts({ minConfidence: 0.5 });
    expect(high).toHaveLength(1);
    expect(high[0].confidence.composite).toBe(0.9);
  });

  it("sorts instincts by composite confidence descending", () => {
    storage.upsertInstinct(makeInstinct({ confidence: makeConfidence(0.3) }));
    storage.upsertInstinct(makeInstinct({ confidence: makeConfidence(0.9) }));
    storage.upsertInstinct(makeInstinct({ confidence: makeConfidence(0.6) }));

    const all = storage.getInstincts();
    expect(all[0].confidence.composite).toBe(0.9);
    expect(all[1].confidence.composite).toBe(0.6);
    expect(all[2].confidence.composite).toBe(0.3);
  });
});

describe("Observations", () => {
  it("appends and reads observations", () => {
    const obs: Observation = {
      layer: "intent",
      session_id: "test-session",
      timestamp: new Date().toISOString(),
      event: "user_prompt",
      data: { prompt_type: "general", prompt_length: 10, has_correction: false, correction_type: "none" },
    };

    storage.appendObservation(obs);
    storage.appendObservation(obs);

    const today = new Date().toISOString().split("T")[0];
    const loaded = storage.getObservations(today);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].session_id).toBe("test-session");
  });

  it("returns empty for date with no observations", () => {
    expect(storage.getObservations("2020-01-01")).toEqual([]);
  });
});

describe("Sessions", () => {
  it("appends and reads session summaries", () => {
    storage.appendSession({
      session_id: "s1",
      timestamp: new Date().toISOString(),
      observation_count: 10,
      patterns_detected: 2,
      corrections: 1,
      errors: 0,
      is_final: true,
    });

    const sessions = storage.getSessions(10);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].session_id).toBe("s1");
  });

  it("limits results and returns in reverse order", () => {
    for (let i = 0; i < 5; i++) {
      storage.appendSession({
        session_id: `s${i}`,
        timestamp: new Date().toISOString(),
        observation_count: i,
        patterns_detected: 0,
        corrections: 0,
        errors: 0,
        is_final: true,
      });
    }

    const sessions = storage.getSessions(3);
    expect(sessions).toHaveLength(3);
    // Reversed: last appended first
    expect(sessions[0].session_id).toBe("s4");
  });
});

describe("Evolution storage", () => {
  it("saves and retrieves patterns", () => {
    storage.savePattern({
      id: "pat_1",
      name: "Grep-Read-Edit workflow",
      type: "sequential",
      level: 1,
      instinct_ids: ["inst_a", "inst_b"],
      cohesion: 0.85,
      domain: "workflow",
      confidence: makeConfidence(0.7),
      created_at: new Date().toISOString(),
    });

    const patterns = storage.getPatterns();
    expect(patterns).toHaveLength(1);
    expect(patterns[0].name).toBe("Grep-Read-Edit workflow");
  });

  it("saves and retrieves strategies", () => {
    storage.saveStrategy({
      id: "strat_1",
      name: "Read before edit",
      principle: "Always read a file before modifying it",
      level: 2,
      source_pattern_id: "pat_1",
      transferable_contexts: ["code-editing", "config-modification"],
      domain: "workflow",
      confidence: makeConfidence(0.8),
      created_at: new Date().toISOString(),
    });

    const strategies = storage.getStrategies();
    expect(strategies).toHaveLength(1);
    expect(strategies[0].principle).toContain("read a file");
  });
});

describe("getStats", () => {
  it("returns correct counts", () => {
    storage.upsertInstinct(makeInstinct({ status: "active", domain: "workflow" }));
    storage.upsertInstinct(makeInstinct({ status: "active", domain: "workflow" }));
    storage.upsertInstinct(makeInstinct({ status: "tentative", domain: "testing" }));
    storage.upsertInstinct(makeInstinct({ status: "deprecated", domain: "testing" }));

    const stats = storage.getStats();
    expect(stats.totalInstincts).toBe(4);
    expect(stats.activeInstincts).toBe(2);
    expect(stats.tentativeInstincts).toBe(1);
    expect(stats.deprecatedInstincts).toBe(1);
    expect(stats.domains["workflow"]).toBe(2);
    expect(stats.domains["testing"]).toBe(2);
  });

  it("calculates average confidence of active instincts", () => {
    storage.upsertInstinct(makeInstinct({ status: "active", confidence: makeConfidence(0.8) }));
    storage.upsertInstinct(makeInstinct({ status: "active", confidence: makeConfidence(0.6) }));
    storage.upsertInstinct(makeInstinct({ status: "tentative", confidence: makeConfidence(0.1) }));

    const stats = storage.getStats();
    expect(stats.avgConfidence).toBe(0.7);
  });

  it("returns 0 avg confidence when no active instincts", () => {
    const stats = storage.getStats();
    expect(stats.avgConfidence).toBe(0);
  });
});
