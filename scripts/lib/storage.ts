// =============================================================================
// AgentMind - Local Storage Engine
// Handles reading/writing instincts, observations, and session data.
// Uses JSON files for MVP; can be swapped for SQLite/PostgreSQL later.
// =============================================================================

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  appendFileSync,
} from "fs";
import { join } from "path";
import type {
  InstinctsStore,
  Instinct,
  Pattern,
  Strategy,
  Observation,
  SessionSummary,
} from "./types.js";

const STORE_VERSION = "0.1.0";

export class LocalStorage {
  private dataDir: string;
  private instinctsPath: string;
  private sessionsPath: string;
  private observationsDir: string;

  constructor(pluginRoot: string) {
    this.dataDir = join(pluginRoot, "data");
    this.instinctsPath = join(this.dataDir, "instincts.json");
    this.sessionsPath = join(this.dataDir, "sessions.jsonl");
    this.observationsDir = join(this.dataDir, "observations");
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    [this.dataDir, this.observationsDir].forEach((dir) => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });
  }

  // --- Instincts Store ---

  loadStore(): InstinctsStore {
    if (!existsSync(this.instinctsPath)) {
      return this.createEmptyStore();
    }
    try {
      const raw = readFileSync(this.instinctsPath, "utf8");
      return JSON.parse(raw) as InstinctsStore;
    } catch {
      return this.createEmptyStore();
    }
  }

  saveStore(store: InstinctsStore): void {
    store.metadata.version = STORE_VERSION;
    writeFileSync(this.instinctsPath, JSON.stringify(store, null, 2));
  }

  private createEmptyStore(): InstinctsStore {
    const now = new Date().toISOString();
    return {
      instincts: [],
      patterns: [],
      strategies: [],
      experts: [],
      metadata: {
        version: STORE_VERSION,
        last_analysis: now,
        total_sessions_analyzed: 0,
        total_observations: 0,
        created_at: now,
      },
    };
  }

  // --- Instinct CRUD ---

  getInstincts(filters?: {
    status?: string;
    domain?: string;
    minConfidence?: number;
  }): Instinct[] {
    const store = this.loadStore();
    let instincts = store.instincts;

    if (filters?.status) {
      instincts = instincts.filter((i) => i.status === filters.status);
    }
    if (filters?.domain) {
      instincts = instincts.filter((i) => i.domain === filters.domain);
    }
    if (filters?.minConfidence !== undefined) {
      instincts = instincts.filter(
        (i) => i.confidence.composite >= filters.minConfidence!,
      );
    }

    return instincts.sort(
      (a, b) => b.confidence.composite - a.confidence.composite,
    );
  }

  getInstinctById(id: string): Instinct | undefined {
    const store = this.loadStore();
    return store.instincts.find((i) => i.id === id);
  }

  upsertInstinct(instinct: Instinct): void {
    const store = this.loadStore();
    const index = store.instincts.findIndex((i) => i.id === instinct.id);
    if (index >= 0) {
      store.instincts[index] = instinct;
    } else {
      store.instincts.push(instinct);
    }
    this.saveStore(store);
  }

  deleteInstinct(id: string): boolean {
    const store = this.loadStore();
    const before = store.instincts.length;
    store.instincts = store.instincts.filter((i) => i.id !== id);
    if (store.instincts.length < before) {
      this.saveStore(store);
      return true;
    }
    return false;
  }

  // --- Observations ---

  appendObservation(observation: Observation): void {
    const today = new Date().toISOString().split("T")[0];
    const filePath = join(this.observationsDir, `${today}.jsonl`);
    appendFileSync(filePath, JSON.stringify(observation) + "\n");
  }

  getObservations(date?: string): Observation[] {
    const targetDate = date || new Date().toISOString().split("T")[0];
    const filePath = join(this.observationsDir, `${targetDate}.jsonl`);
    if (!existsSync(filePath)) return [];

    return readFileSync(filePath, "utf8")
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((o): o is Observation => o !== null);
  }

  // --- Sessions ---

  appendSession(summary: SessionSummary): void {
    appendFileSync(this.sessionsPath, JSON.stringify(summary) + "\n");
  }

  getSessions(limit = 20): SessionSummary[] {
    if (!existsSync(this.sessionsPath)) return [];

    const lines = readFileSync(this.sessionsPath, "utf8").trim().split("\n");
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((s): s is SessionSummary => s !== null)
      .reverse();
  }

  // --- Evolution ---

  getPatterns(): Pattern[] {
    return this.loadStore().patterns;
  }

  getStrategies(): Strategy[] {
    return this.loadStore().strategies;
  }

  savePattern(pattern: Pattern): void {
    const store = this.loadStore();
    const index = store.patterns.findIndex((p) => p.id === pattern.id);
    if (index >= 0) {
      store.patterns[index] = pattern;
    } else {
      store.patterns.push(pattern);
    }
    this.saveStore(store);
  }

  saveStrategy(strategy: Strategy): void {
    const store = this.loadStore();
    const index = store.strategies.findIndex((s) => s.id === strategy.id);
    if (index >= 0) {
      store.strategies[index] = strategy;
    } else {
      store.strategies.push(strategy);
    }
    this.saveStore(store);
  }

  // --- Statistics ---

  getStats(): {
    totalInstincts: number;
    activeInstincts: number;
    tentativeInstincts: number;
    deprecatedInstincts: number;
    avgConfidence: number;
    domains: Record<string, number>;
    totalSessions: number;
    totalObservations: number;
  } {
    const store = this.loadStore();
    const instincts = store.instincts;

    const domains: Record<string, number> = {};
    instincts.forEach((i) => {
      domains[i.domain] = (domains[i.domain] || 0) + 1;
    });

    const active = instincts.filter((i) => i.status === "active");
    const avgConfidence =
      active.length > 0
        ? active.reduce((sum, i) => sum + i.confidence.composite, 0) /
          active.length
        : 0;

    return {
      totalInstincts: instincts.length,
      activeInstincts: active.length,
      tentativeInstincts: instincts.filter((i) => i.status === "tentative")
        .length,
      deprecatedInstincts: instincts.filter((i) => i.status === "deprecated")
        .length,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      domains,
      totalSessions: store.metadata.total_sessions_analyzed,
      totalObservations: store.metadata.total_observations,
    };
  }
}
