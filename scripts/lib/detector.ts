// =============================================================================
// AgentMind - Pattern Detector
// Detects behavioral patterns from observation data.
// =============================================================================

import type {
  Observation,
  ExecutionObservation,
  IntentObservation,
  EvaluationObservation,
  Instinct,
  InstinctSource,
  CompositeConfidence,
} from "./types.js";
import { DEFAULT_WEIGHTS } from "./types.js";

// --- Helpers ---

function createInitialConfidence(frequencyScore: number): CompositeConfidence {
  return {
    frequency: frequencyScore,
    effectiveness: 0.5, // neutral until verified
    human: 0.5, // neutral until reviewed
    composite:
      frequencyScore * DEFAULT_WEIGHTS.frequency +
      0.5 * DEFAULT_WEIGHTS.effectiveness +
      0.5 * DEFAULT_WEIGHTS.human,
  };
}

// --- Sequence Detector ---

export interface SequencePattern {
  sequence: string[];
  count: number;
  contexts: string[]; // session IDs where observed
}

/**
 * Detect repeated tool-use sequences (N-grams).
 * Returns sequences that occur at least `minCount` times.
 */
export function detectSequences(
  observations: Observation[],
  options: { minCount?: number; ngramSize?: number } = {},
): SequencePattern[] {
  const { minCount = 3, ngramSize = 3 } = options;

  const toolEvents = observations
    .filter(
      (o): o is ExecutionObservation =>
        o.layer === "execution" && o.data?.phase === "pre",
    )
    .map((o) => ({ tool: o.data.tool_name, session: o.session_id }));

  const ngrams = new Map<string, { count: number; sessions: Set<string> }>();

  for (let i = 0; i <= toolEvents.length - ngramSize; i++) {
    const seq = toolEvents.slice(i, i + ngramSize).map((e) => e.tool);
    const key = seq.join(" → ");
    const sessions = new Set(
      toolEvents.slice(i, i + ngramSize).map((e) => e.session),
    );

    if (!ngrams.has(key)) {
      ngrams.set(key, { count: 0, sessions: new Set() });
    }
    const entry = ngrams.get(key)!;
    entry.count++;
    sessions.forEach((s) => entry.sessions.add(s));
  }

  return Array.from(ngrams.entries())
    .filter(([, v]) => v.count >= minCount)
    .map(([key, v]) => ({
      sequence: key.split(" → "),
      count: v.count,
      contexts: Array.from(v.sessions),
    }))
    .sort((a, b) => b.count - a.count);
}

// --- Correction Detector ---

export interface CorrectionPattern {
  correction_type: string;
  count: number;
  sessions: string[];
}

/**
 * Detect user correction signals from intent observations.
 */
export function detectCorrections(
  observations: Observation[],
): CorrectionPattern[] {
  const corrections = observations.filter(
    (o): o is IntentObservation =>
      o.layer === "intent" && o.data?.has_correction === true,
  );

  const byType = new Map<string, { count: number; sessions: Set<string> }>();

  corrections.forEach((c) => {
    const type = c.data.correction_type;
    if (!byType.has(type)) {
      byType.set(type, { count: 0, sessions: new Set() });
    }
    const entry = byType.get(type)!;
    entry.count++;
    entry.sessions.add(c.session_id);
  });

  return Array.from(byType.entries())
    .map(([type, v]) => ({
      correction_type: type,
      count: v.count,
      sessions: Array.from(v.sessions),
    }))
    .sort((a, b) => b.count - a.count);
}

// --- Error Pattern Detector ---

export interface ErrorPattern {
  tool_name: string;
  error_type: string;
  count: number;
  sessions: string[];
}

/**
 * Detect recurring error patterns from evaluation observations.
 */
export function detectErrorPatterns(
  observations: Observation[],
): ErrorPattern[] {
  const errors = observations.filter(
    (o): o is EvaluationObservation =>
      o.layer === "evaluation" && o.event === "tool_failure",
  );

  const byKey = new Map<
    string,
    { tool: string; error: string; count: number; sessions: Set<string> }
  >();

  errors.forEach((e) => {
    const key = `${e.data.tool_name}:${e.data.error_type}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        tool: e.data.tool_name as string,
        error: e.data.error_type as string,
        count: 0,
        sessions: new Set(),
      });
    }
    const entry = byKey.get(key)!;
    entry.count++;
    entry.sessions.add(e.session_id);
  });

  return Array.from(byKey.values())
    .filter((v) => v.count >= 2)
    .sort((a, b) => b.count - a.count)
    .map((v) => ({
      tool_name: v.tool,
      error_type: v.error,
      count: v.count,
      sessions: Array.from(v.sessions),
    }));
}

// --- Instinct Candidate Generator ---

/**
 * Generate instinct candidates from detected patterns.
 */
export function generateCandidates(
  sequences: SequencePattern[],
  corrections: CorrectionPattern[],
  errors: ErrorPattern[],
): Omit<Instinct, "id" | "created_at" | "last_seen">[] {
  const candidates: Omit<Instinct, "id" | "created_at" | "last_seen">[] = [];

  // From sequences
  sequences.forEach((seq) => {
    candidates.push({
      trigger: `When performing a ${seq.sequence[0].toLowerCase()} operation`,
      action: `Follow the workflow: ${seq.sequence.join(" → ")}`,
      domain: "workflow",
      status: "tentative",
      confidence: createInitialConfidence(Math.min(seq.count / 10, 0.6)),
      evidence_count: seq.count,
      source: "sequence_detection" as InstinctSource,
      application_count: 0,
      success_rate: 0,
    });
  });

  // From corrections
  corrections.forEach((corr) => {
    candidates.push({
      trigger: `When user provides ${corr.correction_type.replace(/_/g, " ")} feedback`,
      action: `Adjust approach — user has corrected this ${corr.count} time(s) across ${corr.sessions.length} session(s)`,
      domain: "preference",
      status: "tentative",
      confidence: createInitialConfidence(Math.min(corr.count / 6, 0.5)),
      evidence_count: corr.count,
      source: "correction_detection" as InstinctSource,
      application_count: 0,
      success_rate: 0,
    });
  });

  // From error patterns
  errors.forEach((err) => {
    candidates.push({
      trigger: `When using ${err.tool_name}`,
      action: `Be cautious of ${err.error_type} errors (occurred ${err.count} times)`,
      domain: "error-handling",
      status: "tentative",
      confidence: createInitialConfidence(Math.min(err.count / 8, 0.4)),
      evidence_count: err.count,
      source: "error_resolution" as InstinctSource,
      application_count: 0,
      success_rate: 0,
    });
  });

  return candidates;
}
