"use client";

import Link from "next/link";
import {
  ManagerDashboardActivity,
  ManagerDashboardProgramProject,
  ManagerDashboardResponse,
  ManagerProjectDurationReportItem
} from "@kagu/contracts";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, fetchAuthorizedBlob, isAbortError } from "../lib/api";
import {
  formatDisplayDate,
  formatDisplayDateTime,
  getTodayLocal,
  shiftDateString
} from "../lib/date";
import { useAuth } from "./auth-provider";
import { useSyncedDashboardDate } from "./use-synced-dashboard-date";

function toCsv(rows: ManagerProjectDurationReportItem[]) {
  const header = ["Proje", "Ilk Gun", "Son Gun", "Adam/Gun"];
  const body = rows.map((row) => [
    row.projectName,
    formatDisplayDate(row.firstProgramDate),
    formatDisplayDate(row.lastProgramDate),
    String(row.totalVisitDays * row.totalUniqueFieldUsers)
  ]);
  const lines = [header, ...body]
    .map((cells) => cells.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
    .join("\n");
  return `\uFEFF${lines}`;
}

function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function activityTypeLabel(activity: ManagerDashboardActivity) {
  switch (activity.entryType) {
    case "WORK_START":
      return "Saha basladi";
    case "WORK_END":
      return "Gun sonu";
    case "FILE_UPLOAD":
      return "Dosya";
    case "IMAGE_UPLOAD":
      return "Gorsel";
    case "MANAGER_NOTE":
      return "Yonetici notu";
    case "FIELD_NOTE":
      return "Saha notu";
    case "LOCATION_EVENT":
      return "Konum";
    default:
      return activity.entryType;
  }
}

function buildProjectPulse(project: ManagerDashboardProgramProject) {
  return [
    `${project.assignmentCount} ekip`,
    `${project.noteCount} not`,
    `${project.fileCount} dosya`,
    project.latestActivityAt ? `Son hareket ${formatDisplayDateTime(project.latestActivityAt)}` : "Hareket yok"
  ];
}

function formatRouteMode(routeMode: string) {
  switch (routeMode) {
    case "nearest-neighbor":
      return "En yakin sira";
    case "program-order-fallback":
      return "Program sirasi";
    case "no-program":
      return "Program yok";
    default:
      return routeMode;
  }
}

export function ManagerOverviewModule() {
  const { token } = useAuth();
  const [selectedDate, setSelectedDate] = useSyncedDashboardDate();
  const [overview, setOverview] = useState<ManagerDashboardResponse | null>(null);
  const [reportRows, setReportRows] = useState<ManagerProjectDurationReportItem[]>([]);
  const [reportQuery, setReportQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    void apiFetch<ManagerDashboardResponse>(
      `/dashboard/manager?date=${selectedDate}`,
      { signal: controller.signal },
      token
    )
      .then((data) => setOverview(data))
      .catch((error) => {
        if (!isAbortError(error)) {
          setMessage(error instanceof Error ? error.message : "Dashboard yuklenemedi.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedDate, token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const controller = new AbortController();
    setReportLoading(true);
    void apiFetch<ManagerProjectDurationReportItem[]>(
      "/dashboard/manager/project-duration-report",
      { signal: controller.signal },
      token
    )
      .then((data) => setReportRows(data))
      .catch((error) => {
        if (!isAbortError(error)) {
          setMessage(error instanceof Error ? error.message : "Rapor verisi yuklenemedi.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setReportLoading(false);
        }
      });

    return () => controller.abort();
  }, [token]);

  const activeSessions = overview?.activeSessions ?? [];
  const programProjects = overview?.programProjects ?? [];
  const activities = overview?.recentActivities ?? [];
  const routingSummary = overview?.routingSummary;
  const fieldFormSummary = overview?.fieldFormSummary;
  const notificationSummary = overview?.notificationSummary;
  const filteredReportRows = useMemo(() => {
    const query = reportQuery.trim().toLocaleLowerCase("tr-TR");
    if (!query) {
      return reportRows;
    }
    return reportRows.filter((row) => row.projectName.toLocaleLowerCase("tr-TR").includes(query));
  }, [reportQuery, reportRows]);

  const summaryCards = useMemo(
    () => [
      {
        label: "Aktif oturum",
        value: overview?.summaryCards.openSessionCount ?? 0,
        detail: "Secili tarihte sahadaki ekipler"
      },
      {
        label: "Atanmis saha",
        value: overview?.summaryCards.assignedFieldCount ?? 0,
        detail: "Gunluk programa dokunan personel"
      },
      {
        label: "Program projesi",
        value: overview?.summaryCards.projectCount ?? 0,
        detail: "Secili tarihte takibe giren proje"
      },
      {
        label: "Aktivite",
        value: overview?.summaryCards.activityCount ?? 0,
        detail: "Not, dosya ve saha hareketi"
      },
      {
        label: "Bildirim",
        value: overview?.summaryCards.notificationCount ?? 0,
        detail: "Kayitli kampanya ve teslimat"
      }
    ],
    [overview]
  );

  async function downloadDailyCsv() {
    if (!token) {
      return;
    }
    try {
      const { objectUrl, filename } = await fetchAuthorizedBlob(
        `/dashboard/manager/export?date=${selectedDate}`,
        token
      );
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename || `kagu-dashboard-${selectedDate}.csv`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setMessage("Gunluk CSV raporu indirildi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gunluk CSV indirilemedi.");
    }
  }

  function downloadProjectDurationCsv() {
    downloadTextFile(toCsv(filteredReportRows), `kagu-proje-raporu-${getTodayLocal()}.csv`);
    setMessage("Proje sure raporu CSV olarak indirildi.");
  }

  return (
    <div className="manager-module manager-stack-layout">
      <section className="manager-command-surface manager-command-surface-grid">
        <div className="manager-command-copy">
          <span className="manager-command-kicker">Secili gun</span>
          <h2 className="manager-block-title">Sahadaki hareketi yonetin</h2>
          <p className="manager-block-copy">
            Aktif ekipleri, proje yogunlugunu ve gune ait export aksiyonlarini ayni yuzeyden izleyin.
          </p>
        </div>
        <div className="manager-command-controls manager-command-controls-left">
          <div className="manager-inline-actions">
            <button
              className="button ghost"
              onClick={() => setSelectedDate((current) => shiftDateString(current, -1))}
              type="button"
            >
              Onceki gun
            </button>
            <input
              className="input"
              onChange={(event) => setSelectedDate(event.target.value)}
              type="date"
              value={selectedDate}
            />
            <button
              className="button ghost"
              onClick={() => setSelectedDate((current) => shiftDateString(current, 1))}
              type="button"
            >
              Sonraki gun
            </button>
          </div>
          <div className="manager-inline-actions">
            <button className="button ghost" onClick={downloadDailyCsv} type="button">
              Gunluk CSV
            </button>
            <button className="button ghost" onClick={downloadProjectDurationCsv} type="button">
              Proje CSV
            </button>
          </div>
        </div>
      </section>

      {message ? <div className="alert">{message}</div> : null}

      <section className="manager-stat-ribbon">
        {summaryCards.map((card) => (
          <article className="manager-stat-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{loading ? "..." : card.value}</strong>
            <small>{card.detail}</small>
          </article>
        ))}
      </section>

      <div className="manager-dashboard-grid-operations">
        <section className="manager-surface-card">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Canli ekipler</span>
              <h3 className="manager-section-title">Aktif saha oturumlari</h3>
            </div>
            <span className="manager-mini-chip">
              {loading ? "Yukleniyor..." : `${activeSessions.length} aktif`}
            </span>
          </div>

          {!overview && loading ? (
            <div className="empty">Secili gune ait saha oturumlari hazirlaniyor.</div>
          ) : !activeSessions.length ? (
            <div className="empty">Secili gunde aktif saha oturumu bulunmuyor.</div>
          ) : (
            <div className="manager-table-wrap">
              <table className="manager-table">
                <thead>
                  <tr>
                    <th>Personel</th>
                    <th>Proje</th>
                    <th>Cari</th>
                    <th>Baslangic</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSessions.map((session) => (
                    <tr key={session.assignmentId}>
                      <td>{session.user.displayName}</td>
                      <td>{session.project.name}</td>
                      <td>{session.project.customerName ?? "-"}</td>
                      <td>{formatDisplayDateTime(session.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="manager-surface-card">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Program nabzi</span>
              <h3 className="manager-section-title">Bugun oncelikli projeler</h3>
            </div>
            <span className="manager-mini-chip">{programProjects.length} proje</span>
          </div>

          {!overview && loading ? (
            <div className="empty">Program yuzeyi hazirlaniyor.</div>
          ) : !programProjects.length ? (
            <div className="empty">Secili gun icin program projesi bulunmuyor.</div>
          ) : (
            <div className="manager-directory-list">
              {programProjects.slice(0, 6).map((project) => (
                <article className="manager-directory-row" key={project.id}>
                  <div className="manager-directory-main">
                    <div>
                      <strong>{project.projectName}</strong>
                      <p className="muted">
                        {project.customerName ?? project.locationLabel ?? "Cari ve konum bilgisi bekleniyor"}
                      </p>
                    </div>
                    <div className="manager-directory-meta">
                      {buildProjectPulse(project).map((item) => (
                        <span className="manager-mini-chip" key={item}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="manager-dashboard-grid-reports">
        <section className="manager-surface-card">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Son hareketler</span>
              <h3 className="manager-section-title">Gundeki operasyon akisi</h3>
            </div>
            <span className="manager-mini-chip">{activities.length} kayit</span>
          </div>

          {!overview && loading ? (
            <div className="empty">Aktivite akisi yukleniyor.</div>
          ) : !activities.length ? (
            <div className="empty">Secili gun icin yeni hareket bulunmuyor.</div>
          ) : (
            <div className="manager-feed-list">
              {activities.slice(0, 8).map((activity) => (
                <article className="manager-feed-row" key={activity.id}>
                  <div className="manager-feed-topline">
                    <div>
                      <strong>{activity.projectName}</strong>
                      <p className="muted">
                        {activity.actor.displayName} • {activityTypeLabel(activity)}
                      </p>
                    </div>
                    <span className="manager-mini-chip">{formatDisplayDateTime(activity.createdAt)}</span>
                  </div>
                  <p className="manager-feed-text">
                    {activity.note?.trim() || "Bu kayit not icermez, operasyon hareketi olarak kaydedildi."}
                  </p>
                  <div className="manager-feed-inline">
                    <span className="manager-mini-chip">{activity.fileCount} dosya</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="manager-surface-card">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Bildirim ozeti</span>
              <h3 className="manager-section-title">Kampanya teslimati</h3>
            </div>
            <div className="manager-inline-actions">
              <span className="manager-mini-chip">{notificationSummary?.totalCount ?? 0} kampanya</span>
              <span className="manager-mini-chip">{notificationSummary?.sentCount ?? 0} teslim</span>
              <span className="manager-mini-chip">{notificationSummary?.failedCount ?? 0} hata</span>
            </div>
          </div>

          {!overview && loading ? (
            <div className="empty">Bildirim ozeti yukleniyor.</div>
          ) : !notificationSummary?.campaigns.length ? (
            <div className="empty">Secili gune bagli bildirim kampanyasi kaydi yok.</div>
          ) : (
            <div className="manager-feed-list">
              {notificationSummary.campaigns.slice(0, 5).map((campaign) => (
                <article className="manager-feed-row" key={campaign.id}>
                  <div className="manager-feed-topline">
                    <div>
                      <strong>{campaign.title}</strong>
                      <p className="muted">{campaign.type === "DAILY_REMINDER" ? "Gunluk hatirlatici" : "Manuel bildirim"}</p>
                    </div>
                    <span className="manager-mini-chip">{formatDisplayDateTime(campaign.createdAt)}</span>
                  </div>
                  <p className="manager-feed-text">{campaign.message}</p>
                  <div className="manager-feed-inline">
                    <span className="manager-mini-chip">{campaign.deliveryCount} hedef</span>
                    <span className="manager-mini-chip">{campaign.sentCount} gonderildi</span>
                    <span className="manager-mini-chip">{campaign.failedCount} basarisiz</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="manager-dashboard-grid-reports">
        <section className="manager-surface-card">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Rota ozeti</span>
              <h3 className="manager-section-title">Bugunun tavsiye edilen sirasi</h3>
            </div>
            <div className="manager-inline-actions">
              <Link className="button ghost" href="/dashboard/tracking" scroll={false}>
                Takibe Git
              </Link>
              <span className="manager-mini-chip">
                {routingSummary ? formatRouteMode(routingSummary.routeMode) : "Hazirlaniyor"}
              </span>
              <span className="manager-mini-chip">
                {routingSummary?.recommendedStopCount ?? 0} durak
              </span>
              <span className="manager-mini-chip">
                {routingSummary?.skippedProjectCount ?? 0} eksik konum
              </span>
            </div>
          </div>

          {!overview && loading ? (
            <div className="empty">Rota ozeti yukleniyor.</div>
          ) : !routingSummary?.topStops.length ? (
            <div className="empty">Secili gun icin tavsiye edilen rota duragi bulunmuyor.</div>
          ) : (
            <div className="manager-directory-list">
              {routingSummary.topStops.map((stop) => (
                <article className="manager-directory-row" key={stop.projectId}>
                  <div className="manager-directory-main">
                    <div>
                      <strong>
                        #{stop.recommendationRank} {stop.projectName}
                      </strong>
                      <p className="muted">
                        {stop.distanceFromPreviousKm === null
                          ? "Anchor baslangici"
                          : `${stop.distanceFromPreviousKm.toFixed(2)} km sonraki gecis`}
                      </p>
                    </div>
                    <div className="manager-directory-meta">
                      <span className="manager-mini-chip">{stop.assignmentCount} ekip</span>
                      <span className="manager-mini-chip">{stop.activeSessionCount} aktif</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="manager-surface-card">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Saha formlari</span>
              <h3 className="manager-section-title">Gun icindeki form akisi</h3>
            </div>
            <div className="manager-inline-actions">
              <Link className="button ghost" href="/dashboard/forms" scroll={false}>
                Formlari Yonet
              </Link>
              <Link className="button ghost" href="/dashboard/form-responses" scroll={false}>
                Cevaplari Ac
              </Link>
              <span className="manager-mini-chip">{fieldFormSummary?.totalCount ?? 0} cevap</span>
              <span className="manager-mini-chip">
                {fieldFormSummary?.uniqueTemplateCount ?? 0} template
              </span>
              <span className="manager-mini-chip">
                {fieldFormSummary?.uniqueProjectCount ?? 0} proje
              </span>
            </div>
          </div>

          {!overview && loading ? (
            <div className="empty">Saha form ozeti yukleniyor.</div>
          ) : !fieldFormSummary?.recentResponses.length ? (
            <div className="empty">Secili gunde kaydedilmis saha form cevabi yok.</div>
          ) : (
            <div className="manager-feed-list">
              {fieldFormSummary.recentResponses.slice(0, 5).map((response) => (
                <article className="manager-feed-row" key={response.id}>
                  <div className="manager-feed-topline">
                    <div>
                      <strong>{response.templateName}</strong>
                      <p className="muted">
                        {response.projectName} â€¢ {response.actor.displayName}
                      </p>
                    </div>
                    <span className="manager-mini-chip">
                      {formatDisplayDateTime(response.createdAt)}
                    </span>
                  </div>
                  <p className="manager-feed-text">
                    {`Versiyon ${response.templateVersionNumber} (${response.templateVersionTitle})`}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="manager-surface-card">
        <div className="manager-section-head compact">
          <div>
            <span className="manager-section-kicker">Rapor al</span>
            <h3 className="manager-section-title">Proje bazli kac gun / kac ekip</h3>
          </div>
          <div className="manager-inline-actions">
            <input
              className="input"
              onChange={(event) => setReportQuery(event.target.value)}
              placeholder="Proje ara"
              value={reportQuery}
            />
            <button className="button ghost" onClick={downloadProjectDurationCsv} type="button">
              Rapor CSV
            </button>
          </div>
        </div>

        {reportLoading ? (
          <div className="empty">Proje sure raporu hazirlaniyor.</div>
        ) : !filteredReportRows.length ? (
          <div className="empty">Filtreye uygun proje raporu bulunmuyor.</div>
        ) : (
          <div className="manager-table-wrap">
            <table className="manager-table">
              <thead>
                <tr>
                  <th>Proje</th>
                  <th>Ilk Gun</th>
                  <th>Son Gun</th>
                  <th>Adam/Gun</th>
                </tr>
              </thead>
              <tbody>
                {filteredReportRows.map((row) => (
                  <tr key={row.projectId}>
                    <td>{row.projectName}</td>
                    <td>{formatDisplayDate(row.firstProgramDate)}</td>
                    <td>{formatDisplayDate(row.lastProgramDate)}</td>
                    <td>{row.totalVisitDays * row.totalUniqueFieldUsers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
