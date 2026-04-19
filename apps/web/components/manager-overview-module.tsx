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
import { dashboardFeatureFlags } from "../lib/feature-flags";
import { AlertMessage } from "./alert-message";
import { useAuth } from "./auth-provider";
import { ManagerQuickAccessChip } from "./manager-quick-access";
import {
  CalendarIcon,
  CheckCircleIcon,
  FileIcon,
  LocationArrowIcon,
  TimelineIcon,
  UsersIcon
} from "./ui-icons";
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

function formatCampaignType(type: string) {
  return type === "DAILY_REMINDER" ? "Gunluk hatirlatici" : "Manuel bildirim";
}

function buildActivityRecord(activity: ManagerDashboardActivity) {
  return {
    id: activity.id,
    title: activity.projectName,
    subtitle: `${activity.actor.displayName} / ${activityTypeLabel(activity)}`,
    description: activity.note?.trim() || "Bu kayit not icermiyor.",
    meta: [formatDisplayDateTime(activity.createdAt), `${activity.fileCount} dosya`]
  };
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
  const jobSummary = overview?.jobSummary;
  const backupOpsSummary = overview?.backupOpsSummary;
  const notificationSummary = overview?.notificationSummary;
  const filteredReportRows = useMemo(() => {
    const query = reportQuery.trim().toLocaleLowerCase("tr-TR");
    if (!query) {
      return reportRows;
    }
    return reportRows.filter((row) => row.projectName.toLocaleLowerCase("tr-TR").includes(query));
  }, [reportQuery, reportRows]);
  const leadProject = programProjects[0];
  const latestActivity = activities[0];
  const latestCampaign = notificationSummary?.campaigns[0];
  const backupHealthy =
    !!backupOpsSummary?.latestRestorePrepare?.integrityVerified &&
    !!backupOpsSummary?.latestRestorePrepare?.inventoryVerified;

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
  const spotlightCards = [
    {
      label: "Saha ekipleri",
      value: `${overview?.summaryCards.openSessionCount ?? 0}`,
      detail:
        activeSessions.length > 0
          ? `${activeSessions[0]?.project.name ?? "Secili proje"} uzerinde aktif hareket var`
          : "Bugun aktif saha oturumu bekleniyor",
      icon: UsersIcon
    },
    {
      label: "Rota disiplini",
      value: `${routingSummary?.recommendedStopCount ?? 0}`,
      detail: routingSummary
        ? `${formatRouteMode(routingSummary.routeMode)} ile ${routingSummary.skippedProjectCount} eksik konum`
        : "Rota ozeti yukleniyor",
      icon: LocationArrowIcon
    }
  ];
  if (dashboardFeatureFlags.fieldForms) {
    spotlightCards.push({
      label: "Form akisi",
      value: `${fieldFormSummary?.totalCount ?? 0}`,
      detail: fieldFormSummary
        ? `${fieldFormSummary.uniqueTemplateCount} template ve ${fieldFormSummary.uniqueProjectCount} proje`
        : "Form sinyali bekleniyor",
      icon: FileIcon
    });
  }
  const quickStatusItems = [
    {
      label: "Jobs",
      value: `${jobSummary?.runningCount ?? 0} aktif`,
      detail: `${jobSummary?.failedCount ?? 0} hata kaydi`,
      tone: jobSummary?.failedCount ? "warn" : "ok",
      icon: TimelineIcon
    },
    {
      label: "Restore check",
      value: backupHealthy ? "Hazir" : "Kontrol et",
      detail: backupOpsSummary?.latestRestorePrepare
        ? formatDisplayDateTime(backupOpsSummary.latestRestorePrepare.startedAt)
        : "Kayit bekleniyor",
      tone: backupHealthy ? "ok" : "warn",
      icon: CheckCircleIcon
    },
    {
      label: "Bildirim",
      value: `${notificationSummary?.sentCount ?? 0} teslim`,
      detail: latestCampaign ? formatCampaignType(latestCampaign.type) : "Kampanya bekleniyor",
      tone: notificationSummary?.failedCount ? "warn" : "neutral",
      icon: CalendarIcon
    }
  ];

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
      <section className="manager-overview-hero">
        <div className="manager-command-surface manager-overview-poster">
          <div className="manager-command-copy">
            <span className="manager-command-kicker">Secili gun</span>
            <h2 className="manager-block-title">Operasyon ritmini tek bakista yonetin</h2>
            <p className="manager-block-copy manager-block-copy-visible">
              Saha ekipleri, rota disiplini ve export operasyonlari ayni ana yuzeyde.
            </p>
          </div>
          <div className="manager-overview-highlights">
            <div className="manager-inline-actions manager-inline-actions-wrap">
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
            <div className="manager-overview-spotlights">
              {spotlightCards.map((item) => {
                const Icon = item.icon;

                return (
                  <article className="manager-overview-spotlight" key={item.label}>
                    <span className="manager-overview-spotlight-icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <div>
                      <span>{item.label}</span>
                      <strong>{loading ? "..." : item.value}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="manager-surface-card manager-overview-sidecar">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Hizli durum</span>
              <h3 className="manager-section-title">Bugunun kontrol noktasi</h3>
            </div>
            <span className="manager-mini-chip">{formatDisplayDate(selectedDate)}</span>
          </div>

          <div className="manager-overview-statuslist">
            {quickStatusItems.map((item) => {
              const Icon = item.icon;

              return (
                <article className={`manager-overview-status manager-overview-status-${item.tone}`} key={item.label}>
                  <span className="manager-overview-status-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <div>
                    <strong>{item.label}</strong>
                    <b>{item.value}</b>
                    <p>{item.detail}</p>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="manager-overview-actions">
            <button className="button" onClick={downloadDailyCsv} type="button">
              Gunluk CSV
            </button>
            <button className="button ghost" onClick={downloadProjectDurationCsv} type="button">
              Proje CSV
            </button>
          </div>

          <div className="manager-overview-note">
            <strong>Odak noktasi</strong>
            <p>
              {leadProject
                ? `${leadProject.projectName} bugun oncelikli proje olarak one cikiyor.`
                : "Secili gun icin program onceligi henuz olusmadi."}
            </p>
            <p>
              {latestActivity
                ? `Son hareket ${latestActivity.actor.displayName} tarafindan ${formatDisplayDateTime(latestActivity.createdAt)} aninda kaydedildi.`
                : "Yeni aktivite kaydi beklenecek."}
            </p>
          </div>
        </aside>
      </section>

      {message ? <AlertMessage message={message} /> : null}

      <section className="manager-stat-ribbon manager-stat-ribbon-premium">
        {summaryCards.map((card) => (
          <article className="manager-stat-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{loading ? "..." : card.value}</strong>
            <small>{card.detail}</small>
          </article>
        ))}
      </section>

      <section className="manager-command-surface manager-command-surface-grid manager-command-surface-secondary">
        <div className="manager-command-copy">
          <span className="manager-command-kicker">Operasyon ciktisi</span>
          <h2 className="manager-block-title">Takvim, export ve raporlari hizli yonet</h2>
          <p className="manager-block-copy manager-block-copy-visible">
            Gun secimi ve indirme aksiyonlari merkezi yuzeyde tutuluyor; alttaki paneller ise gune ait detay akisini veriyor.
          </p>
        </div>
        <div className="manager-command-controls manager-command-controls-left">
          <div className="manager-inline-actions manager-inline-actions-wrap">
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

      <div className="manager-dashboard-grid-operations">
        <section className="manager-surface-card">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Canli ekipler</span>
              <h3 className="manager-section-title">Aktif saha oturumlari</h3>
            </div>
            <ManagerQuickAccessChip
              ariaLabel="Aktif saha oturumlarini ac"
              payload={{
                title: "Aktif saha oturumlari",
                summary: "Secili gunde aktif saha oturumlari listeleniyor.",
                records: activeSessions.map((session) => ({
                  id: session.assignmentId,
                  title: session.user.displayName,
                  subtitle: session.project.name,
                  description: session.project.customerName ?? "Cari bilgisi yok",
                  meta: [formatDisplayDateTime(session.startedAt)]
                })),
                links: [{ href: "/dashboard/tracking", label: "Takip" }]
              }}
            >
              {loading ? "Yukleniyor..." : `${activeSessions.length} aktif`}
            </ManagerQuickAccessChip>
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
            <ManagerQuickAccessChip
              ariaLabel="Bugunun oncelikli projelerini ac"
              payload={{
                title: "Bugunun oncelikli projeleri",
                summary: "Secili gun icin program yuzeyine dusen projeler listeleniyor.",
                records: programProjects.map((project) => ({
                  id: project.id,
                  title: project.projectName,
                  subtitle: project.customerName ?? project.locationLabel ?? "",
                  description: project.latestActivityAt
                    ? `Son hareket ${formatDisplayDateTime(project.latestActivityAt)}`
                    : "Hareket yok",
                  meta: [
                    `${project.assignmentCount} ekip`,
                    `${project.noteCount} not`,
                    `${project.fileCount} dosya`
                  ]
                })),
                links: [{ href: "/dashboard/program", label: "Gunluk Program" }]
              }}
            >
              {programProjects.length} proje
            </ManagerQuickAccessChip>
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
              <span className="manager-section-kicker">Job ozeti</span>
              <h3 className="manager-section-title">Arka plan operasyonlari</h3>
            </div>
            <div className="manager-inline-actions">
              <Link className="button ghost" href="/dashboard/jobs" scroll={false}>
                Tum Isler
              </Link>
              <ManagerQuickAccessChip
                ariaLabel="Job kayitlarini ac"
                payload={{
                  title: "Job kayitlari",
                  summary: "Son execution kayitlari listeleniyor.",
                  records:
                    jobSummary?.recentExecutions.map((execution) => ({
                      id: execution.id,
                      title: execution.jobName,
                      subtitle: execution.actor?.displayName ?? "Sistem",
                      description: execution.status,
                      meta: [execution.triggerSource, formatDisplayDateTime(execution.startedAt)]
                    })) ?? [],
                  links: [{ href: "/dashboard/jobs", label: "Tum Isler" }]
                }}
              >
                {jobSummary?.totalCount ?? 0} kayit
              </ManagerQuickAccessChip>
              <ManagerQuickAccessChip
                ariaLabel="Calisan joblari ac"
                payload={{
                  title: "Calisan joblar",
                  summary: "Halen calisan execution kayitlari listeleniyor.",
                  records:
                    jobSummary?.recentExecutions
                      .filter((execution) => execution.status === "RUNNING")
                      .map((execution) => ({
                        id: execution.id,
                        title: execution.jobName,
                        subtitle: execution.actor?.displayName ?? "Sistem",
                        description: execution.triggerSource,
                        meta: [formatDisplayDateTime(execution.startedAt)]
                      })) ?? [],
                  links: [{ href: "/dashboard/jobs", label: "Tum Isler" }]
                }}
              >
                {jobSummary?.runningCount ?? 0} calisiyor
              </ManagerQuickAccessChip>
              <ManagerQuickAccessChip
                ariaLabel="Hatali joblari ac"
                payload={{
                  title: "Hatali joblar",
                  summary: "Hata ile biten execution kayitlari listeleniyor.",
                  records:
                    jobSummary?.recentExecutions
                      .filter((execution) => execution.status === "FAILED")
                      .map((execution) => ({
                        id: execution.id,
                        title: execution.jobName,
                        subtitle: execution.actor?.displayName ?? "Sistem",
                        description: execution.status,
                        meta: [formatDisplayDateTime(execution.startedAt)]
                      })) ?? [],
                  links: [{ href: "/dashboard/jobs", label: "Tum Isler" }]
                }}
              >
                {jobSummary?.failedCount ?? 0} hata
              </ManagerQuickAccessChip>
            </div>
          </div>

          {!overview && loading ? (
            <div className="empty">Job ozeti yukleniyor.</div>
          ) : !jobSummary?.recentExecutions.length ? (
            <div className="empty">Secili gun icin job execution kaydi bulunmuyor.</div>
          ) : (
            <div className="manager-feed-list">
              {jobSummary.recentExecutions.slice(0, 5).map((execution) => (
                <article className="manager-feed-row" key={execution.id}>
                  <div className="manager-feed-topline">
                    <div>
                      <strong>{execution.jobName}</strong>
                      <p className="muted">
                        {(execution.actor?.displayName ?? "Sistem")} / {execution.triggerSource}
                      </p>
                    </div>
                    <span className="manager-mini-chip">
                      {formatDisplayDateTime(execution.startedAt)}
                    </span>
                  </div>
                  <div className="manager-feed-inline">
                    <span className="manager-mini-chip">{execution.status}</span>
                    {execution.targetDate ? (
                      <span className="manager-mini-chip">{execution.targetDate}</span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="manager-surface-card">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Backup / Restore</span>
              <h3 className="manager-section-title">Operasyon sagligi</h3>
            </div>
            <div className="manager-inline-actions">
              <Link className="button ghost" href="/dashboard/jobs?filter=backup-ops" scroll={false}>
                Jobs Ac
              </Link>
              <span className="manager-mini-chip">{backupOpsSummary?.exportCount ?? 0} export</span>
              <span className="manager-mini-chip">
                {backupOpsSummary?.restorePrepareCount ?? 0} restore check
              </span>
            </div>
          </div>

          {!overview && loading ? (
            <div className="empty">Backup ve restore ozeti yukleniyor.</div>
          ) : !backupOpsSummary?.latestRestorePrepare ? (
            <div className="empty">Secili gunde restore hazirligi kaydi bulunmuyor.</div>
          ) : (
            <div className="manager-feed-list">
              <article className="manager-feed-row">
                <div className="manager-feed-topline">
                  <div>
                    <strong>Son restore hazirligi</strong>
                    <p className="muted">{formatDisplayDateTime(backupOpsSummary.latestRestorePrepare.startedAt)}</p>
                  </div>
                  <span className="manager-mini-chip">{backupOpsSummary.latestRestorePrepare.status}</span>
                </div>
                  <div className="manager-feed-inline">
                    <span className="manager-mini-chip">
                      Integrity {backupOpsSummary.latestRestorePrepare.integrityVerified ? "OK" : "FAIL"}
                    </span>
                    <span className="manager-mini-chip">
                      Inventory {backupOpsSummary.latestRestorePrepare.inventoryVerified ? "OK" : "FAIL"}
                    </span>
                    <span className="manager-mini-chip">
                      {backupOpsSummary.latestRestorePrepare.missingArtifactCount} eksik artifact
                    </span>
                    {!backupOpsSummary.latestRestorePrepare.integrityVerified ||
                    !backupOpsSummary.latestRestorePrepare.inventoryVerified ? (
                      <span className="manager-mini-chip">Aksiyon gerekli</span>
                    ) : null}
                  </div>
                  {!backupOpsSummary.latestRestorePrepare.integrityVerified ||
                  !backupOpsSummary.latestRestorePrepare.inventoryVerified ? (
                    <p className="manager-feed-text">
                      Son restore hazirligi tam gecmedi. Jobs ekraninda artifact ve checksum detayini inceleyin.
                    </p>
                  ) : (
                    <p className="manager-feed-text">
                      Son restore hazirligi integrity ve inventory kontrolunu gecti.
                    </p>
                  )}
                </article>
              </div>
            )}
        </section>

        <section className="manager-surface-card">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Son hareketler</span>
              <h3 className="manager-section-title">Gundeki operasyon akisi</h3>
            </div>
            <ManagerQuickAccessChip
              ariaLabel="Operasyon hareketlerini ac"
              payload={{
                title: "Operasyon hareketleri",
                summary: "Secili gune ait son operasyon hareketleri listeleniyor.",
                records: activities.map(buildActivityRecord),
                links: [{ href: "/dashboard/projects", label: "Projeler" }]
              }}
            >
              {activities.length} kayit
            </ManagerQuickAccessChip>
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
                        {activity.actor.displayName} / {activityTypeLabel(activity)}
                      </p>
                    </div>
                    <span className="manager-mini-chip">{formatDisplayDateTime(activity.createdAt)}</span>
                  </div>
                  <p className="manager-feed-text">
                    {activity.note?.trim() || "Bu kayit not icermez, operasyon hareketi olarak kaydedildi."}
                  </p>
                  <div className="manager-feed-inline">
                    <ManagerQuickAccessChip
                      ariaLabel={`${activity.projectName} dosya kaydini ac`}
                      payload={{
                        title: `${activity.projectName} dosya kaydi`,
                        summary: "Bu hareketin dosya yogunlugu ve baglami listeleniyor.",
                        records: [buildActivityRecord(activity)],
                        links: [{ href: "/dashboard/projects", label: "Projeler" }]
                      }}
                    >
                      {activity.fileCount} dosya
                    </ManagerQuickAccessChip>
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
              <Link className="button ghost" href="/dashboard/jobs" scroll={false}>
                Job Gecmisi
              </Link>
              <ManagerQuickAccessChip
                ariaLabel="Bildirim kampanyalarini ac"
                payload={{
                  title: "Bildirim kampanyalari",
                  summary: "Kayitli kampanyalar listeleniyor.",
                  records:
                    notificationSummary?.campaigns.map((campaign) => ({
                      id: campaign.id,
                      title: campaign.title,
                      subtitle: formatCampaignType(campaign.type),
                      description: campaign.message,
                      meta: [
                        `${campaign.deliveryCount} hedef`,
                        `${campaign.sentCount} gonderildi`,
                        `${campaign.failedCount} basarisiz`
                      ]
                    })) ?? [],
                  links: [{ href: "/dashboard/tracking", label: "Takip" }]
                }}
              >
                {notificationSummary?.totalCount ?? 0} kampanya
              </ManagerQuickAccessChip>
              <ManagerQuickAccessChip
                ariaLabel="Teslim edilen bildirimleri ac"
                payload={{
                  title: "Teslim edilen bildirimler",
                  summary: "Teslim oranlari kampanya bazinda listeleniyor.",
                  records:
                    notificationSummary?.campaigns
                      .filter((campaign) => campaign.sentCount > 0)
                      .map((campaign) => ({
                        id: campaign.id,
                        title: campaign.title,
                        subtitle: formatCampaignType(campaign.type),
                        description: campaign.message,
                        meta: [`${campaign.sentCount} gonderildi`]
                      })) ?? [],
                  links: [{ href: "/dashboard/tracking", label: "Takip" }]
                }}
              >
                {notificationSummary?.sentCount ?? 0} teslim
              </ManagerQuickAccessChip>
              <ManagerQuickAccessChip
                ariaLabel="Basarisiz bildirimleri ac"
                payload={{
                  title: "Basarisiz bildirimler",
                  summary: "Hata tasiyan kampanyalar listeleniyor.",
                  records:
                    notificationSummary?.campaigns
                      .filter((campaign) => campaign.failedCount > 0)
                      .map((campaign) => ({
                        id: campaign.id,
                        title: campaign.title,
                        subtitle: formatCampaignType(campaign.type),
                        description: campaign.message,
                        meta: [`${campaign.failedCount} basarisiz`]
                      })) ?? [],
                  links: [{ href: "/dashboard/tracking", label: "Takip" }]
                }}
              >
                {notificationSummary?.failedCount ?? 0} hata
              </ManagerQuickAccessChip>
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
                    <ManagerQuickAccessChip
                      ariaLabel={`${campaign.title} hedeflerini ac`}
                      payload={{
                        title: `${campaign.title} hedefleri`,
                        summary: "Kampanya teslimat ozetleri listeleniyor.",
                        records: [
                          {
                            id: campaign.id,
                            title: campaign.title,
                            subtitle: formatCampaignType(campaign.type),
                            description: campaign.message,
                            meta: [
                              `${campaign.deliveryCount} hedef`,
                              `${campaign.sentCount} gonderildi`,
                              `${campaign.failedCount} basarisiz`
                            ]
                          }
                        ],
                        links: [{ href: "/dashboard/tracking", label: "Takip" }]
                      }}
                    >
                      {campaign.deliveryCount} hedef
                    </ManagerQuickAccessChip>
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
              <ManagerQuickAccessChip
                ariaLabel="Rota duraklarini ac"
                payload={{
                  title: "Rota duraklari",
                  summary: "Onerilen rota duraklari listeleniyor.",
                  records:
                    routingSummary?.topStops.map((stop) => ({
                      id: stop.projectId,
                      title: stop.projectName,
                      subtitle: `Sira ${stop.recommendationRank}`,
                      description:
                        stop.distanceFromPreviousKm === null
                          ? "Anchor baslangici"
                          : `${stop.distanceFromPreviousKm.toFixed(2)} km`,
                      meta: [`${stop.assignmentCount} ekip`, `${stop.activeSessionCount} aktif`]
                    })) ?? [],
                  links: [{ href: "/dashboard/tracking", label: "Takip" }]
                }}
              >
                {routingSummary?.recommendedStopCount ?? 0} durak
              </ManagerQuickAccessChip>
              <ManagerQuickAccessChip
                ariaLabel="Eksik konumlari ac"
                payload={{
                  title: "Eksik konumlar",
                  summary: "Rota ozetindeki eksik konum sayisi drawer uzerinden izlenir.",
                  records:
                    (routingSummary?.skippedProjectCount ?? 0) > 0
                      ? [
                          {
                            id: `${selectedDate}-skipped`,
                            title: "Eksik konumlu projeler",
                            description: `${routingSummary?.skippedProjectCount ?? 0} proje rota disinda kaldi.`
                          }
                        ]
                      : [],
                  links: [{ href: "/dashboard/tracking", label: "Takip" }]
                }}
              >
                {routingSummary?.skippedProjectCount ?? 0} eksik konum
              </ManagerQuickAccessChip>
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
                      <ManagerQuickAccessChip
                        ariaLabel={`${stop.projectName} ekiplerini ac`}
                        payload={{
                          title: `${stop.projectName} rota ekibi`,
                          summary: "Duraga bagli ekip ve aktif saha sayisi listeleniyor.",
                          records: [
                            {
                              id: stop.projectId,
                              title: stop.projectName,
                              subtitle: `Sira ${stop.recommendationRank}`,
                              description: "Rota duragi ozet kaydi",
                              meta: [`${stop.assignmentCount} ekip`, `${stop.activeSessionCount} aktif`]
                            }
                          ],
                          links: [{ href: "/dashboard/tracking", label: "Takip" }]
                        }}
                      >
                        {stop.assignmentCount} ekip
                      </ManagerQuickAccessChip>
                      <ManagerQuickAccessChip
                        ariaLabel={`${stop.projectName} aktif saha durumunu ac`}
                        payload={{
                          title: `${stop.projectName} aktif saha`,
                          summary: "Durakta gorunen aktif saha sinyali listeleniyor.",
                          records: [
                            {
                              id: `${stop.projectId}-active`,
                              title: stop.projectName,
                              description: `${stop.activeSessionCount} aktif saha`
                            }
                          ],
                          links: [{ href: "/dashboard/tracking", label: "Takip" }]
                        }}
                      >
                        {stop.activeSessionCount} aktif
                      </ManagerQuickAccessChip>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {dashboardFeatureFlags.fieldForms ? (
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
                        <p className="muted">{response.projectName} / {response.actor.displayName}</p>
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
        ) : null}
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
