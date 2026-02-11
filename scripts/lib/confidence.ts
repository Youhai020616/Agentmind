// =============================================================================
// AgentMind - Confidence Calculator
// Implements the three-dimensional composite confidence scoring system.
// =============================================================================

import type { CompositeConfidence, ConfidenceTier } from './types.js';
import { DEFAULT_WEIGHTS } from './types.js';

// --- Composite Score Calculation ---

/**
 * Calculate the composite confidence score from three dimensions.
 */
export function calculateComposite(
  confidence: Omit<CompositeConfidence, 'composite'>,
  weights = DEFAULT_WEIGHTS
): number {
  const raw =
    confidence.frequency * weights.frequency +
    confidence.effectiveness * weights.effectiveness +
    confidence.human * weights.human;

  // Apply degradation penalty if any dimension is very low
  const minDim = Math.min(confidence.frequency, confidence.effectiveness, confidence.human);
  const penalty = minDim < 0.2 ? 0.9 : 1.0;

  return Math.round(raw * penalty * 100) / 100;
}

/**
 * Update composite score in a confidence object.
 */
export function updateComposite(confidence: CompositeConfidence): CompositeConfidence {
  return {
    ...confidence,
    composite: calculateComposite(confidence),
  };
}

// --- Confidence Tier ---

/**
 * Determine the confidence tier for display and application policy.
 */
export function getTier(composite: number): ConfidenceTier {
  if (composite >= 0.8) return 'core';
  if (composite >= 0.6) return 'strong';
  if (composite >= 0.4) return 'moderate';
  if (composite >= 0.2) return 'tentative';
  return 'deprecated';
}

/**
 * Get human-readable tier description.
 */
export function getTierDescription(tier: ConfidenceTier): string {
  switch (tier) {
    case 'core':       return 'Auto-apply (very high confidence)';
    case 'strong':     return 'Suggest strongly when relevant';
    case 'moderate':   return 'Mention when context matches';
    case 'tentative':  return 'Only if specifically asked';
    case 'deprecated': return 'Scheduled for removal';
  }
}

// --- Frequency Score ---

/**
 * Calculate frequency score based on observation count.
 * Uses a logarithmic curve to avoid linear growth.
 */
export function calculateFrequencyScore(observationCount: number): number {
  if (observationCount <= 0) return 0;
  // Log curve: 1 obs → 0.1, 5 obs → 0.35, 10 obs → 0.5, 50 obs → 0.85, 100 obs → 1.0
  const score = Math.log10(observationCount + 1) / Math.log10(101);
  return Math.round(Math.min(score, 1.0) * 100) / 100;
}

// --- Effectiveness Score ---

/**
 * Calculate effectiveness score using Wilson confidence interval.
 * This handles small sample sizes better than simple success_rate.
 *
 * @param successes - Number of successful applications
 * @param total - Total number of applications
 * @param z - Z-score for confidence level (default 1.96 = 95%)
 */
export function calculateEffectivenessScore(
  successes: number,
  total: number,
  z = 1.96
): number {
  if (total === 0) return 0.5; // No data → neutral

  const phat = successes / total;
  const denominator = 1 + z * z / total;
  const center = phat + z * z / (2 * total);
  const spread = z * Math.sqrt((phat * (1 - phat) + z * z / (4 * total)) / total);

  // Use lower bound of Wilson interval (conservative)
  const lowerBound = (center - spread) / denominator;
  return Math.round(Math.max(0, Math.min(1, lowerBound)) * 100) / 100;
}

// --- Human Score ---

/**
 * Update human approval score using Bayesian update.
 *
 * @param current - Current human score
 * @param approved - Whether the human approved (true) or rejected (false)
 * @param strength - How much this review should affect the score (0.1-0.5)
 */
export function updateHumanScore(
  current: number,
  approved: boolean,
  strength = 0.3
): number {
  const adjustment = approved ? strength : -strength;
  const updated = current + adjustment;
  return Math.round(Math.max(0, Math.min(1, updated)) * 100) / 100;
}

// --- Decay ---

/**
 * Apply weekly decay to confidence scores for instincts not recently seen.
 *
 * @param confidence - Current confidence
 * @param weeksSinceLastSeen - Weeks since the instinct was last observed
 * @param decayRate - Weekly decay rate (default 0.02)
 */
export function applyDecay(
  confidence: CompositeConfidence,
  weeksSinceLastSeen: number,
  decayRate = 0.02
): CompositeConfidence {
  if (weeksSinceLastSeen <= 0) return confidence;

  const decay = Math.pow(1 - decayRate, weeksSinceLastSeen);

  const decayed: CompositeConfidence = {
    frequency: Math.round(confidence.frequency * decay * 100) / 100,
    effectiveness: confidence.effectiveness, // effectiveness doesn't decay
    human: confidence.human, // human approval doesn't decay
    composite: 0,
  };

  decayed.composite = calculateComposite(decayed);
  return decayed;
}

// --- Formatting ---

/**
 * Format confidence for display.
 */
export function formatConfidence(confidence: CompositeConfidence): string {
  const tier = getTier(confidence.composite);
  const bar = '█'.repeat(Math.round(confidence.composite * 10)) +
              '░'.repeat(10 - Math.round(confidence.composite * 10));

  return `${bar} ${(confidence.composite * 100).toFixed(0)}% [${tier}] ` +
    `(F:${(confidence.frequency * 100).toFixed(0)} E:${(confidence.effectiveness * 100).toFixed(0)} H:${(confidence.human * 100).toFixed(0)})`;
}
