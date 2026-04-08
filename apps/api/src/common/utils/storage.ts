import { appendFile, mkdir, readdir, rename, rm, stat, writeFile } from "fs/promises";
import { dirname, isAbsolute, join, normalize, resolve } from "path";
import { randomUUID } from "crypto";

export async function ensureDir(pathname: string) {
  await mkdir(pathname, { recursive: true });
}

export function getStorageRoot(): string {
  return process.env.STORAGE_ROOT ?? join(process.cwd(), "..", "..", "storage");
}

export function normalizeStorageRelativePath(pathname: string) {
  const normalized = normalize(pathname).replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (
    !normalized ||
    normalized === "." ||
    isAbsolute(pathname) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error(`Gecersiz storage yolu: ${pathname}`);
  }
  return normalized;
}

export function resolveStoragePath(pathname: string) {
  const relativePath = normalizeStorageRelativePath(pathname);
  return resolve(getStorageRoot(), relativePath);
}

export async function writeBufferToStorage(relativeDirectory: string, filename: string, buffer: Buffer) {
  const normalizedDirectory = normalizeStorageRelativePath(relativeDirectory);
  const absoluteDirectory = resolveStoragePath(normalizedDirectory);
  await ensureDir(absoluteDirectory);
  const storageName = `${randomUUID()}-${filename}`;
  const relativePath = normalizeStorageRelativePath(join(normalizedDirectory, storageName));
  const destination = resolveStoragePath(relativePath);
  await writeFile(destination, buffer);
  return {
    absolutePath: destination,
    relativePath,
    relativeDirectory: normalizedDirectory
  };
}

export async function writeTextToStorage(relativePath: string, contents: string) {
  const normalizedPath = normalizeStorageRelativePath(relativePath);
  const absolutePath = resolveStoragePath(normalizedPath);
  await ensureDir(dirname(absolutePath));
  await writeFile(absolutePath, contents, "utf8");
  return {
    absolutePath,
    relativePath: normalizedPath
  };
}

export async function appendTextToStorage(relativePath: string, contents: string) {
  const normalizedPath = normalizeStorageRelativePath(relativePath);
  const absolutePath = resolveStoragePath(normalizedPath);
  await ensureDir(dirname(absolutePath));
  await appendFile(absolutePath, contents, "utf8");
  return {
    absolutePath,
    relativePath: normalizedPath
  };
}

export async function appendJsonLineToStorage(relativePath: string, payload: unknown) {
  await appendTextToStorage(relativePath, `${JSON.stringify(payload)}\n`);
}

export async function moveStorageTree(fromRelativePath: string, toRelativePath: string) {
  const source = resolveStoragePath(fromRelativePath);
  const destination = resolveStoragePath(toRelativePath);
  await ensureDir(dirname(destination));
  await rename(source, destination);
}

export async function storagePathExists(relativePath: string) {
  try {
    await stat(resolveStoragePath(relativePath));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function removeStorageTree(relativePath: string) {
  await rm(resolveStoragePath(relativePath), { recursive: true, force: true });
}

export async function removeStoredFiles(paths: string[]) {
  await Promise.all(paths.map((path) => rm(resolveStoragePath(path), { force: true })));
}

export async function removeEmptyStorageDirectories(paths: string[], stopAt: string) {
  const stopAtAbsolute = resolveStoragePath(stopAt);
  const uniqueDirectories = [...new Set(paths.map((path) => normalizeStorageRelativePath(path)))];

  for (const directory of uniqueDirectories) {
    let current = resolveStoragePath(directory);

    while (current.startsWith(stopAtAbsolute) && current !== stopAtAbsolute) {
      try {
        const entries = await readdir(current);
        if (entries.length > 0) {
          break;
        }

        await rm(current, { recursive: false, force: false });
        current = dirname(current);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ENOTEMPTY") {
          break;
        }
        throw error;
      }
    }
  }
}
