import path from "node:path";
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import { chartsRoot, loadConfig, rawRoot, workspaceRoot } from "./config.js";
import { runStaticAudit } from "./audit.js";
import { loadOrCreateReport, saveReport } from "./report-store.js";
import type { Finding, ReportData } from "./types.js";
import {
  addArtifact,
  countEvents,
  readJson
} from "./utils.js";

const reportMarkdownPath = path.join(workspaceRoot, "report.md");
const reportHtmlPath = path.join(workspaceRoot, "report.html");
const reportPdfPath = path.join(workspaceRoot, "report.pdf");

async function main() {
  const config = await loadConfig();
  const report = await loadOrCreateReport(config);
  const dailySnapshots = await readJson<Array<Record<string, unknown>>>(
    path.join(rawRoot, "daily-snapshots.json")
  );
  const technicalAudit = await runStaticAudit(config);
  report.technicalAudit = technicalAudit;

  hydrateMetrics(report, dailySnapshots);
  report.findings = [...deriveRuntimeFindings(report), ...technicalAudit];

  const chartArtifacts = await buildCharts(report);
  for (const artifact of chartArtifacts) {
    report.artifacts.push(artifact);
  }

  const markdown = buildMarkdown(report);
  const html = buildHtml(report);
  await writeText(reportMarkdownPath, markdown);
  await writeText(reportHtmlPath, html);
  addArtifact(report.artifacts, "report", "Markdown raporu", reportMarkdownPath, workspaceRoot);
  addArtifact(report.artifacts, "report", "HTML raporu", reportHtmlPath, workspaceRoot);

  await renderPdf(reportHtmlPath, reportPdfPath);
  addArtifact(report.artifacts, "report", "PDF raporu", reportPdfPath, workspaceRoot);
  await saveReport(report);
}

function hydrateMetrics(report: ReportData, dailySnapshots: Array<Record<string, unknown>>) {
  report.metrics.totalEvents = report.events.length;
  report.metrics.passedEvents = countEvents(report.events, (event) => event.status === "passed");
  report.metrics.expectedFailures = countEvents(
    report.events,
    (event) => event.status === "expected_failure"
  );
  report.metrics.warnings = countEvents(report.events, (event) => event.status === "warning");
  report.metrics.unexpectedFailures = countEvents(
    report.events,
    (event) => event.status === "failed"
  );
  report.metrics.notesCreated = countEvents(report.events, (event) =>
    event.action.includes("not")
  );
  report.metrics.filesUploaded = countEvents(report.events, (event) =>
    event.action.includes("dosya") || event.action.includes("ana dosya")
  );
  report.metrics.downloadsAttempted = countEvents(report.events, (event) =>
    event.action.includes("indir")
  );
  report.metrics.locationPings = countEvents(report.events, (event) =>
    event.action.includes("konum")
  );
  report.metrics.notificationsSent = countEvents(report.events, (event) =>
    event.action.includes("bildirim") || event.action.includes("hatirlatici")
  );
  report.metrics.notificationFailures = countEvents(
    report.events,
    (event) =>
      (event.action.includes("bildirim") || event.action.includes("hatirlatici")) &&
      event.status !== "passed"
  );
  report.metrics.workStarts = countEvents(report.events, (event) => event.action === "is basi yap");
  report.metrics.workEnds = countEvents(report.events, (event) => event.action === "gun sonu yap");
  report.metrics.projectCreateAttempts = countEvents(report.events, (event) =>
    event.action.includes("proje olustur")
  );
  report.metrics.projectDeleteAttempts = countEvents(report.events, (event) =>
    event.action.includes("projeyi sil") || event.action.includes("projeyi silmeyi dene")
  );

  for (const day of report.daily) {
    const events = report.events.filter((event) => event.date === day.date);
    const snapshot = dailySnapshots.find((item) => item.date === day.date) as
      | {
          managerOverview?: { summaryCards?: { projectCount: number; assignedFieldCount: number } };
        }
      | undefined;

    day.events = events.length;
    day.passes = events.filter((event) => event.status === "passed").length;
    day.expectedFailures = events.filter((event) => event.status === "expected_failure").length;
    day.unexpectedFailures = events.filter((event) => event.status === "failed").length;
    day.projectCount = snapshot?.managerOverview?.summaryCards?.projectCount ?? 0;
    day.assignmentCount = snapshot?.managerOverview?.summaryCards?.assignedFieldCount ?? 0;
    day.noteCount = events.filter((event) => event.action.includes("not")).length;
    day.fileCount = events.filter((event) => event.action.includes("dosya")).length;
    day.pingCount = events.filter((event) => event.action.includes("konum")).length;
    day.notificationCount = events.filter(
      (event) => event.action.includes("bildirim") || event.action.includes("hatirlatici")
    ).length;
  }

  for (const personaScore of report.personaScores) {
    const personaEvents = report.events.filter((event) => event.actor === personaScore.displayName);
    personaScore.completedActions = personaEvents.filter((event) => event.status === "passed").length;
    personaScore.failedActions = personaEvents.filter((event) => event.status === "failed").length;
    personaScore.expectedFailures = personaEvents.filter(
      (event) => event.status === "expected_failure"
    ).length;
    personaScore.uiPassCount = report.uiResults.filter(
      (result) => result.actor === personaScore.displayName && result.status === "passed"
    ).length;
    personaScore.uiFailCount = report.uiResults.filter(
      (result) => result.actor === personaScore.displayName && result.status === "failed"
    ).length;
  }
}

function deriveRuntimeFindings(report: ReportData): Finding[] {
  const findings: Finding[] = [];

  if (report.metrics.unexpectedFailures > 0) {
    findings.push({
      id: "runtime-unexpected-failures",
      severity: "High",
      category: "urun eksigi",
      title: "Beklenmeyen operasyon hatalari goruldu",
      detail:
        `${report.metrics.unexpectedFailures} adet beklenmeyen hata kaydi bulundu. Bu durum bazi operasyon akislarda dayaniksizlik oldugunu gosteriyor.`,
      recommendation:
        "Beklenmeyen hata mesajlari action, actor ve endpoint bazinda ayristirilip regression paketi olusturulmali.",
      evidence: ["raw/events.json"]
    });
  }

  if (report.uiResults.some((result) => result.notes.some((note) => note.includes("Yatay")))) {
    findings.push({
      id: "runtime-mobile-overflow",
      severity: "Medium",
      category: "kullanim sorunu",
      title: "Bazi mobil yuzeylerde yatay tasma veya yogunluk sinyali var",
      detail:
        "UI checkpoint sonucunda ozellikle dar viewport senaryolarinda yanal tasma veya asiri uzun kaydirma sinyalleri olustu.",
      recommendation:
        "Mobil yonetici ve saha ekranlarinda panel yogunlugu azaltip bilgi bloklari daha kademeli hale getirilmeli.",
      evidence: ["raw/ui-results.json", "screenshots/"]
    });
  }

  if (!report.environment.pushConfigured && report.metrics.notificationFailures > 0) {
    findings.push({
      id: "runtime-push-environment",
      severity: "Medium",
      category: "ortam kisiti",
      title: "Push teslim basarisizliklari ortam yapilandirmasindan kaynaklandi",
      detail:
        "Bildirim kampanyalari olusturuldu ancak VAPID yapilandirmasi olmadigi icin teslim zinciri basarisiz kayda dustu.",
      recommendation:
        "Staging ve pilot ortamlarda HTTPS ve VAPID anahtarlari standart kurulum parcasi haline getirilmeli.",
      evidence: ["raw/daily-snapshots.json", "raw/events.json"]
    });
  }

  if (report.events.some((event) => event.action === "gun sonu unutuldu")) {
    findings.push({
      id: "runtime-stale-session-visibility",
      severity: "Medium",
      category: "urun eksigi",
      title: "Acik kalan saha oturumlari icin merkezi alarm ihtiyaci var",
      detail:
        "Sibel personasi ile birden fazla acik kalan oturum senaryosu olustu. Akis bunlari teknik olarak engellese de yonetici icin proaktif uyari katmani eksik.",
      recommendation:
        "Yonetici dashboard'una stale session ve gecikmeli kapanis alarm kartlari eklenmeli.",
      evidence: ["raw/events.json"]
    });
  }

  return findings;
}

async function buildCharts(report: ReportData) {
  const artifacts = [];
  const dailyLoadSvg = buildLineChart(
    "Gunluk operasyon hacmi",
    report.daily.map((item) => ({ label: item.date.slice(5), value: item.events }))
  );
  artifacts.push(await writeChart("daily-load.svg", dailyLoadSvg, "Gunluk operasyon hacmi"));

  const personaSvg = buildGroupedBarChart(
    "Persona performansi",
    report.personaScores.map((item) => ({
      label: item.displayName.split(" ")[0],
      primary: item.completedActions,
      secondary: item.failedActions + item.expectedFailures
    })),
    "Tamamlanan",
    "Hata / Koruma"
  );
  artifacts.push(await writeChart("persona-performance.svg", personaSvg, "Persona performansi"));

  const notificationSvg = buildGroupedBarChart(
    "Bildirim teslim durumu",
    [
      {
        label: "Bildirim",
        primary: report.metrics.notificationsSent - report.metrics.notificationFailures,
        secondary: report.metrics.notificationFailures
      }
    ],
    "Basarili",
    "Basarisiz"
  );
  artifacts.push(await writeChart("notifications.svg", notificationSvg, "Bildirim teslim durumu"));

  const locationSvg = buildLineChart(
    "Konum pingi hacmi",
    report.daily.map((item) => ({ label: item.date.slice(5), value: item.pingCount }))
  );
  artifacts.push(await writeChart("location-volume.svg", locationSvg, "Konum pingi hacmi"));

  const fileNoteSvg = buildGroupedBarChart(
    "Dosya ve not hacmi",
    report.daily.map((item) => ({
      label: item.date.slice(5),
      primary: item.noteCount,
      secondary: item.fileCount
    })),
    "Not",
    "Dosya"
  );
  artifacts.push(await writeChart("file-note-volume.svg", fileNoteSvg, "Dosya ve not hacmi"));

  const severityCount = ["Critical", "High", "Medium", "Low"].map((severity) => ({
    label: severity,
    value: report.findings.filter((finding) => finding.severity === severity).length
  }));
  const severitySvg = buildBarChart("Bulgu siddeti dagilimi", severityCount);
  artifacts.push(await writeChart("findings-severity.svg", severitySvg, "Bulgu siddeti dagilimi"));

  return artifacts;
}

function buildMarkdown(report: ReportData) {
  const findingLines = report.findings
    .map(
      (finding) =>
        `- [${finding.severity}] ${finding.title} (${finding.category})\n  - ${finding.detail}\n  - Oneri: ${finding.recommendation}`
    )
    .join("\n");

  const personaTable = [
    "| Persona | Tamamlanan | Beklenmeyen Hata | Koruma Tetik | UI Pass | UI Fail |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...report.personaScores.map(
      (item) =>
        `| ${item.displayName} | ${item.completedActions} | ${item.failedActions} | ${item.expectedFailures} | ${item.uiPassCount} | ${item.uiFailCount} |`
    )
  ].join("\n");

  return `# Kagu Saha Tester Raporu

Uretim zamani: ${report.generatedAt}

## Yonetici Ozeti

- Toplam olay: ${report.metrics.totalEvents}
- Basarili olay: ${report.metrics.passedEvents}
- Beklenmeyen hata: ${report.metrics.unexpectedFailures}
- Beklenen koruma tetigi: ${report.metrics.expectedFailures}
- Bildirim denemesi: ${report.metrics.notificationsSent}
- Konum pingi: ${report.metrics.locationPings}

## Persona Performansi

${personaTable}

## Bulgular

${findingLines}

## Gelistirme Oncelikleri

1. Beklenmeyen hata veren akislari endpoint bazli netlestirip regression paketi haline getirin.
2. Mobil yonetici ve saha ekranlarinda bilgi yogunlugunu azaltin.
3. HTTPS + VAPID yapilandirmasini staging/pilot kurulum standardi yapin.
4. Acik kalan saha oturumlari icin dashboard alarm yuzeyi ekleyin.
5. Aylik rapor ve audit gecmisini urun icine alin.
`;
}

function buildHtml(report: ReportData) {
  const chartRefs = [
    "daily-load.svg",
    "persona-performance.svg",
    "notifications.svg",
    "location-volume.svg",
    "file-note-volume.svg",
    "findings-severity.svg"
  ];

  const findingCards = report.findings
    .map(
      (finding) => `
        <article class="finding ${finding.severity.toLowerCase()}">
          <div class="meta">${finding.severity} · ${finding.category}</div>
          <h3>${finding.title}</h3>
          <p>${finding.detail}</p>
          <p><strong>Oneri:</strong> ${finding.recommendation}</p>
        </article>
      `
    )
    .join("");

  const personaRows = report.personaScores
    .map(
      (item) => `
        <tr>
          <td>${item.displayName}</td>
          <td>${item.completedActions}</td>
          <td>${item.failedActions}</td>
          <td>${item.expectedFailures}</td>
          <td>${item.uiPassCount}</td>
          <td>${item.uiFailCount}</td>
        </tr>
      `
    )
    .join("");

  const charts = chartRefs
    .map((chart) => `<img src="./charts/${chart}" alt="${chart}" />`)
    .join("");

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>Kagu Saha Tester Raporu</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4efe8;
      --surface: #ffffff;
      --ink: #1f2933;
      --accent: #006d77;
      --warn: #b45309;
      --danger: #b91c1c;
      --muted: #5b6470;
      --line: #d9e0e7;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
    .wrap { max-width: 1160px; margin: 0 auto; padding: 32px; }
    .hero { padding: 28px; background: linear-gradient(135deg, #ffffff, #e9f4f3); border-radius: 24px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 24px 0; }
    .card { padding: 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; }
    h1, h2, h3 { margin: 0 0 12px; }
    h2 { margin-top: 32px; }
    .finding { padding: 18px; background: var(--surface); border-radius: 18px; border-left: 8px solid var(--accent); margin-bottom: 16px; }
    .finding.high, .finding.critical { border-left-color: var(--danger); }
    .finding.medium { border-left-color: var(--warn); }
    .meta { color: var(--muted); font-size: 13px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 18px; overflow: hidden; }
    th, td { padding: 12px 14px; border-bottom: 1px solid var(--line); text-align: left; }
    th { background: #f0f7f6; }
    .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .charts img { width: 100%; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <div class="meta">Uretim zamani: ${report.generatedAt}</div>
      <h1>Kagu Saha Tester Raporu</h1>
      <p>1 Nisan 2026 - 30 Nisan 2026 izole servis operasyon testi. 2 yonetici, 5 saha personeli, REST senaryo motoru ve Playwright UI checkpointleri birlikte kullanildi.</p>
    </section>
    <section class="grid">
      <div class="card"><div class="meta">Toplam olay</div><h2>${report.metrics.totalEvents}</h2></div>
      <div class="card"><div class="meta">Beklenmeyen hata</div><h2>${report.metrics.unexpectedFailures}</h2></div>
      <div class="card"><div class="meta">Beklenen koruma</div><h2>${report.metrics.expectedFailures}</h2></div>
    </section>
    <h2>Grafikler</h2>
    <section class="charts">${charts}</section>
    <h2>Persona Ozeti</h2>
    <table>
      <thead>
        <tr><th>Persona</th><th>Tamamlanan</th><th>Beklenmeyen Hata</th><th>Koruma</th><th>UI Pass</th><th>UI Fail</th></tr>
      </thead>
      <tbody>${personaRows}</tbody>
    </table>
    <h2>Bulgular</h2>
    <section>${findingCards}</section>
  </div>
</body>
</html>`;
}

async function renderPdf(htmlPath: string, pdfPath: string) {
  const playwright = await import("playwright");
  let browser: import("playwright").Browser | null = null;
  for (const channel of ["msedge", "chrome"] as const) {
    try {
      browser = await playwright.chromium.launch({ channel, headless: true });
      break;
    } catch {
      // Try the next installed browser.
    }
  }
  if (!browser) {
    browser = await playwright.chromium.launch({ headless: true });
  }
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" }
    });
  } finally {
    await browser.close();
  }
}

async function writeChart(filename: string, svg: string, label: string) {
  const targetPath = path.join(chartsRoot, filename);
  await writeText(targetPath, svg);
  return {
    type: "chart" as const,
    label,
    path: path.relative(workspaceRoot, targetPath).replaceAll("\\", "/")
  };
}

function buildBarChart(title: string, points: Array<{ label: string; value: number }>) {
  const width = 860;
  const height = 320;
  const max = Math.max(1, ...points.map((point) => point.value));
  const barWidth = 80;
  const gap = 36;
  const left = 70;
  const bottom = 250;

  const bars = points
    .map((point, index) => {
      const barHeight = Math.max(4, (point.value / max) * 180);
      const x = left + index * (barWidth + gap);
      const y = bottom - barHeight;
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="10" fill="#006d77" />
        <text x="${x + barWidth / 2}" y="${bottom + 24}" text-anchor="middle" font-size="13">${point.label}</text>
        <text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" font-size="13">${point.value}</text>
      `;
    })
    .join("");

  return svgShell(title, width, height, bars);
}

function buildGroupedBarChart(
  title: string,
  points: Array<{ label: string; primary: number; secondary: number }>,
  primaryLabel: string,
  secondaryLabel: string
) {
  const width = 940;
  const height = 340;
  const max = Math.max(1, ...points.flatMap((point) => [point.primary, point.secondary]));
  const left = 60;
  const bottom = 260;
  const groupWidth = 72;
  const barWidth = 28;
  const gap = 26;

  const bars = points
    .map((point, index) => {
      const x = left + index * (groupWidth + gap);
      const primaryHeight = Math.max(4, (point.primary / max) * 190);
      const secondaryHeight = Math.max(4, (point.secondary / max) * 190);
      return `
        <rect x="${x}" y="${bottom - primaryHeight}" width="${barWidth}" height="${primaryHeight}" rx="8" fill="#006d77" />
        <rect x="${x + 34}" y="${bottom - secondaryHeight}" width="${barWidth}" height="${secondaryHeight}" rx="8" fill="#d97706" />
        <text x="${x + 31}" y="${bottom + 22}" text-anchor="middle" font-size="12">${point.label}</text>
      `;
    })
    .join("");

  const legend = `
    <rect x="690" y="36" width="18" height="18" rx="4" fill="#006d77" />
    <text x="716" y="50" font-size="12">${primaryLabel}</text>
    <rect x="690" y="64" width="18" height="18" rx="4" fill="#d97706" />
    <text x="716" y="78" font-size="12">${secondaryLabel}</text>
  `;

  return svgShell(title, width, height, bars + legend);
}

function buildLineChart(title: string, points: Array<{ label: string; value: number }>) {
  const width = 980;
  const height = 340;
  const max = Math.max(1, ...points.map((point) => point.value));
  const left = 60;
  const top = 60;
  const chartHeight = 190;
  const step = Math.max(18, 820 / Math.max(1, points.length - 1));

  const coords = points.map((point, index) => ({
    x: left + index * step,
    y: top + chartHeight - (point.value / max) * chartHeight,
    value: point.value,
    label: point.label
  }));
  const polyline = coords.map((coord) => `${coord.x},${coord.y}`).join(" ");
  const markers = coords
    .map(
      (coord) => `
        <circle cx="${coord.x}" cy="${coord.y}" r="5" fill="#006d77" />
        <text x="${coord.x}" y="${coord.y - 10}" text-anchor="middle" font-size="11">${coord.value}</text>
        <text x="${coord.x}" y="${top + chartHeight + 24}" text-anchor="middle" font-size="11">${coord.label}</text>
      `
    )
    .join("");

  const shapes = `
    <polyline points="${polyline}" fill="none" stroke="#006d77" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    ${markers}
  `;

  return svgShell(title, width, height, shapes);
}

function svgShell(title: string, width: number, height: number, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="24" fill="#ffffff" />
  <text x="36" y="42" font-size="24" font-family="Segoe UI, sans-serif" fill="#1f2933">${title}</text>
  <line x1="56" y1="${height - 70}" x2="${width - 36}" y2="${height - 70}" stroke="#cbd5e1" stroke-width="2" />
  <line x1="56" y1="62" x2="56" y2="${height - 70}" stroke="#cbd5e1" stroke-width="2" />
  ${body}
</svg>`;
}

async function writeText(filepath: string, content: string) {
  await writeFile(filepath, content, "utf8");
}

void main();
