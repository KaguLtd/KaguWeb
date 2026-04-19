import { posix } from "node:path";
import { Injectable } from "@nestjs/common";
import { formatDateOnly } from "../common/utils/date";
import { sanitizeFilename } from "../common/utils/file-policy";
import { normalizeStorageRelativePath } from "./storage-path.utils";

@Injectable()
export class StoragePathService {
  projectMainRoot(projectStorageRoot: string) {
    return posix.join(this.projectRoot(projectStorageRoot), "main");
  }

  projectTimelineRoot(projectStorageRoot: string) {
    return posix.join(this.projectRoot(projectStorageRoot), "timeline");
  }

  projectLogsRoot(projectStorageRoot: string) {
    return posix.join(this.projectRoot(projectStorageRoot), "logs");
  }

  projectMetaRoot(projectStorageRoot: string) {
    return posix.join(this.projectRoot(projectStorageRoot), "meta");
  }

  projectScaffoldDirectories(projectStorageRoot: string) {
    return [
      this.projectMainRoot(projectStorageRoot),
      this.projectTimelineRoot(projectStorageRoot),
      this.projectLogsRoot(projectStorageRoot),
      this.projectMetaRoot(projectStorageRoot)
    ];
  }

  projectNotesLogFile(projectStorageRoot: string) {
    return posix.join(this.projectLogsRoot(projectStorageRoot), "notes.jsonl");
  }

  projectEventsLogFile(projectStorageRoot: string) {
    return posix.join(this.projectLogsRoot(projectStorageRoot), "project-events.jsonl");
  }

  projectMetadataFile(projectStorageRoot: string) {
    return posix.join(this.projectMetaRoot(projectStorageRoot), "project.json");
  }

  programEventsLogFile(programDate: Date) {
    return posix.join("programs", formatDateOnly(programDate), "logs", "program-events.jsonl");
  }

  systemEventsLogFile() {
    return posix.join("logs", "system-events.jsonl");
  }

  projectMainUploadDirectory(projectStorageRoot: string, title: string, now: Date = new Date()) {
    return posix.join(
      this.projectMainRoot(projectStorageRoot),
      formatDateOnly(now),
      this.storageSegment(title)
    );
  }

  projectTimelineUploadDirectory(projectStorageRoot: string, entryDate: Date) {
    return posix.join(this.projectTimelineRoot(projectStorageRoot), formatDateOnly(entryDate));
  }

  relativeDirectory(relativePath: string) {
    return posix.dirname(normalizeStorageRelativePath(relativePath));
  }

  private projectRoot(projectStorageRoot: string) {
    return normalizeStorageRelativePath(projectStorageRoot);
  }

  private storageSegment(value: string) {
    return sanitizeFilename(value) || "kayitsiz";
  }
}
