"use client";

import {
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
  const header = [
    "Proje",
    "Ilk Gun",
    "Son Gun",
    "Adam/Gun"
  ];
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
  const filteredReportRows = useMemo(() => {
    const query = reportQuery.trim().toLocaleLowerCase("tr-TR");
    if (!query) {
      return reportRows;
    }
    return reportRows.filter((row) =>
      row.projectName.toLocaleLowerCase("tr-TR").includes(query)
    );
  }, [reportQuery, reportRows]);

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
    const rows = filteredReportRows;
    downloadTextFile(toCsv(rows), `kagu-proje-raporu-${getTodayLocal()}.csv`);
    setMessage("Proje sure raporu CSV olarak indirildi.");
  }

  return (
    <div className="manager-module manager-dashboard-v3">
      <section className="manager-command-surface">
        <div className="manager-command-copy">
          <span className="manager-command-kicker">Secili gun</span>
          <h2 className="manager-block-title">Bugun ekipler hangi iste</h2>
        </div>
        <div className="manager-command-controls">
          <div className="manager-date-switch">
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
          <div className="manager-command-actions">
            <button className="button ghost" onClick={downloadDailyCsv} type="button">
              Gunluk CSV
            </button>
          </div>
        </div>
      </section>

      {message ? <div className="alert">{message}</div> : null}

      <section className="manager-surface-card">
        <div className="manager-section-head compact">
          <div>
            <span className="manager-section-kicker">Bugun sahadaki ekipler</span>
            <h3 className="manager-section-title">Hangi ekip hangi iste</h3>
          </div>
          <span className="manager-mini-chip">
            {loading ? "Yukleniyor..." : `${activeSessions.length} aktif oturum`}
          </span>
        </div>

        {!activeSessions.length ? (
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
          <div className="empty">Rapor verisi yukleniyor...</div>
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
