#!/usr/bin/env bash
# =============================================================================
# AgentMind - Intent Layer Observer
# Hook: UserPromptSubmit (async)
#
# Captures user intent signals:
# - Prompt length and type
# - Correction signals (user correcting Agent behavior)
# - Task type classification
# =============================================================================

set -euo pipefail

# Read hook input from stdin
INPUT=$(cat)

# Extract fields
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Skip empty prompts
if [ -z "$PROMPT" ]; then
  exit 0
fi

# --- Detect correction signals ---
HAS_CORRECTION=false
CORRECTION_TYPE="none"

# Strong correction signals
if echo "$PROMPT" | grep -iqE "^(no[,.]|wrong|not that|that's wrong|incorrect)"; then
  HAS_CORRECTION=true
  CORRECTION_TYPE="explicit_rejection"
elif echo "$PROMPT" | grep -iqE "(instead|rather|actually|I meant|I want|don't|shouldn't|stop)"; then
  HAS_CORRECTION=true
  CORRECTION_TYPE="redirection"
elif echo "$PROMPT" | grep -iqE "(again|retry|redo|try again|one more time|revert)"; then
  HAS_CORRECTION=true
  CORRECTION_TYPE="retry_request"
fi

# --- Classify prompt type ---
PROMPT_TYPE="general"
if echo "$PROMPT" | grep -iqE "(fix|bug|error|broken|crash|fail)"; then
  PROMPT_TYPE="debugging"
elif echo "$PROMPT" | grep -iqE "(create|build|add|implement|make|write)"; then
  PROMPT_TYPE="creation"
elif echo "$PROMPT" | grep -iqE "(refactor|improve|optimize|clean|reorganize)"; then
  PROMPT_TYPE="improvement"
elif echo "$PROMPT" | grep -iqE "(explain|what|why|how|understand)"; then
  PROMPT_TYPE="understanding"
elif echo "$PROMPT" | grep -iqE "(test|spec|coverage|assert)"; then
  PROMPT_TYPE="testing"
fi

# --- Build observation record ---
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$0")")}"
DATA_DIR="${PLUGIN_ROOT}/data/observations"
mkdir -p "$DATA_DIR"

OBSERVATION=$(jq -cn \
  --arg sid "$SESSION_ID" \
  --arg ts "$TIMESTAMP" \
  --arg ptype "$PROMPT_TYPE" \
  --argjson plen "${#PROMPT}" \
  --argjson correction "$HAS_CORRECTION" \
  --arg ctype "$CORRECTION_TYPE" \
  '{
    layer: "intent",
    session_id: $sid,
    timestamp: $ts,
    event: "user_prompt",
    data: {
      prompt_type: $ptype,
      prompt_length: $plen,
      has_correction: $correction,
      correction_type: $ctype
    }
  }')

# Append to daily observation file
echo "$OBSERVATION" >> "${DATA_DIR}/$(date +%Y-%m-%d).jsonl"

exit 0
