---
name: reflect
description: Review and approve pending learnings — human-in-the-loop instinct validation
disable-model-invocation: true
context: fork
agent: general-purpose
---

# AgentMind Learning Review

Review pending learning candidates that need your approval.

## Pending Candidates

!`"${CLAUDE_PLUGIN_ROOT}/scripts/lib/run.sh" instinct-manager pending 2>/dev/null`

## Review Process

For each pending candidate above, present it clearly and ask the user:

1. **Show**: The trigger condition, recommended action, confidence score, and supporting evidence
2. **Ask**: "Approve ✅ / Reject ❌ / Modify ✏️ ?"
3. **Process**:
   - **Approve**: Set status to `active`, boost human approval score by +0.3
   - **Reject**: Set status to `deprecated`, add rejection reason
   - **Modify**: Let user edit the trigger/action, then set to `active`

After reviewing all candidates, run:

!`"${CLAUDE_PLUGIN_ROOT}/scripts/lib/run.sh" instinct-manager save 2>/dev/null`

Show a summary: "Reviewed X candidates: Y approved, Z rejected, W modified."

If there are no pending candidates, tell the user their learning queue is empty and suggest
using `/agentmind:status` to see current instincts or `/agentmind:evolve` to check for
evolution opportunities.
