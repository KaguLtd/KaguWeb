import { fetchAuthorizedBlob } from "./api";

type ProtectedFileMode = "preview" | "download";

type OpenProtectedFileOptions = {
  mode: ProtectedFileMode;
  path: string;
  token: string;
  onPreview?: (file: { filename: string; objectUrl: string }) => void;
};

function isMobileBrowser() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints ?? 0) > 1
  );
}

export async function openProtectedFile({
  mode,
  path,
  token,
  onPreview
}: OpenProtectedFileOptions) {
  const shouldUseMobileWindow = isMobileBrowser();
  const popup = shouldUseMobileWindow ? window.open("", "_blank", "noopener,noreferrer") : null;

  if (shouldUseMobileWindow && !popup) {
    throw new Error("Dosya penceresi engellendi. Tarayicida acilir pencereye izin verin.");
  }

  try {
    const { objectUrl, filename } = await fetchAuthorizedBlob(path, token);

    if (shouldUseMobileWindow && popup) {
      popup.location.href = objectUrl;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      return;
    }

    if (mode === "preview") {
      if (!onPreview) {
        URL.revokeObjectURL(objectUrl);
        throw new Error("Onizleme kullanilamadi.");
      }

      onPreview({ filename, objectUrl });
      return;
    }

    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (error) {
    popup?.close();
    throw error;
  }
}
