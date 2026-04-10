"use client";

import {
  LocationFeedItem,
  ManagerUserSummary,
  NotificationCampaignSummary,
  ProjectSummary,
  TrackingOverview
} from "@kagu/contracts";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, isAbortError } from "../lib/api";
import { formatDisplayDateTime } from "../lib/date";
import { useAuth } from "./auth-provider";
import { ManagerDrawer, ManagerDrawerSection } from "./manager-ui";
import { TrackingMap } from "./tracking-map";
import { useSyncedDashboardDate } from "./use-synced-dashboard-date";

function uniqueLatestLocations(locations: LocationFeedItem[]) {
  const seen = new Set<string>();
  return locations.filter((location) => {
    if (seen.has(location.actor.id)) {
      return false;
    }
    seen.add(location.actor.id);
    return true;
  });
}

export function ManagerTrackingModule() {
  const { token } = useAuth();
  const [selectedDate, setSelectedDate] = useSyncedDashboardDate();
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [fieldUsers, setFieldUsers] = useState<ManagerUserSummary[]>([]);
  const [overview, setOverview] = useState<TrackingOverview | null>(null);
  const [history, setHistory] = useState<LocationFeedItem[]>([]);
  const [campaigns, setCampaigns] = useState<NotificationCampaignSummary[]>([]);
  const [pushConfig, setPushConfig] = useState<{ enabled: boolean; publicKey: string | null } | null>(
    null
  );
  const [notifyDrawerOpen, setNotifyDrawerOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState({
    title: "",
    message: "",
    userIds: [] as string[]
  });

  const fieldMarkers = useMemo(
    () =>
      uniqueLatestLocations(overview?.recentLocations ?? []).map((location) => ({
        id: location.id,
        label: location.actor.displayName,
        description: `${formatDisplayDateTime(location.capturedAt)} / ${location.source}`,
        latitude: location.latitude,
        longitude: location.longitude
      })),
    [overview]
  );

  const linePoints = useMemo(
    () => history.map((item) => [item.latitude, item.longitude] as [number, number]),
    [history]
  );
  const feedRows = useMemo(() => {
    const sessionRows = (overview?.activeSessions ?? []).map((session) => ({
      id: `session-${session.assignmentId}`,
      tone: "session" as const,
      type: "Canli Oturum",
      actor: session.user.displayName,
      subject: session.project.name,
      detail: "Aktif saha oturumu",
      createdAt: session.startedAt
    }));
    const campaignRows = campaigns.map((campaign) => ({
      id: `campaign-${campaign.id}`,
      tone: campaign.type === "DAILY_REMINDER" ? ("reminder" as const) : ("campaign" as const),
      type: campaign.type === "DAILY_REMINDER" ? "Gunluk Hatirlatici" : "Manuel Bildirim",
      actor: campaign.sender.displayName,
      subject: campaign.title,
      detail: campaign.message,
      createdAt: campaign.createdAt
    }));
    return [...sessionRows, ...campaignRows].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
  }, [campaigns, overview?.activeSessions]);
  const selectedProjectLabel = projects.find((project) => project.id === selectedProjectId)?.name ?? "Tum projeler";
  const selectedUserLabel = fieldUsers.find((user) => user.id === selectedUserId)?.displayName ?? "Tum saha personeli";

  useEffect(() => {
    if (!token) {
      return;
    }
    const controller = new AbortController();
    void Promise.all([
      refreshLookups(token, controller.signal),
      refreshCampaigns(token, controller.signal),
      refreshPushConfig(token, controller.signal)
    ]).catch((error) => {
      if (!isAbortError(error)) {
        setMessage(error instanceof Error ? error.message : "Takip lookup verisi yuklenemedi.");
      }
    });
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const controller = new AbortController();
    void refreshTracking(token, controller.signal).catch((error) => {
      if (!isAbortError(error)) {
        setMessage(error instanceof Error ? error.message : "Takip verisi yuklenemedi.");
      }
    });
    return () => controller.abort();
  }, [selectedDate, selectedProjectId, selectedUserId, token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshTracking(token).catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(interval);
  }, [selectedDate, selectedProjectId, selectedUserId, token]);

  async function refreshLookups(currentToken: string, signal?: AbortSignal) {
    const [projectData, userData] = await Promise.all([
      apiFetch<ProjectSummary[]>("/projects?status=active", { signal }, currentToken),
      apiFetch<ManagerUserSummary[]>("/users?role=FIELD&status=active", { signal }, currentToken)
    ]);
    setProjects(projectData);
    setFieldUsers(userData);
  }

  async function refreshTracking(currentToken: string, signal?: AbortSignal) {
    const params = new URLSearchParams();
    params.set("date", selectedDate);
    if (selectedProjectId) {
      params.set("projectId", selectedProjectId);
    }
    if (selectedUserId) {
      params.set("userId", selectedUserId);
    }
    const [overviewData, historyData] = await Promise.all([
      apiFetch<TrackingOverview>(`/tracking/overview?${params.toString()}`, { signal }, currentToken),
      apiFetch<LocationFeedItem[]>(`/tracking/history?${params.toString()}`, { signal }, currentToken)
    ]);
    setOverview(overviewData);
    setHistory(historyData);
  }

  async function refreshCampaigns(currentToken: string, signal?: AbortSignal) {
    const data = await apiFetch<NotificationCampaignSummary[]>("/notifications/campaigns", { signal }, currentToken);
    setCampaigns(data);
  }

  async function refreshPushConfig(currentToken: string, signal?: AbortSignal) {
    const data = await apiFetch<{ enabled: boolean; publicKey: string | null }>(
      "/notifications/public-key",
      { signal },
      currentToken
    );
    setPushConfig(data);
  }

  function toggleManualRecipient(userId: string) {
    setManualDraft((current) => ({
      ...current,
      userIds: current.userIds.includes(userId)
        ? current.userIds.filter((value) => value !== userId)
        : [...current.userIds, userId]
    }));
  }

  async function sendManualNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }
    try {
      await apiFetch(
        "/notifications/manual",
        { method: "POST", body: JSON.stringify(manualDraft) },
        token
      );
      setManualDraft({ title: "", message: "", userIds: [] });
      await refreshCampaigns(token);
      setNotifyDrawerOpen(false);
      setMessage("Bildirim kampanyasi kaydedildi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bildirim gonderilemedi.");
    }
  }

  async function sendDailyReminder() {
    if (!token) {
      return;
    }
    try {
      await apiFetch(
        "/notifications/daily-reminder",
        { method: "POST", body: JSON.stringify({ date: selectedDate }) },
        token
      );
      await refreshCampaigns(token);
      setNotifyDrawerOpen(false);
      setMessage("Gunluk hatirlatici gonderildi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Hatirlatici gonderilemedi.");
    }
  }

  return (
    <>
      <div className="manager-module manager-stack-layout">
        <section className="manager-command-surface manager-command-surface-grid">
          <div className="manager-command-copy">
            <span className="manager-command-kicker">Takip</span>
            <h2 className="manager-block-title">Harita ve saha akisi</h2>
            <p className="manager-block-copy">
              Harita, canli feed ve bildirim aksiyonlarini secili tarih baglamiyla birlikte izleyin.
            </p>
          </div>
          <div className="manager-command-controls manager-command-controls-left">
            <div className="manager-inline-actions">
              <input
                className="input"
                onChange={(event) => setSelectedDate(event.target.value)}
                type="date"
                value={selectedDate}
              />
              <select
                className="select"
                onChange={(event) => setSelectedProjectId(event.target.value)}
                value={selectedProjectId}
              >
                <option value="">Tum projeler</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <select
                className="select"
                onChange={(event) => setSelectedUserId(event.target.value)}
                value={selectedUserId}
              >
                <option value="">Tum saha personeli</option>
                {fieldUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>
              <button className="button" onClick={() => setNotifyDrawerOpen(true)} type="button">
                Bildirim Gonder
              </button>
            </div>
          </div>
        </section>

        {message ? <div className="alert">{message}</div> : null}

        <section className="manager-stat-ribbon manager-stat-ribbon-compact">
          <article className="manager-stat-card">
            <span>Proje marker</span>
            <strong>{overview?.projectLocations.length ?? 0}</strong>
            <small>{selectedProjectLabel}</small>
          </article>
          <article className="manager-stat-card">
            <span>Aktif saha</span>
            <strong>{fieldMarkers.length}</strong>
            <small>{selectedUserLabel}</small>
          </article>
          <article className="manager-stat-card">
            <span>Konum izi</span>
            <strong>{history.length}</strong>
            <small>Gecmis yakalama noktasi</small>
          </article>
          <article className="manager-stat-card">
            <span>Kampanya</span>
            <strong>{campaigns.length}</strong>
            <small>Kayitli bildirim akisi</small>
          </article>
        </section>

        <section className="manager-surface-card map-panel">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Harita</span>
              <h3 className="manager-section-title">Proje + aktif saha markerlari</h3>
            </div>
            <div className="manager-inline-actions">
              <span className="manager-inline-badge is-info">Proje marker</span>
              <span className="manager-inline-badge is-positive">Saha marker</span>
              <span className="manager-mini-chip">{overview?.projectLocations.length ?? 0} proje</span>
              <span className="manager-mini-chip">{fieldMarkers.length} aktif saha</span>
            </div>
          </div>
          <TrackingMap
            fieldMarkers={fieldMarkers}
            linePoints={linePoints}
            projectMarkers={(overview?.projectLocations ?? []).map((project) => ({
              id: project.projectId,
              label: project.projectName,
              description: project.locationLabel,
              latitude: project.latitude,
              longitude: project.longitude
            }))}
          />
        </section>

        <section className="manager-surface-card">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Canli feed</span>
              <h3 className="manager-section-title">Oturum ve kampanya kayitlari</h3>
            </div>
            <span className="manager-mini-chip">{feedRows.length} kayit</span>
          </div>
          {!feedRows.length ? (
            <div className="empty">Kayit bulunmuyor.</div>
          ) : (
            <div className="manager-feed-list">
              {feedRows.map((row) => (
                <article className={`manager-feed-row manager-feed-row-${row.tone}`} key={row.id}>
                  <div className="manager-feed-topline">
                    <div>
                      <div className="manager-feed-labels">
                        <span className={`manager-inline-badge manager-inline-badge-${row.tone}`}>{row.type}</span>
                        <span className="manager-mini-chip">{row.actor}</span>
                      </div>
                      <strong>{row.subject}</strong>
                    </div>
                    <span className="manager-mini-chip">{formatDisplayDateTime(row.createdAt)}</span>
                  </div>
                  <p className="manager-feed-text">{row.detail}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <ManagerDrawer
        onClose={() => setNotifyDrawerOpen(false)}
        open={notifyDrawerOpen}
        title="Bildirim Gonder"
        description="Gunluk hatirlatici veya manuel bildirim akisini mevcut backend endpointleri ile tetikleyin."
      >
        <div className="stack">
          {!pushConfig?.enabled ? (
            <div className="alert">Web push yapilandirilmadi. Islem kampanya kaydi olarak tutulur.</div>
          ) : null}

          <ManagerDrawerSection
            eyebrow="Hazir akis"
            title="Gunluk hatirlatici"
            description="Secili tarih icin tek dokunusla standart hatirlatici kampanyasini olusturun."
          >
            <button className="button secondary" onClick={sendDailyReminder} type="button">
              Bugunun hatirlaticisini gonder
            </button>
          </ManagerDrawerSection>

          <ManagerDrawerSection
            eyebrow="Manuel kampanya"
            title="Bildirim olustur"
            description="Baslik, mesaj ve hedef saha personellerini secin."
          >
            <form className="stack" onSubmit={sendManualNotification}>
              <input
                className="input"
                onChange={(event) =>
                  setManualDraft((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Baslik"
                required
                value={manualDraft.title}
              />
              <textarea
                className="textarea"
                onChange={(event) =>
                  setManualDraft((current) => ({ ...current, message: event.target.value }))
                }
                placeholder="Mesaj"
                required
                value={manualDraft.message}
              />
              <div className="program-assignment-grid">
                {fieldUsers.map((user) => (
                  <label
                    className={`assign-pill ${manualDraft.userIds.includes(user.id) ? "active" : ""}`}
                    key={user.id}
                  >
                    <input
                      checked={manualDraft.userIds.includes(user.id)}
                      onChange={() => toggleManualRecipient(user.id)}
                      type="checkbox"
                    />
                    <span>{user.displayName}</span>
                  </label>
                ))}
              </div>
              <button className="button" type="submit">
                Bildirim Gonder
              </button>
            </form>
          </ManagerDrawerSection>
        </div>
      </ManagerDrawer>
    </>
  );
}
