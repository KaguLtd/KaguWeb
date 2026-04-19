import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { appendFile, copyFile, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  StorageAccessResult,
  StorageDriver,
  StorageFileWriteResult,
  StorageWriteResult
} from "./storage-driver";
import { normalizeStorageRelativePath } from "./storage-path.utils";

@Injectable()
export class LocalStorageDriver extends StorageDriver {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  async ensureDirectory(relativePath: string): Promise<StorageWriteResult> {
    const normalizedPath = normalizeStorageRelativePath(relativePath);
    const absolutePath = this.resolvePath(normalizedPath);
    await mkdir(absolutePath, { recursive: true });

    return {
      absolutePath,
      relativePath: normalizedPath
    };
  }

  async pathExists(relativePath: string) {
    try {
      await stat(this.resolvePath(relativePath));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }

      throw error;
    }
  }

  async writeBuffer(relativeDirectory: string, filename: string, buffer: Buffer): Promise<StorageFileWriteResult> {
    const target = await this.prepareWriteTarget(relativeDirectory, filename);
    await writeFile(target.absolutePath, buffer);

    return target;
  }

  async writeFile(relativeDirectory: string, filename: string, sourcePath: string): Promise<StorageFileWriteResult> {
    const target = await this.prepareWriteTarget(relativeDirectory, filename);
    await copyFile(sourcePath, target.absolutePath);

    return target;
  }

  private async prepareWriteTarget(relativeDirectory: string, filename: string): Promise<StorageFileWriteResult> {
    const normalizedDirectory = normalizeStorageRelativePath(relativeDirectory);
    const absoluteDirectory = this.resolvePath(normalizedDirectory);
    await mkdir(absoluteDirectory, { recursive: true });

    const storageName = `${randomUUID()}-${filename}`;
    const relativePath = normalizeStorageRelativePath(`${normalizedDirectory}/${storageName}`);
    const absolutePath = this.resolvePath(relativePath);

    return {
      absolutePath,
      relativePath,
      relativeDirectory: normalizedDirectory
    };
  }

  async writeText(relativePath: string, contents: string): Promise<StorageWriteResult> {
    const normalizedPath = normalizeStorageRelativePath(relativePath);
    const absolutePath = this.resolvePath(normalizedPath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");

    return {
      absolutePath,
      relativePath: normalizedPath
    };
  }

  async appendJsonLine(relativePath: string, payload: unknown) {
    const normalizedPath = normalizeStorageRelativePath(relativePath);
    const absolutePath = this.resolvePath(normalizedPath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await appendFile(absolutePath, `${JSON.stringify(payload)}\n`, "utf8");
  }

  async moveTree(fromRelativePath: string, toRelativePath: string) {
    const source = this.resolvePath(fromRelativePath);
    const destination = this.resolvePath(toRelativePath);
    await mkdir(dirname(destination), { recursive: true });
    await rename(source, destination);
  }

  async removeTree(relativePath: string) {
    await rm(this.resolvePath(relativePath), { recursive: true, force: true });
  }

  async removeFiles(paths: string[]) {
    await Promise.all(paths.map((path) => rm(this.resolvePath(path), { force: true })));
  }

  async removeEmptyDirectories(paths: string[], stopAt: string) {
    const stopAtAbsolute = this.resolvePath(stopAt);
    const uniqueDirectories = [...new Set(paths.map((path) => normalizeStorageRelativePath(path)))];

    for (const directory of uniqueDirectories) {
      let current = this.resolvePath(directory);

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

  createReadStream(relativePath: string) {
    return createReadStream(this.resolvePath(relativePath));
  }

  async readText(relativePath: string, options?: { maxBytes?: number }) {
    const absolutePath = this.resolvePath(relativePath);
    const maxBytes = options?.maxBytes;

    if (!maxBytes) {
      return {
        contents: await readFile(absolutePath, "utf8"),
        truncated: false
      };
    }

    const handle = await open(absolutePath, "r");
    try {
      const buffer = Buffer.alloc(maxBytes + 1);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes + 1, 0);
      return {
        contents: buffer.subarray(0, Math.min(bytesRead, maxBytes)).toString("utf8"),
        truncated: bytesRead > maxBytes
      };
    } finally {
      await handle.close();
    }
  }

  async resolveAccess(relativePath: string): Promise<StorageAccessResult> {
    return {
      kind: "stream",
      stream: this.createReadStream(relativePath)
    };
  }

  private resolvePath(relativePath: string) {
    const normalizedPath = normalizeStorageRelativePath(relativePath);
    const storageRoot = this.configService.getOrThrow<string>("STORAGE_ROOT");
    return resolve(storageRoot, normalizedPath);
  }
}
