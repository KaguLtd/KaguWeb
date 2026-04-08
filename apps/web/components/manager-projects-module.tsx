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
import { ManagerDrawer } from "./manager-ui";
import { MapPicker } from "./map-picker";
import { TrackingMap } from "./tracking-map";

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

  return (
    <>
      <div className="manager-module manager-stack-layout">
        <section className="manager-command-surface manager-command-surface-left">
          <div className="manager-command-copy">
            <span className="manager-command-kicker">Projeler</span>
            <h2 className="manager-block-title">Proje klasorlerini yonet</h2>
          </div>
          <div className="manager-command-controls manager-command-controls-left">
            <div className="manager-inline-actions">
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
            <div className="manager-inline-actions manager-actions-stack">
              <button className="button ghost" onClick={() => setCustomerDrawerOpen(true)} type="button">
                Cari Ac
              </button>
              <button className="button" onClick={() => openProjectEditor("create")} type="button">
                Yeni Proje
              </button>
            </div>
          </div>
        </section>

        {message ? <div className="alert">{message}</div> : null}

        <section className="manager-surface-card">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Tum proje klasorleri</span>
              <h3 className="manager-section-title">Liste gorunumu</h3>
            </div>
            <span className="manager-mini-chip">
              {loading ? "Yukleniyor..." : `${projects.length} proje`}
            </span>
          </div>

          {!projects.length ? (
            <div className="empty">Filtreye uygun proje bulunmuyor.</div>
          ) : (
            <div className="manager-table-wrap">
              <table className="manager-table">
                <thead>
                  <tr>
                    <th>Proje</th>
                    <th>Cari</th>
                    <th>Konum</th>
                    <th>Durum</th>
                    <th>Main Dosya</th>
                    <th>Timeline</th>
                    <th>Guncelleme</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr
                      className="manager-table-clickable"
                      key={project.id}
                      onClick={() => void openProjectDrawer(project.id)}
                    >
                      <td>{project.name}</td>
                      <td>{project.customer?.name ?? "-"}</td>
                      <td>
                        <span
                          className={`manager-location-indicator ${
                            project.locationLabel ? "has-location" : "missing-location"
                          }`}
                        >
                          {project.locationLabel ? "\u2713" : "-"}
                        </span>
                      </td>
                      <td>{project.isArchived ? "Arsiv" : "Aktif"}</td>
                      <td>{project.mainFileCount}</td>
                      <td>{project.timelineEntryCount ?? 0}</td>
                      <td>{formatDisplayDateTime(project.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ManagerDrawer
        onClose={() => setProjectDrawerOpen(false)}
        open={projectDrawerOpen && Boolean(focusProject)}
        title={focusProject?.name ?? "Proje detayi"}
      >
        {focusProject ? (
          <div className="stack">
            <div className="manager-table-wrap">
              <table className="manager-table">
                <tbody>
                  <tr>
                    <th>Cari</th>
                    <td>{focusProject.customer?.name ?? "-"}</td>
                  </tr>
                  <tr>
                    <th>Konum</th>
                    <td>{focusProject.locationLabel ?? "-"}</td>
                  </tr>
                  <tr>
                    <th>Kod</th>
                    <td>{focusProject.code ?? "-"}</td>
                  </tr>
                  <tr>
                    <th>Aciklama</th>
                    <td>{focusProject.description ?? "-"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <section className="stack">
              <div className="manager-section-head compact">
                <h4 className="manager-section-title">Konum</h4>
              </div>
              {projectMarkers.length ? (
                <TrackingMap
                  fieldMarkers={fieldMarkers}
                  linePoints={historyLine.length > 1 ? historyLine : []}
                  projectMarkers={projectMarkers}
                />
              ) : (
                <div className="empty">Proje koordinati tanimli degil.</div>
              )}
            </section>

            <section className="stack">
              <div className="manager-section-head compact">
                <h4 className="manager-section-title">Proje Notlari</h4>
                <span className="manager-mini-chip">
                  {detailLoading ? "Yukleniyor..." : timeline.length}
                </span>
              </div>
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
            </section>

            <section className="stack">
              <div className="manager-section-head compact">
                <h4 className="manager-section-title">Ana Dosyalar</h4>
                <span className="manager-mini-chip">{mainFiles.length}</span>
              </div>
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
            </section>

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
          </div>
        ) : null}
      </ManagerDrawer>

      <ManagerDrawer
        onClose={() => setProjectEditorOpen(false)}
        open={projectEditorOpen}
        title={projectEditorMode === "create" ? "Yeni Proje" : "Proje Duzenle"}
      >
        <form className="stack" onSubmit={saveProject}>
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
          <textarea
            className="textarea"
            onChange={(event) =>
              setProjectDraft((current) => ({ ...current, description: event.target.value }))
            }
            placeholder="Aciklama"
            value={projectDraft.description}
          />
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
          {projectEditorMode === "create" ? (
            <>
              <input
                className="input"
                multiple
                onChange={(event) => setCreateUploadFiles(Array.from(event.target.files ?? []))}
                type="file"
              />
            </>
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
      >
        <form className="stack" onSubmit={createCustomer}>
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
          <button className="button" disabled={creatingCustomer} type="submit">
            {creatingCustomer ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </form>
      </ManagerDrawer>

      {previewUrl ? (
        <div className="field-preview-shell">
          <button aria-label="Kapat" className="field-preview-backdrop" onClick={closePreview} type="button" />
          <div className="field-preview-panel glass">
            <div className="field-preview-header">
              <div>
                <div className="eyebrow">Dosya onizleme</div>
                <h2 className="section-title">{previewName}</h2>
              </div>
              <button className="button ghost" type="button" onClick={closePreview}>
                Kapat
              </button>
            </div>

            {previewName?.toLowerCase().endsWith(".pdf") ? (
              <iframe className="field-preview-frame" src={previewUrl} title={previewName} />
            ) : (
              <img
                alt={previewName ?? "preview"}
                className="field-preview-frame"
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
