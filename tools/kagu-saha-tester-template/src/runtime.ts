import { spawn } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { TesterConfig } from "./types.js";
import { ensureDir } from "./utils.js";

type ManagedProcess = {
  kind: "api" | "web";
  process: import("node:child_process").ChildProcess;
  stdout: WriteStream;
  stderr: WriteStream;
};

function spawnWindowsNpm(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  stdout: WriteStream,
  stderr: WriteStream
) {
  const child = spawn(
    process.env.ComSpec ?? "cmd.exe",
    ["/d", "/s", "/c", `npm.cmd ${args.join(" ")}`],
    {
      cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  return child;
}

export async function startIsolatedRuntime(
  config: TesterConfig,
  options: {
    api: boolean;
    web: boolean;
    runtimeRoot: string;
  }
) {
  const managed: ManagedProcess[] = [];
  await ensureDir(options.runtimeRoot);

  if (options.api) {
    managed.push(await startApi(config, options.runtimeRoot));
    await waitForHttp(`${config.runtime.apiOrigin}${config.runtime.apiBasePath}/auth/login`, "POST");
  }

  if (options.web) {
    managed.push(await startWeb(config, options.runtimeRoot));
    await waitForHttp(`${config.runtime.webOrigin}/login`, "GET");
  }

  return {
    async stop() {
      for (const entry of managed.reverse()) {
        if (entry.process.pid) {
          await killProcessTree(entry.process.pid);
        }
        entry.stdout.end();
        entry.stderr.end();
      }
    }
  };
}

async function startApi(config: TesterConfig, runtimeRoot: string): Promise<ManagedProcess> {
  const stdoutFile = createWriteStream(path.join(runtimeRoot, "tester-api.out.log"), { flags: "w" });
  const stderrFile = createWriteStream(path.join(runtimeRoot, "tester-api.err.log"), { flags: "w" });
  const child = spawnWindowsNpm(
    config.repoRoot,
    ["run", "start:dev", "--workspace", "@kagu/api"],
    {
      ...process.env,
      DATABASE_URL: config.runtime.databaseUrl,
      PORT: "4300",
      WEB_ORIGIN: config.runtime.webOrigin,
      STORAGE_ROOT: config.runtime.storageRoot
    },
    stdoutFile,
    stderrFile
  );
  return { kind: "api", process: child, stdout: stdoutFile, stderr: stderrFile };
}

async function startWeb(config: TesterConfig, runtimeRoot: string): Promise<ManagedProcess> {
  const stdoutFile = createWriteStream(path.join(runtimeRoot, "tester-web.out.log"), { flags: "w" });
  const stderrFile = createWriteStream(path.join(runtimeRoot, "tester-web.err.log"), { flags: "w" });
  const child = spawnWindowsNpm(
    config.repoRoot,
    ["run", "dev", "--workspace", "@kagu/web", "--", "--hostname", "127.0.0.1", "--port", "3300"],
    {
      ...process.env,
      NEXT_PUBLIC_API_URL: "/api",
      NEXT_SERVER_API_PROXY_URL: `${config.runtime.apiOrigin}${config.runtime.apiBasePath}`
    },
    stdoutFile,
    stderrFile
  );
  return { kind: "web", process: child, stdout: stdoutFile, stderr: stderrFile };
}

async function waitForHttp(url: string, method: "GET" | "POST") {
  const started = Date.now();
  while (Date.now() - started < 120000) {
    try {
      const response = await fetch(url, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: method === "POST" ? JSON.stringify({ username: "_probe_", password: "_probe_" }) : undefined
      });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Retry until timeout.
    }
    await delay(1500);
  }
  throw new Error(`Runtime endpoint did not become ready: ${url}`);
}

async function killProcessTree(pid: number) {
  await new Promise<void>((resolve) => {
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore"
    });
    killer.on("close", () => resolve());
    killer.on("error", () => resolve());
  });
  await delay(500);
}
