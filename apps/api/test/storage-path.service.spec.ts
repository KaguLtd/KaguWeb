import { StoragePathService } from "../src/storage/storage-path.service";

describe("StoragePathService", () => {
  const service = new StoragePathService();

  it("builds stable project scaffold paths", () => {
    expect(service.projectScaffoldDirectories("projects/test-proje")).toEqual([
      "projects/test-proje/main",
      "projects/test-proje/timeline",
      "projects/test-proje/logs",
      "projects/test-proje/meta"
    ]);
  });

  it("builds upload paths with normalized title segments", () => {
    expect(
      service.projectMainUploadDirectory("projects/test-proje", "Ana Dosya", new Date("2026-04-09T00:00:00.000Z"))
    ).toBe("projects/test-proje/main/2026-04-09/ana-dosya");
  });

  it("extracts the containing directory from a stored file path", () => {
    expect(
      service.relativeDirectory("projects/test-proje/main/2026-04-09/ana-dosya/uuid-a.pdf")
    ).toBe("projects/test-proje/main/2026-04-09/ana-dosya");
  });
});
