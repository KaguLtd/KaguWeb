import { spawn } from "node:child_process";
import path from "node:path";

function quoteCmdValue(value: string) {
  if (!/[\s"]/u.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

export async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    allowFailure?: boolean;
    stdin?: string;
    label?: string;
  }
) {
  const env = { ...process.env, ...options.env };
  const isWindowsScript = process.platform === "win32" && /\.(cmd|bat)$/iu.test(command);
  const executable = isWindowsScript ? process.env.ComSpec ?? "cmd.exe" : command;
  const finalArgs = isWindowsScript
    ? ["/d", "/s", "/c", `${quoteCmdValue(command)} ${args.map(quoteCmdValue).join(" ")}`]
    : args;

  return await new Promise<{ stdout: string; stderr: string; exitCode: number | null }>(
    (resolve, reject) => {
      const child = spawn(executable, finalArgs, {
        cwd: options.cwd,
        env,
        shell: false,
        windowsHide: true
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      if (options.stdin) {
        child.stdin.write(options.stdin);
        child.stdin.end();
      }

      child.on("error", (error) => reject(error));
      child.on("close", (code) => {
        if (code !== 0 && !options.allowFailure) {
          const detail = `${options.label ?? path.basename(command)} exited with ${code}\n${stderr || stdout}`;
          reject(new Error(detail.trim()));
          return;
        }

        resolve({ stdout, stderr, exitCode: code });
      });
    }
  );
}
