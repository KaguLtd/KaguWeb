import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ArtifactRecord, ReportData, SimulationEvent, TesterConfig } from "./types.js";

export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s.-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

export async function ensureDir(directory: string) {
  await mkdir(directory, { recursive: true });
}

export async function resetDir(directory: string) {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
}

export function apiUrl(config: TesterConfig, pathname: string) {
  const normalizedBase = config.runtime.apiBasePath.replace(/\/$/, "");
  return `${config.runtime.apiOrigin}${normalizedBase}${pathname}`;
}

export function weekdayName(date: string) {
  return new Intl.DateTimeFormat("tr-TR", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`)
  );
}

export function monthDateRange(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const values: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    values.push(cursor.toISOString().slice(0, 10));
  }
  return values;
}

export function workMode(
  date: string,
  config: TesterConfig
): "full-day" | "half-day" | "off-day" {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (day === config.month.offDayWeekday) {
    return "off-day";
  }
  if (day === config.month.halfDayWeekday) {
    return "half-day";
  }
  return "full-day";
}

export function buildEventId(date: string, actor: string, action: string) {
  return `${date}-${slugify(actor)}-${slugify(action)}`;
}

export function countEvents(events: SimulationEvent[], predicate: (event: SimulationEvent) => boolean) {
  return events.reduce((total, event) => total + (predicate(event) ? 1 : 0), 0);
}

export async function writeJson(filepath: string, value: unknown) {
  await writeFile(filepath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJson<T>(filepath: string) {
  const raw = await readFile(filepath, "utf8");
  return JSON.parse(raw) as T;
}

export async function listFiles(directory: string) {
  try {
    return await readdir(directory);
  } catch {
    return [];
  }
}

export function addArtifact(
  list: ArtifactRecord[],
  type: ArtifactRecord["type"],
  label: string,
  targetPath: string,
  root: string
) {
  list.push({
    type,
    label,
    path: path.relative(root, targetPath).replaceAll("\\", "/")
  });
}

export function summarizeMonth(config: TesterConfig, report: ReportData) {
  const dates = monthDateRange(config.month.startDate, config.month.endDate);
  const halfDays = dates.filter((date) => workMode(date, config) === "half-day").length;
  const offDays = dates.filter((date) => workMode(date, config) === "off-day").length;
  return {
    ...report,
    month: {
      startDate: config.month.startDate,
      endDate: config.month.endDate,
      totalDays: dates.length,
      workingDays: dates.length - halfDays - offDays,
      halfDays,
      offDays
    }
  };
}
