import { describe, it, expect } from "vitest";
import {
  detectSequences,
  detectCorrections,
  detectErrorPatterns,
  generateCandidates,
} from "../detector.js";
import type {
  Observation,
  ExecutionObservation,
  IntentObservation,
  EvaluationObservation,
} from "../types.js";

// --- Helpers ---

function makeExecObs(
  tool: string,
  session = "s1",
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
  session = "s1",
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
  session = "s1",
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

// --- Tests ---

describe("detectSequences", () => {
  it("returns empty for no observations", () => {
    expect(detectSequences([])).toEqual([]);
  });

  it("returns empty when below minCount", () => {
    const obs: Observation[] = [
      makeExecObs("Grep"),
      makeExecObs("Read"),
      makeExecObs("Edit"),
    ];
    expect(detectSequences(obs, { minCount: 3 })).toEqual([]);
  });

  it("detects repeated trigram sequences", () => {
    const obs: Observation[] = [];
    // Repeat Grep → Read → Edit 4 times
    for (let i = 0; i < 4; i++) {
      obs.push(makeExecObs("Grep"));
      obs.push(makeExecObs("Read"));
      obs.push(makeExecObs("Edit"));
    }

    const result = detectSequences(obs, { minCount: 3, ngramSize: 3 });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].sequence).toEqual(["Grep", "Read", "Edit"]);
    expect(result[0].count).toBeGreaterThanOrEqual(3);
  });

  it("respects custom ngramSize", () => {
    const obs: Observation[] = [];
    for (let i = 0; i < 5; i++) {
      obs.push(makeExecObs("Read"));
      obs.push(makeExecObs("Edit"));
    }

    const bigrams = detectSequences(obs, { minCount: 3, ngramSize: 2 });
    expect(bigrams.length).toBeGreaterThan(0);
    expect(bigrams[0].sequence).toHaveLength(2);
  });

  it("tracks session context", () => {
    const obs: Observation[] = [];
    for (let i = 0; i < 3; i++) {
      obs.push(makeExecObs("Grep", `session_${i}`));
      obs.push(makeExecObs("Read", `session_${i}`));
      obs.push(makeExecObs("Edit", `session_${i}`));
    }

    const result = detectSequences(obs, { minCount: 3, ngramSize: 3 });
    if (result.length > 0) {
      expect(result[0].contexts.length).toBeGreaterThan(0);
    }
  });

  it("ignores non-execution observations", () => {
    const obs: Observation[] = [
      makeIntentObs(false),
      makeExecObs("Grep"),
      makeIntentObs(false),
      makeExecObs("Read"),
    ];
    // Only 2 tool events, not enough for trigram
    expect(detectSequences(obs, { minCount: 1, ngramSize: 3 })).toEqual([]);
  });
});

describe("detectCorrections", () => {
  it("returns empty for no corrections", () => {
    const obs: Observation[] = [
      makeIntentObs(false),
      makeIntentObs(false),
    ];
    expect(detectCorrections(obs)).toEqual([]);
  });

  it("groups corrections by type", () => {
    const obs: Observation[] = [
      makeIntentObs(true, "explicit_rejection"),
      makeIntentObs(true, "explicit_rejection"),
      makeIntentObs(true, "redirection"),
    ];

    const result = detectCorrections(obs);
    expect(result).toHaveLength(2);

    const rejection = result.find((c) => c.correction_type === "explicit_rejection");
    expect(rejection).toBeDefined();
    expect(rejection!.count).toBe(2);

    const redirect = result.find((c) => c.correction_type === "redirection");
    expect(redirect).toBeDefined();
    expect(redirect!.count).toBe(1);
  });

  it("tracks sessions per correction type", () => {
    const obs: Observation[] = [
      makeIntentObs(true, "redirection", "s1"),
      makeIntentObs(true, "redirection", "s2"),
    ];

    const result = detectCorrections(obs);
    expect(result[0].sessions).toContain("s1");
    expect(result[0].sessions).toContain("s2");
  });
});

describe("detectErrorPatterns", () => {
  it("returns empty for no errors", () => {
    expect(detectErrorPatterns([])).toEqual([]);
  });

  it("groups by tool + error type", () => {
    const obs: Observation[] = [
      makeEvalObs("Bash", "command_failure"),
      makeEvalObs("Bash", "command_failure"),
      makeEvalObs("Read", "file_not_found"),
      makeEvalObs("Read", "file_not_found"),
    ];

    const result = detectErrorPatterns(obs);
    expect(result).toHaveLength(2);
    expect(result[0].count).toBe(2);
  });

  it("filters out patterns with count < 2", () => {
    const obs: Observation[] = [
      makeEvalObs("Bash", "timeout"),
      // Only 1 occurrence — should be excluded
    ];

    const result = detectErrorPatterns(obs);
    expect(result).toHaveLength(0);
  });

  it("sorts by count descending", () => {
    const obs: Observation[] = [
      makeEvalObs("Read", "file_not_found"),
      makeEvalObs("Read", "file_not_found"),
      makeEvalObs("Read", "file_not_found"),
      makeEvalObs("Bash", "timeout"),
      makeEvalObs("Bash", "timeout"),
    ];

    const result = detectErrorPatterns(obs);
    expect(result[0].tool_name).toBe("Read");
    expect(result[0].count).toBe(3);
  });
});

describe("generateCandidates", () => {
  it("returns empty for empty inputs", () => {
    expect(generateCandidates([], [], [])).toEqual([]);
  });

  it("generates candidates from sequences", () => {
    const sequences = [
      { sequence: ["Grep", "Read", "Edit"], count: 5, contexts: ["s1"] },
    ];

    const result = generateCandidates(sequences, [], []);
    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe("workflow");
    expect(result[0].source).toBe("sequence_detection");
    expect(result[0].action).toContain("Grep → Read → Edit");
  });

  it("generates candidates from error patterns", () => {
    const errors = [
      { tool_name: "Bash", error_type: "command_failure", count: 4, sessions: ["s1"] },
    ];

    const result = generateCandidates([], [], errors);
    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe("error-handling");
    expect(result[0].source).toBe("error_resolution");
    expect(result[0].action).toContain("command_failure");
  });

  it("sets tentative status for all candidates", () => {
    const sequences = [
      { sequence: ["A", "B", "C"], count: 3, contexts: ["s1"] },
    ];
    const result = generateCandidates(sequences, [], []);
    expect(result[0].status).toBe("tentative");
  });

  it("caps initial confidence appropriately", () => {
    const sequences = [
      { sequence: ["A", "B", "C"], count: 100, contexts: ["s1"] },
    ];
    const result = generateCandidates(sequences, [], []);
    // frequency capped at 0.6 for sequences
    expect(result[0].confidence.frequency).toBeLessThanOrEqual(0.6);
  });

  it("generates candidates from corrections", () => {
    const corrections = [
      { correction_type: "explicit_rejection", count: 3, sessions: ["s1", "s2"] },
      { correction_type: "redirection", count: 2, sessions: ["s1"] },
    ];

    const result = generateCandidates([], corrections, []);
    expect(result).toHaveLength(2);
    expect(result[0].domain).toBe("preference");
    expect(result[0].source).toBe("correction_detection");
    expect(result[0].action).toContain("3 time(s)");
    expect(result[0].action).toContain("2 session(s)");
  });

  it("generates candidates from all three sources combined", () => {
    const sequences = [
      { sequence: ["Grep", "Read", "Edit"], count: 5, contexts: ["s1"] },
    ];
    const corrections = [
      { correction_type: "redirection", count: 4, sessions: ["s1"] },
    ];
    const errors = [
      { tool_name: "Bash", error_type: "timeout", count: 3, sessions: ["s1"] },
    ];

    const result = generateCandidates(sequences, corrections, errors);
    expect(result).toHaveLength(3);

    const domains = result.map((r) => r.domain);
    expect(domains).toContain("workflow");
    expect(domains).toContain("preference");
    expect(domains).toContain("error-handling");
  });

  it("sets correction candidates as tentative", () => {
    const corrections = [
      { correction_type: "retry_request", count: 2, sessions: ["s1"] },
    ];

    const result = generateCandidates([], corrections, []);
    expect(result[0].status).toBe("tentative");
  });

  it("caps correction confidence appropriately", () => {
    const corrections = [
      { correction_type: "explicit_rejection", count: 100, sessions: ["s1"] },
    ];

    const result = generateCandidates([], corrections, []);
    // frequency capped at 0.5 for corrections
    expect(result[0].confidence.frequency).toBeLessThanOrEqual(0.5);
  });
});
