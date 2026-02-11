<p align="center">
  <img src="./agentmind-hero-minimal.png" alt="AgentMind" width="800">
</p>

# AgentMind — Self-Learning Memory System for AI Agents

> **Give your AI Agent memory, let it grow, and make it understand you better over time.**

[中文文档](./README.zh-CN.md)

AgentMind is a Claude Code Plugin that observes user-agent interactions, automatically learns coding preferences, workflow patterns, and best practices, then intelligently applies them in future sessions.

## Core Philosophy

```
Observe → Understand → Memorize → Apply → Validate → Evolve
   O          U           M         A         V         E
```

## Installation

### Option 1: Marketplace (Recommended)

```bash
# Run in Claude Code
/plugin marketplace add agentmind/agentmind-plugin
/plugin install agentmind@agentmind-marketplace
```

### Option 2: Local Development

```bash
# Clone the project
git clone https://github.com/Youhai020616/Agentmind.git
cd Agentmind

# Install dependencies
npm install

# Load in development mode
claude --plugin-dir .
```

## Features

### Automatic Learning (Zero Configuration)

AgentMind runs automatically in the background after installation:

- **Intent Observation** — Detects user corrections and preference expressions
- **Execution Observation** — Records tool call patterns (no code content stored)
- **Evaluation Observation** — Tracks error patterns and resolutions
- **Context Injection** — Automatically loads learned preferences at each session start

### Commands

| Command | Description |
|---------|-------------|
| `/agentmind:status` | View learning status overview |
| `/agentmind:instincts` | Browse and manage learned instincts |
| `/agentmind:reflect` | Review pending learning outcomes |
| `/agentmind:evolve` | Analyze and execute instinct evolution |
| `/agentmind:dashboard` | Visualize learning data |

### Confidence System

AgentMind uses a three-dimensional composite confidence score:

```
Composite Confidence = Frequency × 0.35 + Effectiveness × 0.40 + Human × 0.25
```

| Confidence | Level | Behavior |
|------------|-------|----------|
| ≥ 0.8 | Core | Auto-injected into agent context |
| 0.6–0.8 | Strong | Auto-suggested when contextually relevant |
| 0.4–0.6 | Moderate | Provided only when asked |
| 0.2–0.4 | Tentative | Silent observation, not applied |
| < 0.2 | Deprecated | Marked for deletion |

### Four-Level Evolution

```
Level 0: Instinct    — Single trigger → Single action
Level 1: Pattern     — Multi-step ordered sequence
Level 2: Strategy    — Transferable decision principles
Level 3: Expert      — Complete domain capability set
```

## Project Structure

```
agentmind/
├── .claude-plugin/
│   ├── plugin.json              # Plugin manifest
│   └── marketplace.json         # Marketplace definition
├── skills/                      # Auto-activated Skills
│   ├── agentmind-context/       # Learning context injection
│   └── agentmind-guide/         # Behavior guidance
├── commands/                    # User commands
│   ├── status.md
│   ├── reflect.md
│   ├── evolve.md
│   ├── instincts.md
│   └── dashboard.md
├── agents/                      # Dedicated Agents
│   ├── learning-analyst.md
│   └── evolution-engine.md
├── hooks/
│   └── hooks.json               # Event hook registration
├── scripts/                     # Hook scripts
│   ├── observe-intent.sh
│   ├── observe-execution.sh
│   ├── observe-evaluation.sh
│   ├── inject-context.sh
│   ├── analyze-session.sh
│   ├── pre-compact-save.sh
│   └── lib/                     # Core TypeScript library
│       ├── types.ts
│       ├── storage.ts
│       ├── detector.ts
│       ├── confidence.ts
│       ├── instinct-manager.ts
│       ├── context-generator.ts
│       └── run.sh
├── data/                        # Runtime data (.gitignore)
├── docs/                        # Design documents
│   ├── 00-README.md
│   ├── 01-system-architecture.md
│   ├── 02-observation-layer.md
│   ├── 03-analysis-engine.md
│   ├── 04-confidence-system.md
│   ├── 05-evolution-system.md
│   ├── 06-api-sdk-design.md
│   ├── 07-commercialization.md
│   ├── 08-implementation-roadmap.md
│   ├── 09-market-analysis.md
│   └── 10-claude-code-plugin-guide.md
├── package.json
├── tsconfig.json
└── README.md
```

## Development

### Prerequisites

- Node.js 20+
- Claude Code (latest)
- jq (shell script dependency)

### Local Development

```bash
# Install dependencies
npm install

# Grant execute permissions to scripts
chmod +x scripts/*.sh

# Start Claude Code in development mode
claude --plugin-dir .

# Debug mode (view Hook output)
claude --plugin-dir . --debug
```

### Run Tests

```bash
npm test
```

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

## Architecture

<p align="center">
  <img src="./agentmind-architecture-minimal.png" alt="AgentMind Architecture" width="800">
</p>

### Data Flow

```
User interacts with Claude Code
        │
        ▼
┌─────────────────────────────────┐
│  Observation Layer (Hooks, async)│
│  Intent · Execution · Evaluation │
│  → JSONL records                 │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Analysis Engine (Session End)   │
│  Pattern detection · Candidate   │
│  generation → instincts.json     │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Context Injection (Session Start)│
│  Confidence filtering · Formatting│
│  → Inject into Agent System Prompt│
└─────────────────────────────────┘
```

### Hook Mapping

| Event | Script | Mode | Purpose |
|-------|--------|------|---------|
| SessionStart | inject-context.sh | Sync | Inject learning context |
| UserPromptSubmit | observe-intent.sh | Async | Intent layer observation |
| PreToolUse | observe-execution.sh | Async | Execution observation (pre) |
| PostToolUse | observe-execution.sh | Async | Execution observation (post) |
| PostToolUseFailure | observe-evaluation.sh | Async | Error pattern collection |
| Stop | analyze-session.sh | Async | Session analysis |
| PreCompact | pre-compact-save.sh | Sync | Save critical data |
| SessionEnd | analyze-session.sh | Sync | Final persistence |

## Privacy

AgentMind only stores **behavioral patterns**, never code content:

- Tool call sequences (e.g., `Grep → Read → Edit`)
- File extensions (`.ts`, `.tsx`) instead of file paths
- Error types (`TypeError`) instead of error details
- User correction patterns instead of conversation transcripts

All data is stored locally in the `data/` directory by default.

## Design Documents

Full design documentation is available in the `docs/` directory:

| Document | Content |
|----------|---------|
| [00-README](docs/00-README.md) | Project overview and document index |
| [01-system-architecture](docs/01-system-architecture.md) | Six-layer system architecture |
| [02-observation-layer](docs/02-observation-layer.md) | Four-layer observation system |
| [03-analysis-engine](docs/03-analysis-engine.md) | Analysis engine and causal reasoning |
| [04-confidence-system](docs/04-confidence-system.md) | Three-dimensional confidence system |
| [05-evolution-system](docs/05-evolution-system.md) | Four-level evolution mechanism |
| [06-api-sdk-design](docs/06-api-sdk-design.md) | API/SDK interface design |
| [07-commercialization](docs/07-commercialization.md) | Commercialization plan and pricing |
| [08-implementation-roadmap](docs/08-implementation-roadmap.md) | Phased implementation roadmap |
| [09-market-analysis](docs/09-market-analysis.md) | In-depth market analysis |
| [10-claude-code-plugin-guide](docs/10-claude-code-plugin-guide.md) | Claude Code Plugin development guide |

## Roadmap

- [x] Phase 0: Plugin skeleton and core files
- [ ] Phase 0.5: Script debugging and local testing
- [ ] Phase 1: Analysis engine enhancement + Confidence system
- [ ] Phase 2: Evolution system + Dashboard
- [ ] Phase 3: Marketplace release
- [ ] Phase 4: SDK extraction + Cloud version

## License

MIT
