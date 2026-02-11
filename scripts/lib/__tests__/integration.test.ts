import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { LocalStorage } from "../storage.js";
import {
  detectSequences,
  detectCorrections,
  detectErrorPatterns,
  generateCandidates,
} from "../detector.js";
import { calculateComposite, getTier } from "../confidence.js";
import type {
  Observation,
  ExecutionObservation,
  IntentObservation,
  EvaluationObservation,
  Instinct,
} from "../types.js";

// --- Test Setup ---

const TEST_ROOT = join(import.meta.dirname, ".test-integration-" + process.pid);

let storage: LocalStorage;

function makeExecObs(
  tool: string,
  session = "integration-session",
): ExecutionObservation {
  return {
    layer: "execution",
    session_id: session,
    timestamp: new Date().toISOString(),
    event: "tool_pre",
    data: {
      tool_name: tool,
      tool_use_id: "tu_" + Math.random().toString(36).slice(2, 6),
      phase: "pre",
      abstract: {},
      success: null,
    },
  };
}

function makeIntentObs(
  hasCorrection: boolean,
  correctionType: "none" | "explicit_rejection" | "redirection" | "retry_request" = "none",
  session = "integration-session",
): IntentObservation {
  return {
    layer: "intent",
    session_id: session,
    timestamp: new Date().toISOString(),
    event: "user_prompt",
    data: {
      prompt_type: "general",
      prompt_length: 50,
      has_correction: hasCorrection,
      correction_type: correctionType,
    },
  };
}

function makeEvalObs(
  tool: string,
  errorType: string,
  session = "integration-session",
): EvaluationObservation {
  return {
    layer: "evaluation",
    session_id: session,
    timestamp: new Date().toISOString(),
    event: "tool_failure",
    data: {
      tool_name: tool,
      error_type: errorType,
      error_length: 100,
    },
  };
}

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

// --- Integration Tests ---

describe("End-to-end: Observe → Detect → Generate → Store → Retrieve", () => {
  it("complete data flow from observations to stored instincts", () => {
    // Step 1: Write observations (simulating hook scripts)
    const observations: Observation[] = [];

    // Simulate a coding session: repeated Grep → Read → Edit pattern
    for (let i = 0; i < 5; i++) {
      const obs = [
        makeExecObs("Grep"),
        makeExecObs("Read"),
        makeExecObs("Edit"),
      ];
      obs.forEach((o) => {
        storage.appendObservation(o);
        observations.push(o);
      });
    }

    // Add some corrections
    const correction1 = makeIntentObs(true, "explicit_rejection");
    const correction2 = makeIntentObs(true, "redirection");
    storage.appendObservation(correction1);
    storage.appendObservation(correction2);
    observations.push(correction1, correction2);

    // Add some errors
    const err1 = makeEvalObs("Bash", "command_failure");
    const err2 = makeEvalObs("Bash", "command_failure");
    storage.appendObservation(err1);
    storage.appendObservation(err2);
    observations.push(err1, err2);

    // Step 2: Run detection
    const sequences = detectSequences(observations, { minCount: 3 });
    const corrections = detectCorrections(observations);
    const errors = detectErrorPatterns(observations);

    expect(sequences.length).toBeGreaterThan(0);
    expect(sequences[0].sequence).toEqual(["Grep", "Read", "Edit"]);
    expect(corrections).toHaveLength(2); // explicit_rejection, redirection
    expect(errors).toHaveLength(1); // Bash:command_failure (count=2)

    // Step 3: Generate candidates
    const candidates = generateCandidates(sequences, corrections, errors);
    expect(candidates.length).toBeGreaterThan(0);

    const domains = candidates.map((c) => c.domain);
    expect(domains).toContain("workflow");
    expect(domains).toContain("preference");
    expect(domains).toContain("error-handling");

    // Step 4: Store as instincts
    candidates.forEach((candidate) => {
      const instinct: Instinct = {
        ...candidate,
        id: "inst_" + Math.random().toString(36).slice(2, 8),
        created_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      };
      storage.upsertInstinct(instinct);
    });

    // Step 5: Verify retrieval
    const allInstincts = storage.getInstincts();
    expect(allInstincts.length).toBe(candidates.length);

    // Workflow instincts should be present
    const workflows = storage.getInstincts({ domain: "workflow" });
    expect(workflows.length).toBeGreaterThan(0);
    expect(workflows[0].action).toContain("Grep");

    // Preference instincts should be present
    const preferences = storage.getInstincts({ domain: "preference" });
    expect(preferences.length).toBeGreaterThan(0);

    // Error-handling instincts should be present
    const errorHandling = storage.getInstincts({ domain: "error-handling" });
    expect(errorHandling.length).toBeGreaterThan(0);

    // Step 6: Verify stored observations are readable
    const today = new Date().toISOString().split("T")[0];
    const storedObs = storage.getObservations(today);
    expect(storedObs.length).toBe(observations.length);
  });

  it("confidence scoring integrates correctly with stored instincts", () => {
    // Create instinct with known confidence dimensions
    const instinct: Instinct = {
      id: "inst_conf_test",
      trigger: "When writing TypeScript",
      action: "Use strict mode",
      domain: "code-style",
      status: "active",
      confidence: {
        frequency: 0.8,
        effectiveness: 0.9,
        human: 0.7,
        composite: 0, // Will be calculated
      },
      evidence_count: 15,
      source: "sequence_detection",
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      application_count: 10,
      success_rate: 0.9,
    };

    // Calculate composite
    instinct.confidence.composite = calculateComposite(instinct.confidence);
    expect(instinct.confidence.composite).toBeGreaterThan(0.7);

    // Verify tier
    const tier = getTier(instinct.confidence.composite);
    expect(tier).toBe("core"); // Should be >=0.8

    // Store and retrieve
    storage.upsertInstinct(instinct);
    const retrieved = storage.getInstinctById("inst_conf_test");
    expect(retrieved).toBeDefined();
    expect(retrieved!.confidence.composite).toBe(instinct.confidence.composite);
  });

  it("multi-session observations accumulate correctly", () => {
    // Session 1 observations
    for (let i = 0; i < 4; i++) {
      storage.appendObservation(makeExecObs("Read", "session_1"));
      storage.appendObservation(makeExecObs("Edit", "session_1"));
    }

    // Session 2 observations
    for (let i = 0; i < 4; i++) {
      storage.appendObservation(makeExecObs("Read", "session_2"));
      storage.appendObservation(makeExecObs("Edit", "session_2"));
    }

    // Both sessions contribute to detection
    const today = new Date().toISOString().split("T")[0];
    const allObs = storage.getObservations(today);
    expect(allObs.length).toBe(16);

    const sequences = detectSequences(allObs, { minCount: 3, ngramSize: 2 });
    expect(sequences.length).toBeGreaterThan(0);

    // Should track both sessions
    const readEditSeq = sequences.find(
      (s) => s.sequence[0] === "Read" && s.sequence[1] === "Edit",
    );
    expect(readEditSeq).toBeDefined();
    expect(readEditSeq!.contexts).toContain("session_1");
    expect(readEditSeq!.contexts).toContain("session_2");
  });

  it("session summaries track analysis history", () => {
    storage.appendSession({
      session_id: "s1",
      timestamp: new Date().toISOString(),
      observation_count: 20,
      patterns_detected: 3,
      corrections: 1,
      errors: 2,
      is_final: true,
    });

    storage.appendSession({
      session_id: "s2",
      timestamp: new Date().toISOString(),
      observation_count: 15,
      patterns_detected: 2,
      corrections: 0,
      errors: 1,
      is_final: true,
    });

    const sessions = storage.getSessions(10);
    expect(sessions).toHaveLength(2);
    // Most recent first
    expect(sessions[0].session_id).toBe("s2");
    expect(sessions[1].session_id).toBe("s1");
  });

  it("evolution storage integrates with instincts", () => {
    // Create base instincts
    const inst1: Instinct = {
      id: "inst_evo_1",
      trigger: "When searching",
      action: "Use Grep",
      domain: "workflow",
      status: "active",
      confidence: { frequency: 0.8, effectiveness: 0.7, human: 0.6, composite: 0.71 },
      evidence_count: 10,
      source: "sequence_detection",
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      application_count: 5,
      success_rate: 0.8,
    };

    const inst2: Instinct = {
      id: "inst_evo_2",
      trigger: "When reading results",
      action: "Use Read tool",
      domain: "workflow",
      status: "active",
      confidence: { frequency: 0.7, effectiveness: 0.8, human: 0.6, composite: 0.72 },
      evidence_count: 8,
      source: "sequence_detection",
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      application_count: 4,
      success_rate: 0.9,
    };

    storage.upsertInstinct(inst1);
    storage.upsertInstinct(inst2);

    // Create a pattern from these instincts
    storage.savePattern({
      id: "pat_search",
      name: "Search-Read workflow",
      type: "sequential",
      level: 1,
      instinct_ids: ["inst_evo_1", "inst_evo_2"],
      cohesion: 0.85,
      domain: "workflow",
      confidence: { frequency: 0.75, effectiveness: 0.75, human: 0.6, composite: 0.71 },
      created_at: new Date().toISOString(),
    });

    // Create a strategy from the pattern
    storage.saveStrategy({
      id: "strat_research",
      name: "Research before modify",
      principle: "Always understand code before changing it",
      level: 2,
      source_pattern_id: "pat_search",
      transferable_contexts: ["code-editing", "debugging"],
      domain: "workflow",
      confidence: { frequency: 0.7, effectiveness: 0.8, human: 0.7, composite: 0.74 },
      created_at: new Date().toISOString(),
    });

    // Verify the full evolution tree is stored
    const store = storage.loadStore();
    expect(store.instincts).toHaveLength(2);
    expect(store.patterns).toHaveLength(1);
    expect(store.strategies).toHaveLength(1);
    expect(store.patterns[0].instinct_ids).toContain("inst_evo_1");
    expect(store.strategies[0].source_pattern_id).toBe("pat_search");
  });
});

describe("Stats integration", () => {
  it("accurately reflects the stored data", () => {
    // Add various instincts
    storage.upsertInstinct({
      id: "inst_stat_1",
      trigger: "t1", action: "a1", domain: "workflow", status: "active",
      confidence: { frequency: 0.8, effectiveness: 0.9, human: 0.7, composite: 0.82 },
      evidence_count: 10, source: "sequence_detection",
      created_at: new Date().toISOString(), last_seen: new Date().toISOString(),
      application_count: 5, success_rate: 0.9,
    });

    storage.upsertInstinct({
      id: "inst_stat_2",
      trigger: "t2", action: "a2", domain: "error-handling", status: "tentative",
      confidence: { frequency: 0.3, effectiveness: 0.5, human: 0.5, composite: 0.41 },
      evidence_count: 3, source: "error_resolution",
      created_at: new Date().toISOString(), last_seen: new Date().toISOString(),
      application_count: 1, success_rate: 0.5,
    });

    const stats = storage.getStats();
    expect(stats.totalInstincts).toBe(2);
    expect(stats.activeInstincts).toBe(1);
    expect(stats.tentativeInstincts).toBe(1);
    expect(stats.domains["workflow"]).toBe(1);
    expect(stats.domains["error-handling"]).toBe(1);
    expect(stats.avgConfidence).toBeCloseTo(0.82, 1);
  });
});
