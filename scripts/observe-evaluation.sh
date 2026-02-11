#!/usr/bin/env bash
# =============================================================================
# AgentMind - Evaluation Layer Observer
# Hook: PostToolUseFailure (async)
#
# Captures error and failure patterns:
# - Tool failures and error types
# - Error frequency per tool
# - Error context (what was being attempted)
# =============================================================================

set -euo pipefail

# Read hook input from stdin
INPUT=$(cat)

# Validate JSON input
if [ -z "$INPUT" ] || ! echo "$INPUT" | jq empty 2>/dev/null; then
  exit 0
fi

# Extract fields
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
ERROR_MSG=$(echo "$INPUT" | jq -r '.error // "unknown error"')
IS_INTERRUPT=$(echo "$INPUT" | jq -r '.is_interrupt // false')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Skip user interrupts — they're not real errors
if [ "$IS_INTERRUPT" = "true" ]; then
  exit 0
fi

# --- Classify error type (most specific patterns first) ---
ERROR_TYPE="unknown"
if echo "$ERROR_MSG" | grep -iqE "(ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network|connection refused|fetch failed)"; then
  ERROR_TYPE="network_error"
elif echo "$ERROR_MSG" | grep -iqE "(command not found|exit code|non-zero|command failed)"; then
  ERROR_TYPE="command_failure"
elif echo "$ERROR_MSG" | grep -iqE "(no such file|does not exist|ENOENT|file not found)"; then
  ERROR_TYPE="file_not_found"
elif echo "$ERROR_MSG" | grep -iqE "(permission denied|EACCES|access denied|forbidden)"; then
  ERROR_TYPE="permission_error"
elif echo "$ERROR_MSG" | grep -iqE "(SyntaxError|unexpected token|parse error|invalid syntax)"; then
  ERROR_TYPE="syntax_error"
elif echo "$ERROR_MSG" | grep -iqE "(timed out|timeout|TIMEOUT)"; then
  ERROR_TYPE="timeout"
elif echo "$ERROR_MSG" | grep -iqE "(TypeError|type error|TypeScript|is not a function|is not assignable)"; then
  ERROR_TYPE="type_error"
fi

# --- Build observation record ---
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$0")")}"
DATA_DIR="${PLUGIN_ROOT}/data/observations"
mkdir -p "$DATA_DIR"

OBSERVATION=$(jq -cn \
  --arg sid "$SESSION_ID" \
  --arg ts "$TIMESTAMP" \
  --arg tool "$TOOL_NAME" \
  --arg etype "$ERROR_TYPE" \
  --argjson errlen "${#ERROR_MSG}" \
  '{
    layer: "evaluation",
    session_id: $sid,
    timestamp: $ts,
    event: "tool_failure",
    data: {
      tool_name: $tool,
      error_type: $etype,
      error_length: $errlen
    }
  }')

echo "$OBSERVATION" >> "${DATA_DIR}/$(date +%Y-%m-%d).jsonl"

exit 0
