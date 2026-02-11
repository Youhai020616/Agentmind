---
name: dashboard
description: Open AgentMind web dashboard for visual exploration of learning data
disable-model-invocation: true
---

# AgentMind Dashboard

Launch the AgentMind web dashboard for visual exploration.

!`"${CLAUDE_PLUGIN_ROOT}/scripts/lib/run.sh" instinct-manager dashboard-data 2>/dev/null`

## Dashboard Information

The AgentMind web dashboard provides visual exploration of your learning data:

- **Instinct Overview**: Interactive cards showing all learned instincts
- **Confidence Radar**: 3D visualization of frequency × effectiveness × human scores
- **Evolution Tree**: Visual tree of how instincts evolved into patterns and strategies
- **Domain Map**: Breakdown of learning across different coding domains
- **Trend Charts**: Confidence changes over time
- **Session Timeline**: When and what was learned in each session

### Local Dashboard (MVP)

For the MVP version, display a rich text summary of the dashboard data above.
The web-based dashboard will be available in a future version.

### Quick Stats

Show key metrics:
- Total active instincts
- Average confidence score
- Most active domain
- Last learning event
- Evolution depth (max level reached)
- Sessions analyzed
