#!/usr/bin/env bash
# =============================================================================
# AgentMind - TypeScript Runner
# Wrapper script that runs TypeScript modules using tsx.
#
# Usage: run.sh <module-name> [args...]
# Example: run.sh instinct-manager status
#          run.sh context-generator generate
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODULE="$1"
shift

# Check if tsx is available
if command -v npx &> /dev/null; then
  exec npx --yes tsx "${SCRIPT_DIR}/${MODULE}.ts" "$@"
elif command -v tsx &> /dev/null; then
  exec tsx "${SCRIPT_DIR}/${MODULE}.ts" "$@"
elif command -v node &> /dev/null; then
  # Fallback: try running compiled JS
  DIST_FILE="${SCRIPT_DIR}/dist/${MODULE}.js"
  if [ -f "$DIST_FILE" ]; then
    exec node "$DIST_FILE" "$@"
  else
    echo "Error: tsx not found and no compiled JS available." >&2
    echo "Run 'npm install' in the plugin directory first." >&2
    exit 1
  fi
else
  echo "Error: Node.js is required. Please install Node.js 20+." >&2
  exit 1
fi
