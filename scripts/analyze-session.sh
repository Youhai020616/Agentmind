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

# Load the most recent 7 days of observation files for cross-day analysis
RECENT_OBS_FILES=()
for OFFSET in 0 1 2 3 4 5 6; do
  if DAY=$(date -v -"${OFFSET}"d +%Y-%m-%d 2>/dev/null); then
    :
  else
    DAY=$(date -d "${OFFSET} days ago" +%Y-%m-%d 2>/dev/null || true)
  fi

  if [ -n "${DAY:-}" ] && [ -f "${OBS_DIR}/${DAY}.jsonl" ]; then
    RECENT_OBS_FILES+=("${OBS_DIR}/${DAY}.jsonl")
  fi
done

if [ "${#RECENT_OBS_FILES[@]}" -eq 0 ]; then
  exit 0
fi

MERGED_OBS_FILE=$(mktemp "${DATA_DIR}/recent-observations.XXXXXX.jsonl")
trap 'rm -f "$MERGED_OBS_FILE"' EXIT
cat "${RECENT_OBS_FILES[@]}" > "$MERGED_OBS_FILE"

# --- Run pattern analysis via environment variables (no shell interpolation in JS) ---
export AGENTMIND_OBS_FILE="$MERGED_OBS_FILE"
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

  // Read observations from the last 7 days for cross-day analysis
  const raw = fs.readFileSync(obsFile, "utf8").trim();
  if (!raw) return;

  const allObservations = raw.split("\n")
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  const sessionObservations = allObservations.filter(o => o.session_id === sessionId);

  if (sessionObservations.length < 5) {
    if (isFinal) {
      const summary = {
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        observation_count: sessionObservations.length,
        analysis: "skipped_insufficient_data",
        is_final: true
      };
      fs.appendFileSync(dataDir + "/sessions.jsonl", JSON.stringify(summary) + "\n");
    }
    return;
  }

  // --- Pattern Detection ---

  // 1. Tool sequence detection (N-gram) across recent observations
  const toolEvents = allObservations
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
  const corrections = allObservations
    .filter(o => o.layer === "intent" && o.data && o.data.has_correction);

  // 3. Error patterns
  const errors = allObservations
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
      action: "User has corrected the agent " + corrections.length + " time(s) in the last 7 days — review correction patterns",
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
    total_observations: (instincts.metadata.total_observations || 0) + sessionObservations.length
  };

  // Atomic write: write to temp file, then rename
  const tmpFile = instinctsFile + ".tmp." + process.pid;
  fs.writeFileSync(tmpFile, JSON.stringify(instincts, null, 2));
  fs.renameSync(tmpFile, instinctsFile);

  // Log session summary
  const sessionCorrections = sessionObservations
    .filter(o => o.layer === "intent" && o.data && o.data.has_correction);
  const sessionErrors = sessionObservations
    .filter(o => o.layer === "evaluation" && o.event === "tool_failure");
  const summary = {
    session_id: sessionId,
    timestamp: new Date().toISOString(),
    observation_count: sessionObservations.length,
    patterns_detected: candidates.length,
    corrections: sessionCorrections.length,
    errors: sessionErrors.length,
    is_final: isFinal
  };
  fs.appendFileSync(dataDir + "/sessions.jsonl", JSON.stringify(summary) + "\n");
}

analyze().catch(() => process.exit(0));
' 2>/dev/null

# --- Run evolution cycle on final session analysis ---
if [ "$IS_FINAL" = "true" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  LIB_DIR="${SCRIPT_DIR}/lib"

  if [ -x "${LIB_DIR}/run.sh" ]; then
    "${LIB_DIR}/run.sh" evolution run 2>/dev/null || true
  elif command -v npx &> /dev/null; then
    npx --yes tsx "${LIB_DIR}/evolution.ts" run 2>/dev/null || true
  fi
fi

exit 0
