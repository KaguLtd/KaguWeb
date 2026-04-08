import path from "node:path";
import { workspaceRoot } from "./config.js";
import { runCommand } from "./runner.js";

async function main() {
  const cwd = workspaceRoot;
  await runCommand("npm.cmd", ["run", "setup"], {
    cwd,
    label: "tester setup"
  });
  await runCommand("npm.cmd", ["run", "simulate"], {
    cwd,
    label: "tester simulate"
  });
  await runCommand("npm.cmd", ["run", "ui"], {
    cwd,
    label: "tester ui"
  });
  await runCommand("npm.cmd", ["run", "report"], {
    cwd,
    label: "tester report"
  });
}

void main();
