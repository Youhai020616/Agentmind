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

export CLAUDE_PLUGIN_ROOT="$PLUGIN_ROOT"

# Use run.sh to invoke context-generator
if [ -x "${LIB_DIR}/run.sh" ]; then
  "${LIB_DIR}/run.sh" context-generator generate 2>/dev/null || exit 0
else
  # Fallback: try direct tsx/node invocation
  if command -v npx &> /dev/null; then
    npx --yes tsx "${LIB_DIR}/context-generator.ts" generate 2>/dev/null || exit 0
  elif command -v node &> /dev/null; then
    DIST_FILE="${LIB_DIR}/dist/context-generator.js"
    if [ -f "$DIST_FILE" ]; then
      node "$DIST_FILE" generate 2>/dev/null || exit 0
    fi
  fi
fi

exit 0
