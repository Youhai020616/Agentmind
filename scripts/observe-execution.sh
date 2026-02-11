#!/usr/bin/env bash
# =============================================================================
# AgentMind - Execution Layer Observer
# Hooks: PreToolUse (--phase pre) / PostToolUse (--phase post) (async)
#
# Captures tool usage patterns:
# - Which tools are used and in what order
# - Tool parameters (abstracted, no raw content)
# - Success/failure status
# - Timing information
# =============================================================================

set -euo pipefail

# Parse --phase argument properly
PHASE="post"
while [ $# -gt 0 ]; do
  case "$1" in
    --phase)
      PHASE="${2:-post}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

# Read hook input from stdin
INPUT=$(cat)

# Validate JSON input
if ! echo "$INPUT" | jq empty 2>/dev/null; then
  exit 0
fi

# Extract common fields
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"')
TOOL_USE_ID=$(echo "$INPUT" | jq -r '.tool_use_id // "unknown"')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# --- Abstract tool input (privacy: no raw content) ---
TOOL_ABSTRACT=""
case "$TOOL_NAME" in
  Bash)
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
    # Extract only the command name, not arguments with sensitive data
    CMD_NAME=$(echo "$CMD" | awk '{print $1}' | xargs basename 2>/dev/null || echo "$CMD" | awk '{print $1}')
    HAS_PIPE=$(echo "$CMD" | grep -c '|' || true)
    CMD_LEN=${#CMD}
    TOOL_ABSTRACT=$(jq -cn --arg cmd "${CMD_NAME:-}" --argjson pipe "${HAS_PIPE:-0}" --argjson len "${CMD_LEN:-0}" \
      '{command_name: $cmd, has_pipe: ($pipe > 0), command_length: $len}')
    ;;
  Read)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
    EXT=$(echo "$FILE_PATH" | sed 's/.*\.//' | tr '[:upper:]' '[:lower:]')
    TOOL_ABSTRACT=$(jq -cn --arg ext "${EXT:-}" '{file_extension: $ext}')
    ;;
  Write|Edit)
    FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
    EXT=$(echo "$FILE_PATH" | sed 's/.*\.//' | tr '[:upper:]' '[:lower:]')
    TOOL_ABSTRACT=$(jq -cn --arg ext "${EXT:-}" --arg tool "$TOOL_NAME" \
      '{file_extension: $ext, operation: $tool}')
    ;;
  Grep)
    PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern // ""')
    PLEN=${#PATTERN}
    TOOL_ABSTRACT=$(jq -cn --argjson plen "${PLEN:-0}" '{pattern_length: $plen}')
    ;;
  Glob)
    PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern // ""')
    TOOL_ABSTRACT=$(jq -cn --arg pat "${PATTERN:-}" '{glob_pattern: $pat}')
    ;;
  WebSearch)
    TOOL_ABSTRACT='{"type": "web_search"}'
    ;;
  WebFetch)
    TOOL_ABSTRACT='{"type": "web_fetch"}'
    ;;
  Task)
    AGENT_TYPE=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // "unknown"')
    TOOL_ABSTRACT=$(jq -cn --arg at "$AGENT_TYPE" '{subagent_type: $at}')
    ;;
  *)
    # MCP tools or unknown — just record the name
    TOOL_ABSTRACT='{"type": "other"}'
    ;;
esac

# --- Build observation record ---
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$0")")}"
DATA_DIR="${PLUGIN_ROOT}/data/observations"
mkdir -p "$DATA_DIR"

# For PostToolUse, check if there's a response indicating success
SUCCESS="null"
if [ "$PHASE" = "post" ]; then
  HAS_RESPONSE=$(echo "$INPUT" | jq 'has("tool_response")')
  if [ "$HAS_RESPONSE" = "true" ]; then
    SUCCESS="true"
  fi
fi

OBSERVATION=$(jq -cn \
  --arg sid "$SESSION_ID" \
  --arg ts "$TIMESTAMP" \
  --arg phase "$PHASE" \
  --arg tool "$TOOL_NAME" \
  --arg tuid "$TOOL_USE_ID" \
  --argjson abstract "${TOOL_ABSTRACT:-'{}'}" \
  --argjson success "$SUCCESS" \
  '{
    layer: "execution",
    session_id: $sid,
    timestamp: $ts,
    event: ("tool_" + $phase),
    data: {
      tool_name: $tool,
      tool_use_id: $tuid,
      phase: $phase,
      abstract: $abstract,
      success: $success
    }
  }')

echo "$OBSERVATION" >> "${DATA_DIR}/$(date +%Y-%m-%d).jsonl"

exit 0
