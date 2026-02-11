---
name: evolve
description: Analyze instincts for evolution — cluster related instincts into patterns and strategies
disable-model-invocation: true
context: fork
agent: general-purpose
allowed-tools: Read, Grep, Glob, Bash
---

# AgentMind Evolution Analysis

Analyze current instincts for evolution opportunities.

## Current Evolution Candidates

!`"${CLAUDE_PLUGIN_ROOT}/scripts/lib/run.sh" instinct-manager evolve-candidates 2>/dev/null`

## Evolution Process

For each evolution candidate cluster:

1. **Display the cluster**: Show all related instincts grouped together
2. **Propose evolution**: Suggest what Pattern or Strategy could emerge
3. **Show the abstract principle**: What general principle do these instincts embody?
4. **List transferable contexts**: Where else could this principle apply?
5. **Ask for approval**: "Evolve these into a Pattern? Y/N"

For approved evolutions:
- Create the new Pattern/Strategy entry
- Link source instincts to the evolved entity
- Calculate new confidence (source avg × 0.8)
- Show the updated evolution tree

## Evolution Tree

After processing, display the current evolution tree:

!`"${CLAUDE_PLUGIN_ROOT}/scripts/lib/run.sh" instinct-manager tree 2>/dev/null`

If no evolution candidates exist, explain that the system needs more high-confidence
instincts (3+ related instincts with confidence > 0.5) before evolution can occur.
