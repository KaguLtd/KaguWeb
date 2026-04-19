export type StorageWriteResult = {
  absolutePath: string;
  relativePath: string;
};

export type StorageFileWriteResult = StorageWriteResult & {
  relativeDirectory: string;
};

export type StorageDownloadDisposition = "inline" | "attachment";

export type StorageAccessResult =
  | {
      kind: "stream";
      stream: NodeJS.ReadableStream;
    }
  | {
      kind: "redirect";
      url: string;
    };

export type StorageTextReadResult = {
  contents: string;
  truncated: boolean;
};

export abstract class StorageDriver {
  abstract ensureDirectory(relativePath: string): Promise<StorageWriteResult>;
  abstract pathExists(relativePath: string): Promise<boolean>;
  abstract writeBuffer(relativeDirectory: string, filename: string, buffer: Buffer): Promise<StorageFileWriteResult>;
  abstract writeFile(relativeDirectory: string, filename: string, sourcePath: string): Promise<StorageFileWriteResult>;
  abstract writeText(relativePath: string, contents: string): Promise<StorageWriteResult>;
  abstract appendJsonLine(relativePath: string, payload: unknown): Promise<void>;
  abstract moveTree(fromRelativePath: string, toRelativePath: string): Promise<void>;
  abstract removeTree(relativePath: string): Promise<void>;
  abstract removeFiles(paths: string[]): Promise<void>;
  abstract removeEmptyDirectories(paths: string[], stopAt: string): Promise<void>;
  abstract createReadStream(relativePath: string): NodeJS.ReadableStream;
  abstract readText(
    relativePath: string,
    options?: {
      maxBytes?: number;
    }
  ): Promise<StorageTextReadResult>;
  abstract resolveAccess(
    relativePath: string,
    options?: {
      disposition?: StorageDownloadDisposition;
      filename?: string;
      contentType?: string;
    }
  ): Promise<StorageAccessResult>;
}
