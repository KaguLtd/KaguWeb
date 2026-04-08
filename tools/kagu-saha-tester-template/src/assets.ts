import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureDir } from "./utils.js";

export async function ensureSampleAssets(assetsRoot: string) {
  await ensureDir(assetsRoot);

  const pdfContent = `%PDF-1.3
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Count 1 /Kids [3 0 R] >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 67 >>
stream
BT /F1 18 Tf 36 96 Td (Kagu Tester PDF ornek dosyasi) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000241 00000 n 
0000000360 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
430
%%EOF`;

  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgJ2P2iQAAAAASUVORK5CYII=";

  await writeFile(path.join(assetsRoot, "ornek-teknik-rapor.pdf"), pdfContent, "binary");
  await writeFile(path.join(assetsRoot, "saha-fotograf.png"), Buffer.from(pngBase64, "base64"));
  await writeFile(path.join(assetsRoot, "mekanik-izleme.txt"), "Kagu tester mekanik saha notu\n", "utf8");
  await writeFile(path.join(assetsRoot, "yerlesim-plani.dwg"), "DWG PLACEHOLDER CONTENT\n", "utf8");
  await writeFile(path.join(assetsRoot, "gecersiz-arac.exe"), "MZ", "utf8");
}

export function buildMainUploadForm(variant = "core") {
  const form = new FormData();
  form.append(
    "files",
    new Blob([Buffer.from("Kagu ana dokuman", "utf8")], { type: "application/pdf" }),
    `${variant}-main-ozet.pdf`
  );
  form.append(
    "files",
    new Blob([Buffer.from("DWG TEST", "utf8")], { type: "application/octet-stream" }),
    `${variant}-yerlesim.dwg`
  );
  return form;
}

export function buildFieldEntryForm(note: string, variant: "image" | "document" | "mixed") {
  const form = new FormData();
  form.append("note", note);

  if (variant === "image" || variant === "mixed") {
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgJ2P2iQAAAAASUVORK5CYII=";
    form.append(
      "files",
      new Blob([Buffer.from(pngBase64, "base64")], { type: "image/png" }),
      "saha-kaydi.png"
    );
  }

  if (variant === "document" || variant === "mixed") {
    form.append(
      "files",
      new Blob([Buffer.from("Kagu saha tutanagi", "utf8")], { type: "application/pdf" }),
      "saha-tutanak.pdf"
    );
  }

  return form;
}

export function buildInvalidFieldEntryForm(note: string) {
  const form = new FormData();
  form.append("note", note);
  form.append(
    "files",
    new Blob([Buffer.from("MZ", "utf8")], { type: "application/octet-stream" }),
    "zararli.exe"
  );
  return form;
}
