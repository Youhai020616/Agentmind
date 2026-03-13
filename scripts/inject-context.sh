#!/usr/bin/env bash
# =============================================================================
# AgentMind - Context Injection
# Hook: SessionStart (sync — stdout becomes Claude's context)
#
# Reads learned instincts and generates a concise learning context
# that gets injected into Claude's system prompt at session start.
# =============================================================================

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$0")")}"
INSTINCTS_FILE="${PLUGIN_ROOT}/data/instincts.json"

# No instincts yet — exit silently
if [ ! -f "$INSTINCTS_FILE" ]; then
  exit 0
fi

# Check if file is valid JSON and has instincts
INSTINCT_COUNT=$(jq -r '.instincts | length // 0' "$INSTINCTS_FILE" 2>/dev/null || echo "0")
if [ "$INSTINCT_COUNT" = "0" ]; then
  exit 0
fi

# Generate context using the TypeScript context-generator module
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LIB_DIR="${SCRIPT_DIR}/lib"

# Read hook input from stdin (SessionStart provides cwd, model, etc.)
INPUT=$(cat 2>/dev/null || true)
CWD=$(echo "$INPUT" | jq -r '.cwd // ""' 2>/dev/null || echo "")

export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"
export AGENTMIND_CWD="$CWD"

# Record which instincts are being injected for effectiveness tracking (Phase 1.1)
ACTIVE_INSTINCTS_FILE="${PLUGIN_ROOT}/data/active-instincts.json"
INJECTED_IDS=$(jq -r '[.instincts[] | select(.status == "active" and .confidence.composite >= 0.4) | .id] | tojson' "$INSTINCTS_FILE" 2>/dev/null || echo '[]')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Atomic write: tmp + rename
ACTIVE_TMP="${ACTIVE_INSTINCTS_FILE}.tmp.$$"
jq -cn --argjson ids "$INJECTED_IDS" --arg ts "$TIMESTAMP" \
  '{injected_ids: $ids, injected_at: $ts, outcome_count: 0}' > "$ACTIVE_TMP" 2>/dev/null
mv "$ACTIVE_TMP" "$ACTIVE_INSTINCTS_FILE" 2>/dev/null || true

# Use run.sh to invoke context-generator (pass --cwd for task-aware injection)
# Build args array to handle paths with spaces correctly
CTX_ARGS=(generate)
if [ -n "$CWD" ]; then
  CTX_ARGS+=(--cwd "$CWD")
fi

if [ -x "${LIB_DIR}/run.sh" ]; then
  "${LIB_DIR}/run.sh" context-generator "${CTX_ARGS[@]}" 2>/dev/null || exit 0
else
  if command -v npx &> /dev/null; then
    npx --yes tsx "${LIB_DIR}/context-generator.ts" "${CTX_ARGS[@]}" 2>/dev/null || exit 0
  elif command -v node &> /dev/null; then
    DIST_FILE="${LIB_DIR}/dist/context-generator.js"
    if [ -f "$DIST_FILE" ]; then
      node "$DIST_FILE" "${CTX_ARGS[@]}" 2>/dev/null || exit 0
    fi
  fi
fi

exit 0
