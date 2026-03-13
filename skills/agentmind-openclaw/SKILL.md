# AgentMind for OpenClaw

Self-learning memory system that makes AI agents understand you better over time.
Automatically detects your preferences, workflows, and code style from interactions.

## Trigger
Use when user asks about learned preferences, wants to review agent behavior patterns,
or when starting a session that should leverage previously learned knowledge.

## Commands
- `/agentmind status` — Show learning overview
- `/agentmind instincts` — List learned behaviors
- `/agentmind evolve` — Trigger evolution cycle
- `/agentmind preferences` — Show detected preferences
- `/agentmind approve <id>` — Approve a learned behavior
- `/agentmind reject <id>` — Reject a learned behavior

## How It Works (OpenClaw Mode)

Unlike the Claude Code plugin which uses lifecycle hooks, the OpenClaw adaptation works through:

1. **Memory Analysis**: Reads `memory/*.md` files and conversation history to detect patterns
2. **Bootstrap Injection**: High-confidence instincts are injected via BOOTSTRAP.md
3. **Periodic Learning**: A cron job runs `analyze` to discover new patterns from recent interactions
4. **Manual Feedback**: Users can approve/reject instincts through chat commands

## Setup

```bash
# Install as OpenClaw skill
cp -r skills/agentmind-openclaw ~/.openclaw/skills/agentmind/

# Create cron for periodic learning (every 6 hours)
openclaw cron create --name "AgentMind Learn" \
  --schedule "0 */6 * * *" \
  --task "Run AgentMind analysis on recent memory files"
```

## Data Location
- Instincts: `~/.openclaw/workspace/agentmind/instincts.json`
- Observations: `~/.openclaw/workspace/agentmind/observations/`

## Integration with OpenClaw Memory
AgentMind complements OpenClaw's built-in `memory_search` (pull-based) with
push-based injection — high-confidence instincts are automatically included
in the agent's context without needing to search for them.
