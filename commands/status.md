---
name: status
description: Show AgentMind learning status — instinct counts, confidence trends, and domain breakdown
disable-model-invocation: true
argument-hint: "[domain] [--verbose]"
---

# AgentMind Status

Show the current learning status. Display the results from the status command below:

!`"${CLAUDE_PLUGIN_ROOT}/scripts/lib/run.sh" instinct-manager status $ARGUMENTS 2>/dev/null`

Format the output as a clear, readable summary:

1. **Overview**: Total instincts by status (active / tentative / deprecated)
2. **Top Instincts**: Show the 5 highest-confidence instincts with their trigger → action
3. **Domain Breakdown**: Show instinct count per domain
4. **Recent Activity**: Last 5 learning events (new instincts, confidence changes, evolutions)
5. **Health Score**: Overall learning system health (based on active ratio, avg confidence)

If the status data is empty, explain that AgentMind is still in its initial observation phase
and needs more coding sessions to build up learned patterns.
