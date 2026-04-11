"use client";

import Link from "next/link";
import {
  BackupRestorePreparationResult,
  JobArtifactPreview,
  JobExecutionStatus,
  JobExecutionSummary
} from "@kagu/contracts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, fetchAuthorizedBlob, isAbortError } from "../lib/api";
import { formatDisplayDateTime } from "../lib/date";
import { AlertMessage } from "./alert-message";
import { useAuth } from "./auth-provider";
import { ManagerDrawer, ManagerDrawerSection } from "./manager-ui";
import { CheckCircleIcon, FileIcon, RefreshIcon, TimelineIcon } from "./ui-icons";

type FilterDraft = {
  jobName: string;
  status: "" | JobExecutionStatus;
};

const emptyFilters: FilterDraft = {
  jobName: "",
  status: ""
};

const backupOpsFilterValue = "system.backup";

function isBackupExportJob(jobName: string) {
  return jobName === "system.backup-export";
}

function isBackupRestorePrepareJob(jobName: string) {
  return jobName === "system.backup-restore-prepare";
}

function isBackupOperationJob(jobName: string) {
  return isBackupExportJob(jobName) || isBackupRestorePrepareJob(jobName);
}

function getBackupExportPath(resultSummary: Record<string, unknown> | null) {
  const relativePath = resultSummary?.relativePath;
  return typeof relativePath === "string" ? relativePath : null;
}

function getBackupExportCounts(resultSummary: Record<string, unknown> | null) {
  const counts = resultSummary?.counts;
  if (!counts || typeof counts !== "object") {
    return null;
  }

  const entries = Object.entries(counts).filter((entry): entry is [string, number] => {
    const [, value] = entry;
    return typeof value === "number";
  });

  return entries.length ? Object.fromEntries(entries) : null;
}

function getBackupExportSummaryLine(resultSummary: Record<string, unknown> | null) {
  const counts = getBackupExportCounts(resultSummary);
  if (!counts) {
    return null;
  }

  const userCount = counts.activeUsers ?? counts.totalUsers;
  const parts = [
    typeof counts.projects === "number" ? `${counts.projects} proje` : null,
    typeof userCount === "number" ? `${userCount} kullanici` : null,
    typeof counts.dailyPrograms === "number" ? `${counts.dailyPrograms} program` : null
  ].filter(Boolean);

  return parts.length ? parts.join(" / ") : null;
}

function getBackupExportIntegrity(resultSummary: Record<string, unknown> | null) {
  const integrityValue = resultSummary?.integrity;
  if (!integrityValue || typeof integrityValue !== "object") {
    return null;
  }
  const integrity = integrityValue as Record<string, unknown>;

  const algorithm = typeof integrity.algorithm === "string" ? integrity.algorithm : null;
  const payloadSha256 =
    typeof integrity.payloadSha256 === "string" ? integrity.payloadSha256 : null;
  const payloadBytes = typeof integrity.payloadBytes === "number" ? integrity.payloadBytes : null;

  if (!algorithm && !payloadSha256 && payloadBytes === null) {
    return null;
  }

  return {
    algorithm,
    payloadSha256,
    payloadBytes
  };
}

function getBackupExportInventory(resultSummary: Record<string, unknown> | null) {
  const inventoryValue = resultSummary?.inventory;
  if (!inventoryValue || typeof inventoryValue !== "object") {
    return null;
  }
  const inventory = inventoryValue as Record<string, unknown>;

  const artifactCount =
    typeof inventory.artifactCount === "number" ? inventory.artifactCount : null;
  const artifacts = Array.isArray(inventory.artifacts)
    ? inventory.artifacts
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const artifact = item as Record<string, unknown>;
          const type = typeof artifact.type === "string" ? artifact.type : null;
          const relativePath =
            typeof artifact.relativePath === "string" ? artifact.relativePath : null;

          if (!type || !relativePath) {
            return null;
          }

          return {
            type,
            relativePath
          };
        })
        .filter(
          (artifact): artifact is { type: string; relativePath: string } => artifact !== null
        )
    : [];
  const relatedLogs = Array.isArray(inventory.relatedLogs)
    ? inventory.relatedLogs.filter((value): value is string => typeof value === "string")
    : [];

  if (artifactCount === null && !artifacts.length && !relatedLogs.length) {
    return null;
  }

  return {
    artifactCount,
    artifacts,
    relatedLogs
  };
}

function getBackupExportArtifactPath(
  resultSummary: Record<string, unknown> | null,
  artifactType: string
) {
  const inventory = getBackupExportInventory(resultSummary);
  return inventory?.artifacts.find((artifact) => artifact.type === artifactType)?.relativePath ?? null;
}

function getRestorePreparationSummary(resultSummary: Record<string, unknown> | null) {
  const integrityVerified = resultSummary?.integrityVerified;
  const inventoryVerified = resultSummary?.inventoryVerified;
  const artifactCount = resultSummary?.artifactCount;
  const missingArtifacts = Array.isArray(resultSummary?.missingArtifacts)
    ? resultSummary?.missingArtifacts.filter((value): value is string => typeof value === "string")
    : [];

  if (
    typeof integrityVerified !== "boolean" &&
    typeof inventoryVerified !== "boolean" &&
    typeof artifactCount !== "number" &&
    !missingArtifacts.length
  ) {
    return null;
  }

  return {
    integrityVerified: typeof integrityVerified === "boolean" ? integrityVerified : null,
    inventoryVerified: typeof inventoryVerified === "boolean" ? inventoryVerified : null,
    artifactCount: typeof artifactCount === "number" ? artifactCount : null,
    missingArtifacts
  };
}

function formatDuration(startedAt: string, finishedAt: string | null) {
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);
  const totalSeconds = Math.floor(diffMs / 1000);

  if (totalSeconds < 60) {
    return `${totalSeconds} sn`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes} dk ${seconds} sn`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} sa ${remainingMinutes} dk`;
}

function formatStatus(status: JobExecutionStatus) {
  switch (status) {
    case "RUNNING":
      return "Calisiyor";
    case "SUCCEEDED":
      return "Basarili";
    case "FAILED":
      return "Hatali";
    default:
      return status;
  }
}

function formatArtifactType(type: string) {
  switch (type) {
    case "manifest":
      return "Manifest";
    case "summary":
      return "Summary";
    case "system-event-log":
      return "System Event Log";
    default:
      return type;
  }
}

export function ManagerJobsModule() {
  const { token } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [executions, setExecutions] = useState<JobExecutionSummary[]>([]);
  const [filters, setFilters] = useState<FilterDraft>(() =>
    searchParams.get("filter") === "backup-ops"
      ? { jobName: backupOpsFilterValue, status: "" }
      : emptyFilters
  );
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportingBackup, setExportingBackup] = useState(false);
  const [preparingRestorePath, setPreparingRestorePath] = useState<string | null>(null);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [previewingPath, setPreviewingPath] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<JobExecutionSummary | null>(null);
  const [selectedArtifactPreview, setSelectedArtifactPreview] = useState<JobArtifactPreview | null>(null);
  const [selectedRestorePreparation, setSelectedRestorePreparation] =
    useState<BackupRestorePreparationResult | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  async function fetchExecutions(signal?: AbortSignal) {
    if (!token) {
      return;
    }

    const params = new URLSearchParams();
    if (filters.jobName.trim() && filters.jobName.trim() !== backupOpsFilterValue) {
      params.set("jobName", filters.jobName.trim());
    }
    if (filters.status) {
      params.set("status", filters.status);
    }
    params.set("limit", "50");

    const path = `/jobs/executions?${params.toString()}`;
    const data = await apiFetch<JobExecutionSummary[]>(path, { signal }, token);
    setExecutions(
      filters.jobName.trim() === backupOpsFilterValue
        ? data.filter((execution) => isBackupOperationJob(execution.jobName))
        : data
    );
    setLastUpdatedAt(new Date().toISOString());
  }

  useEffect(() => {
    if (!token) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    void fetchExecutions(controller.signal)
      .catch((error) => {
        if (!isAbortError(error)) {
          setMessage(error instanceof Error ? error.message : "İş geçmişi yüklenemedi.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (!token || !autoRefresh) {
      return;
    }

    const interval = window.setInterval(() => {
      void fetchExecutions().catch(() => undefined);
    }, 15000);

    return () => window.clearInterval(interval);
  }, [autoRefresh, token, filters.jobName, filters.status]);

  const stats = useMemo(
    () => ({
      running: executions.filter((execution) => execution.status === "RUNNING").length,
      succeeded: executions.filter((execution) => execution.status === "SUCCEEDED").length,
      failed: executions.filter((execution) => execution.status === "FAILED").length,
      backupExports: executions.filter((execution) => isBackupExportJob(execution.jobName)).length,
      restorePrepares: executions.filter((execution) => isBackupRestorePrepareJob(execution.jobName))
        .length
    }),
    [executions]
  );

  async function applyFilters() {
    try {
      setLoading(true);
      await fetchExecutions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Is gecmisi filtrelenemedi.");
    } finally {
      setLoading(false);
    }
  }

  async function applyPreset(nextFilters: FilterDraft) {
    setFilters(nextFilters);
    const params = new URLSearchParams(searchParams.toString());
    if (nextFilters.jobName === backupOpsFilterValue) {
      params.set("filter", "backup-ops");
    } else {
      params.delete("filter");
    }
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}` as never, {
      scroll: false
    });

    if (!token) {
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (nextFilters.jobName.trim() && nextFilters.jobName.trim() !== backupOpsFilterValue) {
        params.set("jobName", nextFilters.jobName.trim());
      }
      if (nextFilters.status) {
        params.set("status", nextFilters.status);
      }
      params.set("limit", "50");

      const data = await apiFetch<JobExecutionSummary[]>(
        `/jobs/executions?${params.toString()}`,
        {},
        token
      );
      setExecutions(
        nextFilters.jobName.trim() === backupOpsFilterValue
          ? data.filter((execution) => isBackupOperationJob(execution.jobName))
          : data
      );
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hazir filtre uygulanamadi.");
    } finally {
      setLoading(false);
    }
  }

  async function createBackupExport() {
    if (!token) {
      return;
    }

    try {
      setExportingBackup(true);
      const label = `panel-${new Date().toISOString().slice(0, 10)}`;
      const result = await apiFetch<{
        relativePath: string;
        exportedAt: string;
      }>(
        "/jobs/backup-export",
        {
          method: "POST",
          body: JSON.stringify({ label })
        },
        token
      );
      setMessage(`Backup export olusturuldu: ${result.relativePath}`);
      await fetchExecutions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Backup export baslatilamadi.");
    } finally {
      setExportingBackup(false);
    }
  }

  async function downloadArtifact(relativePath: string) {
    if (!token) {
      return;
    }

    try {
      setDownloadingPath(relativePath);
      const query = new URLSearchParams({ path: relativePath });
      const { blob, filename, objectUrl } = await fetchAuthorizedBlob(
        `/jobs/artifacts/download?${query.toString()}`,
        token
      );
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setMessage(`${filename} indirildi (${blob.size} bytes).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Artifact indirilemedi.");
    } finally {
      setDownloadingPath(null);
    }
  }

  async function previewArtifact(relativePath: string) {
    if (!token) {
      return;
    }

    try {
      setPreviewingPath(relativePath);
      const query = new URLSearchParams({ path: relativePath });
      const preview = await apiFetch<JobArtifactPreview>(
        `/jobs/artifacts/preview?${query.toString()}`,
        {},
        token
      );
      setSelectedArtifactPreview(preview);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Artifact preview alinamadi.");
    } finally {
      setPreviewingPath(null);
    }
  }

  async function prepareRestore(manifestPath: string) {
    if (!token) {
      return;
    }

    try {
      setPreparingRestorePath(manifestPath);
      const result = await apiFetch<BackupRestorePreparationResult>(
        "/jobs/backup-restore-prepare",
        {
          method: "POST",
          body: JSON.stringify({ manifestPath })
        },
        token
      );
      setSelectedRestorePreparation(result);
      setMessage(
        result.integrityVerified && result.inventoryVerified
          ? "Restore hazirligi dogrulandi."
          : "Restore hazirligi eksik artifact veya integrity hatasi buldu."
      );
      await fetchExecutions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Restore hazirligi calistirilamadi.");
    } finally {
      setPreparingRestorePath(null);
    }
  }

  const selectedIntegrity = getBackupExportIntegrity(selectedExecution?.resultSummary ?? null);
  const selectedInventory = getBackupExportInventory(selectedExecution?.resultSummary ?? null);
  const selectedCounts = getBackupExportCounts(selectedExecution?.resultSummary ?? null);
  const selectedSummaryArtifactPath = getBackupExportArtifactPath(
    selectedExecution?.resultSummary ?? null,
    "summary"
  );
  const previewExecution = selectedExecution ?? executions[0] ?? null;
  const previewRestoreSummary = getRestorePreparationSummary(previewExecution?.resultSummary ?? null);
  const jobSignalCards = [
    {
      label: "Calisan is",
      value: `${stats.running}`,
      detail: "Henüz tamamlanmamış işlem kayıtları",
      icon: RefreshIcon
    },
    {
      label: "Export",
      value: `${stats.backupExports}`,
      detail: "Yedek manifest ureten kosular",
      icon: FileIcon
    },
    {
      label: "Restore check",
      value: `${stats.restorePrepares}`,
      detail: "Restore hazirlik dogrulama adimlari",
      icon: CheckCircleIcon
    }
  ];

  return (
    <>
      <div className="manager-module manager-stack-layout">
        <section className="manager-overview-hero">
          <div className="manager-command-surface manager-overview-poster">
            <div className="manager-command-copy">
              <span className="manager-command-kicker">Job execution</span>
              <h2 className="manager-block-title">Arka plan operasyonlarini saglik, artifact ve restore baglamiyla izleyin</h2>
              <p className="manager-block-copy manager-block-copy-visible">
                İşlem kayıtları, yedek akışları ve geri yükleme kontrol sonuçları tek operasyon panelinde toplandı.
              </p>
            </div>
            <div className="manager-overview-highlights">
              <div className="manager-inline-actions manager-inline-actions-wrap">
                <Link className="button ghost" href="/dashboard/templates" scroll={false}>
                  Template'lere Don
                </Link>
                <Link className="button ghost" href="/dashboard/tracking" scroll={false}>
                  Takibi Ac
                </Link>
                <button
                  className="button"
                  disabled={exportingBackup}
                  onClick={() => void createBackupExport()}
                  type="button"
                >
                  {exportingBackup ? "Export Hazirlaniyor..." : "Backup Export"}
                </button>
              </div>
              <div className="manager-inline-actions manager-inline-actions-wrap">
                <input
                  className="input"
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, jobName: event.target.value }))
                  }
                  placeholder="Job ara"
                  value={filters.jobName}
                />
                <select
                  className="select"
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      status: event.target.value as FilterDraft["status"]
                    }))
                  }
                  value={filters.status}
                >
                  <option value="">Tum durumlar</option>
                  <option value="RUNNING">Calisiyor</option>
                  <option value="SUCCEEDED">Basarili</option>
                  <option value="FAILED">Hatali</option>
                </select>
                <button className="button" onClick={() => void applyFilters()} type="button">
                  Filtreyi Uygula
                </button>
              </div>
              <div className="manager-overview-spotlights">
                {jobSignalCards.map((item) => {
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
                <h3 className="manager-section-title">Execution odagi</h3>
              </div>
              <span className="manager-mini-chip">{lastUpdatedAt ? formatDisplayDateTime(lastUpdatedAt) : "-"}</span>
            </div>

            <div className="manager-overview-statuslist">
              <article className={`manager-overview-status ${stats.failed ? "manager-overview-status-warn" : "manager-overview-status-ok"}`}>
                <span className="manager-overview-status-icon" aria-hidden="true">
                  <TimelineIcon />
                </span>
                <div>
                  <strong>Liste sagligi</strong>
                  <b>{stats.failed ? "Kontrol et" : "Stabil"}</b>
                  <p>{stats.failed} hatali, {stats.running} calisan execution var</p>
                </div>
              </article>
              <article className="manager-overview-status">
                <span className="manager-overview-status-icon" aria-hidden="true">
                  <CheckCircleIcon />
                </span>
                <div>
                  <strong>Restore hazirligi</strong>
                  <b>{previewRestoreSummary?.integrityVerified && previewRestoreSummary?.inventoryVerified ? "Hazir" : "Beklemede"}</b>
                  <p>{previewExecution?.jobName ?? "İşlem seçildiğinde detay gösterilir"}</p>
                </div>
              </article>
            </div>

            <div className="manager-inline-actions manager-inline-actions-wrap">
              <button
                className="button ghost"
                onClick={() => void applyPreset({ jobName: "", status: "FAILED" })}
                type="button"
              >
                Sadece Hatali
              </button>
              <button
                className="button ghost"
                onClick={() => void applyPreset({ jobName: backupOpsFilterValue, status: "" })}
                type="button"
              >
                Backup Ops
              </button>
              <button className="button ghost" onClick={() => void applyPreset(emptyFilters)} type="button">
                Temizle
              </button>
            </div>

            <label className="toggle-row">
              <span>Auto refresh</span>
              <input
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
                type="checkbox"
              />
            </label>
          </aside>
        </section>

        {message ? <AlertMessage message={message} /> : null}

        <section className="manager-panel-split">
          <section className="manager-surface-card">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Execution listesi</span>
              <h3 className="manager-section-title">Son job kosulari</h3>
            </div>
            <span className="manager-mini-chip">{executions.length} kayıt</span>
          </div>

            {loading ? (
              <div className="empty">İşlem listesi yükleniyor.</div>
            ) : !executions.length ? (
              <div className="empty">Filtreye uygun job execution kaydi bulunmuyor.</div>
            ) : (
              <div className="manager-feed-list">
              {executions.map((execution) => {
                const backupExportPath = getBackupExportPath(execution.resultSummary);
                const backupExport = isBackupExportJob(execution.jobName);
                const backupRestorePrepare = isBackupRestorePrepareJob(execution.jobName);
                const backupExportSummary = getBackupExportSummaryLine(execution.resultSummary);
                const backupExportIntegrity = getBackupExportIntegrity(execution.resultSummary);
                const restorePreparationSummary = getRestorePreparationSummary(execution.resultSummary);
                const backupExportSummaryPath = getBackupExportArtifactPath(
                  execution.resultSummary,
                  "summary"
                );
                const backupExportManifestPath = getBackupExportArtifactPath(
                  execution.resultSummary,
                  "manifest"
                );

                return (
                  <button
                    className="manager-feed-row manager-directory-button"
                    key={execution.id}
                    onClick={() => {
                      setSelectedExecution(execution);
                      setSelectedArtifactPreview(null);
                      setSelectedRestorePreparation(null);
                      setDetailOpen(true);
                    }}
                    type="button"
                  >
                    <div className="manager-feed-topline">
                      <div>
                        <strong>{execution.jobName}</strong>
                        <p className="muted">{execution.scope ?? "Scope yok"} / {execution.actor?.displayName ?? "Sistem"}</p>
                      </div>
                      <span className="manager-mini-chip">
                        {formatDisplayDateTime(execution.startedAt)}
                      </span>
                    </div>
                    <div className="manager-feed-inline">
                      <span className="manager-mini-chip">{formatStatus(execution.status)}</span>
                      <span className="manager-mini-chip">{execution.triggerSource}</span>
                      <span className="manager-mini-chip">
                        {formatDuration(execution.startedAt, execution.finishedAt)}
                      </span>
                      {backupExport ? <span className="manager-mini-chip">Backup Export</span> : null}
                      {backupRestorePrepare ? (
                        <span className="manager-mini-chip">Restore Prepare</span>
                      ) : null}
                      {backupExportIntegrity?.algorithm ? (
                        <span className="manager-mini-chip">{backupExportIntegrity.algorithm}</span>
                      ) : null}
                      {backupRestorePrepare &&
                      restorePreparationSummary &&
                      restorePreparationSummary.integrityVerified !== null ? (
                        <span className="manager-mini-chip">
                          Integrity {restorePreparationSummary.integrityVerified ? "OK" : "FAIL"}
                        </span>
                      ) : null}
                      {backupRestorePrepare &&
                      restorePreparationSummary &&
                      restorePreparationSummary.inventoryVerified !== null ? (
                        <span className="manager-mini-chip">
                          Inventory {restorePreparationSummary.inventoryVerified ? "OK" : "FAIL"}
                        </span>
                      ) : null}
                      {execution.targetDate ? (
                        <span className="manager-mini-chip">{execution.targetDate}</span>
                      ) : null}
                    </div>
                    {backupExportPath ? (
                      <p className="muted">Export dosyasi: {backupExportPath}</p>
                    ) : null}
                    {backupExportSummaryPath ? (
                      <p className="muted">Summary dosyasi: {backupExportSummaryPath}</p>
                    ) : null}
                    {backupExportSummary ? (
                      <p className="muted">Ozet: {backupExportSummary}</p>
                    ) : null}
                    {backupExportIntegrity?.payloadSha256 ? (
                      <p className="muted">
                        Checksum: {backupExportIntegrity.payloadSha256.slice(0, 12)}...
                      </p>
                    ) : null}
                    {backupRestorePrepare && restorePreparationSummary ? (
                      <p className="muted">
                        Restore ozet:{" "}
                        {[
                          restorePreparationSummary.artifactCount !== null
                            ? `${restorePreparationSummary.artifactCount} artifact`
                            : null,
                          restorePreparationSummary.missingArtifacts.length
                            ? `${restorePreparationSummary.missingArtifacts.length} eksik`
                            : "eksik yok"
                        ]
                          .filter(Boolean)
                          .join(" / ")}
                      </p>
                    ) : null}
                    {backupExport ? (
                      <div
                        className="manager-inline-actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {backupExportManifestPath ? (
                          <button
                            className="button ghost"
                            disabled={downloadingPath === backupExportManifestPath}
                            onClick={() => void downloadArtifact(backupExportManifestPath)}
                            type="button"
                          >
                            {downloadingPath === backupExportManifestPath
                              ? "Manifest iniyor..."
                              : "Manifest"}
                          </button>
                        ) : null}
                        {backupExportManifestPath ? (
                          <button
                            className="button ghost"
                            disabled={preparingRestorePath === backupExportManifestPath}
                            onClick={() => void prepareRestore(backupExportManifestPath)}
                            type="button"
                          >
                            {preparingRestorePath === backupExportManifestPath
                              ? "Kontrol..."
                              : "Restore Check"}
                          </button>
                        ) : null}
                        {backupExportManifestPath ? (
                          <button
                            className="button ghost"
                            disabled={previewingPath === backupExportManifestPath}
                            onClick={() => void previewArtifact(backupExportManifestPath)}
                            type="button"
                          >
                            {previewingPath === backupExportManifestPath
                              ? "Preview..."
                              : "Preview"}
                          </button>
                        ) : null}
                        {backupExportSummaryPath ? (
                          <button
                            className="button ghost"
                            disabled={downloadingPath === backupExportSummaryPath}
                            onClick={() => void downloadArtifact(backupExportSummaryPath)}
                            type="button"
                          >
                            {downloadingPath === backupExportSummaryPath
                              ? "Summary iniyor..."
                              : "Summary"}
                          </button>
                        ) : null}
                        {backupExportSummaryPath ? (
                          <button
                            className="button ghost"
                            disabled={previewingPath === backupExportSummaryPath}
                            onClick={() => void previewArtifact(backupExportSummaryPath)}
                            type="button"
                          >
                            {previewingPath === backupExportSummaryPath
                              ? "Preview..."
                              : "Preview"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </button>
                );
              })}
              </div>
            )}
          </section>

          <aside className="manager-surface-card manager-focus-panel">
            <div className="manager-section-head compact">
              <div>
                <span className="manager-section-kicker">Secili execution</span>
                <h3 className="manager-section-title">Hizli okuma paneli</h3>
              </div>
              <span className="manager-mini-chip">
                {previewExecution ? formatStatus(previewExecution.status) : "Kayit yok"}
              </span>
            </div>

            {!previewExecution ? (
              <div className="empty">Liste seçimi olmadığı için işlem özeti gösterilemiyor.</div>
            ) : (
              <div className="manager-focus-stack">
                <div className="manager-focus-lead">
                  <strong>{previewExecution.jobName}</strong>
                  <p className="muted">
                    {previewExecution.actor?.displayName ?? "Sistem"} / {previewExecution.triggerSource}
                  </p>
                </div>

                <div className="manager-sheet-grid">
                  <div className="manager-sheet-card">
                    <span>Durum</span>
                    <strong>{formatStatus(previewExecution.status)}</strong>
                  </div>
                  <div className="manager-sheet-card">
                    <span>Sure</span>
                    <strong>{formatDuration(previewExecution.startedAt, previewExecution.finishedAt)}</strong>
                  </div>
                  <div className="manager-sheet-card">
                    <span>Hedef</span>
                    <strong>{previewExecution.targetDate ?? "-"}</strong>
                  </div>
                  <div className="manager-sheet-card">
                    <span>Scope</span>
                    <strong>{previewExecution.scope ?? "-"}</strong>
                  </div>
                </div>

                <div className="manager-overview-note">
                  <strong>Artifact ve restore sinyali</strong>
                  <p>{getBackupExportSummaryLine(previewExecution.resultSummary) ?? "Bu execution icin ozet artifact bilgisi yok."}</p>
                  <p>
                    {previewRestoreSummary
                      ? `Integrity ${previewRestoreSummary.integrityVerified ? "OK" : "FAIL"} / Inventory ${previewRestoreSummary.inventoryVerified ? "OK" : "FAIL"}`
                      : "Restore preparation ozeti yok."}
                  </p>
                </div>

                <div className="manager-overview-actions">
                  <button
                    className="button"
                    onClick={() => {
                      setSelectedExecution(previewExecution);
                      setDetailOpen(true);
                    }}
                    type="button"
                  >
                    Detayi Ac
                  </button>
                  <button className="button ghost" onClick={() => void fetchExecutions()} type="button">
                    Listeyi Yenile
                  </button>
                </div>
              </div>
            )}
          </aside>
        </section>
      </div>

      <ManagerDrawer
        description="Secili job kosusunun sonucunu, actor bilgisini ve ozet payload'ini inceleyin."
        onClose={() => {
          setDetailOpen(false);
          setSelectedArtifactPreview(null);
          setSelectedRestorePreparation(null);
        }}
        open={detailOpen && Boolean(selectedExecution)}
        title={selectedExecution?.jobName ?? "Job Execution"}
      >
        {selectedExecution ? (
          <div className="stack">
            {isBackupExportJob(selectedExecution.jobName) ? (
              <>
                <ManagerDrawerSection
                  eyebrow="Export"
                  title="Manifest ozeti"
                  description="Kaydedilen aggregate sayilar bu blokta hizli okunur."
                >
                  {selectedCounts ? (
                    <div className="stack">
                      {selectedSummaryArtifactPath ? (
                        <p className="muted">Summary dosyasi: {selectedSummaryArtifactPath}</p>
                      ) : null}
                      <div className="manager-feed-inline">
                        {Object.entries(selectedCounts).map(([key, value]) => (
                          <span className="manager-mini-chip" key={key}>
                            {key}: {value}
                          </span>
                        ))}
                      </div>
                      <div className="manager-inline-actions">
                        {getBackupExportArtifactPath(selectedExecution.resultSummary, "manifest") ? (
                          <button
                            className="button ghost"
                            disabled={
                              downloadingPath ===
                              getBackupExportArtifactPath(selectedExecution.resultSummary, "manifest")
                            }
                            onClick={() =>
                              void downloadArtifact(
                                getBackupExportArtifactPath(
                                  selectedExecution.resultSummary,
                                  "manifest"
                                ) as string
                              )
                            }
                            type="button"
                          >
                            {downloadingPath ===
                            getBackupExportArtifactPath(selectedExecution.resultSummary, "manifest")
                              ? "Manifest iniyor..."
                              : "Manifest indir"}
                          </button>
                        ) : null}
                        {getBackupExportArtifactPath(selectedExecution.resultSummary, "manifest") ? (
                          <button
                            className="button ghost"
                            disabled={
                              preparingRestorePath ===
                              getBackupExportArtifactPath(selectedExecution.resultSummary, "manifest")
                            }
                            onClick={() =>
                              void prepareRestore(
                                getBackupExportArtifactPath(
                                  selectedExecution.resultSummary,
                                  "manifest"
                                ) as string
                              )
                            }
                            type="button"
                          >
                            {preparingRestorePath ===
                            getBackupExportArtifactPath(selectedExecution.resultSummary, "manifest")
                              ? "Kontrol..."
                              : "Restore hazirligini kontrol et"}
                          </button>
                        ) : null}
                        {getBackupExportArtifactPath(selectedExecution.resultSummary, "manifest") ? (
                          <button
                            className="button ghost"
                            disabled={
                              previewingPath ===
                              getBackupExportArtifactPath(selectedExecution.resultSummary, "manifest")
                            }
                            onClick={() =>
                              void previewArtifact(
                                getBackupExportArtifactPath(
                                  selectedExecution.resultSummary,
                                  "manifest"
                                ) as string
                              )
                            }
                            type="button"
                          >
                            {previewingPath ===
                            getBackupExportArtifactPath(selectedExecution.resultSummary, "manifest")
                              ? "Preview..."
                              : "Manifest preview"}
                          </button>
                        ) : null}
                        {selectedSummaryArtifactPath ? (
                          <button
                            className="button ghost"
                            disabled={downloadingPath === selectedSummaryArtifactPath}
                            onClick={() => void downloadArtifact(selectedSummaryArtifactPath)}
                            type="button"
                          >
                            {downloadingPath === selectedSummaryArtifactPath
                              ? "Summary iniyor..."
                              : "Summary indir"}
                          </button>
                        ) : null}
                        {selectedSummaryArtifactPath ? (
                          <button
                            className="button ghost"
                            disabled={previewingPath === selectedSummaryArtifactPath}
                            onClick={() => void previewArtifact(selectedSummaryArtifactPath)}
                            type="button"
                          >
                            {previewingPath === selectedSummaryArtifactPath
                              ? "Preview..."
                              : "Summary preview"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="empty">Bu export icin aggregate sayi ozeti kaydedilmemis.</div>
                  )}
                </ManagerDrawerSection>

                <ManagerDrawerSection
                  eyebrow="Restore Prep"
                  title="Restore hazirligi"
                  description="Manifest butunlugu ve artifact inventory bu blokta dogrulanir."
                >
                  {selectedRestorePreparation ? (
                    <div className="stack">
                      <div className="manager-feed-inline">
                        <span className="manager-mini-chip">
                          Integrity: {selectedRestorePreparation.integrityVerified ? "OK" : "FAIL"}
                        </span>
                        <span className="manager-mini-chip">
                          Inventory: {selectedRestorePreparation.inventoryVerified ? "OK" : "FAIL"}
                        </span>
                        <span className="manager-mini-chip">
                          Artifact: {selectedRestorePreparation.artifactCount}
                        </span>
                      </div>
                      <p className="muted">{selectedRestorePreparation.manifestPath}</p>
                      {selectedRestorePreparation.counts ? (
                        <div className="manager-feed-inline">
                          {Object.entries(selectedRestorePreparation.counts).map(([key, value]) => (
                            <span className="manager-mini-chip" key={key}>
                              {key}: {value}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="manager-table-wrap">
                        <table className="manager-table">
                          <tbody>
                            <tr>
                              <th>Beklenen SHA-256</th>
                              <td>{selectedRestorePreparation.integrity.expectedSha256 ?? "-"}</td>
                            </tr>
                            <tr>
                              <th>Hesaplanan SHA-256</th>
                              <td>{selectedRestorePreparation.integrity.calculatedSha256}</td>
                            </tr>
                            <tr>
                              <th>Beklenen boyut</th>
                              <td>
                                {selectedRestorePreparation.integrity.expectedBytes !== null
                                  ? `${selectedRestorePreparation.integrity.expectedBytes} bytes`
                                  : "-"}
                              </td>
                            </tr>
                            <tr>
                              <th>Hesaplanan boyut</th>
                              <td>{selectedRestorePreparation.integrity.calculatedBytes} bytes</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div className="stack">
                        {selectedRestorePreparation.artifacts.map((artifact) => (
                          <p className="muted" key={`${artifact.type}-${artifact.relativePath}`}>
                            Artifact [{formatArtifactType(artifact.type)}]: {artifact.relativePath} /{" "}
                            {artifact.exists ? "OK" : "Eksik"}
                          </p>
                        ))}
                      </div>
                      {selectedRestorePreparation.missingArtifacts.length ? (
                        <div className="stack">
                          {selectedRestorePreparation.missingArtifacts.map((path) => (
                            <p className="muted" key={path}>
                              Eksik artifact: {path}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <div className="empty">Eksik artifact bulunmadi.</div>
                      )}
                    </div>
                  ) : (
                    <div className="empty">Manifest secip restore hazirligini calistirin.</div>
                  )}
                </ManagerDrawerSection>

                <ManagerDrawerSection
                  eyebrow="Integrity"
                  title="Checksum bilgisi"
                  description="Manifest butunlugu icin kaydedilen checksum ve boyut bilgisi."
                >
                  {selectedIntegrity ? (
                    <div className="manager-table-wrap">
                      <table className="manager-table">
                        <tbody>
                          <tr>
                            <th>Algoritma</th>
                            <td>{selectedIntegrity.algorithm ?? "-"}</td>
                          </tr>
                          <tr>
                            <th>SHA-256</th>
                            <td>{selectedIntegrity.payloadSha256 ?? "-"}</td>
                          </tr>
                          <tr>
                            <th>Payload boyutu</th>
                            <td>
                              {typeof selectedIntegrity.payloadBytes === "number"
                                ? `${selectedIntegrity.payloadBytes} bytes`
                                : "-"}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="empty">Bu export icin checksum bilgisi kaydedilmemis.</div>
                  )}
                </ManagerDrawerSection>

                <ManagerDrawerSection
                  eyebrow="Inventory"
                  title="Artifact inventory"
                  description="Manifest ile iliskili artifact ve log referanslari."
                >
                  {selectedInventory ? (
                    <div className="stack">
                      <div className="manager-feed-inline">
                        <span className="manager-mini-chip">
                          Artifact sayisi: {selectedInventory.artifactCount ?? "-"}
                        </span>
                        {selectedInventory.artifacts.some((artifact) => artifact.type === "summary") ? (
                          <span className="manager-mini-chip">Summary artifact var</span>
                        ) : null}
                      </div>
                      {selectedInventory.artifacts.length ? (
                        <div className="stack">
                          {selectedInventory.artifacts.map((artifact) => (
                            <div
                              className="manager-inline-actions"
                              key={`${artifact.type}-${artifact.relativePath}`}
                            >
                              <p className="muted">
                                Artifact [{formatArtifactType(artifact.type)}]: {artifact.relativePath}
                              </p>
                              <button
                                className="button ghost"
                                disabled={downloadingPath === artifact.relativePath}
                                onClick={() => void downloadArtifact(artifact.relativePath)}
                                type="button"
                              >
                                {downloadingPath === artifact.relativePath
                                  ? "Indiriliyor..."
                                  : "Indir"}
                              </button>
                              <button
                                className="button ghost"
                                disabled={previewingPath === artifact.relativePath}
                                onClick={() => void previewArtifact(artifact.relativePath)}
                                type="button"
                              >
                                {previewingPath === artifact.relativePath ? "Preview..." : "Preview"}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="empty">Bu export icin artifact listesi kaydedilmemis.</div>
                      )}
                      {selectedInventory.relatedLogs.length ? (
                        <div className="stack">
                          {selectedInventory.relatedLogs.map((logPath) => (
                            <p className="muted" key={logPath}>
                              Log: {logPath}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <div className="empty">Bu export icin ek log referansi kaydedilmemis.</div>
                      )}
                    </div>
                  ) : (
                    <div className="empty">Bu export icin inventory ozeti kaydedilmemis.</div>
                  )}
                </ManagerDrawerSection>
              </>
            ) : null}

            <ManagerDrawerSection
              eyebrow="Preview"
              title="Artifact preview"
              description="Secili artifact icin read-only icerik onizlemesi."
            >
              {selectedArtifactPreview ? (
                <div className="stack">
                  <div className="manager-feed-inline">
                    <span className="manager-mini-chip">{selectedArtifactPreview.previewMode}</span>
                    <span className="manager-mini-chip">{selectedArtifactPreview.filename}</span>
                    {selectedArtifactPreview.truncated ? (
                      <span className="manager-mini-chip">Kirpildi</span>
                    ) : null}
                  </div>
                  <p className="muted">{selectedArtifactPreview.path}</p>
                  <pre className="manager-json-block">{selectedArtifactPreview.preview}</pre>
                </div>
              ) : (
                <div className="empty">Artifact secip preview istegi gonderin.</div>
              )}
            </ManagerDrawerSection>

            <ManagerDrawerSection
              eyebrow="Baglam"
              title="Calisma ozeti"
              description="Trigger kaynagi, actor ve sonuc durumu bu blokta yer alir."
            >
              <div className="manager-table-wrap">
                <table className="manager-table">
                  <tbody>
                    <tr>
                      <th>Durum</th>
                      <td>{formatStatus(selectedExecution.status)}</td>
                    </tr>
                    <tr>
                      <th>Kaynak</th>
                      <td>{selectedExecution.triggerSource}</td>
                    </tr>
                    <tr>
                      <th>Scope</th>
                      <td>{selectedExecution.scope ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Actor</th>
                      <td>{selectedExecution.actor?.displayName ?? "Sistem"}</td>
                    </tr>
                    <tr>
                      <th>Baslangic</th>
                      <td>{formatDisplayDateTime(selectedExecution.startedAt)}</td>
                    </tr>
                    <tr>
                      <th>Bitis</th>
                      <td>
                        {selectedExecution.finishedAt
                          ? formatDisplayDateTime(selectedExecution.finishedAt)
                          : "Devam ediyor"}
                      </td>
                    </tr>
                    <tr>
                      <th>Sure</th>
                      <td>{formatDuration(selectedExecution.startedAt, selectedExecution.finishedAt)}</td>
                    </tr>
                    <tr>
                      <th>Hedef tarih</th>
                      <td>{selectedExecution.targetDate ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Export yolu</th>
                      <td>{getBackupExportPath(selectedExecution.resultSummary) ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Hata</th>
                      <td>{selectedExecution.errorMessage ?? "-"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </ManagerDrawerSection>

            <ManagerDrawerSection
              eyebrow="Ozet"
              title="Result summary"
              description="Job tamamlandiysa kaydedilen ozet payload burada gorunur."
            >
              <pre className="manager-json-block">
                {JSON.stringify(selectedExecution.resultSummary, null, 2)}
              </pre>
            </ManagerDrawerSection>
          </div>
        ) : (
          <div className="empty">Detay secimi bekleniyor.</div>
        )}
      </ManagerDrawer>
    </>
  );
}
