---
name: instincts
description: Browse, search, and manage learned instincts with filtering and detail views
disable-model-invocation: true
argument-hint: "[list|search|show <id>|export|import] [--domain <domain>] [--min-confidence <n>]"
---

# AgentMind Instincts Manager

Manage your learned instincts.

## Current Instincts Data

!`"${CLAUDE_PLUGIN_ROOT}/scripts/lib/run.sh" instinct-manager list $ARGUMENTS 2>/dev/null`

## Available Actions

Based on the user's command arguments, perform the appropriate action:

### `list` (default)
Show all instincts in a table format:
| ID | Trigger | Action | Confidence | Domain | Status |

Support filters: `--domain frontend`, `--min-confidence 0.6`, `--status active`

### `search <query>`
Semantic search through instincts. Show the most relevant matches.

### `show <id>`
Show detailed view of a single instinct:
- Full trigger and action text
- Confidence breakdown (frequency / effectiveness / human → composite)
- Evidence chain (which observations led to this instinct)
- Application history (when and where it was applied)
- Evolution status (part of any Pattern/Strategy?)

### `export [--domain <domain>]`
Export instincts as JSON to stdout. User can redirect to file.

### `import <file> [--trust <0-1>]`
Import instincts from a JSON file. Set initial confidence based on `--trust` flag (default 0.5).

If no arguments provided, default to `list --status active`.
