import { isAbsolute, normalize } from "node:path";

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
