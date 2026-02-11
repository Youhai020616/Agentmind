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
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
TRIGGER=$(echo "$INPUT" | jq -r '.trigger // "unknown"')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$0")")}"
DATA_DIR="${PLUGIN_ROOT}/data"

mkdir -p "$DATA_DIR"

# Log compact event
jq -cn \
  --arg sid "$SESSION_ID" \
  --arg ts "$TIMESTAMP" \
  --arg trigger "$TRIGGER" \
  '{event: "pre_compact", session_id: $sid, timestamp: $ts, trigger: $trigger}' \
  >> "${DATA_DIR}/sessions.jsonl"

# Output context to preserve through compaction
echo '{"additionalContext": "AgentMind: Observation data has been persisted before compaction. Learning context remains available."}'

exit 0
