import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TesterConfig } from "./types.js";

export const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const runtimeRoot = path.join(workspaceRoot, "runtime");
export const chartsRoot = path.join(workspaceRoot, "charts");
export const rawRoot = path.join(workspaceRoot, "raw");
export const screenshotsRoot = path.join(workspaceRoot, "screenshots");
export const assetsRoot = path.join(workspaceRoot, "runtime", "assets");

export async function loadConfig(): Promise<TesterConfig> {
  const configPath = path.join(workspaceRoot, "tester.config.json");
  const raw = await readFile(configPath, "utf8");
  return JSON.parse(raw) as TesterConfig;
}
