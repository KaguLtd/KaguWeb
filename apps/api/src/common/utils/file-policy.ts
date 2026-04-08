import { extname } from "path";

const blockedExtensions = new Set([
  ".exe",
  ".dll",
  ".bat",
  ".cmd",
  ".com",
  ".msi",
  ".ps1",
  ".sh",
  ".bash",
  ".zsh",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".jar",
  ".vb",
  ".vbs",
  ".scr",
  ".pif",
  ".php",
  ".asp",
  ".aspx",
  ".jsp",
  ".html",
  ".htm",
  ".svg"
]);

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
const inlineExtensions = new Set([".pdf", ...imageExtensions]);

export const MAX_FILE_SIZE = 250 * 1024 * 1024;

export function sanitizeFilename(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

export function fileExtension(name: string): string {
  return extname(name).toLowerCase();
}

export function ensureFileAllowed(name: string) {
  const extension = fileExtension(name);
  if (blockedExtensions.has(extension)) {
    throw new Error(`Blocked file extension: ${extension}`);
  }
}

export function isImage(name: string): boolean {
  return imageExtensions.has(fileExtension(name));
}

export function isInlinePreviewable(name: string): boolean {
  return inlineExtensions.has(fileExtension(name));
}

export function fileTitleFromName(name: string): string {
  const extension = extname(name);
  return name.slice(0, name.length - extension.length) || name;
}

