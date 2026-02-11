import { describe, it, expect } from "vitest";
import {
  calculateComposite,
  updateComposite,
  getTier,
  getTierDescription,
  calculateFrequencyScore,
  calculateEffectivenessScore,
  updateHumanScore,
  applyDecay,
  formatConfidence,
} from "../confidence.js";
import type { CompositeConfidence } from "../types.js";

describe("calculateComposite", () => {
  it("calculates weighted composite from three dimensions", () => {
    const result = calculateComposite({
      frequency: 0.8,
      effectiveness: 0.9,
      human: 0.7,
    });
    // 0.8*0.35 + 0.9*0.40 + 0.7*0.25 = 0.28 + 0.36 + 0.175 = 0.815
    expect(result).toBeCloseTo(0.82, 1);
  });

  it("applies degradation penalty when a dimension is very low", () => {
    const withoutPenalty = calculateComposite({
      frequency: 0.5,
      effectiveness: 0.5,
      human: 0.5,
    });
    const withPenalty = calculateComposite({
      frequency: 0.1, // below 0.2 threshold
      effectiveness: 0.5,
      human: 0.5,
    });
    // penalty = 0.9 multiplier
    expect(withPenalty).toBeLessThan(withoutPenalty);
  });

  it("handles all zeros", () => {
    const result = calculateComposite({
      frequency: 0,
      effectiveness: 0,
      human: 0,
    });
    expect(result).toBe(0);
  });

  it("handles all ones", () => {
    const result = calculateComposite({
      frequency: 1,
      effectiveness: 1,
      human: 1,
    });
    expect(result).toBe(1);
  });
});

describe("updateComposite", () => {
  it("returns a new object with updated composite", () => {
    const input: CompositeConfidence = {
      frequency: 0.6,
      effectiveness: 0.7,
      human: 0.8,
      composite: 0, // stale
    };
    const result = updateComposite(input);
    expect(result.composite).toBeGreaterThan(0);
    expect(result.frequency).toBe(0.6);
    expect(result.effectiveness).toBe(0.7);
    expect(result.human).toBe(0.8);
  });
});

describe("getTier", () => {
  it("returns core for >= 0.8", () => {
    expect(getTier(0.8)).toBe("core");
    expect(getTier(1.0)).toBe("core");
  });

  it("returns strong for 0.6-0.8", () => {
    expect(getTier(0.6)).toBe("strong");
    expect(getTier(0.79)).toBe("strong");
  });

  it("returns moderate for 0.4-0.6", () => {
    expect(getTier(0.4)).toBe("moderate");
    expect(getTier(0.59)).toBe("moderate");
  });

  it("returns tentative for 0.2-0.4", () => {
    expect(getTier(0.2)).toBe("tentative");
    expect(getTier(0.39)).toBe("tentative");
  });

  it("returns deprecated for < 0.2", () => {
    expect(getTier(0.1)).toBe("deprecated");
    expect(getTier(0)).toBe("deprecated");
  });
});

describe("getTierDescription", () => {
  it("returns description for each tier", () => {
    expect(getTierDescription("core")).toContain("Auto-apply");
    expect(getTierDescription("deprecated")).toContain("removal");
  });
});

describe("calculateFrequencyScore", () => {
  it("returns 0 for zero observations", () => {
    expect(calculateFrequencyScore(0)).toBe(0);
  });

  it("returns 0 for negative observations", () => {
    expect(calculateFrequencyScore(-5)).toBe(0);
  });

  it("increases with more observations", () => {
    const s1 = calculateFrequencyScore(1);
    const s5 = calculateFrequencyScore(5);
    const s50 = calculateFrequencyScore(50);
    expect(s5).toBeGreaterThan(s1);
    expect(s50).toBeGreaterThan(s5);
  });

  it("caps at 1.0", () => {
    expect(calculateFrequencyScore(1000)).toBeLessThanOrEqual(1);
  });

  it("returns reasonable values for typical counts", () => {
    const s10 = calculateFrequencyScore(10);
    expect(s10).toBeGreaterThan(0.3);
    expect(s10).toBeLessThan(0.7);
  });
});

describe("calculateEffectivenessScore", () => {
  it("returns 0.5 (neutral) for zero total", () => {
    expect(calculateEffectivenessScore(0, 0)).toBe(0.5);
  });

  it("returns high score for all successes", () => {
    const score = calculateEffectivenessScore(100, 100);
    expect(score).toBeGreaterThan(0.9);
  });

  it("returns low score for no successes", () => {
    const score = calculateEffectivenessScore(0, 100);
    expect(score).toBeLessThan(0.1);
  });

  it("is conservative for small samples", () => {
    // Wilson interval is wider with fewer observations
    const smallSample = calculateEffectivenessScore(2, 2);
    const largeSample = calculateEffectivenessScore(200, 200);
    expect(largeSample).toBeGreaterThan(smallSample);
  });

  it("returns value between 0 and 1", () => {
    const score = calculateEffectivenessScore(7, 10);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe("updateHumanScore", () => {
  it("increases score on approval", () => {
    const updated = updateHumanScore(0.5, true);
    expect(updated).toBeGreaterThan(0.5);
  });

  it("decreases score on rejection", () => {
    const updated = updateHumanScore(0.5, false);
    expect(updated).toBeLessThan(0.5);
  });

  it("clamps to 0", () => {
    const updated = updateHumanScore(0.1, false, 0.5);
    expect(updated).toBeGreaterThanOrEqual(0);
  });

  it("clamps to 1", () => {
    const updated = updateHumanScore(0.9, true, 0.5);
    expect(updated).toBeLessThanOrEqual(1);
  });

  it("uses custom strength", () => {
    const weak = updateHumanScore(0.5, true, 0.1);
    const strong = updateHumanScore(0.5, true, 0.5);
    expect(strong).toBeGreaterThan(weak);
  });
});

describe("applyDecay", () => {
  const base: CompositeConfidence = {
    frequency: 0.8,
    effectiveness: 0.7,
    human: 0.6,
    composite: 0.72,
  };

  it("returns unchanged confidence for 0 weeks", () => {
    const result = applyDecay(base, 0);
    expect(result.frequency).toBe(base.frequency);
    expect(result.effectiveness).toBe(base.effectiveness);
  });

  it("decays frequency over time", () => {
    const result = applyDecay(base, 4);
    expect(result.frequency).toBeLessThan(base.frequency);
  });

  it("does not decay effectiveness", () => {
    const result = applyDecay(base, 10);
    expect(result.effectiveness).toBe(base.effectiveness);
  });

  it("does not decay human score", () => {
    const result = applyDecay(base, 10);
    expect(result.human).toBe(base.human);
  });

  it("recalculates composite after decay", () => {
    const result = applyDecay(base, 4);
    expect(result.composite).toBeLessThan(base.composite);
    expect(result.composite).toBeGreaterThan(0);
  });
});

describe("formatConfidence", () => {
  it("formats confidence as a readable string", () => {
    const conf: CompositeConfidence = {
      frequency: 0.8,
      effectiveness: 0.7,
      human: 0.6,
      composite: 0.72,
    };
    const formatted = formatConfidence(conf);
    expect(formatted).toContain("72%");
    expect(formatted).toContain("strong");
    expect(formatted).toContain("F:");
    expect(formatted).toContain("E:");
    expect(formatted).toContain("H:");
  });
});
