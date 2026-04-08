import path from "node:path";
import {
  assetsRoot,
  chartsRoot,
  loadConfig,
  rawRoot,
  runtimeRoot,
  screenshotsRoot,
  workspaceRoot
} from "./config.js";
import { ensureSampleAssets } from "./assets.js";
import { runCommand } from "./runner.js";
import { ensureDir, resetDir, writeJson } from "./utils.js";

async function main() {
  const config = await loadConfig();
  await ensureDir(workspaceRoot);
  await resetDir(runtimeRoot);
  await resetDir(chartsRoot);
  await resetDir(rawRoot);
  await resetDir(screenshotsRoot);
  await ensureSampleAssets(assetsRoot);

  await runCommand("npm.cmd", ["run", "db:ensure-local"], {
    cwd: config.repoRoot,
    env: {
      ...process.env,
      DATABASE_URL: config.runtime.databaseUrl
    },
    label: "db:ensure-local"
  });

  const adminDatabaseUrl = config.runtime.databaseUrl.replace(
    /\/([^/?]+)(\?schema=.*)$/u,
    "/postgres$2"
  );
  const dbNameMatch = config.runtime.databaseUrl.match(/\/([^/?]+)\?schema=/u);
  const dbName = dbNameMatch?.[1];
  if (!dbName) {
    throw new Error("databaseUrl icinden veritabani adi ayrilamadi.");
  }

  await runCommand("npx.cmd", ["prisma", "db", "execute", "--stdin", "--url", adminDatabaseUrl], {
    cwd: config.repoRoot,
    stdin: `
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${dbName}'
  AND pid <> pg_backend_pid();
`,
    label: "terminate tester db sessions"
  });

  await runCommand("npx.cmd", ["prisma", "db", "execute", "--stdin", "--url", adminDatabaseUrl], {
    cwd: config.repoRoot,
    stdin: `DROP DATABASE IF EXISTS "${dbName}";`,
    label: "drop tester database"
  });

  await runCommand("npx.cmd", ["prisma", "db", "execute", "--stdin", "--url", adminDatabaseUrl], {
    cwd: config.repoRoot,
    stdin: `CREATE DATABASE "${dbName}";`,
    label: "reset tester database"
  });

  await runCommand("npm.cmd", ["run", "db:init"], {
    cwd: config.repoRoot,
    env: {
      ...process.env,
      DATABASE_URL: config.runtime.databaseUrl
    },
    label: "db:init"
  });

  await runCommand(
    "npm.cmd",
    [
      "run",
      "db:bootstrap-admin",
      "--",
      "--username",
      config.bootstrapAdmin.username,
      "--displayName",
      config.bootstrapAdmin.displayName,
      "--password",
      config.bootstrapAdmin.password
    ],
    {
      cwd: config.repoRoot,
      env: {
        ...process.env,
        DATABASE_URL: config.runtime.databaseUrl
      },
      label: "bootstrap admin"
    }
  );

  await writeJson(path.join(rawRoot, "setup-summary.json"), {
    generatedAt: new Date().toISOString(),
    config,
    notes: [
      "Izole runtime klasorleri temizlendi.",
      "kagu_tester veritabani sifirlandi ve migrationlar uygulandi.",
      "Bootstrap admin olusturuldu."
    ]
  });
}

void main();
