// =============================================================================
// AgentMind — Public API
//
// Usage:
//   import { LocalStorage, calculateComposite, detectSequences } from "agentmind/core";
// =============================================================================

// Storage
export { LocalStorage } from "./storage.js";

// Confidence
export {
  calculateComposite,
  updateComposite,
  getTier,
  getTierDescription,
  calculateFrequencyScore,
  calculateEffectivenessScore,
  updateHumanScore,
  applyDecay,
  formatConfidence,
} from "./confidence.js";

// Detection
export {
  detectSequences,
  detectCorrections,
  detectErrorPatterns,
  generateCandidates,
} from "./detector.js";

// Types
export type {
  Observation,
  IntentObservation,
  ExecutionObservation,
  EvaluationObservation,
  Instinct,
  InstinctStatus,
  InstinctSource,
  CompositeConfidence,
  ConfidenceTier,
  Pattern,
  Strategy,
  ExpertSystem,
  ClusterType,
  EvolutionLevel,
  InstinctsStore,
  StoreMetadata,
  SessionSummary,
} from "./types.js";

export { DEFAULT_WEIGHTS } from "./types.js";
