import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { diskStorage } from "multer";
import { MAX_FILE_COUNT, MAX_FILE_SIZE, sanitizeFilename } from "./file-policy";

const DEFAULT_UPLOAD_TEMP_ROOT = "./runtime/tmp/uploads";

function resolveUploadTempRoot() {
  return resolve(process.env.UPLOAD_TEMP_ROOT?.trim() || DEFAULT_UPLOAD_TEMP_ROOT);
}

function ensureUploadTempRoot() {
  const root = resolveUploadTempRoot();
  mkdirSync(root, { recursive: true });
  return root;
}

export const uploadDiskStorageOptions = {
  storage: diskStorage({
    destination: (_request, _file, callback) => {
      callback(null, ensureUploadTempRoot());
    },
    filename: (_request, file, callback) => {
      const safeName = sanitizeFilename(file.originalname) || "upload";
      callback(null, `${randomUUID()}-${safeName}`);
    }
  }),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILE_COUNT
  }
};

export async function cleanupUploadedTempFiles(files: Express.Multer.File[] | undefined) {
  if (!files?.length) {
    return;
  }

  await Promise.all(
    files.map(async (file) => {
      if (!file.path) {
        return;
      }

      await rm(file.path, { force: true });
    })
  );
}
