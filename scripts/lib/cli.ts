#!/usr/bin/env npx tsx
// =============================================================================
// AgentMind - Unified CLI
//
// Usage: agentmind <command> [options]
//
// Commands:
//   status [domain]              Show learning overview
//   list [--domain X] [--agent Y] List instincts
//   approve <id>                 Approve an instinct
//   reject <id>                  Reject an instinct
//   promote <id>                 Strongly endorse an instinct
//   demote <id>                  Strongly reject an instinct
//   evolve                       Run full evolution cycle
//   preferences [--days N]       Detect preferences from observations
//   search <keyword>             Search instincts
//   export [file]                Export instincts
//   import <file>                Import instincts
//   version                      Show version
// =============================================================================

const command = process.argv[2] || "status";
const args = process.argv.slice(3);

async function main() {
  switch (command) {
    case "version":
    case "--version":
    case "-v":
      console.log("agentmind v1.0.0");
      break;

    case "evolve":
      // Delegate to evolution engine
      await import("./evolution.js");
      break;

    case "preferences":
    case "prefs":
      // Delegate to preference detector
      process.argv = ["node", "preference-detector.ts", "detect", ...args];
      await import("./preference-detector.js");
      break;

    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;

    default:
      // All other commands go to instinct-manager
      process.argv = ["node", "instinct-manager.ts", command, ...args];
      await import("./instinct-manager.js");
      break;
  }
}

function printHelp() {
  console.log(`
AgentMind — Agent Self-Learning Memory System

Usage: agentmind <command> [options]

Learning:
  status [domain]              Show learning overview
  list [--domain X] [--agent Y] List instincts
  search <keyword>             Search instincts
  preferences [--days N]       Detect preferences

Feedback:
  approve <id>                 Approve an instinct (human +0.3)
  reject <id>                  Reject an instinct (human -0.3)
  promote <id>                 Strongly endorse (human → 1.0)
  demote <id>                  Strongly reject (human → 0.0)

Evolution:
  evolve                       Run cluster + abstract + degrade cycle
  evolve-candidates            Show evolution candidates
  tree                         Show evolution tree

Data:
  export [file]                Export instincts to JSON
  import <file>                Import instincts from JSON
  dashboard-data               Output dashboard JSON

Options:
  --agent <id>                 Filter by agent ID (multi-agent mode)
  --domain <name>              Filter by domain
  --days <n>                   Observation window for preferences

Environment:
  CLAUDE_PLUGIN_ROOT           Plugin data directory
  AGENTMIND_AGENT_ID           Default agent ID for multi-agent mode
`);
}

main().catch(console.error);
