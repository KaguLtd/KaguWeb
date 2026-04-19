"use client";

import {
  CustomerSummary,
  LocationFeedItem,
  MainFileItem,
  ProjectSummary,
  TimelineEntry
} from "@kagu/contracts";
import { FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { formatDisplayDateTime } from "../lib/date";
import { openProtectedFile as openProtectedFileWithAuth } from "../lib/protected-file";
import { AlertMessage } from "./alert-message";
import { useAuth } from "./auth-provider";
import { ManagerQuickAccessChip } from "./manager-quick-access";
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
  description: string;
  locationLabel: string;
  latitude: string;
  longitude: string;
};

type ProjectTimelineEntry = Omit<TimelineEntry, "entryType"> & {
  entryType: TimelineEntry["entryType"] | "FIELD_FORM_RESPONSE";
  formResponse?: {
    templateName: string;
    templateVersionNumber: number;
    projectEntryId: string | null;
  };
};

type CustomerDraft = {
  name: string;
  note: string;
};

const emptyProjectDraft: ProjectDraft = {
  customerId: "",
  name: "",
  description: "",
  locationLabel: "",
  latitude: "",
  longitude: ""
};

const emptyCustomerDraft: CustomerDraft = {
  name: "",
  note: ""
};

function entryTypeLabel(value: ProjectTimelineEntry["entryType"]) {
  switch (value) {
    case "MANAGER_NOTE":
      return "Yönetici notu";
    case "FIELD_NOTE":
      return "Saha notu";
    case "WORK_START":
      return "İş başlangıcı";
    case "WORK_END":
      return "Gün sonu";
    case "FILE_UPLOAD":
      return "Dosya yükleme";
    case "IMAGE_UPLOAD":
      return "Görsel yükleme";
    case "LOCATION_EVENT":
      return "Konum olayı";
    case "FIELD_FORM_RESPONSE":
      return "Form yanıtı";
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
    description: project.description ?? "",
    locationLabel: project.locationLabel ?? "",
    latitude: numberToInputValue(project.latitude),
    longitude: numberToInputValue(project.longitude)
  };
}

function buildTimelineQuickRecord(entry: ProjectTimelineEntry) {
  return {
    id: entry.id,
    title: entry.actor.displayName,
    subtitle: formatDisplayDateTime(entry.createdAt),
    description:
      entry.entryType === "FIELD_FORM_RESPONSE"
        ? `${entry.formResponse?.templateName ?? "Form"} v${entry.formResponse?.templateVersionNumber ?? 1}`
        : entry.note?.trim() || entryTypeLabel(entry.entryType),
    meta: [entryTypeLabel(entry.entryType), `${entry.files.length} dosya`],
    files: entry.files.map((file) => ({
      id: file.id,
      name: file.originalName,
      extension: file.extension,
      downloadPath: file.downloadUrl,
      previewPath: file.inlineUrl ?? undefined
    }))
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
  const [timeline, setTimeline] = useState<ProjectTimelineEntry[]>([]);
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

  const noteEntries = useMemo(
    () =>
      timeline.filter(
        (entry) =>
          entry.entryType === "MANAGER_NOTE" ||
          entry.entryType === "FIELD_NOTE" ||
          Boolean(entry.note?.trim())
      ),
    [timeline]
  );

  const fieldNoteEntries = useMemo(
    () =>
      timeline.filter(
        (entry) =>
          entry.actor.role === "FIELD" &&
          (Boolean(entry.note?.trim()) || entry.files.length > 0)
      ),
    [timeline]
  );

  const movementEntries = useMemo(
    () =>
      timeline.filter(
        (entry) =>
          !(
            entry.actor.role === "FIELD" &&
            (Boolean(entry.note?.trim()) || entry.files.length > 0)
          ) &&
          entry.entryType !== "MANAGER_NOTE" &&
          entry.entryType !== "FIELD_NOTE" &&
          !entry.note?.trim()
      ),
    [timeline]
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
        setMessage(error instanceof Error ? error.message : "Proje listesi yüklenemedi.");
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
        apiFetch<ProjectTimelineEntry[]>(`/projects/${projectId}/timeline`, {}, currentToken),
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
          createUploadFiles.length ? "Proje ve ilk dosyalar oluşturuldu." : "Proje oluşturuldu."
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
              description: projectDraft.description.trim() || null,
              locationLabel: projectDraft.locationLabel.trim() || null,
              latitude: parseNumberInput(projectDraft.latitude, null),
              longitude: parseNumberInput(projectDraft.longitude, null)
            })
          },
          token
        );
        setMessage("Proje güncellendi.");
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
      setMessage("Cari adı zorunludur.");
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
      setMessage("Cari oluşturuldu.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cari oluşturulamadı.");
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
      setMessage(focusProject.isArchived ? "Proje aktif edildi." : "Proje arşivlendi.");
      await Promise.all([
        refreshProjects(token),
        refreshProjectDetail(token, focusProject.id)
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Arşiv durumu güncellenemedi.");
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
      setMessage("Yükleme için dosya seçin.");
      return;
    }
    setUploadingFiles(true);
    try {
      const form = new FormData();
      uploadFiles.forEach((file) => form.append("files", file));
      await apiFetch(`/projects/${focusProject.id}/main-files`, { method: "POST", body: form }, token);
      setUploadFiles([]);
      setMessage("Ana dosyalar yüklendi.");
      await refreshProjectDetail(token, focusProject.id);
      await refreshProjects(token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ana dosya yüklenemedi.");
    } finally {
      setUploadingFiles(false);
    }
  }

  async function removeMainFile(fileId: string) {
    if (!token || !focusProject) {
      return;
    }
    if (!window.confirm("Seçilen ana dosya kaldırılsın mı?")) {
      return;
    }
    try {
      await apiFetch(`/projects/${focusProject.id}/main-files/${fileId}`, { method: "DELETE" }, token);
      setMessage("Ana dosya kaldırıldı.");
      await refreshProjectDetail(token, focusProject.id);
      await refreshProjects(token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ana dosya kaldırılamadı.");
    }
  }

  async function openProtectedFile(path: string, mode: "preview" | "download") {
    if (!token) {
      return;
    }

    try {
      await openProtectedFileWithAuth({
        mode,
        path,
        token,
        onPreview: ({ filename, objectUrl }) => {
          if (previewObjectUrlRef.current) {
            URL.revokeObjectURL(previewObjectUrlRef.current);
          }
          previewObjectUrlRef.current = objectUrl;
          setPreviewUrl(objectUrl);
          setPreviewName(filename);
        }
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dosya acilamadi.");
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

  function renderTimelineFileRow(file: ProjectTimelineEntry["files"][number]) {
    return (
      <div className="file-row" key={file.id}>
        <div>
          <strong>{file.originalName}</strong>
          <div className="tiny muted">{file.extension}</div>
        </div>
        <div className="toolbar-tight">
          {file.inlineUrl ? (
            <button
              className="button ghost"
              onClick={() => void openProtectedFile(file.inlineUrl!, "preview")}
              type="button"
            >
              Onizle
            </button>
          ) : null}
          <button
            className="button ghost"
            onClick={() => void openProtectedFile(file.downloadUrl, "download")}
            type="button"
          >
            Indir
          </button>
        </div>
      </div>
    );
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
      label: "Aktif klasör",
      value: `${activeProjects}`,
      detail: "Sahada kullanılan canlı proje kayıtları",
      icon: FolderIcon
    },
    {
      label: "Konumlu proje",
      value: `${mappedProjects}`,
      detail: "Harita ve rota akışına bağlanabilen klasörler",
      icon: MapPinIcon
    },
    {
      label: "Dosya yoğunluğu",
      value: `${projects.reduce((sum, project) => sum + project.mainFileCount, 0)}`,
      detail: "Ana dosya havuzu seçili filtre için hesaplandı",
      icon: FileIcon
    }
  ];
  const statusFilterLabel =
    statusFilter === "active" ? "Aktif" : statusFilter === "archived" ? "Arşiv" : "Tümü";
  const projectListRecords = useMemo(
    () =>
      projects.map((project) => ({
        id: project.id,
        title: project.name,
        subtitle: project.customer?.name ?? project.locationLabel ?? "",
        description: `${project.mainFileCount} dosya / ${project.timelineEntryCount ?? 0} hareket`,
        meta: [
          project.isArchived ? "Arsiv" : "Aktif",
          `${project.mainFileCount} dosya`,
          `${project.timelineEntryCount ?? 0} hareket`
        ]
      })),
    [projects]
  );

  return (
    <>
      <div className="manager-module manager-stack-layout">
        <section className="manager-overview-hero">
          <div className="manager-command-surface manager-overview-poster">
            <div className="manager-command-copy">
              <span className="manager-command-kicker">Projeler</span>
              <h2 className="manager-block-title">Kayıt, konum ve dosya akışını tek alanda yönetin</h2>
              <p className="manager-block-copy manager-block-copy-visible">
                Cari ilişkisi, dosya yoğunluğu ve saha izi aynı klasör yapısından okunur.
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
                  <option value="archived">Arşiv</option>
                  <option value="all">Tüm projeler</option>
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
                <span className="manager-section-kicker">Seçili odak</span>
                <h3 className="manager-section-title">Proje özeti</h3>
              </div>
              <span className="manager-mini-chip">{statusFilterLabel}</span>
            </div>

            <div className="manager-overview-note">
              <strong>{listPreviewProject?.name ?? "Proje seçilmedi"}</strong>
              <p>
                {listPreviewProject
                  ? listPreviewProject.customer?.name ?? "Cari bağlantısı yok"
                  : "Filtre sonucu proje bulunmuyor."}
              </p>
              <p>
                {listPreviewProject
                  ? listPreviewProject.locationLabel ?? "Konum etiketi yok"
                  : "Yeni proje oluşturarak başlayın."}
              </p>
            </div>

            <div className="manager-overview-statuslist">
              <article className="manager-overview-status manager-overview-status-ok">
                <span className="manager-overview-status-icon" aria-hidden="true">
                  <FileIcon />
                </span>
                <div>
                  <strong>Ana dosya</strong>
                  <b>{listPreviewProject?.mainFileCount ?? 0}</b>
                  <p>Seçili klasörün ana dosya sayısı</p>
                </div>
              </article>
              <article className="manager-overview-status">
                <span className="manager-overview-status-icon" aria-hidden="true">
                  <TimelineIcon />
                </span>
                <div>
                  <strong>Hareket</strong>
                  <b>{listPreviewProject?.timelineEntryCount ?? 0}</b>
                  <p>Kayda düşmüş operasyon hareketi</p>
                </div>
              </article>
            </div>

            <div className="manager-overview-actions">
              <button className="button ghost" onClick={() => setCustomerDrawerOpen(true)} type="button">
                Cari Aç
              </button>
              <button className="button" onClick={() => openProjectEditor("create")} type="button">
                Yeni Proje
              </button>
            </div>
          </aside>
        </section>

        {message ? <AlertMessage message={message} /> : null}

        <section className="manager-panel-split">
          <section className="manager-surface-card">
            <div className="manager-section-head compact">
              <div>
                <span className="manager-section-kicker">Tüm projeler</span>
                <h3 className="manager-section-title">Çalışma listesi</h3>
              </div>
              <ManagerQuickAccessChip
                ariaLabel="Filtrelenmis projeleri ac"
                payload={{
                  title: "Filtrelenmis projeler",
                  summary: "Mevcut filtreye uyan proje kayitlari listeleniyor.",
                  records: projectListRecords,
                  links: [{ href: "/dashboard/projects", label: "Projeler" }]
                }}
              >
                {loading ? "Yükleniyor..." : `${projects.length} proje`}
              </ManagerQuickAccessChip>
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
                        <span>{project.code ?? "Kod henüz oluşmadı"}</span>
                      </div>
                      <div className="manager-directory-meta">
                        <span className={`manager-inline-badge ${project.isArchived ? "is-muted" : "is-positive"}`}>
                          {project.isArchived ? "Arşiv" : "Aktif"}
                        </span>
                        <span className={`manager-inline-badge ${project.locationLabel ? "is-positive" : "is-warn"}`}>
                          {project.locationLabel ? "Konum hazır" : "Konum eksik"}
                        </span>
                      </div>
                    </div>

                    <div className="manager-entity-side">
                      <p className="muted">
                        {project.customer?.name ?? "Cari bağlantısı yok"}
                        {project.locationLabel ? ` / ${project.locationLabel}` : ""}
                      </p>
                      <div className="manager-directory-meta">
                        <ManagerQuickAccessChip
                          ariaLabel={`${project.name} dosyalarini ac`}
                          payload={{
                            title: `${project.name} ana dosyalari`,
                            summary: "Secili projede yuklenmis ana dosyalar listeleniyor.",
                            records:
                              focusProject?.id === project.id
                                ? mainFiles.map((file) => ({
                                    id: file.id,
                                    title: file.title,
                                    subtitle: `${file.versionCount} surum`,
                                    description: "Proje ana dosyasi",
                                    files: [
                                      {
                                        id: file.id,
                                        name: file.title,
                                        downloadPath: file.latestVersion.downloadUrl,
                                        previewPath: file.latestVersion.inlineUrl ?? undefined
                                      }
                                    ]
                                  }))
                                : [],
                            links: [{ href: "/dashboard/projects", label: "Projeler" }]
                          }}
                        >
                          {project.mainFileCount} dosya
                        </ManagerQuickAccessChip>
                        <ManagerQuickAccessChip
                          ariaLabel={`${project.name} hareketlerini ac`}
                          payload={{
                            title: `${project.name} hareketleri`,
                            summary: "Secili proje icin timeline kayitlari listeleniyor.",
                            records:
                              focusProject?.id === project.id
                                ? timeline.map(buildTimelineQuickRecord)
                                : [],
                            links: [{ href: "/dashboard/projects", label: "Projeler" }]
                          }}
                        >
                          {project.timelineEntryCount ?? 0} hareket
                        </ManagerQuickAccessChip>
                        <span className="manager-mini-chip">{formatDisplayDateTime(project.updatedAt)}</span>
                      </div>
                    </div>

                    <div className="manager-entity-actions">
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
                <span className="manager-section-kicker">Seçili klasör</span>
                <h3 className="manager-section-title">Hızlı özet</h3>
              </div>
              <span className="manager-mini-chip">{listPreviewProject?.customer?.name ?? "Cari yok"}</span>
            </div>

            {!listPreviewProject ? (
              <div className="empty">Seçili proje yok.</div>
            ) : (
              <div className="manager-focus-stack">
                <div className="manager-focus-lead">
                  <strong>{listPreviewProject.name}</strong>
                  <p className="muted">
                    {listPreviewProject.description?.trim() || "Açıklama yok"}
                  </p>
                </div>

                <div className="manager-sheet-grid">
                  <div className="manager-sheet-card">
                    <span>Durum</span>
                    <strong>{listPreviewProject.isArchived ? "Arşiv" : "Aktif"}</strong>
                  </div>
                  <div className="manager-sheet-card">
                    <span>Konum</span>
                    <strong>{listPreviewProject.locationLabel ? "Hazır" : "Eksik"}</strong>
                  </div>
                  <div className="manager-sheet-card">
                    <span>Ana dosya</span>
                    <strong>{listPreviewProject.mainFileCount}</strong>
                  </div>
                  <div className="manager-sheet-card">
                    <span>Hareket</span>
                    <strong>{listPreviewProject.timelineEntryCount ?? 0}</strong>
                  </div>
                </div>

                <div className="manager-overview-note">
                  <strong>Son güncelleme</strong>
                  <p>{formatDisplayDateTime(listPreviewProject.updatedAt)}</p>
                  <p>{listPreviewProject.locationLabel ?? "Konum girilmedi"}</p>
                </div>

                <div className="manager-overview-actions">
                  <button className="button" onClick={() => void openProjectDrawer(listPreviewProject.id)} type="button">
                    Detayı Aç
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
                    Düzenle
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
        title={focusProject?.name ?? "Proje detayı"}
        badge={
          focusProject ? (
            <span className={`manager-inline-badge ${focusProject.isArchived ? "is-muted" : "is-positive"}`}>
              {focusProject.isArchived ? "Arşiv proje" : "Aktif proje"}
            </span>
          ) : null
        }
      >
        {focusProject ? (
          <div className="stack">
            <ManagerDrawerSection eyebrow="Özet" title="Kayıt bilgisi">
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
                  <strong>{focusProject.locationLabel ?? "Konum etiketi yok"}</strong>
                </div>
                <div className="manager-sheet-card manager-sheet-card-wide">
                  <span>Açıklama</span>
                  <strong>{focusProject.description ?? "-"}</strong>
                </div>
              </div>
            </ManagerDrawerSection>

            <ManagerDrawerSection eyebrow="Konum" title="Harita">
              {projectMarkers.length ? (
                <TrackingMap
                  fieldMarkers={fieldMarkers}
                  linePoints={historyLine.length > 1 ? historyLine : []}
                  projectMarkers={projectMarkers}
                />
              ) : (
                <div className="empty">Proje koordinatı tanımlı değil.</div>
              )}
            </ManagerDrawerSection>

            <ManagerDrawerSection
              eyebrow="Notlar"
              title="Proje notları"
              meta={
                <ManagerQuickAccessChip
                  ariaLabel="Proje notlarini ac"
                  payload={{
                    title: "Proje notlari",
                    summary: "Proje timeline icindeki not kayitlari listeleniyor.",
                    records: noteEntries.map(buildTimelineQuickRecord),
                    links: [{ href: "/dashboard/projects", label: "Projeler" }]
                  }}
                >
                  {detailLoading ? "Yükleniyor..." : noteEntries.length}
                </ManagerQuickAccessChip>
              }
            >
              {!noteEntries.length ? (
                <div className="empty">Proje notu bulunmuyor.</div>
              ) : (
                <div className="manager-table-wrap">
                  <table className="manager-table">
                    <thead>
                      <tr>
                        <th>Zaman</th>
                        <th>Kullanıcı</th>
                        <th>Tür</th>
                        <th>Not</th>
                      </tr>
                    </thead>
                    <tbody>
                      {noteEntries.slice(0, 20).map((entry) => (
                        <tr key={entry.id}>
                          <td>{formatDisplayDateTime(entry.createdAt)}</td>
                          <td>{entry.actor.displayName}</td>
                          <td>{entryTypeLabel(entry.entryType)}</td>
                          <td>{entry.note?.trim() || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ManagerDrawerSection>

            <ManagerDrawerSection
              eyebrow="Saha akisi"
              title="Saha notlari ve dosyalari"
              meta={
                <ManagerQuickAccessChip
                  ariaLabel="Saha notlari ve dosyalarini ac"
                  payload={{
                    title: "Saha notlari ve dosyalari",
                    summary: "Saha kullanicilarinin biraktigi not ve ekler listeleniyor.",
                    records: fieldNoteEntries.map(buildTimelineQuickRecord),
                    links: [{ href: "/dashboard/projects", label: "Projeler" }]
                  }}
                >
                  {detailLoading ? "Yukleniyor..." : fieldNoteEntries.length}
                </ManagerQuickAccessChip>
              }
            >
              {!fieldNoteEntries.length ? (
                <div className="empty">Sahadan gelen not veya dosya kaydi bulunmuyor.</div>
              ) : (
                <div className="stack">
                  {fieldNoteEntries.slice(0, 20).map((entry) => (
                    <article className="manager-overview-note" key={entry.id}>
                      <div className="manager-entity-headline">
                        <div className="manager-table-primary">
                          <strong>{entry.actor.displayName}</strong>
                          <span>{entryTypeLabel(entry.entryType)}</span>
                        </div>
                        <span className="manager-mini-chip">{formatDisplayDateTime(entry.createdAt)}</span>
                      </div>
                      <p>{entry.note?.trim() || "Bu kayitta not yok, yalnizca dosya eklendi."}</p>
                      {entry.files.length ? (
                        <div className="file-list">{entry.files.map(renderTimelineFileRow)}</div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </ManagerDrawerSection>

            <ManagerDrawerSection
              eyebrow="Hareketler"
              title="Proje hareketleri"
              meta={
                <ManagerQuickAccessChip
                  ariaLabel="Proje hareketlerini ac"
                  payload={{
                    title: "Proje hareketleri",
                    summary: "Not disi timeline ve sistem hareketleri listeleniyor.",
                    records: movementEntries.map(buildTimelineQuickRecord),
                    links: [{ href: "/dashboard/projects", label: "Projeler" }]
                  }}
                >
                  {detailLoading ? "Yükleniyor..." : movementEntries.length}
                </ManagerQuickAccessChip>
              }
            >
              {!movementEntries.length ? (
                <div className="empty">Proje hareketi bulunmuyor.</div>
              ) : (
                <div className="manager-table-wrap">
                  <table className="manager-table">
                    <thead>
                      <tr>
                        <th>Zaman</th>
                        <th>Kullanıcı</th>
                        <th>Tür</th>
                        <th>Detay</th>
                        <th>Dosya</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movementEntries.slice(0, 20).map((entry) => (
                        <tr key={entry.id}>
                          <td>{formatDisplayDateTime(entry.createdAt)}</td>
                          <td>{entry.actor.displayName}</td>
                          <td>{entryTypeLabel(entry.entryType)}</td>
                          <td>
                            {entry.entryType === "FIELD_FORM_RESPONSE"
                              ? `${entry.formResponse?.templateName ?? "Form"} v${entry.formResponse?.templateVersionNumber ?? 1}`
                              : entry.note?.trim() || "-"}
                          </td>
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
              title="Ana dosyalar"
              meta={
                <ManagerQuickAccessChip
                  ariaLabel="Ana dosyalari ac"
                  payload={{
                    title: "Ana dosyalar",
                    summary: "Secili projeye bagli ana dosyalar listeleniyor.",
                    records: mainFiles.map((file) => ({
                      id: file.id,
                      title: file.title,
                      subtitle: `${file.versionCount} surum`,
                      description: "Proje ana dosyasi",
                      files: [
                        {
                          id: file.id,
                          name: file.title,
                          downloadPath: file.latestVersion.downloadUrl,
                          previewPath: file.latestVersion.inlineUrl ?? undefined
                        }
                      ]
                    })),
                    links: [{ href: "/dashboard/projects", label: "Projeler" }]
                  }}
                >
                  {mainFiles.length} dosya
                </ManagerQuickAccessChip>
              }
            >
              <form className="stack" onSubmit={uploadMainFiles}>
                <input
                  className="input"
                  multiple
                  onChange={(event) => setUploadFiles(Array.from(event.target.files ?? []))}
                  type="file"
                />
                <button className="button" disabled={uploadingFiles} type="submit">
                  {uploadingFiles ? "Yükleniyor..." : "Dosya Yükle"}
                </button>
              </form>
              {!mainFiles.length ? (
                <div className="empty">Ana dosya yok.</div>
              ) : (
                <div className="file-list">
                  {mainFiles.map((file) => (
                    <div className="file-row" key={file.id}>
                      <div>
                        <strong>{file.title}</strong>
                        <div className="tiny muted">{file.versionCount} sürüm</div>
                      </div>
                      <div className="toolbar-tight">
                        {file.latestVersion.inlineUrl ? (
                          <button
                            className="button ghost"
                            onClick={() => void openProtectedFile(file.latestVersion.inlineUrl!, "preview")}
                            type="button"
                          >
                            Önizle
                          </button>
                        ) : null}
                        <button
                          className="button ghost"
                          onClick={() => void openProtectedFile(file.latestVersion.downloadUrl, "download")}
                          type="button"
                        >
                          İndir
                        </button>
                        <button
                          className="button danger"
                          onClick={() => void removeMainFile(file.id)}
                          type="button"
                        >
                          Kaldır
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ManagerDrawerSection>

            <ManagerDrawerSection eyebrow="Aksiyonlar" title="Kayıt işlemleri" tone="danger">
              <div className="toolbar">
                <button className="button ghost" onClick={() => openProjectEditor("edit")} type="button">
                  Düzenle
                </button>
                <button className="button ghost" onClick={toggleArchive} type="button">
                  {focusProject.isArchived ? "Aktife Al" : "Arşivle"}
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
        title={projectEditorMode === "create" ? "Yeni Proje" : "Projeyi Düzenle"}
        badge={
          <span className="manager-inline-badge is-info">
            {projectEditorMode === "create" ? "Oluşturma modu" : "Düzenleme modu"}
          </span>
        }
      >
        <form className="stack" onSubmit={saveProject}>
          <ManagerDrawerSection eyebrow="Kimlik" title="Kayıt bilgisi">
            <input
              className="input"
              onChange={(event) =>
                setProjectDraft((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Proje adı"
              required
              value={projectDraft.name}
            />
            <select
              className="select"
              onChange={(event) =>
                setProjectDraft((current) => ({ ...current, customerId: event.target.value }))
              }
              value={projectDraft.customerId}
            >
              <option value="">Cari bağla (isteğe bağlı)</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </ManagerDrawerSection>

          <ManagerDrawerSection eyebrow="Açıklama" title="Kısa not">
            <textarea
              className="textarea"
              onChange={(event) =>
                setProjectDraft((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Açıklama"
              value={projectDraft.description}
            />
          </ManagerDrawerSection>

          <ManagerDrawerSection eyebrow="Konum" title="Konum ve harita seçimi">
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
            <ManagerDrawerSection eyebrow="İlk dosyalar" title="Açılış paketini ekle">
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
        title="Cari Aç"
      >
        <form className="stack" onSubmit={createCustomer}>
          <ManagerDrawerSection eyebrow="Cari" title="Yeni cari bilgisi">
            <input
              className="input"
              onChange={(event) =>
                setCustomerDraft((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Cari adı"
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
                <div className="field-v3-kicker">Dosya önizleme</div>
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
                alt={previewName ?? "önizleme"}
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
