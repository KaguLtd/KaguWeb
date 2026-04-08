import { ensureFileAllowed, isInlinePreviewable, sanitizeFilename } from "../src/common/utils/file-policy";

describe("file policy", () => {
  it("sanitizes filenames", () => {
    expect(sanitizeFilename("Klasik Plan 01.DWG")).toBe("klasik-plan-01.dwg");
  });

  it("allows business formats", () => {
    expect(() => ensureFileAllowed("plan.dwg")).not.toThrow();
    expect(() => ensureFileAllowed("rapor.xlsx")).not.toThrow();
  });

  it("blocks scripts and executables", () => {
    expect(() => ensureFileAllowed("script.ps1")).toThrow();
    expect(() => ensureFileAllowed("run.exe")).toThrow();
  });

  it("knows previewable files", () => {
    expect(isInlinePreviewable("foto.jpg")).toBe(true);
    expect(isInlinePreviewable("rapor.pdf")).toBe(true);
    expect(isInlinePreviewable("kesif.dwg")).toBe(false);
  });
});
