"use client";

import {
  AuthResponse,
  FieldAssignedProjectSummary,
  FieldNotificationHistoryPage,
  MainFileItem,
  SessionUser,
  TimelineEntry
} from "@kagu/contracts";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, fetchAuthorizedBlob } from "../lib/api";
import {
  formatDisplayDate,
  formatDisplayDateTime,
  formatDateValue,
  getTodayLocal
} from "../lib/date";
import {
  BackIcon,
  BellIcon,
  CheckCircleIcon,
  DeviceIcon,
  KeyIcon,
  LocationArrowIcon,
  PowerIcon,
} from "./ui-icons";
import { useAuth } from "./auth-provider";

const PUSH_STORAGE_KEY_PREFIX = "kagu.push.subscriptionId";
const AUTO_REFRESH_INTERVAL_MS = 10000;
const RESUME_REFRESH_DEDUPE_MS = 1400;

function distanceMeters(
  previous: { latitude: number; longitude: number },
  next: { latitude: number; longitude: number }
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(next.latitude - previous.latitude);
  const dLng = toRad(next.longitude - previous.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(previous.latitude)) *
      Math.cos(toRad(next.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCurrentPosition() {
  return new Promise<GeolocationPosition | null>((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 10000
      }
    );
  });
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const safeBase64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(safeBase64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

function formatProgramDate(date: string) {
  return formatDisplayDate(date);
}

function formatDateTime(date: string) {
  return formatDisplayDateTime(date);
}

function formatTime(date: string) {
  return formatDateValue(date, {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildMapsHref(assignment: FieldAssignedProjectSummary) {
  if (assignment.latitude !== null && assignment.longitude !== null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${assignment.latitude},${assignment.longitude}`;
  }

  if (assignment.locationLabel) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(assignment.locationLabel)}`;
  }

  return null;
}

function entryTypeLabel(entryType: TimelineEntry["entryType"]) {
  switch (entryType) {
    case "WORK_START":
      return "Sahaya ulasildi";
    case "WORK_END":
      return "Proje gun sonu";
    case "FIELD_NOTE":
      return "Saha notu";
    case "MANAGER_NOTE":
      return "Yonetici notu";
    case "FILE_UPLOAD":
      return "Dosya eklendi";
    case "IMAGE_UPLOAD":
      return "Gorsel eklendi";
    case "LOCATION_EVENT":
      return "Konum kaydi";
    default:
      return entryType;
  }
}

function FieldSheetCell({
  label,
  value,
  icon
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="field-v3-sheetcell">
      <span className="field-v3-sheetlabel">{label}</span>
      <div className="field-v3-sheetvalue">
        {icon ? (
          <span className="field-v3-sheeticon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span>{value}</span>
      </div>
    </div>
  );
}

export function FieldWorkspace({
  token,
  user,
  onLogout
}: {
  token: string;
  user: SessionUser;
  onLogout: () => void;
}) {
  const [assignments, setAssignments] = useState<FieldAssignedProjectSummary[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pushConfig, setPushConfig] = useState<{ enabled: boolean; publicKey: string | null } | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [notificationHistoryPage, setNotificationHistoryPage] = useState<FieldNotificationHistoryPage>({
    items: [],
    page: 1,
    pageSize: 10,
    totalCount: 0,
    totalPages: 1
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [isSecureClient, setIsSecureClient] = useState(true);
  const [homeTab, setHomeTab] = useState<"projects" | "notifications" | "device">("projects");
  const [passwordSheetOpen, setPasswordSheetOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastPassiveRefreshRef = useRef(0);
  const selectedProjectIdRef = useRef<string | null>(null);
  const notificationPageRef = useRef(1);
  const detailTopRef = useRef<HTMLDivElement | null>(null);
  const pushStorageKey = `${PUSH_STORAGE_KEY_PREFIX}:${user.id}`;
  const { replaceAuth } = useAuth();

  const selectedAssignment = useMemo(
    () => assignments.find((assignment) => assignment.assignmentId === selectedAssignmentId) ?? null,
    [assignments, selectedAssignmentId]
  );

  const activeAssignment = useMemo(
    () => assignments.find((assignment) => assignment.activeSession) ?? null,
    [assignments]
  );
  const selectedProjectId = selectedAssignment?.projectId ?? null;
  const activeSessionCount = assignments.filter((assignment) => assignment.activeSession).length;
  const notificationHistory = notificationHistoryPage.items;
  const homeProgramDateLabel = formatProgramDate(assignments[0]?.dailyProgramDate ?? getTodayLocal());
  const footerDateLabel = selectedAssignment
    ? formatProgramDate(selectedAssignment.dailyProgramDate)
    : homeProgramDateLabel;
  selectedProjectIdRef.current = selectedProjectId;

  const noteEntries = useMemo(
    () =>
      timeline.filter(
        (entry) =>
          entry.entryType === "FIELD_NOTE" ||
          entry.entryType === "MANAGER_NOTE" ||
          Boolean(entry.note) ||
          entry.files.length > 0
      ),
    [timeline]
  );

  useEffect(() => {
    setIsSecureClient(
      window.isSecureContext ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1"
    );
  }, []);

  async function runFieldRefresh(reason: "auto" | "resume" | "manual" | "initial") {
    if (reason !== "manual" && document.visibilityState === "hidden") {
      return;
    }

    const now = Date.now();
    if (reason === "resume" && now - lastPassiveRefreshRef.current < RESUME_REFRESH_DEDUPE_MS) {
      return;
    }

    if (reason === "auto" || reason === "resume" || reason === "manual") {
      lastPassiveRefreshRef.current = now;
    }

    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const task = Promise.all([
      refreshAssignments(),
      refreshNotificationHistory(),
      selectedProjectIdRef.current ? refreshTimeline(selectedProjectIdRef.current) : Promise.resolve()
    ])
      .then(() => undefined)
      .finally(() => {
        refreshInFlightRef.current = null;
      });

    refreshInFlightRef.current = task;
    return task;
  }

  useEffect(() => {
    void runFieldRefresh("initial");
    void refreshPushState();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void runFieldRefresh("auto").catch(() => undefined);
    }, AUTO_REFRESH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runFieldRefresh("resume").catch(() => undefined);
      }
    };

    const onFocus = () => {
      void runFieldRefresh("resume").catch(() => undefined);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void runFieldRefresh("resume").catch(() => undefined);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    if (selectedAssignmentId && !assignments.some((assignment) => assignment.assignmentId === selectedAssignmentId)) {
      setSelectedAssignmentId(null);
    }
  }, [assignments, selectedAssignmentId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setTimeline([]);
      return;
    }

    void refreshTimeline(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedAssignmentId) {
      return;
    }
    detailTopRef.current?.scrollIntoView({ block: "start", inline: "nearest" });
  }, [selectedAssignmentId]);

  useEffect(() => {
    if (!activeAssignment || !("geolocation" in navigator)) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: Date.now()
        };

        const previous = lastSentRef.current;
        const moved = previous ? distanceMeters(previous, next) >= 60 : true;
        const elapsed = previous ? next.timestamp - previous.timestamp >= 180000 : true;

        if (!moved && !elapsed) {
          return;
        }

        lastSentRef.current = next;
        try {
          await apiFetch(
            `/assignments/${activeAssignment.assignmentId}/location-pings`,
            {
              method: "POST",
              body: JSON.stringify({
                latitude: next.latitude,
                longitude: next.longitude,
                accuracy: position.coords.accuracy,
                source: "watch"
              })
            },
            token
          );
        } catch {
          // Keep field flow uninterrupted when location pinging fails.
        }
      },
      () => undefined,
      {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 20000
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [activeAssignment, token]);

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
    };
  }, []);

  async function refreshAssignments() {
    const data = await apiFetch<FieldAssignedProjectSummary[]>("/me/program-projects", {}, token);
    setAssignments(data);
  }

  async function refreshPushState() {
    try {
      const config = await apiFetch<{ enabled: boolean; publicKey: string | null }>(
        "/notifications/public-key",
        {},
        token
      );
      setPushConfig(config);

      if ("serviceWorker" in navigator && "PushManager" in window) {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = registration
          ? await registration.pushManager.getSubscription()
          : null;
        setPushEnabled(Boolean(subscription));
      }
    } catch {
      setPushConfig({ enabled: false, publicKey: null });
    }
  }

  async function refreshNotificationHistory(page = notificationPageRef.current) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "10"
    });
    const data = await apiFetch<FieldNotificationHistoryPage>(
      `/notifications/history?${params.toString()}`,
      {},
      token
    );
    notificationPageRef.current = data.page;
    setNotificationHistoryPage(data);
  }

  async function refreshTimeline(projectId: string) {
    const data = await apiFetch<TimelineEntry[]>(`/projects/${projectId}/timeline`, {}, token);
    setTimeline(data);
  }

  async function startWork(assignment?: FieldAssignedProjectSummary | null) {
    const targetAssignment = assignment ?? selectedAssignment;
    if (!targetAssignment) {
      return;
    }

    const position = await getCurrentPosition();
    if (!position && !isSecureClient) {
      setMessage("Telefon uygulamasi guvenli baglantida acilmadigi icin konum alinamadi. HTTPS gerekir.");
    }
    await apiFetch(
      `/assignments/${targetAssignment.assignmentId}/work-start`,
      {
        method: "POST",
        body: JSON.stringify({
          latitude: position?.coords.latitude,
          longitude: position?.coords.longitude
        })
      },
      token
    );

    setMessage("Sahaya ulasildi kaydi alindi.");
    await refreshAssignments();
    await refreshTimeline(targetAssignment.projectId);
  }

  async function endWork(assignment?: FieldAssignedProjectSummary | null) {
    const targetAssignment = assignment ?? selectedAssignment;
    if (!targetAssignment) {
      return;
    }

    const position = await getCurrentPosition();
    if (!position && !isSecureClient) {
      setMessage("Telefon uygulamasi guvenli baglantida acilmadigi icin konum alinamadi. HTTPS gerekir.");
    }
    await apiFetch(
      `/assignments/${targetAssignment.assignmentId}/work-end`,
      {
        method: "POST",
        body: JSON.stringify({
          latitude: position?.coords.latitude,
          longitude: position?.coords.longitude
        })
      },
      token
    );

    setMessage("Proje gun sonu kaydedildi.");
    await refreshAssignments();
    await refreshTimeline(targetAssignment.projectId);
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      setPasswordError("Yeni sifre ve tekrar alani ayni olmali.");
      return;
    }

    setPasswordSubmitting(true);
    setPasswordError(null);

    try {
      const response = await apiFetch<AuthResponse>(
        "/auth/password",
        {
          method: "PATCH",
          body: JSON.stringify({
            currentPassword,
            newPassword
          })
        },
        token
      );
      replaceAuth(response);
      setPasswordSheetOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Sifreniz guncellendi.");
      setPushMessage(null);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Sifre guncellenemedi.");
    } finally {
      setPasswordSubmitting(false);
    }
  }

  async function addFieldEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAssignment) {
      return;
    }

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await apiFetch(
      `/program-projects/${selectedAssignment.dailyProgramProjectId}/entries`,
      {
        method: "POST",
        body: form
      },
      token
    );

    formElement.reset();
    setMessage("Gunluk not veya dosya eklendi.");
    await refreshTimeline(selectedAssignment.projectId);
  }

  async function enablePushNotifications() {
    if (!pushConfig?.publicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushMessage(
        !isSecureClient
          ? "Bu telefon uygulamayi HTTP uzerinden actigi icin web push kapali. HTTPS veya desteklenen PWA gerekir."
          : "Bu tarayicida web push desteklenmiyor."
      );
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushMessage("Bildirim izni verilmedi.");
        return;
      }

      const registration =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(pushConfig.publicKey)
        }));

      const payload = subscription.toJSON();
      const record = await apiFetch<{ id: string }>(
        "/notifications/subscriptions",
        {
          method: "POST",
          body: JSON.stringify({
            endpoint: payload.endpoint,
            keys: payload.keys,
            userAgent: navigator.userAgent
          })
        },
        token
      );

      window.localStorage.setItem(pushStorageKey, record.id);
      setPushEnabled(true);
      setPushMessage("Bu cihaz bildirim almak uzere kaydedildi.");
    } catch (error) {
      setPushMessage(error instanceof Error ? error.message : "Bildirim kurulumu basarisiz.");
    }
  }

  function closePreview() {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setPreviewName(null);
  }

  async function openProtectedFile(path: string, mode: "preview" | "download") {
    const { objectUrl, filename } = await fetchAuthorizedBlob(path, token);
    if (mode === "preview") {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
      previewObjectUrlRef.current = objectUrl;
      setPreviewUrl(objectUrl);
      setPreviewName(filename);
      return;
    }

    const isMobileDownloadClient = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const link = document.createElement("a");
    link.href = objectUrl;
    if (isMobileDownloadClient) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    } else {
      link.download = filename;
    }
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), isMobileDownloadClient ? 30000 : 1000);
  }

  function openMapsForAssignment(assignment: FieldAssignedProjectSummary) {
    const href = buildMapsHref(assignment);
    if (!href) {
      setMessage("Bu proje icin konum bilgisi bulunmuyor.");
      return;
    }

    window.open(href, "_blank", "noopener,noreferrer");
  }

  function renderFileRow(file: MainFileItem | TimelineEntry["files"][number], title: string, extension?: string) {
    const previewPath = "latestVersion" in file ? file.latestVersion.inlineUrl : file.inlineUrl;
    const downloadPath = "latestVersion" in file ? file.latestVersion.downloadUrl : file.downloadUrl;
    const metaLine =
      "latestVersion" in file
        ? `${file.versionCount} surum`
        : extension ?? file.extension;

    return (
      <div className="file-row field-v4-listrow" key={file.id}>
        <div className="field-v4-listrow-main">
          <strong>{title}</strong>
          <span>{metaLine}</span>
        </div>
        <div className="toolbar-tight field-v4-listrow-actions">
          {previewPath ? (
            <button className="button ghost" type="button" onClick={() => void openProtectedFile(previewPath, "preview")}>
              Onizle
            </button>
          ) : null}
          <button className="button ghost" type="button" onClick={() => void openProtectedFile(downloadPath, "download")}>
            Indir
          </button>
        </div>
      </div>
    );
  }

  function openHomeTab(nextTab: "projects" | "notifications" | "device") {
    setSelectedAssignmentId(null);
    setHomeTab(nextTab);
  }

  function renderDetailView() {
    if (!selectedAssignment) {
      return null;
    }

    return (
      <>
        <div ref={detailTopRef} />
        <div className="field-v4-detailbar">
          <button
            className="field-v3-utility field-v4-backbutton"
            type="button"
            onClick={() => {
              setSelectedAssignmentId(null);
              setHomeTab("projects");
            }}
          >
            <BackIcon />
            <span>Projeler</span>
          </button>
        </div>

        {message ? <div className="alert field-v3-banner">{message}</div> : null}

        <section className="field-v3-screen field-v4-detailstack">
          <div className="field-v3-panel field-v4-compactpanel field-v4-detailpanel">
            <div className="field-v3-panelhead">
              <div>
                <span className="field-v3-kicker">Proje adi</span>
                <h3>{selectedAssignment.projectName}</h3>
              </div>
            </div>
            {selectedAssignment.customerName ? (
              <div className="field-v4-inline-meta">{selectedAssignment.customerName}</div>
            ) : null}
          </div>

          <div className="field-v3-panel field-v4-compactpanel field-v4-detailpanel">
            <div className="field-v3-panelhead">
              <div>
                <span className="field-v3-kicker">Projeye ait dosyalar</span>
                <h3>Ana belge listesi</h3>
              </div>
              <div className="chip field-v3-chip-soft">{selectedAssignment.mainFiles.length} dosya</div>
            </div>

            <div className="file-list field-v4-compactlist">
              {selectedAssignment.mainFiles.length === 0 ? (
                <div className="empty">Bu projede indirilebilir ana dosya yok.</div>
              ) : (
                selectedAssignment.mainFiles.map((file) => renderFileRow(file, file.title))
              )}
            </div>
          </div>

          <div className="field-v3-panel field-v4-compactpanel field-v4-detailpanel">
            <div className="field-v3-panelhead">
              <div>
                <span className="field-v3-kicker">Projeye ait ana not</span>
                <h3>Ana not</h3>
              </div>
            </div>

            <div className="field-v4-infobox field-v4-infobox-compact">
              <strong>{selectedAssignment.description ?? "Bu proje icin ana not girilmemis."}</strong>
            </div>
          </div>

          <div className="field-v3-panel field-v4-compactpanel field-v4-detailpanel">
            <div className="field-v3-panelhead">
              <div>
                <span className="field-v3-kicker">Projeye ait akis notlari</span>
                <h3>Not ekle ve kayitlari gor</h3>
              </div>
              <div className="chip field-v3-chip-soft">{noteEntries.length} kayit</div>
            </div>

            <form className="field-v4-notecomposer field-v4-notecomposer-compact" onSubmit={addFieldEntry}>
              <textarea
                className="textarea"
                name="note"
                placeholder="Bugun sahada gordugunuz notu kisaca yazin"
              />
              <div className="field-v4-notecomposer-row">
                <input className="input" name="files" type="file" multiple />
                <button className="button" type="submit">
                  Notu kaydet
                </button>
              </div>
            </form>

            <div className="field-v4-notelist field-v4-compactlist">
              {noteEntries.length === 0 ? (
                <div className="empty">Bu proje icin gosterilecek not veya dosya kaydi bulunmuyor.</div>
              ) : (
                noteEntries.map((entry) => (
                  <article className="field-v4-note" key={entry.id}>
                    <div className="field-v4-notehead">
                      <div>
                        <strong>{entryTypeLabel(entry.entryType)}</strong>
                        <span>{entry.actor.displayName}</span>
                      </div>
                      <time>{formatDateTime(entry.createdAt)}</time>
                    </div>
                    {entry.note ? <p className="field-v4-notetext">{entry.note}</p> : null}
                    {entry.files.length > 0 ? (
                      <div className="file-list">
                        {entry.files.map((file) =>
                          renderFileRow(file, file.originalName, file.extension)
                        )}
                      </div>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      </>
    );
  }

  function renderHomeView() {
    return (
      <>
        {message ? <div className="alert field-v3-banner">{message}</div> : null}

        {homeTab === "projects" ? (
          <section className="field-v3-screen">
            <div className="field-v3-panel field-v4-projectpanel">
              <div className="field-v3-panelhead">
                <div>
                  <span className="field-v3-kicker">Projeler</span>
                  <h3>Bugun atanmis isler</h3>
                </div>
                <div className="chip field-v3-chip-soft">
                  {assignments.length} proje / {activeSessionCount} aktif
                </div>
              </div>

              {assignments.length === 0 ? (
                <div className="empty">Bugun size atanmis proje bulunmuyor.</div>
              ) : (
                <div className="field-v3-projectlist">
                  {assignments.map((assignment) => (
                    <article
                      className={`field-v3-projectrow field-v4-projectrow${
                        assignment.activeSession ? " active" : ""
                      }`}
                      key={assignment.assignmentId}
                    >
                      <div className="field-v3-projecthead">
                        <div className="field-v3-projecttitle">
                          <span className="field-v4-projectbadge">Bugun</span>
                          <strong className="field-v4-projectname">{assignment.projectName}</strong>
                          <span className="field-v4-projectsub">
                            {assignment.customerName ?? "Cari tanimli degil"}
                          </span>
                        </div>
                      </div>

                      <div className="field-v3-sheetgrid field-v4-projectgrid field-v4-projectstatusgrid">
                        <FieldSheetCell
                          icon={<CheckCircleIcon />}
                          label="Durum"
                          value={
                            assignment.activeSession
                              ? `Aktif / ${formatTime(assignment.activeSession.startedAt)}`
                              : "Bekliyor"
                          }
                        />
                      </div>

                      <div className="field-v3-rowactions field-v4-projectactions">
                        <button
                          className="button ghost"
                          onClick={() => openMapsForAssignment(assignment)}
                          type="button"
                        >
                          <LocationArrowIcon />
                          <span>Haritayi ac</span>
                        </button>
                        <button
                          className="button success"
                          type="button"
                          onClick={() => void startWork(assignment)}
                          disabled={Boolean(
                            activeAssignment &&
                              !assignment.activeSession &&
                              activeAssignment.assignmentId !== assignment.assignmentId
                          )}
                        >
                          <CheckCircleIcon />
                          <span>Sahaya ulastim</span>
                        </button>
                        <button
                          className="button danger"
                          type="button"
                          onClick={() => void endWork(assignment)}
                          disabled={!assignment.activeSession}
                        >
                          <PowerIcon />
                          <span>Gun sonu</span>
                        </button>
                        <button
                          className="button"
                          onClick={() => setSelectedAssignmentId(assignment.assignmentId)}
                          type="button"
                        >
                          <span>Detay</span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {homeTab === "notifications" ? (
          <section className="field-v3-screen">
            <div className="field-v3-panel">
              <div className="field-v3-panelhead">
                <div>
                  <span className="field-v3-kicker">Bildirimler</span>
                  <h3>Size gonderilenler</h3>
                </div>
                <div className="chip field-v3-chip-soft">
                  {notificationHistoryPage.totalCount} kayit / Sayfa {notificationHistoryPage.page}
                </div>
              </div>

              <div className="field-v4-feed">
                {notificationHistory.length === 0 ? (
                  <div className="empty">Size gonderilmis bildirim kaydi bulunmuyor.</div>
                ) : (
                  notificationHistory.map((item) => (
                    <article className="field-v3-feedrow field-v4-feedrow" key={item.id}>
                      <div className="field-v4-feedtime">{formatDateTime(item.createdAt)}</div>
                      <p className="field-v4-feedmessage">{item.message}</p>
                    </article>
                  ))
                )}
              </div>

              <div className="field-v4-pager">
                <button
                  className="button ghost"
                  aria-label="Onceki sayfa"
                  disabled={notificationHistoryPage.page <= 1}
                  type="button"
                  onClick={() => void refreshNotificationHistory(notificationHistoryPage.page - 1)}
                >
                  <BackIcon />
                </button>
                <span>
                  {notificationHistoryPage.page} / {notificationHistoryPage.totalPages}
                </span>
                <button
                  className="button ghost field-v4-pager-next"
                  aria-label="Sonraki sayfa"
                  disabled={notificationHistoryPage.page >= notificationHistoryPage.totalPages}
                  type="button"
                  onClick={() => void refreshNotificationHistory(notificationHistoryPage.page + 1)}
                >
                  <BackIcon />
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {homeTab === "device" ? (
          <section className="field-v3-screen">
            <div className="field-v3-panel">
              <div className="field-v3-panelhead">
                <div>
                  <span className="field-v3-kicker">Bildirimler</span>
                  <h3>Cihaz islemleri</h3>
                </div>
                <span className={`chip field-v3-status ${pushEnabled ? "is-active" : "is-idle"}`}>
                  {pushEnabled ? "Acik" : "Kapali"}
                </span>
              </div>

              <div className="field-v3-rowactions">
                <button
                  className="button secondary"
                  disabled={pushEnabled}
                  type="button"
                  onClick={() => void enablePushNotifications()}
                >
                  <BellIcon />
                  <span>{pushEnabled ? "Bildirimler acik" : "Bildirimleri ac"}</span>
                </button>
              </div>

              {pushMessage ? <div className="field-v4-inlinehint">{pushMessage}</div> : null}
            </div>

            <div className="field-v3-panel field-v3-dangerpanel">
              <div className="field-v3-panelhead">
                <div>
                  <span className="field-v3-kicker">Hesap</span>
                  <h3>Guvenlik islemleri</h3>
                </div>
              </div>

              <div className="field-v3-info-row">
                <span>Hesap</span>
                <strong>{user.displayName}</strong>
              </div>

              <div className="field-v3-rowactions">
                <button className="button ghost" type="button" onClick={() => setPasswordSheetOpen(true)}>
                  <KeyIcon />
                  <span>Sifre degistir</span>
                </button>
              </div>

              <button className="button ghost" type="button" onClick={onLogout}>
                <PowerIcon />
                <span>Oturumu kapat</span>
              </button>
            </div>
          </section>
        ) : null}

      </>
    );
  }

  function renderBottomNav() {
    return (
      <div className="field-v4-bottomnav-shell">
        <div className="field-v4-bottomnav-meta">
          <span>{footerDateLabel}</span>
          <span>{user.displayName}</span>
        </div>
        <nav className="field-v3-bottomnav" aria-label="Saha alt navigasyon">
          <button
            className={`field-v3-navitem ${homeTab === "projects" ? "active" : ""}`}
            onClick={() => openHomeTab("projects")}
            type="button"
          >
            <CheckCircleIcon />
            <span>Projeler</span>
          </button>
          <button
            className={`field-v3-navitem ${homeTab === "notifications" ? "active" : ""}`}
            onClick={() => openHomeTab("notifications")}
            type="button"
          >
            <BellIcon />
            <span>Bildirimler</span>
          </button>
          <button
            className={`field-v3-navitem ${homeTab === "device" ? "active" : ""}`}
            onClick={() => openHomeTab("device")}
            type="button"
          >
            <DeviceIcon />
            <span>Cihaz</span>
          </button>
        </nav>
      </div>
    );
  }

  return (
    <div className="field-mobile-shell field-v3-shell">
      <div className="field-mobile-frame field-v3-frame">
        {selectedAssignment ? renderDetailView() : renderHomeView()}
        <div className="field-v4-footer-spacer" />
      </div>

      {renderBottomNav()}

      {previewUrl ? (
        <div className="field-v3-preview-shell">
          <button aria-label="Kapat" className="field-v3-preview-backdrop" type="button" onClick={closePreview} />
          <div className="field-v3-preview-panel glass">
            <div className="field-v3-preview-header">
              <div>
                <div className="field-v3-kicker">Dosya onizleme</div>
                <h2>{previewName}</h2>
              </div>
              <button className="button ghost" type="button" onClick={closePreview}>
                <BackIcon />
                <span>Kapat</span>
              </button>
            </div>

            {previewName?.toLowerCase().endsWith(".pdf") ? (
              <iframe className="field-v3-preview-frame" src={previewUrl} title={previewName} />
            ) : (
              <img
                alt={previewName ?? "preview"}
                className="field-v3-preview-frame"
                src={previewUrl}
                style={{ objectFit: "contain" }}
              />
            )}
          </div>
        </div>
      ) : null}

      {passwordSheetOpen ? (
        <div className="field-v4-sheet-shell">
          <button
            aria-label="Kapat"
            className="field-v3-preview-backdrop"
            type="button"
            onClick={() => {
              setPasswordSheetOpen(false);
              setPasswordError(null);
              setCurrentPassword("");
              setNewPassword("");
              setConfirmPassword("");
            }}
          />
          <div className="field-v4-sheet-panel glass">
            <div className="field-v3-panelhead">
              <div>
                <span className="field-v3-kicker">Sifre degistir</span>
                <h3>Yeni giris sifrenizi belirleyin</h3>
              </div>
              <button
                className="button ghost"
                type="button"
                onClick={() => {
                  setPasswordSheetOpen(false);
                  setPasswordError(null);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
              >
                <BackIcon />
                <span>Kapat</span>
              </button>
            </div>

            <form className="field-v4-passwordform" onSubmit={changePassword}>
              <input
                autoComplete="current-password"
                className="input"
                placeholder="Mevcut sifre"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
              <input
                autoComplete="new-password"
                className="input"
                placeholder="Yeni sifre"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <input
                autoComplete="new-password"
                className="input"
                placeholder="Yeni sifre tekrar"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />

              {passwordError ? <div className="alert">{passwordError}</div> : null}

              <div className="field-v3-rowactions">
                <button className="button" disabled={passwordSubmitting} type="submit">
                  {passwordSubmitting ? "Kaydediliyor..." : "Sifreyi guncelle"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
