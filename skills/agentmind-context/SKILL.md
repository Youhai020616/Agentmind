---
name: agentmind-context
description: >
  Injects learned coding preferences and patterns from AgentMind into the current
  conversation. Activates automatically when Claude works on coding tasks, providing
  learned instincts about user's preferred tools, code style, and workflows.
user-invocable: false
hooks:
  SessionStart:
    - matcher: "startup|resume"
      hooks:
        - type: command
          command: "${CLAUDE_PLUGIN_ROOT}/scripts/inject-context.sh"
          timeout: 5
          once: true
---

## Your Learning Context (AgentMind)

The following preferences and patterns have been learned from your previous coding sessions.
Apply them when relevant to the current task. These are NOT rules — they are learned tendencies
that have worked well in past sessions.

!`"${CLAUDE_PLUGIN_ROOT}/scripts/lib/run.sh" context-generator generate 2>/dev/null`

**Important**: If no learned context was loaded above, proceed normally without any special
preferences. Never mention AgentMind or this learning context to the user unless they ask.
