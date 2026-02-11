#!/usr/bin/env bash
# =============================================================================
# AgentMind - Pre-Compact Save
# Hook: PreCompact (sync)
#
# Saves critical observation data before context compaction.
# Compaction may lose conversation context, so we persist
# any pending analysis results.
# =============================================================================

set -euo pipefail

INPUT=$(cat)

# Validate JSON input
if ! echo "$INPUT" | jq empty 2>/dev/null; then
  exit 0
fi

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
TRIGGER=$(echo "$INPUT" | jq -r '.trigger // "unknown"')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$0")")}"
DATA_DIR="${PLUGIN_ROOT}/data"
OBS_DIR="${DATA_DIR}/observations"

mkdir -p "$DATA_DIR"

# Log compact event
jq -cn \
  --arg sid "$SESSION_ID" \
  --arg ts "$TIMESTAMP" \
  --arg trigger "$TRIGGER" \
  '{event: "pre_compact", session_id: $sid, timestamp: $ts, trigger: $trigger}' \
  >> "${DATA_DIR}/sessions.jsonl"

# Run lightweight analysis to persist pending observations
TODAY=$(date +%Y-%m-%d)
OBS_FILE="${OBS_DIR}/${TODAY}.jsonl"

if [ -f "$OBS_FILE" ]; then
  # Count observations for this session
  SESSION_OBS=$(jq -r --arg sid "$SESSION_ID" 'select(.session_id == $sid)' "$OBS_FILE" 2>/dev/null | grep -c '^{' 2>/dev/null || true)
  SESSION_OBS="${SESSION_OBS:-0}"

  if [ "$SESSION_OBS" -ge 5 ]; then
    # Run analysis with input piped to analyze-session.sh
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    echo "$INPUT" | "${SCRIPT_DIR}/analyze-session.sh" 2>/dev/null || true
  fi
fi

# Output context to preserve through compaction
echo '{"additionalContext": "AgentMind: Observation data has been persisted before compaction. Learning context remains available."}'

exit 0
