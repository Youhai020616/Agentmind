// =============================================================================
// AgentMind - Core Type Definitions
// =============================================================================

// --- Observation Types ---

export type ObservationLayer = 'intent' | 'decision' | 'execution' | 'evaluation';

export interface Observation {
  layer: ObservationLayer;
  session_id: string;
  timestamp: string;
  event: string;
  data: Record<string, unknown>;
}

export interface IntentObservation extends Observation {
  layer: 'intent';
  data: {
    prompt_type: 'general' | 'debugging' | 'creation' | 'improvement' | 'understanding' | 'testing';
    prompt_length: number;
    has_correction: boolean;
    correction_type: 'none' | 'explicit_rejection' | 'redirection' | 'retry_request';
  };
}

export interface ExecutionObservation extends Observation {
  layer: 'execution';
  data: {
    tool_name: string;
    tool_use_id: string;
    phase: 'pre' | 'post';
    abstract: Record<string, unknown>;
    success: boolean | null;
  };
}

export interface EvaluationObservation extends Observation {
  layer: 'evaluation';
  data: {
    tool_name: string;
    error_type: string;
    error_length: number;
  };
}

// --- Confidence System ---

export interface CompositeConfidence {
  frequency: number;      // 0-1: How often this pattern occurs
  effectiveness: number;  // 0-1: How well it works when applied
  human: number;          // 0-1: Human approval score
  composite: number;      // Weighted combination
}

export const DEFAULT_WEIGHTS = {
  frequency: 0.35,
  effectiveness: 0.40,
  human: 0.25,
} as const;

export type ConfidenceTier =
  | 'core'       // >= 0.8: Auto-apply
  | 'strong'     // 0.6-0.8: Suggest strongly
  | 'moderate'   // 0.4-0.6: Mention when relevant
  | 'tentative'  // 0.2-0.4: Only if asked
  | 'deprecated'; // < 0.2: Scheduled for removal

// --- Instinct System ---

export type InstinctStatus = 'active' | 'tentative' | 'deprecated';
export type InstinctSource =
  | 'sequence_detection'
  | 'correction_detection'
  | 'error_resolution'
  | 'preference_detection'
  | 'human_created'
  | 'evolved'
  | 'imported';

export interface Instinct {
  id: string;
  trigger: string;           // When to apply this instinct
  action: string;            // What to do
  domain: string;            // Category (code-style, workflow, tool-usage, etc.)
  status: InstinctStatus;
  confidence: CompositeConfidence;
  evidence_count: number;
  source: InstinctSource;
  created_at: string;
  last_seen: string;
  last_applied?: string;
  last_verified?: string;
  application_count: number;
  success_rate: number;
  tags?: string[];
  evolution_parent?: string; // ID of parent if evolved
}

// --- Evolution System ---

export type EvolutionLevel = 0 | 1 | 2 | 3;
export type ClusterType = 'sequential' | 'parallel' | 'conditional';

export interface Pattern {
  id: string;
  name: string;
  type: ClusterType;
  level: 1;
  instinct_ids: string[];
  cohesion: number;         // 0-1: How tightly related
  domain: string;
  confidence: CompositeConfidence;
  created_at: string;
}

export interface Strategy {
  id: string;
  name: string;
  principle: string;        // Abstract principle (one sentence)
  level: 2;
  source_pattern_id: string;
  transferable_contexts: string[];
  domain: string;
  confidence: CompositeConfidence;
  created_at: string;
}

export interface ExpertSystem {
  id: string;
  name: string;
  level: 3;
  domain: string;
  strategy_ids: string[];
  pattern_ids: string[];
  instinct_ids: string[];
  total_confidence: number;
  system_prompt: string;
  created_at: string;
}

export type EvolvedEntity = Pattern | Strategy | ExpertSystem;

// --- Storage Types ---

export interface InstinctsStore {
  instincts: Instinct[];
  patterns: Pattern[];
  strategies: Strategy[];
  experts: ExpertSystem[];
  metadata: StoreMetadata;
}

export interface StoreMetadata {
  version: string;
  last_analysis: string;
  total_sessions_analyzed: number;
  total_observations: number;
  created_at: string;
}

// --- Session Types ---

export interface SessionSummary {
  session_id: string;
  timestamp: string;
  observation_count: number;
  patterns_detected: number;
  corrections: number;
  errors: number;
  is_final: boolean;
}

// --- Hook Input Types ---

export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
}

export interface UserPromptHookInput extends HookInput {
  hook_event_name: 'UserPromptSubmit';
  prompt: string;
}

export interface ToolUseHookInput extends HookInput {
  hook_event_name: 'PreToolUse' | 'PostToolUse';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  tool_response?: Record<string, unknown>;
}

export interface StopHookInput extends HookInput {
  hook_event_name: 'Stop';
  stop_hook_active: boolean;
}

export interface SessionStartHookInput extends HookInput {
  hook_event_name: 'SessionStart';
  source: 'startup' | 'resume' | 'clear' | 'compact';
  model: string;
}
