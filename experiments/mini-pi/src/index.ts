import * as readline from "node:readline";
import { MiniAgentHarness } from "./agent-loop.js";
import { createBuiltinTools } from "./tools.js";
import { TreeSessionStorage } from "./session.js";
import { RobustModelGateway } from "./gateway.js";
import { TelemetryCollector } from "./telemetry.js";

async function main() {
  console.log("\x1b[36m\x1b[1m=== Mini-Pi Coding Agent v1.0.0 ===\x1b[0m");
  console.log("Type your prompt and press Enter. Type 'exit' to quit.\n");

  const cwd = process.cwd();
  const tools = createBuiltinTools(cwd);
  const session = new TreeSessionStorage("./.mini-pi/session.jsonl");
  await session.init();

  const gateway = new RobustModelGateway();
  const telemetry = new TelemetryCollector();

  const harness = new MiniAgentHarness(tools, gateway, session, telemetry);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = () => {
    rl.question("\x1b[32m\x1b[1mmini-pi>\x1b[0m ", async (input) => {
      const prompt = input.trim();
      if (prompt === "exit" || prompt === "quit") {
        console.log(telemetry.generateReport());
        process.exit(0);
      }

      if (prompt) {
        try {
          console.log("\x1b[90mThinking and executing...\x1b[0m");
          const answer = await harness.runTurn(prompt);
          console.log(`\n\x1b[37m${answer}\x1b[0m\n`);
        } catch (err: any) {
          console.error(`\x1b[31mError: ${err.message}\x1b[0m\n`);
        }
      }
      ask();
    });
  };

  ask();
}

main().catch(console.error);
