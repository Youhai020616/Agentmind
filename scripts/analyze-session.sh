#!/usr/bin/env bash
# =============================================================================
# AgentMind - Session Analyzer
# Hooks: Stop (async) / SessionEnd (sync)
#
# Analyzes observations from the current session to detect patterns
# and generate/update instinct candidates.
#
# Usage:
#   analyze-session.sh          — Standard analysis (Stop hook, async)
#   analyze-session.sh --final  — Final analysis (SessionEnd hook)
# =============================================================================

set -euo pipefail

IS_FINAL=false
if [ "${1:-}" = "--final" ]; then
  IS_FINAL=true
fi

# Read hook input from stdin
INPUT=$(cat)

# Validate JSON input
if ! echo "$INPUT" | jq empty 2>/dev/null; then
  exit 0
fi

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$0")")}"
DATA_DIR="${PLUGIN_ROOT}/data"
OBS_DIR="${DATA_DIR}/observations"
INSTINCTS_FILE="${DATA_DIR}/instincts.json"

# Ensure data directory exists
mkdir -p "$DATA_DIR"

# Check if there are observations to analyze
TODAY=$(date +%Y-%m-%d)
OBS_FILE="${OBS_DIR}/${TODAY}.jsonl"

if [ ! -f "$OBS_FILE" ]; then
  exit 0
fi

# Count observations for this session using jq for robust JSON matching
SESSION_OBS=$(jq -r --arg sid "$SESSION_ID" 'select(.session_id == $sid)' "$OBS_FILE" 2>/dev/null | grep -c '^{' 2>/dev/null || true)
SESSION_OBS="${SESSION_OBS:-0}"

# Need minimum observations for meaningful analysis
if [ "$SESSION_OBS" -lt 5 ]; then
  # Too few observations — skip analysis
  if [ "$IS_FINAL" = "true" ]; then
    # On final, at least save a session summary
    jq -cn \
      --arg sid "$SESSION_ID" \
      --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
      --argjson count "$SESSION_OBS" \
      '{session_id: $sid, timestamp: $ts, observation_count: $count, analysis: "skipped_insufficient_data"}' \
      >> "${DATA_DIR}/sessions.jsonl"
  fi
  exit 0
fi

# --- Run pattern analysis via environment variables (no shell interpolation in JS) ---
export AGENTMIND_OBS_FILE="$OBS_FILE"
export AGENTMIND_SESSION_ID="$SESSION_ID"
export AGENTMIND_INSTINCTS_FILE="$INSTINCTS_FILE"
export AGENTMIND_DATA_DIR="$DATA_DIR"
export AGENTMIND_IS_FINAL="$IS_FINAL"

node --no-warnings -e '
const fs = require("fs");

async function analyze() {
  const obsFile = process.env.AGENTMIND_OBS_FILE;
  const sessionId = process.env.AGENTMIND_SESSION_ID;
  const instinctsFile = process.env.AGENTMIND_INSTINCTS_FILE;
  const dataDir = process.env.AGENTMIND_DATA_DIR;
  const isFinal = process.env.AGENTMIND_IS_FINAL === "true";

  // Read observations for this session
  const lines = fs.readFileSync(obsFile, "utf8").trim().split("\n");
  const observations = lines
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(o => o && o.session_id === sessionId);

  if (observations.length < 5) return;

  // --- Pattern Detection ---

  // 1. Tool sequence detection (N-gram)
  const toolEvents = observations
    .filter(o => o.layer === "execution" && o.data && o.data.phase === "pre")
    .map(o => o.data.tool_name);

  const bigrams = {};
  const trigrams = {};
  for (let i = 0; i < toolEvents.length - 1; i++) {
    const bi = toolEvents[i] + " -> " + toolEvents[i + 1];
    bigrams[bi] = (bigrams[bi] || 0) + 1;
    if (i < toolEvents.length - 2) {
      const tri = toolEvents[i] + " -> " + toolEvents[i + 1] + " -> " + toolEvents[i + 2];
      trigrams[tri] = (trigrams[tri] || 0) + 1;
    }
  }

  // 2. Correction detection
  const corrections = observations
    .filter(o => o.layer === "intent" && o.data && o.data.has_correction);

  // 3. Error patterns
  const errors = observations
    .filter(o => o.layer === "evaluation" && o.event === "tool_failure");

  const errorTypes = {};
  errors.forEach(e => {
    if (e.data && e.data.tool_name && e.data.error_type) {
      const key = e.data.tool_name + ":" + e.data.error_type;
      errorTypes[key] = (errorTypes[key] || 0) + 1;
    }
  });

  // --- Generate Instinct Candidates ---
  const candidates = [];

  // From frequent sequences
  Object.entries(trigrams).forEach(([seq, count]) => {
    if (count >= 2) {
      const tools = seq.split(" -> ");
      candidates.push({
        trigger: "When performing a " + tools[0].toLowerCase() + " operation",
        action: "Follow the sequence: " + seq,
        domain: "workflow",
        evidence_count: count,
        source: "sequence_detection",
        initial_confidence: Math.min(count / 10, 0.5)
      });
    }
  });

  // From corrections
  if (corrections.length > 0) {
    candidates.push({
      trigger: "When responding to user requests",
      action: "User has corrected the agent " + corrections.length + " time(s) in this session — review correction patterns",
      domain: "user-preference",
      evidence_count: corrections.length,
      source: "correction_detection",
      initial_confidence: 0.3
    });
  }

  // --- Update instincts file (atomic write) ---
  let instincts = { instincts: [], patterns: [], strategies: [], experts: [], metadata: {} };
  try {
    if (fs.existsSync(instinctsFile)) {
      const raw = fs.readFileSync(instinctsFile, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.instincts)) {
        instincts = parsed;
      }
    }
  } catch {
    // Corrupted file — start fresh
  }

  // Add new candidates (avoid duplicates)
  candidates.forEach(c => {
    const existing = instincts.instincts.find(i =>
      i.trigger === c.trigger && i.action === c.action
    );

    if (existing) {
      // Update existing — boost frequency score
      existing.confidence.frequency = Math.min(
        existing.confidence.frequency + 0.05,
        1.0
      );
      existing.confidence.composite = (
        existing.confidence.frequency * 0.35 +
        existing.confidence.effectiveness * 0.40 +
        existing.confidence.human * 0.25
      );
      existing.evidence_count = (existing.evidence_count || 0) + c.evidence_count;
      existing.last_seen = new Date().toISOString();
    } else {
      // Create new instinct
      instincts.instincts.push({
        id: "inst_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        trigger: c.trigger,
        action: c.action,
        domain: c.domain,
        status: "tentative",
        confidence: {
          frequency: c.initial_confidence,
          effectiveness: 0.5,
          human: 0.5,
          composite: c.initial_confidence * 0.35 + 0.5 * 0.40 + 0.5 * 0.25
        },
        evidence_count: c.evidence_count,
        source: c.source,
        created_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        application_count: 0,
        success_rate: 0
      });
    }
  });

  // Update metadata
  instincts.metadata = {
    ...instincts.metadata,
    last_analysis: new Date().toISOString(),
    total_sessions_analyzed: (instincts.metadata.total_sessions_analyzed || 0) + (isFinal ? 1 : 0),
    total_observations: (instincts.metadata.total_observations || 0) + observations.length
  };

  // Atomic write: write to temp file, then rename
  const tmpFile = instinctsFile + ".tmp." + process.pid;
  fs.writeFileSync(tmpFile, JSON.stringify(instincts, null, 2));
  fs.renameSync(tmpFile, instinctsFile);

  // Log session summary
  const summary = {
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    observation_count: observations.length,
    patterns_detected: candidates.length,
    corrections: corrections.length,
    errors: errors.length,
    is_final: isFinal
  };
  fs.appendFileSync(dataDir + "/sessions.jsonl", JSON.stringify(summary) + "\n");
}

analyze().catch(() => process.exit(0));
' 2>/dev/null

exit 0
