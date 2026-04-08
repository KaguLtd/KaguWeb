import path from "node:path";
import { loadConfig, rawRoot, runtimeRoot, screenshotsRoot, workspaceRoot } from "./config.js";
import { fieldPersonas } from "./personas.js";
import { loadOrCreateReport, saveReport } from "./report-store.js";
import { startIsolatedRuntime } from "./runtime.js";
import type { Role, UiCheckpointResult } from "./types.js";
import { addArtifact, slugify, writeJson } from "./utils.js";

async function main() {
  const config = await loadConfig();
  const report = await loadOrCreateReport(config);
  const playwright = await import("playwright");
  const runtime = await startIsolatedRuntime(config, {
    api: true,
    web: true,
    runtimeRoot
  });

  try {
    const results: UiCheckpointResult[] = [];

    for (const date of config.month.uiCheckpoints) {
      const desktopBrowser = await launchBrowser(playwright, false);
      const mobileBrowser = await launchBrowser(playwright, true);

      try {
        results.push(
          ...(await captureManagerSuite(
            desktopBrowser,
            date,
            config.bootstrapAdmin.username,
            config.bootstrapAdmin.password,
            config.bootstrapAdmin.displayName,
            "desktop"
          ))
        );
        results.push(
          ...(await captureManagerSuite(
            mobileBrowser,
            date,
            config.managerMobile.username,
            config.managerMobile.password,
            config.managerMobile.displayName,
            "mobile"
          ))
        );

        for (const persona of fieldPersonas) {
          results.push(
            await captureFieldSuite(
              mobileBrowser,
              date,
              persona.username,
              config.fieldPassword,
              persona.displayName
            )
          );
        }
      } finally {
        await desktopBrowser.close();
        await mobileBrowser.close();
      }
    }

    report.uiResults = results;
    for (const result of results) {
      addArtifact(report.artifacts, "screenshot", result.title, path.join(workspaceRoot, result.screenshotPath), workspaceRoot);
    }
    await writeJson(path.join(rawRoot, "ui-results.json"), results);
    addArtifact(report.artifacts, "raw", "UI checkpoint sonuclari", path.join(rawRoot, "ui-results.json"), workspaceRoot);
    await saveReport(report);
  } finally {
    await runtime.stop();
  }
}

async function captureManagerSuite(
  browser: import("playwright").Browser,
  date: string,
  username: string,
  password: string,
  displayName: string,
  device: "desktop" | "mobile"
): Promise<UiCheckpointResult[]> {
  const pages = [
    { path: `/dashboard?date=${date}`, label: "dashboard" },
    { path: `/dashboard/projects?date=${date}`, label: "projects" },
    { path: `/dashboard/program?date=${date}`, label: "program" },
    { path: `/dashboard/tracking?date=${date}`, label: "tracking" }
  ];

  const context = await browser.newContext(
    device === "mobile"
      ? {
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true
        }
      : {
          viewport: { width: 1440, height: 1024 }
        }
  );
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await login(page, username, password);
  const results: UiCheckpointResult[] = [];

  for (const item of pages) {
    await page.goto(`http://localhost:3300${item.path}`, { waitUntil: "networkidle" });
    const diagnostics = await collectDiagnostics(page);
    const screenshotPath = await savePageScreenshot(page, `${date}-${slugify(displayName)}-${item.label}.png`);
    const notes = [...diagnostics.notes];
    if (consoleErrors.length) {
      notes.push(`Konsol hatasi: ${consoleErrors[0]}`);
    }

    results.push({
      id: `${date}-${username}-${item.label}`,
      date,
      actor: displayName,
      role: "MANAGER",
      device,
      page: item.label,
      title: `${displayName} ${item.label} ${date}`,
      status: diagnostics.notes.some((note) => note.includes("Yatay")) ? "failed" : "passed",
      screenshotPath,
      notes
    });
  }

  await context.close();
  return results;
}

async function captureFieldSuite(
  browser: import("playwright").Browser,
  date: string,
  username: string,
  password: string,
  displayName: string
): Promise<UiCheckpointResult> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  await login(page, username, password);
  await page.goto("http://localhost:3300/dashboard", { waitUntil: "networkidle" });

  const firstCard = page.locator(".field-assignment-card").first();
  if ((await firstCard.count()) > 0) {
    await firstCard.click();
    await page.waitForLoadState("networkidle");
  }

  const diagnostics = await collectDiagnostics(page);
  const screenshotPath = await savePageScreenshot(page, `${date}-${slugify(displayName)}-field.png`);
  await context.close();

  return {
    id: `${date}-${username}-field`,
    date,
    actor: displayName,
    role: "FIELD" as Role,
    device: "mobile",
    page: "field",
    title: `${displayName} saha ekrani ${date}`,
    status: diagnostics.notes.some((note) => note.includes("Yatay")) ? "failed" : "passed",
    screenshotPath,
    notes: diagnostics.notes
  };
}

async function login(page: import("playwright").Page, username: string, password: string) {
  await page.goto("http://localhost:3300/login", { waitUntil: "networkidle" });
  await page.getByPlaceholder("kullanici adiniz").fill(username);
  await page.getByPlaceholder("sifreniz").fill(password);
  await page.getByRole("button", { name: "Devam et" }).click();
  await page.waitForURL(/\/dashboard/u, { timeout: 30000 });
  await page.waitForLoadState("networkidle");
}

async function collectDiagnostics(page: import("playwright").Page) {
  return await page.evaluate(() => {
    const notes: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > window.innerWidth + 4) {
      notes.push("Yatay tasma algilandi.");
    }
    const ratio = root.scrollHeight / window.innerHeight;
    if (ratio > 4) {
      notes.push("Dikey yogunluk yuksek, ekranda uzun kaydirma gerekiyor.");
    }
    if (ratio <= 4) {
      notes.push("Kaydirma derinligi kabul edilebilir seviyede.");
    }
    return { notes };
  });
}

async function savePageScreenshot(page: import("playwright").Page, filename: string) {
  const absolute = path.join(screenshotsRoot, filename);
  await page.screenshot({ path: absolute, fullPage: true });
  return path.relative(workspaceRoot, absolute).replaceAll("\\", "/");
}

async function launchBrowser(
  playwright: typeof import("playwright"),
  mobile: boolean
) {
  const channels = ["msedge", "chrome"] as const;
  for (const channel of channels) {
    try {
      return await playwright.chromium.launch({ channel, headless: true });
    } catch {
      // Try the next channel.
    }
  }

  return await playwright.chromium.launch({
    headless: true,
    args: mobile ? ["--use-mobile-user-agent"] : []
  });
}

void main();
