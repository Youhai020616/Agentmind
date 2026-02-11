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

# Generate context using Node.js for proper JSON processing
node --no-warnings -e "
const fs = require('fs');

try {
  const data = JSON.parse(fs.readFileSync('${INSTINCTS_FILE}', 'utf8'));
  const instincts = data.instincts || [];

  // Filter active instincts above threshold
  const active = instincts
    .filter(i => i.status === 'active' && i.confidence && i.confidence.composite >= 0.4)
    .sort((a, b) => b.confidence.composite - a.confidence.composite);

  if (active.length === 0) process.exit(0);

  // Group by confidence tier
  const strong = active.filter(i => i.confidence.composite >= 0.8);
  const moderate = active.filter(i => i.confidence.composite >= 0.6 && i.confidence.composite < 0.8);
  const tentative = active.filter(i => i.confidence.composite >= 0.4 && i.confidence.composite < 0.6);

  let output = '';
  output += '## AgentMind Learning Context\n\n';

  if (strong.length > 0) {
    output += '### Strong Preferences (apply these):\n';
    strong.slice(0, 10).forEach(i => {
      output += '- ' + i.trigger + ': ' + i.action + '\n';
    });
    output += '\n';
  }

  if (moderate.length > 0) {
    output += '### Patterns (prefer these when applicable):\n';
    moderate.slice(0, 8).forEach(i => {
      output += '- ' + i.trigger + ': ' + i.action + '\n';
    });
    output += '\n';
  }

  if (tentative.length > 0) {
    output += '### Suggestions (consider these):\n';
    tentative.slice(0, 5).forEach(i => {
      output += '- Consider: ' + i.action + '\n';
    });
    output += '\n';
  }

  // Token budget: keep output under ~300 tokens
  if (output.length > 2000) {
    output = output.substring(0, 2000) + '\n...(truncated for context budget)\n';
  }

  process.stdout.write(output);
} catch (e) {
  // Silently fail — don't break the session
  process.exit(0);
}
" 2>/dev/null

exit 0
