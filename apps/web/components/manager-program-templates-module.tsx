"use client";

import Link from "next/link";
import { ManagerUserSummary, ProjectSummary } from "@kagu/contracts";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, isAbortError } from "../lib/api";
import { formatDisplayDate } from "../lib/date";
import { AlertMessage } from "./alert-message";
import { useAuth } from "./auth-provider";
import { ManagerDrawer, ManagerDrawerSection } from "./manager-ui";
import { CalendarIcon, CheckCircleIcon, TimelineIcon, UsersIcon } from "./ui-icons";

type ProgramTemplateSummary = {
  id: string;
  name: string;
  managerNote: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  rule: {
    frequency: string;
    weekdays: number[];
    startDate: string;
    endDate: string | null;
  } | null;
  projectCount: number;
  assignmentCount: number;
};

type ProgramTemplateDetail = {
  id: string;
  name: string;
  managerNote: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  rule: {
    frequency: string;
    weekdays: number[];
    startDate: string;
    endDate: string | null;
  } | null;
  projects: Array<{
    id: string | null;
    sortOrder: number;
    note: string | null;
    project: {
      id: string;
      code: string | null;
      name: string;
      isArchived: boolean;
    };
    assignments: Array<{
      user: {
        id: string;
        username: string;
        displayName: string;
        role: string;
        isActive: boolean;
      };
    }>;
  }>;
};

type ProgramTemplatePreview = {
  templateId: string;
  targetDate: string;
  matchesRule: boolean;
  existingDailyProgramId: string | null;
  wouldCreateDailyProgram: boolean;
  projectPlans: Array<{
    templateProjectId: string | null;
    project: {
      id: string;
      code?: string | null;
      name: string;
    };
    action: "create" | "merge";
    assignmentPlans: Array<{
      user: {
        id: string;
        username: string;
        displayName: string;
        role: string;
        isActive: boolean;
      };
      action: "create" | "keep" | "activate";
    }>;
  }>;
  summary: {
    createProjectCount: number;
    mergeProjectCount: number;
    createAssignmentCount: number;
    activateAssignmentCount: number;
  };
};

type TemplateEditorMode = "create" | "edit";

type TemplateProjectDraft = {
  projectId: string;
  note: string;
  userIds: string[];
};

type TemplateDraft = {
  name: string;
  managerNote: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
  weekdays: number[];
  projects: TemplateProjectDraft[];
};

const weekdayOptions = [
  { value: 1, label: "Pzt" },
  { value: 2, label: "Sal" },
  { value: 3, label: "Car" },
  { value: 4, label: "Per" },
  { value: 5, label: "Cum" },
  { value: 6, label: "Cmt" },
  { value: 7, label: "Paz" }
] as const;

const emptyDraft: TemplateDraft = {
  name: "",
  managerNote: "",
  isActive: true,
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  weekdays: [1],
  projects: []
};

function formatWeekdays(weekdays: number[]) {
  const labels: Record<number, string> = {
    1: "Pzt",
    2: "Sal",
    3: "Car",
    4: "Per",
    5: "Cum",
    6: "Cmt",
    7: "Paz"
  };

  return weekdays.map((day) => labels[day] ?? String(day)).join(", ");
}

function draftFromDetail(detail: ProgramTemplateDetail): TemplateDraft {
  return {
    name: detail.name,
    managerNote: detail.managerNote ?? "",
    isActive: detail.isActive,
    startDate: detail.rule?.startDate ?? new Date().toISOString().slice(0, 10),
    endDate: detail.rule?.endDate ?? "",
    weekdays: detail.rule?.weekdays.length ? detail.rule.weekdays : [1],
    projects: detail.projects.map((project) => ({
      projectId: project.project.id,
      note: project.note ?? "",
      userIds: project.assignments.map((assignment) => assignment.user.id)
    }))
  };
}

export function ManagerProgramTemplatesModule() {
  const { token } = useAuth();
  const [templates, setTemplates] = useState<ProgramTemplateSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [fieldUsers, setFieldUsers] = useState<ManagerUserSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [detail, setDetail] = useState<ProgramTemplateDetail | null>(null);
  const [preview, setPreview] = useState<ProgramTemplatePreview | null>(null);
  const [previewDate, setPreviewDate] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<TemplateEditorMode>("create");
  const [editorDraft, setEditorDraft] = useState<TemplateDraft>(emptyDraft);
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const [savingEditor, setSavingEditor] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    void Promise.all([
      apiFetch<ProgramTemplateSummary[]>("/program-templates", { signal: controller.signal }, token),
      apiFetch<ProjectSummary[]>("/projects?status=active", { signal: controller.signal }, token),
      apiFetch<ManagerUserSummary[]>(
        "/users?role=FIELD&status=active",
        { signal: controller.signal },
        token
      )
    ])
      .then(([templateData, projectData, userData]) => {
        setTemplates(templateData);
        setProjects(projectData);
        setFieldUsers(userData);
        setSelectedTemplateId((current) => current || templateData[0]?.id || "");
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          setMessage(error instanceof Error ? error.message : "Tekrarlı iş verisi yüklenemedi.");
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
    if (!token || !selectedTemplateId) {
      setDetail(null);
      setPreview(null);
      return;
    }

    const controller = new AbortController();
    setDetailLoading(true);

    void apiFetch<ProgramTemplateDetail>(
      `/program-templates/${selectedTemplateId}`,
      { signal: controller.signal },
      token
    )
      .then((data) => setDetail(data))
      .catch((error) => {
        if (!isAbortError(error)) {
          setMessage(error instanceof Error ? error.message : "Tekrarlı iş detayı yüklenemedi.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedTemplateId, token]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  );

  const canSaveEditor =
    editorDraft.name.trim().length >= 2 &&
    editorDraft.weekdays.length > 0 &&
    editorDraft.projects.length > 0 &&
    editorDraft.projects.every((project) => project.projectId.trim().length > 0);

  async function refreshTemplates() {
    if (!token) {
      return;
    }
    const data = await apiFetch<ProgramTemplateSummary[]>("/program-templates", {}, token);
    setTemplates(data);
  }

  async function refreshDetail(id: string) {
    if (!token) {
      return;
    }
    const data = await apiFetch<ProgramTemplateDetail>(`/program-templates/${id}`, {}, token);
    setDetail(data);
  }

  async function previewTemplate() {
    if (!token || !selectedTemplateId) {
      return;
    }

    try {
      setActionLoading(true);
      const data = await apiFetch<ProgramTemplatePreview>(
        `/program-templates/${selectedTemplateId}/preview`,
        {
          method: "POST",
          body: JSON.stringify({ date: previewDate })
        },
        token
      );
      setPreview(data);
      setMessage("Tekrarlı iş önizlemesi güncellendi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Önizleme oluşturulamadı.");
    } finally {
      setActionLoading(false);
    }
  }

  async function toggleTemplate(nextActive: boolean) {
    if (!token || !selectedTemplateId) {
      return;
    }

    try {
      setActionLoading(true);
      await apiFetch(
        `/program-templates/${selectedTemplateId}/${nextActive ? "activate" : "deactivate"}`,
        { method: "POST" },
        token
      );
      await Promise.all([refreshTemplates(), refreshDetail(selectedTemplateId)]);
      setMessage(nextActive ? "Tekrarlı iş etkinleştirildi." : "Tekrarlı iş pasife alındı.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Tekrarlı iş durumu güncellenemedi.");
    } finally {
      setActionLoading(false);
    }
  }

  async function materializeTemplate() {
    if (!token || !selectedTemplateId) {
      return;
    }

    try {
      setActionLoading(true);
      const result = await apiFetch<{
        templateId: string;
        dailyProgramId: string;
        date: string;
        projectCount: number;
        createdProjectCount: number;
        createdAssignmentCount: number;
      }>(
        `/program-templates/${selectedTemplateId}/materialize`,
        {
          method: "POST",
          body: JSON.stringify({ date: previewDate })
        },
        token
      );
      await refreshTemplates();
      setMessage(
        `${result.date} icin materialize tamamlandi. ${result.createdProjectCount} proje ve ${result.createdAssignmentCount} atama eklendi.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Materialize islemi basarisiz.");
    } finally {
      setActionLoading(false);
    }
  }

  function openCreateEditor() {
    setEditorMode("create");
    setEditorDraft({
      ...emptyDraft,
      startDate: previewDate
    });
    setEditorMessage(null);
    setEditorOpen(true);
  }

  function openEditEditor() {
    if (!detail) {
      return;
    }
    setEditorMode("edit");
    setEditorDraft(draftFromDetail(detail));
    setEditorMessage(null);
    setEditorOpen(true);
  }

  function toggleWeekday(day: number) {
    setEditorDraft((current) => ({
      ...current,
      weekdays: current.weekdays.includes(day)
        ? current.weekdays.filter((value) => value !== day)
        : [...current.weekdays, day].sort((left, right) => left - right)
    }));
  }

  function addProjectDraft() {
    setEditorDraft((current) => ({
      ...current,
      projects: [...current.projects, { projectId: "", note: "", userIds: [] }]
    }));
  }

  function updateProjectDraft(index: number, next: Partial<TemplateProjectDraft>) {
    setEditorDraft((current) => ({
      ...current,
      projects: current.projects.map((project, currentIndex) =>
        currentIndex === index ? { ...project, ...next } : project
      )
    }));
  }

  function removeProjectDraft(index: number) {
    setEditorDraft((current) => ({
      ...current,
      projects: current.projects.filter((_, currentIndex) => currentIndex !== index)
    }));
  }

  function toggleProjectUser(index: number, userId: string) {
    const currentUsers = editorDraft.projects[index]?.userIds ?? [];
    updateProjectDraft(index, {
      userIds: currentUsers.includes(userId)
        ? currentUsers.filter((value) => value !== userId)
        : [...currentUsers, userId]
    });
  }

  async function refreshLookups() {
    if (!token) {
      return;
    }
    const [projectData, userData] = await Promise.all([
      apiFetch<ProjectSummary[]>("/projects?status=active", {}, token),
      apiFetch<ManagerUserSummary[]>("/users?role=FIELD&status=active", {}, token)
    ]);
    setProjects(projectData);
    setFieldUsers(userData);
  }

  async function handleSaveEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canSaveEditor) {
      return;
    }

    const payload = {
      name: editorDraft.name.trim(),
      managerNote: editorDraft.managerNote.trim() || undefined,
      isActive: editorDraft.isActive,
      rule: {
        startDate: editorDraft.startDate,
        endDate: editorDraft.endDate.trim() || undefined,
        weekdays: editorDraft.weekdays
      },
      projects: editorDraft.projects.map((project) => ({
        projectId: project.projectId,
        note: project.note.trim() || undefined,
        userIds: project.userIds
      }))
    };

    try {
      setSavingEditor(true);
      const response = await apiFetch<{ id: string }>(
        editorMode === "create" ? "/program-templates" : `/program-templates/${selectedTemplateId}`,
        {
          method: editorMode === "create" ? "POST" : "PATCH",
          body: JSON.stringify(payload)
        },
        token
      );

      await Promise.all([refreshTemplates(), refreshLookups()]);
      setSelectedTemplateId(response.id);
      await refreshDetail(response.id);
      setEditorOpen(false);
      setMessage(editorMode === "create" ? "Tekrarlı iş oluşturuldu." : "Tekrarlı iş güncellendi.");
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "Tekrarlı iş kaydedilemedi.");
    } finally {
      setSavingEditor(false);
    }
  }

  const templateSignalCards = [
    {
      label: "Tekrarlı İş",
      value: `${templates.length}`,
      detail: "Kayıtlı tekrarlı iş",
      icon: CalendarIcon
    },
    {
      label: "Aktif",
      value: `${templates.filter((template) => template.isActive).length}`,
      detail: "Uygulanabilir tekrarlı iş",
      icon: CheckCircleIcon
    },
    {
      label: "Atama",
      value: `${selectedTemplate?.assignmentCount ?? 0}`,
      detail: "Seçili iş altındaki toplam ekip bağlantısı",
      icon: UsersIcon
    }
  ];

  return (
    <>
    <div className="manager-module manager-stack-layout">
      <section className="manager-overview-hero">
        <div className="manager-command-surface manager-overview-poster">
        <div className="manager-command-copy">
          <span className="manager-command-kicker">Template yonetimi</span>
          <h2 className="manager-block-title">Tekrar eden programlari yonetin</h2>
          <p className="manager-block-copy manager-block-copy-visible">
            Haftalik rota sablonlarini inceleyin, preview alin ve secili gune kontrollu sekilde uygulayin.
          </p>
        </div>

        <div className="manager-overview-highlights">
          <div className="manager-inline-actions manager-inline-actions-wrap">
            <Link className="button ghost" href="/dashboard/program" scroll={false}>
              Gunluk Programa Git
            </Link>
            <button className="button ghost" onClick={openCreateEditor} type="button">
              Yeni Template
            </button>
            <button
              className="button ghost"
              disabled={!detail}
              onClick={openEditEditor}
              type="button"
            >
              Template Duzenle
            </button>
          </div>
          <div className="manager-inline-actions manager-inline-actions-wrap">
            <Link className="button ghost" href="/dashboard/tracking" scroll={false}>
              Takip Onerisini Ac
            </Link>
            <input
              className="input"
              onChange={(event) => setPreviewDate(event.target.value)}
              type="date"
              value={previewDate}
            />
            <button className="button ghost" disabled={actionLoading || !selectedTemplateId} onClick={() => void previewTemplate()} type="button">
              Preview
            </button>
            <button className="button" disabled={actionLoading || !selectedTemplateId} onClick={() => void materializeTemplate()} type="button">
              Materialize
            </button>
          </div>
          <div className="manager-overview-spotlights">
            {templateSignalCards.map((item) => {
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
              <span className="manager-section-kicker">Secili sablon</span>
              <h3 className="manager-section-title">Template ozeti</h3>
            </div>
            <span className="manager-mini-chip">{previewDate}</span>
          </div>

          <div className="manager-overview-statuslist">
            <article className={`manager-overview-status ${selectedTemplate?.isActive ? "manager-overview-status-ok" : "manager-overview-status-warn"}`}>
              <span className="manager-overview-status-icon" aria-hidden="true">
                <CheckCircleIcon />
              </span>
              <div>
                <strong>Durum</strong>
                <b>{selectedTemplate?.isActive ? "Aktif" : "Pasif"}</b>
                <p>{selectedTemplate ? `${selectedTemplate.projectCount} proje / ${selectedTemplate.assignmentCount} atama` : "Template secimi bekleniyor"}</p>
              </div>
            </article>
            <article className="manager-overview-status">
              <span className="manager-overview-status-icon" aria-hidden="true">
                <TimelineIcon />
              </span>
              <div>
                <strong>Preview</strong>
                <b>{preview?.matchesRule ? "Hazir" : "Bekliyor"}</b>
                <p>{preview ? `${preview.summary.createProjectCount} yeni proje / ${preview.summary.createAssignmentCount} yeni atama` : "Preview alinmadi"}</p>
              </div>
            </article>
          </div>

          <div className="manager-overview-note">
            <strong>{selectedTemplate?.name ?? "Template secin"}</strong>
            <p>{selectedTemplate?.rule ? `${formatWeekdays(selectedTemplate.rule.weekdays)} / ${selectedTemplate.rule.startDate}` : "Kural tanimi bekleniyor."}</p>
            <p>{selectedTemplate?.managerNote?.trim() || "Yonetici notu yok."}</p>
          </div>
        </aside>
      </section>

      {message ? <AlertMessage message={message} /> : null}

      <div className="manager-panel-split">
        <section className="manager-surface-card">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Template listesi</span>
              <h3 className="manager-section-title">Kayitli sablonlar</h3>
            </div>
            <span className="manager-mini-chip">{templates.length} kayıt</span>
          </div>

          {loading ? (
            <div className="empty">Tekrarlı iş listesi yükleniyor.</div>
          ) : !templates.length ? (
            <div className="empty">Henüz kayıtlı tekrarlı iş bulunmuyor.</div>
          ) : (
            <div className="manager-directory-list">
              {templates.map((template) => (
                <button
                  className={`manager-directory-row manager-directory-button ${
                    template.id === selectedTemplateId ? "active" : ""
                  }`}
                  key={template.id}
                  onClick={() => {
                    setSelectedTemplateId(template.id);
                    setPreview(null);
                  }}
                  type="button"
                >
                  <div className="manager-directory-main">
                    <div>
                      <strong>{template.name}</strong>
                      <p className="muted">
                        {template.rule
                          ? `${formatWeekdays(template.rule.weekdays)} / ${template.rule.startDate}`
                          : "Kural tanimi bekleniyor"}
                      </p>
                    </div>
                    <div className="manager-directory-meta">
                      <span className="manager-mini-chip">
                        {template.isActive ? "Aktif" : "Pasif"}
                      </span>
                      <span className="manager-mini-chip">{template.projectCount} proje</span>
                      <span className="manager-mini-chip">{template.assignmentCount} atama</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="manager-surface-card">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Template detayi</span>
              <h3 className="manager-section-title">
                {detail?.name ?? "Detay icin soldan secim yapin"}
              </h3>
            </div>
            <div className="manager-inline-actions">
              <button
                className="button ghost"
                disabled={actionLoading || !detail || detail.isActive}
                onClick={() => void toggleTemplate(true)}
                type="button"
              >
                Aktive Et
              </button>
              <button
                className="button ghost"
                disabled={actionLoading || !detail || !detail.isActive}
                onClick={() => void toggleTemplate(false)}
                type="button"
              >
                Pasife Al
              </button>
            </div>
          </div>

          {!selectedTemplateId ? (
            <div className="empty">Detay gormek icin bir template secin.</div>
          ) : detailLoading ? (
            <div className="empty">Tekrarlı iş detayı yükleniyor.</div>
          ) : !detail ? (
            <div className="empty">Template detayi okunamadi.</div>
          ) : (
            <div className="stack">
              <div className="manager-inline-actions">
                <span className="manager-mini-chip">{detail.isActive ? "Aktif" : "Pasif"}</span>
                <span className="manager-mini-chip">
                  {detail.rule ? formatWeekdays(detail.rule.weekdays) : "Kural yok"}
                </span>
                <span className="manager-mini-chip">{detail.projects.length} proje</span>
              </div>
              <div className="manager-table-wrap">
                <table className="manager-table">
                  <tbody>
                    <tr>
                      <th>Baslangic</th>
                      <td>{detail.rule?.startDate ? formatDisplayDate(detail.rule.startDate) : "-"}</td>
                    </tr>
                    <tr>
                      <th>Bitis</th>
                      <td>{detail.rule?.endDate ? formatDisplayDate(detail.rule.endDate) : "Yok"}</td>
                    </tr>
                    <tr>
                      <th>Not</th>
                      <td>{detail.managerNote?.trim() || "-"}</td>
                    </tr>
                    <tr>
                      <th>Guncelleme</th>
                      <td>{formatDisplayDate(detail.updatedAt)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {!detail.projects.length ? (
                <div className="empty">Bu template icin proje kaydi yok.</div>
              ) : (
                <div className="manager-feed-list">
                  {detail.projects.map((item) => (
                    <article className="manager-feed-row" key={item.id ?? item.project.id}>
                      <div className="manager-feed-topline">
                        <div>
                          <strong>{item.project.name}</strong>
                          <p className="muted">
                            {item.note?.trim() || item.project.code || "Ek not yok"}
                          </p>
                        </div>
                        <span className="manager-mini-chip">Sira {item.sortOrder + 1}</span>
                      </div>
                      <div className="manager-feed-inline">
                        {item.assignments.length ? (
                          item.assignments.map((assignment) => (
                            <span className="manager-mini-chip" key={assignment.user.id}>
                              {assignment.user.displayName}
                            </span>
                          ))
                        ) : (
                          <span className="manager-mini-chip">Atama yok</span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="manager-surface-card">
        <div className="manager-section-head compact">
          <div>
            <span className="manager-section-kicker">Preview</span>
            <h3 className="manager-section-title">Secili tarih etkisi</h3>
          </div>
          <div className="manager-inline-actions">
            <span className="manager-mini-chip">{preview?.targetDate ?? previewDate}</span>
            <span className="manager-mini-chip">
              {preview?.matchesRule ? "Kurala uyuyor" : "Preview bekleniyor"}
            </span>
          </div>
        </div>

        {!preview ? (
          <div className="empty">Preview almak icin tarih secip Preview butonunu kullanin.</div>
        ) : (
          <div className="stack">
            <div className="manager-inline-actions">
              <span className="manager-mini-chip">
                {preview.wouldCreateDailyProgram ? "Yeni gunluk program" : "Mevcut gunluk program"}
              </span>
              <span className="manager-mini-chip">
                {preview.summary.createProjectCount} yeni proje
              </span>
              <span className="manager-mini-chip">
                {preview.summary.createAssignmentCount} yeni atama
              </span>
              <span className="manager-mini-chip">
                {preview.summary.activateAssignmentCount} aktivasyon
              </span>
            </div>

            {!preview.projectPlans.length ? (
              <div className="empty">Secili template bu tarih icin proje plani uretmedi.</div>
            ) : (
              <div className="manager-feed-list">
                {preview.projectPlans.map((plan) => (
                  <article className="manager-feed-row" key={plan.templateProjectId ?? plan.project.id}>
                    <div className="manager-feed-topline">
                      <div>
                        <strong>{plan.project.name}</strong>
                        <p className="muted">{plan.action === "create" ? "Yeni eklenecek" : "Mevcut kayıtla birleştirilecek"}</p>
                      </div>
                      <span className="manager-mini-chip">{plan.assignmentPlans.length} atama</span>
                    </div>
                    <div className="manager-feed-inline">
                      {plan.assignmentPlans.map((assignment) => (
                        <span className="manager-mini-chip" key={`${plan.project.id}-${assignment.user.id}`}>
                          {assignment.user.displayName} / {assignment.action}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>

    <ManagerDrawer
      onClose={() => setEditorOpen(false)}
      open={editorOpen}
      title={editorMode === "create" ? "Yeni Program Template'i" : "Program Template'ini Duzenle"}
      description="Template metadata, tekrar kurali ve proje/ekip setini tek panelden yonetin."
    >
      <form className="stack" onSubmit={(event) => void handleSaveEditor(event)}>
        {editorMessage ? <AlertMessage message={editorMessage} /> : null}

        <ManagerDrawerSection
          eyebrow="Kimlik"
          title="Template bilgisi"
          description="Ad, not ve genel aktiflik durumunu bu bloktan yonetin."
        >
          <input
            className="input"
            onChange={(event) =>
              setEditorDraft((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="Template adi"
            required
            value={editorDraft.name}
          />
          <textarea
            className="textarea"
            onChange={(event) =>
              setEditorDraft((current) => ({ ...current, managerNote: event.target.value }))
            }
            placeholder="Yonetici notu"
            value={editorDraft.managerNote}
          />
          <label className="toggle-row">
            <span>Template aktif</span>
            <input
              checked={editorDraft.isActive}
              onChange={(event) =>
                setEditorDraft((current) => ({ ...current, isActive: event.target.checked }))
              }
              type="checkbox"
            />
          </label>
        </ManagerDrawerSection>

        <ManagerDrawerSection
          eyebrow="Kural"
          title="Tekrar plani"
          description="Haftalik tekrar gunlerini ve tarih araligini secin."
        >
          <div className="split two">
            <input
              className="input"
              onChange={(event) =>
                setEditorDraft((current) => ({ ...current, startDate: event.target.value }))
              }
              required
              type="date"
              value={editorDraft.startDate}
            />
            <input
              className="input"
              onChange={(event) =>
                setEditorDraft((current) => ({ ...current, endDate: event.target.value }))
              }
              type="date"
              value={editorDraft.endDate}
            />
          </div>
          <div className="program-assignment-grid">
            {weekdayOptions.map((weekday) => {
              const selected = editorDraft.weekdays.includes(weekday.value);
              return (
                <button
                  className={`assign-pill ${selected ? "active" : ""}`}
                  key={weekday.value}
                  onClick={() => toggleWeekday(weekday.value)}
                  type="button"
                >
                  <span className="assign-pill-check" aria-hidden="true">
                    {selected ? "\u2713" : "+"}
                  </span>
                  <span className="assign-pill-copy">
                    <strong>{weekday.label}</strong>
                    <small>{selected ? "Secili" : "Ekle"}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </ManagerDrawerSection>

        <ManagerDrawerSection
          eyebrow="Proje seti"
          title="Template projeleri"
          description="Sirali proje kayitlarini ve her proje icin saha atamalarini tanimlayin."
        >
          <div className="toolbar">
            <button className="button ghost" onClick={addProjectDraft} type="button">
              Proje Satiri Ekle
            </button>
          </div>

          {!editorDraft.projects.length ? (
            <div className="empty">Template kaydi icin en az bir proje ekleyin.</div>
          ) : (
            <div className="stack">
              {editorDraft.projects.map((projectDraft, index) => {
                const currentProject =
                  projects.find((project) => project.id === projectDraft.projectId) ?? null;

                return (
                  <section className="manager-drawer-section" key={`${projectDraft.projectId}-${index}`}>
                    <div className="manager-section-head compact">
                      <div>
                        <span className="manager-section-kicker">Proje #{index + 1}</span>
                        <h3 className="manager-section-title">
                          {currentProject?.name ?? "Proje secin"}
                        </h3>
                      </div>
                      <button
                        className="button ghost"
                        onClick={() => removeProjectDraft(index)}
                        type="button"
                      >
                        Kaldir
                      </button>
                    </div>

                    <div className="split two">
                      <select
                        className="select"
                        onChange={(event) =>
                          updateProjectDraft(index, { projectId: event.target.value })
                        }
                        value={projectDraft.projectId}
                      >
                        <option value="">Proje secin</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input"
                        onChange={(event) =>
                          updateProjectDraft(index, { note: event.target.value })
                        }
                        placeholder="Proje notu"
                        value={projectDraft.note}
                      />
                    </div>

                    <div className="program-assignment-grid">
                      {fieldUsers.map((user) => {
                        const selected = projectDraft.userIds.includes(user.id);
                        return (
                          <button
                            className={`assign-pill ${selected ? "active" : ""}`}
                            key={`${index}-${user.id}`}
                            onClick={() => toggleProjectUser(index, user.id)}
                            type="button"
                          >
                            <span className="assign-pill-check" aria-hidden="true">
                              {selected ? "\u2713" : "+"}
                            </span>
                            <span className="assign-pill-copy">
                              <strong>{user.displayName}</strong>
                              <small>{selected ? "Atandi" : `@${user.username}`}</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </ManagerDrawerSection>

        <div className="toolbar manager-action-foot">
          <span className={`manager-inline-badge ${canSaveEditor ? "is-positive" : "is-warn"}`}>
            {canSaveEditor ? "Kayda hazir" : "Zorunlu alanlar eksik"}
          </span>
          <button className="button" disabled={savingEditor || !canSaveEditor} type="submit">
            {savingEditor
              ? "Kaydediliyor..."
              : editorMode === "create"
                ? "Template'i Kaydet"
                : "Degisiklikleri Kaydet"}
          </button>
        </div>
      </form>
    </ManagerDrawer>
    </>
  );
}
