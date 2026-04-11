"use client";

import {
  CustomerSummary,
  LocationFeedItem,
  MainFileItem,
  ProjectSummary,
  TimelineEntry
} from "@kagu/contracts";
import { FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, fetchAuthorizedBlob } from "../lib/api";
import { formatDisplayDateTime } from "../lib/date";
import { useAuth } from "./auth-provider";
import { ManagerDrawer, ManagerDrawerSection } from "./manager-ui";
import { useDialogBehavior } from "./dialog-behavior";
import { MapPicker } from "./map-picker";
import { TrackingMap } from "./tracking-map";
import { FileIcon, FolderIcon, MapPinIcon, TimelineIcon } from "./ui-icons";

type ProjectStatusFilter = "active" | "archived" | "all";
type ProjectEditorMode = "create" | "edit";

type ProjectDraft = {
  customerId: string;
  name: string;
  code: string;
  description: string;
  locationLabel: string;
  latitude: string;
  longitude: string;
};

type CustomerDraft = {
  name: string;
  note: string;
};

const emptyProjectDraft: ProjectDraft = {
  customerId: "",
  name: "",
  code: "",
  description: "",
  locationLabel: "",
  latitude: "",
  longitude: ""
};

const emptyCustomerDraft: CustomerDraft = {
  name: "",
  note: ""
};

function entryTypeLabel(value: TimelineEntry["entryType"]) {
  switch (value) {
    case "MANAGER_NOTE":
      return "Yonetici notu";
    case "FIELD_NOTE":
      return "Saha notu";
    case "WORK_START":
      return "Is basi";
    case "WORK_END":
      return "Gun sonu";
    case "FILE_UPLOAD":
      return "Dosya yukleme";
    case "IMAGE_UPLOAD":
      return "Gorsel yukleme";
    case "LOCATION_EVENT":
      return "Konum olayi";
    default:
      return value;
  }
}

function parseNumberInput(value: string, emptyValue: null | undefined) {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) {
    return emptyValue;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : emptyValue;
}

function numberToInputValue(value: number | null) {
  return value === null ? "" : `${value}`;
}

function draftFromProject(project: ProjectSummary): ProjectDraft {
  return {
    customerId: project.customer?.id ?? "",
    name: project.name,
    code: project.code ?? "",
    description: project.description ?? "",
    locationLabel: project.locationLabel ?? "",
    latitude: numberToInputValue(project.latitude),
    longitude: numberToInputValue(project.longitude)
  };
}

export function ManagerProjectsModule() {
  const { token } = useAuth();
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>("active");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
  const [mainFiles, setMainFiles] = useState<MainFileItem[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [locationFeed, setLocationFeed] = useState<LocationFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [projectDrawerOpen, setProjectDrawerOpen] = useState(false);
  const [projectEditorOpen, setProjectEditorOpen] = useState(false);
  const [projectEditorMode, setProjectEditorMode] = useState<ProjectEditorMode>("create");
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(emptyProjectDraft);
  const [savingProject, setSavingProject] = useState(false);

  const [customerDrawerOpen, setCustomerDrawerOpen] = useState(false);
  const [customerDraft, setCustomerDraft] = useState<CustomerDraft>(emptyCustomerDraft);
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [createUploadFiles, setCreateUploadFiles] = useState<File[]>([]);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const previewPanelRef = useRef<HTMLDivElement | null>(null);
  const previewCloseRef = useRef<HTMLButtonElement | null>(null);

  const focusProject = useMemo(
    () => selectedProject ?? projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProject, selectedProjectId]
  );

  const projectMarkers = useMemo(() => {
    if (!focusProject || focusProject.latitude === null || focusProject.longitude === null) {
      return [];
    }
    return [
      {
        id: focusProject.id,
        label: focusProject.name,
        description: focusProject.locationLabel,
        latitude: focusProject.latitude,
        longitude: focusProject.longitude
      }
    ];
  }, [focusProject]);

  const fieldMarkers = useMemo(
    () =>
      locationFeed.slice(0, 20).map((point) => ({
        id: point.id,
        label: point.actor.displayName,
        description: formatDisplayDateTime(point.capturedAt),
        latitude: point.latitude,
        longitude: point.longitude
      })),
    [locationFeed]
  );

  const historyLine = useMemo(
    () =>
      [...locationFeed]
        .reverse()
        .map((point) => [point.latitude, point.longitude] as [number, number]),
    [locationFeed]
  );

  useEffect(() => {
    return () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
      }
    };
  }, []);

  useDialogBehavior({
    open: Boolean(previewUrl),
    containerRef: previewPanelRef,
    onClose: closePreview,
    initialFocusRef: previewCloseRef
  });

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    void Promise.all([refreshProjects(token), refreshCustomers(token)])
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Proje listesi yuklenemedi.");
      })
      .finally(() => setLoading(false));
  }, [deferredQuery, statusFilter, token]);

  useEffect(() => {
    if (!projects.length) {
      setSelectedProjectId(null);
      setSelectedProject(null);
      return;
    }
    setSelectedProjectId((current) =>
      current && projects.some((project) => project.id === current) ? current : projects[0].id
    );
  }, [projects]);

  async function refreshProjects(currentToken: string) {
    const params = new URLSearchParams();
    params.set("status", statusFilter);
    if (deferredQuery.trim()) {
      params.set("query", deferredQuery.trim());
    }
    const data = await apiFetch<ProjectSummary[]>(`/projects?${params.toString()}`, {}, currentToken);
    setProjects(data);
  }

  async function refreshCustomers(currentToken: string) {
    const data = await apiFetch<CustomerSummary[]>(
      "/customers?includeArchived=true",
      {},
      currentToken
    );
    setCustomers(data);
  }

  async function refreshProjectDetail(currentToken: string, projectId: string) {
    setDetailLoading(true);
    try {
      const [projectData, fileData, timelineData, locationData] = await Promise.all([
        apiFetch<ProjectSummary>(`/projects/${projectId}`, {}, currentToken),
        apiFetch<MainFileItem[]>(`/projects/${projectId}/main-files`, {}, currentToken),
        apiFetch<TimelineEntry[]>(`/projects/${projectId}/timeline`, {}, currentToken),
        apiFetch<LocationFeedItem[]>(`/projects/${projectId}/location-feed`, {}, currentToken).catch(
          () => []
        )
      ]);
      setSelectedProject(projectData);
      setMainFiles(fileData);
      setTimeline(timelineData);
      setLocationFeed(locationData);
    } finally {
      setDetailLoading(false);
    }
  }

  async function openProjectDrawer(projectId: string) {
    if (!token) {
      return;
    }
    setSelectedProjectId(projectId);
    await refreshProjectDetail(token, projectId);
    setProjectDrawerOpen(true);
  }

  function openProjectEditor(mode: ProjectEditorMode) {
    if (mode === "edit" && focusProject) {
      setProjectDraft(draftFromProject(focusProject));
    } else {
      setProjectDraft({
        ...emptyProjectDraft,
        customerId: customers.find((customer) => !customer.isArchived)?.id ?? ""
      });
      setCreateUploadFiles([]);
    }
    setProjectEditorMode(mode);
    setProjectEditorOpen(true);
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }
    if (!projectDraft.name.trim()) {
      setMessage("Proje adi zorunludur.");
      return;
    }

    setSavingProject(true);
    try {
      if (projectEditorMode === "create") {
        const created = await apiFetch<ProjectSummary>(
          "/projects",
          {
            method: "POST",
            body: JSON.stringify({
              customerId: projectDraft.customerId || undefined,
              name: projectDraft.name.trim(),
              code: projectDraft.code.trim() || undefined,
              description: projectDraft.description.trim() || undefined,
              locationLabel: projectDraft.locationLabel.trim() || undefined,
              latitude: parseNumberInput(projectDraft.latitude, undefined),
              longitude: parseNumberInput(projectDraft.longitude, undefined)
            })
          },
          token
        );
        if (createUploadFiles.length) {
          const form = new FormData();
          createUploadFiles.forEach((file) => form.append("files", file));
          await apiFetch(`/projects/${created.id}/main-files`, { method: "POST", body: form }, token);
        }
        setMessage(
          createUploadFiles.length ? "Proje ve ilk dosyalar olusturuldu." : "Proje olusturuldu."
        );
        setCreateUploadFiles([]);
        setProjectEditorOpen(false);
        await refreshProjects(token);
        await openProjectDrawer(created.id);
      } else if (focusProject) {
        await apiFetch<ProjectSummary>(
          `/projects/${focusProject.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              customerId: projectDraft.customerId || null,
              name: projectDraft.name.trim(),
              code: projectDraft.code.trim() || null,
              description: projectDraft.description.trim() || null,
              locationLabel: projectDraft.locationLabel.trim() || null,
              latitude: parseNumberInput(projectDraft.latitude, null),
              longitude: parseNumberInput(projectDraft.longitude, null)
            })
          },
          token
        );
        setMessage("Proje guncellendi.");
        setProjectEditorOpen(false);
        await Promise.all([
          refreshProjects(token),
          refreshProjectDetail(token, focusProject.id)
        ]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Proje kaydedilemedi.");
    } finally {
      setSavingProject(false);
    }
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }
    if (!customerDraft.name.trim()) {
      setMessage("Cari adi zorunludur.");
      return;
    }
    setCreatingCustomer(true);
    try {
      const created = await apiFetch<CustomerSummary>(
        "/customers",
        {
          method: "POST",
          body: JSON.stringify({
            name: customerDraft.name.trim(),
            note: customerDraft.note.trim() || undefined
          })
        },
        token
      );
      setCustomerDraft(emptyCustomerDraft);
      setCustomerDrawerOpen(false);
      await refreshCustomers(token);
      setProjectDraft((current) =>
        current.customerId ? current : { ...current, customerId: created.id }
      );
      setMessage("Cari olusturuldu.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cari olusturulamadi.");
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function toggleArchive() {
    if (!token || !focusProject) {
      return;
    }
    try {
      await apiFetch(
        `/projects/${focusProject.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ isArchived: !focusProject.isArchived })
        },
        token
      );
      setMessage(focusProject.isArchived ? "Proje aktif edildi." : "Proje arsivlendi.");
      await Promise.all([
        refreshProjects(token),
        refreshProjectDetail(token, focusProject.id)
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Arsiv durumu guncellenemedi.");
    }
  }

  async function deleteProject() {
    if (!token || !focusProject) {
      return;
    }
    if (!window.confirm(`${focusProject.name} silinsin mi?`)) {
      return;
    }
    try {
      await apiFetch(`/projects/${focusProject.id}`, { method: "DELETE" }, token);
      setProjectDrawerOpen(false);
      setMessage("Proje silindi.");
      await refreshProjects(token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Proje silinemedi.");
    }
  }

  async function uploadMainFiles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !focusProject) {
      return;
    }
    if (!uploadFiles.length) {
      setMessage("Yukleme icin dosya secin.");
      return;
    }
    setUploadingFiles(true);
    try {
      const form = new FormData();
      uploadFiles.forEach((file) => form.append("files", file));
      await apiFetch(`/projects/${focusProject.id}/main-files`, { method: "POST", body: form }, token);
      setUploadFiles([]);
      setMessage("Main dosyalar yuklendi.");
      await refreshProjectDetail(token, focusProject.id);
      await refreshProjects(token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Main dosya yuklenemedi.");
    } finally {
      setUploadingFiles(false);
    }
  }

  async function removeMainFile(fileId: string) {
    if (!token || !focusProject) {
      return;
    }
    if (!window.confirm("Secilen main dosya kaldirilsin mi?")) {
      return;
    }
    try {
      await apiFetch(`/projects/${focusProject.id}/main-files/${fileId}`, { method: "DELETE" }, token);
      setMessage("Main dosya kaldirildi.");
      await refreshProjectDetail(token, focusProject.id);
      await refreshProjects(token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Main dosya kaldirilamadi.");
    }
  }

  async function openProtectedFile(path: string, mode: "preview" | "download") {
    if (!token) {
      return;
    }
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

    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  function closePreview() {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
    setPreviewUrl(null);
    setPreviewName(null);
  }

  const draftLatitude = parseNumberInput(projectDraft.latitude, null);
  const draftLongitude = parseNumberInput(projectDraft.longitude, null);
  const activeProjects = projects.filter((project) => !project.isArchived).length;
  const archivedProjects = projects.filter((project) => project.isArchived).length;
  const mappedProjects = projects.filter((project) => project.locationLabel || project.latitude !== null).length;
  const listPreviewProject =
    focusProject ?? projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
  const projectSignalCards = [
    {
      label: "Aktif klasor",
      value: `${activeProjects}`,
      detail: "Sahada kullanilan canli proje kayitlari",
      icon: FolderIcon
    },
    {
      label: "Konumlu proje",
      value: `${mappedProjects}`,
      detail: "Harita ve rota akisina baglanabilen klasorler",
      icon: MapPinIcon
    },
    {
      label: "Dosya yogunlugu",
      value: `${projects.reduce((sum, project) => sum + project.mainFileCount, 0)}`,
      detail: "Main dosya havuzu secili filtre icin hesaplandi",
      icon: FileIcon
    }
  ];

  return (
    <>
      <div className="manager-module manager-stack-layout">
        <section className="manager-overview-hero">
          <div className="manager-command-surface manager-overview-poster">
            <div className="manager-command-copy">
              <span className="manager-command-kicker">Projeler</span>
              <h2 className="manager-block-title">Kayit, konum ve dosya akislarini tek workspace'te yonet</h2>
              <p className="manager-block-copy manager-block-copy-visible">
                Cari iliskisi, dosya yogunlugu ve saha izi ayni klasor yapisi uzerinden okunuyor.
              </p>
            </div>

            <div className="manager-overview-highlights">
              <div className="manager-inline-actions manager-inline-actions-wrap">
                <input
                  className="input"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Proje ara"
                  value={query}
                />
                <select
                  className="select"
                  onChange={(event) => setStatusFilter(event.target.value as ProjectStatusFilter)}
                  value={statusFilter}
                >
                  <option value="active">Aktif</option>
                  <option value="archived">Arsiv</option>
                  <option value="all">Tum projeler</option>
                </select>
              </div>

              <div className="manager-overview-spotlights">
                {projectSignalCards.map((item) => {
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
                <span className="manager-section-kicker">Secili odak</span>
                <h3 className="manager-section-title">Proje sinyali</h3>
              </div>
              <span className="manager-mini-chip">{statusFilter}</span>
            </div>

            <div className="manager-overview-note">
              <strong>{listPreviewProject?.name ?? "Proje secilmedi"}</strong>
              <p>
                {listPreviewProject
                  ? listPreviewProject.customer?.name ?? "Cari iliskisi bekleniyor"
                  : "Filtre sonucu proje bulunmuyor."}
              </p>
              <p>
                {listPreviewProject
                  ? listPreviewProject.locationLabel ?? "Konum etiketi henuz tanimli degil."
                  : "Yeni proje olusturarak klasor akisina baslayin."}
              </p>
            </div>

            <div className="manager-overview-statuslist">
              <article className="manager-overview-status manager-overview-status-ok">
                <span className="manager-overview-status-icon" aria-hidden="true">
                  <FileIcon />
                </span>
                <div>
                  <strong>Main dosya</strong>
                  <b>{listPreviewProject?.mainFileCount ?? 0}</b>
                  <p>Secili klasorun ana dosya sayisi</p>
                </div>
              </article>
              <article className="manager-overview-status">
                <span className="manager-overview-status-icon" aria-hidden="true">
                  <TimelineIcon />
                </span>
                <div>
                  <strong>Timeline</strong>
                  <b>{listPreviewProject?.timelineEntryCount ?? 0}</b>
                  <p>Kayda dusmus operasyon hareketi</p>
                </div>
              </article>
            </div>

            <div className="manager-overview-actions">
              <button className="button ghost" onClick={() => setCustomerDrawerOpen(true)} type="button">
                Cari Ac
              </button>
              <button className="button" onClick={() => openProjectEditor("create")} type="button">
                Yeni Proje
              </button>
            </div>
          </aside>
        </section>

        {message ? <div className="alert">{message}</div> : null}

        <section className="manager-stat-ribbon manager-stat-ribbon-compact manager-stat-ribbon-premium">
          <article className="manager-stat-card">
            <span>Liste sonucu</span>
            <strong>{loading ? "..." : projects.length}</strong>
            <small>Mevcut filtre gorunumu</small>
          </article>
          <article className="manager-stat-card">
            <span>Aktif</span>
            <strong>{loading ? "..." : activeProjects}</strong>
            <small>Operasyonda kullanilan proje</small>
          </article>
          <article className="manager-stat-card">
            <span>Arsiv</span>
            <strong>{loading ? "..." : archivedProjects}</strong>
            <small>Kapatilmis veya bekleyen klasor</small>
          </article>
          <article className="manager-stat-card">
            <span>Konumlu</span>
            <strong>{loading ? "..." : mappedProjects}</strong>
            <small>Haritada acilabilen proje</small>
          </article>
        </section>

        <section className="manager-panel-split">
          <section className="manager-surface-card">
            <div className="manager-section-head compact">
              <div>
                <span className="manager-section-kicker">Tum proje klasorleri</span>
                <h3 className="manager-section-title">Calisma listesi</h3>
              </div>
              <span className="manager-mini-chip">
                {loading ? "Yukleniyor..." : `${projects.length} proje`}
              </span>
            </div>

            {!projects.length ? (
              <div className="empty">Filtreye uygun proje bulunmuyor.</div>
            ) : (
              <div className="manager-entity-list">
                {projects.map((project) => (
                  <article
                    className={`manager-entity-row ${selectedProjectId === project.id ? "is-selected" : ""}`}
                    key={project.id}
                    onClick={() => setSelectedProjectId(project.id)}
                  >
                    <div className="manager-entity-headline">
                      <div className="manager-table-primary">
                        <strong>{project.name}</strong>
                        <span>{project.code ?? "Kod tanimli degil"}</span>
                      </div>
                      <div className="manager-directory-meta">
                        <span className={`manager-inline-badge ${project.isArchived ? "is-muted" : "is-positive"}`}>
                          {project.isArchived ? "Arsiv" : "Aktif"}
                        </span>
                        <span className={`manager-inline-badge ${project.locationLabel ? "is-positive" : "is-warn"}`}>
                          {project.locationLabel ? "Konum hazir" : "Konum eksik"}
                        </span>
                      </div>
                    </div>

                    <div className="manager-entity-side">
                      <p className="muted">
                        {project.customer?.name ?? "Cari iliskisi yok"}
                        {project.locationLabel ? ` / ${project.locationLabel}` : ""}
                      </p>
                      <div className="manager-directory-meta">
                        <span className="manager-mini-chip">{project.mainFileCount} dosya</span>
                        <span className="manager-mini-chip">{project.timelineEntryCount ?? 0} hareket</span>
                        <span className="manager-mini-chip">{formatDisplayDateTime(project.updatedAt)}</span>
                      </div>
                    </div>

                    <div className="manager-entity-actions">
                      <button
                        className="button ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedProjectId(project.id);
                        }}
                        type="button"
                      >
                        Sec
                      </button>
                      <button
                        className="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void openProjectDrawer(project.id);
                        }}
                        type="button"
                      >
                        Detay
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="manager-surface-card manager-focus-panel">
            <div className="manager-section-head compact">
              <div>
                <span className="manager-section-kicker">Secili klasor</span>
                <h3 className="manager-section-title">Hizli ozet</h3>
              </div>
              <span className="manager-mini-chip">{listPreviewProject?.customer?.name ?? "Cari yok"}</span>
            </div>

            {!listPreviewProject ? (
              <div className="empty">Liste secimi olmadigi icin onizleme gosterilemiyor.</div>
            ) : (
              <div className="manager-focus-stack">
                <div className="manager-focus-lead">
                  <strong>{listPreviewProject.name}</strong>
                  <p className="muted">
                    {listPreviewProject.description?.trim() || "Bu klasor icin aciklama henuz girilmemis."}
                  </p>
                </div>

                <div className="manager-sheet-grid">
                  <div className="manager-sheet-card">
                    <span>Durum</span>
                    <strong>{listPreviewProject.isArchived ? "Arsiv" : "Aktif"}</strong>
                  </div>
                  <div className="manager-sheet-card">
                    <span>Konum</span>
                    <strong>{listPreviewProject.locationLabel ? "Hazir" : "Eksik"}</strong>
                  </div>
                  <div className="manager-sheet-card">
                    <span>Main dosya</span>
                    <strong>{listPreviewProject.mainFileCount}</strong>
                  </div>
                  <div className="manager-sheet-card">
                    <span>Timeline</span>
                    <strong>{listPreviewProject.timelineEntryCount ?? 0}</strong>
                  </div>
                </div>

                <div className="manager-overview-note">
                  <strong>Son guncelleme</strong>
                  <p>{formatDisplayDateTime(listPreviewProject.updatedAt)}</p>
                  <p>{listPreviewProject.locationLabel ?? "Harita ve rota akisina baglanmasi icin konum girin."}</p>
                </div>

                <div className="manager-overview-actions">
                  <button className="button" onClick={() => void openProjectDrawer(listPreviewProject.id)} type="button">
                    Cekmeceyi Ac
                  </button>
                  <button
                    className="button ghost"
                    onClick={() => {
                      setSelectedProjectId(listPreviewProject.id);
                      setSelectedProject(listPreviewProject);
                      openProjectEditor("edit");
                    }}
                    type="button"
                  >
                    Duzenle
                  </button>
                </div>
              </div>
            )}
          </aside>
        </section>
      </div>

      <ManagerDrawer
        onClose={() => setProjectDrawerOpen(false)}
        open={projectDrawerOpen && Boolean(focusProject)}
        title={focusProject?.name ?? "Proje detayi"}
        description="Proje kaydinin ozet bilgilerini, harita baglamini, aktivite akislarini ve ana dosyalarini birlikte inceleyin."
        badge={
          focusProject ? (
            <span className={`manager-inline-badge ${focusProject.isArchived ? "is-muted" : "is-positive"}`}>
              {focusProject.isArchived ? "Arsiv proje" : "Aktif proje"}
            </span>
          ) : null
        }
      >
        {focusProject ? (
          <div className="stack">
            <ManagerDrawerSection
              eyebrow="Ozet"
              title="Kayit bilgisi"
              description="Mevcut proje kimligi, cari baglami ve ana aciklama alanlari."
            >
              <div className="manager-sheet-grid">
                <div className="manager-sheet-card">
                  <span>Cari</span>
                  <strong>{focusProject.customer?.name ?? "-"}</strong>
                </div>
                <div className="manager-sheet-card">
                  <span>Kod</span>
                  <strong>{focusProject.code ?? "-"}</strong>
                </div>
                <div className="manager-sheet-card manager-sheet-card-wide">
                  <span>Konum</span>
                  <strong>{focusProject.locationLabel ?? "Konum etiketi tanimli degil"}</strong>
                </div>
                <div className="manager-sheet-card manager-sheet-card-wide">
                  <span>Aciklama</span>
                  <strong>{focusProject.description ?? "Aciklama girilmemis."}</strong>
                </div>
              </div>
            </ManagerDrawerSection>

            <ManagerDrawerSection
              eyebrow="Konum"
              title="Harita ve saha izi"
              description="Proje markeri ile son saha hareketleri ayni harita uzerinde gosterilir."
            >
              {projectMarkers.length ? (
                <TrackingMap
                  fieldMarkers={fieldMarkers}
                  linePoints={historyLine.length > 1 ? historyLine : []}
                  projectMarkers={projectMarkers}
                />
              ) : (
                <div className="empty">Proje koordinati tanimli degil.</div>
              )}
            </ManagerDrawerSection>

            <ManagerDrawerSection
              eyebrow="Aktivite"
              title="Proje notlari ve gecmis hareket"
              description="Ilk 20 timeline kaydi okunabilir bloklar halinde gosterilir."
              meta={<span className="manager-mini-chip">{detailLoading ? "Yukleniyor..." : timeline.length}</span>}
            >
              {!timeline.length ? (
                <div className="empty">Proje notu bulunmuyor.</div>
              ) : (
                <div className="manager-table-wrap">
                  <table className="manager-table">
                    <thead>
                      <tr>
                        <th>Zaman</th>
                        <th>Kullanici</th>
                        <th>Tur</th>
                        <th>Not</th>
                        <th>Dosya</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeline.slice(0, 20).map((entry) => (
                        <tr key={entry.id}>
                          <td>{formatDisplayDateTime(entry.createdAt)}</td>
                          <td>{entry.actor.displayName}</td>
                          <td>{entryTypeLabel(entry.entryType)}</td>
                          <td>{entry.note?.trim() || "-"}</td>
                          <td>{entry.files.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ManagerDrawerSection>

            <ManagerDrawerSection
              eyebrow="Dosyalar"
              title="Ana dosya yonetimi"
              description="Yukleme, onizleme, indirme ve kaldirma akislari mevcut endpointlerle korunur."
              meta={<span className="manager-mini-chip">{mainFiles.length} dosya</span>}
            >
              <form className="stack" onSubmit={uploadMainFiles}>
                <input
                  className="input"
                  multiple
                  onChange={(event) => setUploadFiles(Array.from(event.target.files ?? []))}
                  type="file"
                />
                <button className="button" disabled={uploadingFiles} type="submit">
                  {uploadingFiles ? "Yukleniyor..." : "Dosya Yukle"}
                </button>
              </form>
              {!mainFiles.length ? (
                <div className="empty">Main dosya yok.</div>
              ) : (
                <div className="file-list">
                  {mainFiles.map((file) => (
                    <div className="file-row" key={file.id}>
                      <div>
                        <strong>{file.title}</strong>
                        <div className="tiny muted">{file.versionCount} surum</div>
                      </div>
                      <div className="toolbar-tight">
                        {file.latestVersion.inlineUrl ? (
                          <button
                            className="button ghost"
                            onClick={() => void openProtectedFile(file.latestVersion.inlineUrl!, "preview")}
                            type="button"
                          >
                            Onizle
                          </button>
                        ) : null}
                        <button
                          className="button ghost"
                          onClick={() => void openProtectedFile(file.latestVersion.downloadUrl, "download")}
                          type="button"
                        >
                          Indir
                        </button>
                        <button
                          className="button danger"
                          onClick={() => void removeMainFile(file.id)}
                          type="button"
                        >
                          Kaldir
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ManagerDrawerSection>

            <ManagerDrawerSection
              eyebrow="Aksiyonlar"
              title="Kayit islemleri"
              description="Duzenleme, arsivleme ve kaldirma akislari ayni backend davranisiyla calisir."
              tone="danger"
            >
              <div className="toolbar">
                <button className="button ghost" onClick={() => openProjectEditor("edit")} type="button">
                  Duzenle
                </button>
                <button className="button ghost" onClick={toggleArchive} type="button">
                  {focusProject.isArchived ? "Aktife Al" : "Arsivle"}
                </button>
                <button className="button danger-minimal" onClick={deleteProject} type="button">
                  Sil
                </button>
              </div>
            </ManagerDrawerSection>
          </div>
        ) : null}
      </ManagerDrawer>

      <ManagerDrawer
        onClose={() => setProjectEditorOpen(false)}
        open={projectEditorOpen}
        title={projectEditorMode === "create" ? "Yeni Proje" : "Proje Duzenle"}
        description={
          projectEditorMode === "create"
            ? "Yeni proje kaydi acin. Ilk dosyalar yalnizca olusturma adiminda eklenir."
            : "Mevcut proje kaydinin alanlarini guncelleyin."
        }
        badge={
          <span className="manager-inline-badge is-info">
            {projectEditorMode === "create" ? "Olusturma modu" : "Duzenleme modu"}
          </span>
        }
      >
        <form className="stack" onSubmit={saveProject}>
          <ManagerDrawerSection
            eyebrow="Kimlik"
            title="Kayit bilgisi"
            description="Projenin temel kimligi ve cari iliskisi bu bolumde tutulur."
          >
            <div className="split two">
              <input
                className="input"
                onChange={(event) =>
                  setProjectDraft((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Proje adi"
                required
                value={projectDraft.name}
              />
              <input
                className="input"
                onChange={(event) =>
                  setProjectDraft((current) => ({ ...current, code: event.target.value }))
                }
                placeholder="Proje kodu"
                value={projectDraft.code}
              />
            </div>
            <select
              className="select"
              onChange={(event) =>
                setProjectDraft((current) => ({ ...current, customerId: event.target.value }))
              }
              value={projectDraft.customerId}
            >
              <option value="">Cari baglama (opsiyonel)</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </ManagerDrawerSection>

          <ManagerDrawerSection
            eyebrow="Aciklama"
            title="Kayit notu"
            description="Projenin ana aciklamasi saha tarafinda da referans olarak gorunur."
          >
            <textarea
              className="textarea"
              onChange={(event) =>
                setProjectDraft((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Aciklama"
              value={projectDraft.description}
            />
          </ManagerDrawerSection>

          <ManagerDrawerSection
            eyebrow="Konum"
            title="Konum ve harita secimi"
            description="Etiket ve koordinatlar birlikte duzenlenir; haritaya tiklayarak secim yapabilirsiniz."
          >
            <input
              className="input"
              onChange={(event) =>
                setProjectDraft((current) => ({ ...current, locationLabel: event.target.value }))
              }
              placeholder="Konum etiketi"
              value={projectDraft.locationLabel}
            />
            <div className="split two">
              <input
                className="input"
                onChange={(event) =>
                  setProjectDraft((current) => ({ ...current, latitude: event.target.value }))
                }
                placeholder="Enlem"
                step="0.000001"
                type="number"
                value={projectDraft.latitude}
              />
              <input
                className="input"
                onChange={(event) =>
                  setProjectDraft((current) => ({ ...current, longitude: event.target.value }))
                }
                placeholder="Boylam"
                step="0.000001"
                type="number"
                value={projectDraft.longitude}
              />
            </div>
            <div className="map-shell compact">
              <MapPicker
                latitude={typeof draftLatitude === "number" ? draftLatitude : null}
                longitude={typeof draftLongitude === "number" ? draftLongitude : null}
                onPick={({ latitude, longitude }) =>
                  setProjectDraft((current) => ({
                    ...current,
                    latitude: `${latitude}`,
                    longitude: `${longitude}`
                  }))
                }
              />
            </div>
          </ManagerDrawerSection>

          {projectEditorMode === "create" ? (
            <ManagerDrawerSection
              eyebrow="Ilk dosyalar"
              title="Acilis paketini ekle"
              description="Main file yukleme akisi create davranisi ile ayni sekilde korunur."
            >
              <input
                className="input"
                multiple
                onChange={(event) => setCreateUploadFiles(Array.from(event.target.files ?? []))}
                type="file"
              />
            </ManagerDrawerSection>
          ) : null}
          <button className="button" disabled={savingProject} type="submit">
            {savingProject ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </form>
      </ManagerDrawer>

      <ManagerDrawer
        onClose={() => setCustomerDrawerOpen(false)}
        open={customerDrawerOpen}
        title="Cari Ac"
        description="Proje formundan ayrilmadan yeni cari kaydi acabilirsiniz."
      >
        <form className="stack" onSubmit={createCustomer}>
          <ManagerDrawerSection
            eyebrow="Cari"
            title="Yeni cari bilgisi"
            description="Olusturulan cari kaydi proje formunda secili hale gelebilir."
          >
            <input
              className="input"
              onChange={(event) =>
                setCustomerDraft((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Cari adi"
              required
              value={customerDraft.name}
            />
            <textarea
              className="textarea"
              onChange={(event) =>
                setCustomerDraft((current) => ({ ...current, note: event.target.value }))
              }
              placeholder="Cari notu"
              value={customerDraft.note}
            />
          </ManagerDrawerSection>
          <button className="button" disabled={creatingCustomer} type="submit">
            {creatingCustomer ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </form>
      </ManagerDrawer>

      {previewUrl ? (
        <div className="field-v3-preview-shell">
          <button aria-label="Kapat" className="field-v3-preview-backdrop" onClick={closePreview} type="button" />
          <div className="field-v3-preview-panel glass" ref={previewPanelRef} tabIndex={-1}>
            <div className="field-v3-preview-header">
              <div>
                <div className="field-v3-kicker">Dosya onizleme</div>
                <h2>{previewName}</h2>
              </div>
              <button className="button ghost" ref={previewCloseRef} type="button" onClick={closePreview}>
                Kapat
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
    </>
  );
}
