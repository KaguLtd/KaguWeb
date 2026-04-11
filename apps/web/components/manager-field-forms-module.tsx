"use client";

import Link from "next/link";
import {
  FieldFormFieldType,
  FieldFormSchemaField,
  FieldFormTemplateDetail,
  FieldFormTemplateSummary
} from "@kagu/contracts";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, isAbortError } from "../lib/api";
import { formatDisplayDate } from "../lib/date";
import { useAuth } from "./auth-provider";
import { ManagerDrawer, ManagerDrawerSection } from "./manager-ui";
import { CheckCircleIcon, FileIcon, TimelineIcon } from "./ui-icons";

type FieldFormEditorMode = "create" | "edit" | "version";

type FieldDraft = {
  key: string;
  label: string;
  type: FieldFormFieldType;
  required: boolean;
  optionsText: string;
};

type TemplateDraft = {
  name: string;
  description: string;
  isActive: boolean;
  versionTitle: string;
  fields: FieldDraft[];
};

const fieldTypeOptions: Array<{ value: FieldFormFieldType; label: string }> = [
  { value: "TEXT", label: "Kisa metin" },
  { value: "TEXTAREA", label: "Uzun metin" },
  { value: "NUMBER", label: "Sayi" },
  { value: "BOOLEAN", label: "Evet/Hayir" },
  { value: "DATE", label: "Tarih" },
  { value: "SELECT", label: "Secim" }
];

const emptyDraft: TemplateDraft = {
  name: "",
  description: "",
  isActive: true,
  versionTitle: "v1",
  fields: [
    {
      key: "summary",
      label: "Ozet",
      type: "TEXTAREA",
      required: true,
      optionsText: ""
    }
  ]
};

function draftFieldFromSchema(field: FieldFormSchemaField): FieldDraft {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    required: Boolean(field.required),
    optionsText: field.options?.join("\n") ?? ""
  };
}

function draftFromDetail(detail: FieldFormTemplateDetail): TemplateDraft {
  const latestVersion = detail.versions[0];
  return {
    name: detail.name,
    description: detail.description ?? "",
    isActive: detail.isActive,
    versionTitle: latestVersion?.title ?? "v1",
    fields: latestVersion?.schema.fields.map(draftFieldFromSchema) ?? emptyDraft.fields
  };
}

function buildSchema(fields: FieldDraft[]) {
  return {
    fields: fields.map((field) => ({
      key: field.key.trim(),
      label: field.label.trim(),
      type: field.type,
      required: field.required || undefined,
      options:
        field.type === "SELECT"
          ? field.optionsText
              .split("\n")
              .map((option) => option.trim())
              .filter(Boolean)
          : undefined
    }))
  };
}

export function ManagerFieldFormsModule() {
  const { token } = useAuth();
  const [templates, setTemplates] = useState<FieldFormTemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [detail, setDetail] = useState<FieldFormTemplateDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<FieldFormEditorMode>("create");
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft);
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    void apiFetch<FieldFormTemplateSummary[]>(
      "/field-form-templates",
      { signal: controller.signal },
      token
    )
      .then((data) => {
        setTemplates(data);
        setSelectedTemplateId((current) => current || data[0]?.id || "");
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          setMessage(error instanceof Error ? error.message : "Saha form template listesi yuklenemedi.");
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
      return;
    }

    const controller = new AbortController();
    setDetailLoading(true);

    void apiFetch<FieldFormTemplateDetail>(
      `/field-form-templates/${selectedTemplateId}`,
      { signal: controller.signal },
      token
    )
      .then((data) => setDetail(data))
      .catch((error) => {
        if (!isAbortError(error)) {
          setMessage(error instanceof Error ? error.message : "Saha form template detayi yuklenemedi.");
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

  const canSave =
    draft.name.trim().length >= 2 &&
    draft.fields.length > 0 &&
    draft.fields.every((field) => field.key.trim() && field.label.trim()) &&
    (editorMode !== "version" || draft.versionTitle.trim().length >= 2);

  async function refreshTemplates() {
    if (!token) {
      return;
    }
    const data = await apiFetch<FieldFormTemplateSummary[]>("/field-form-templates", {}, token);
    setTemplates(data);
  }

  async function refreshDetail(id: string) {
    if (!token) {
      return;
    }
    const data = await apiFetch<FieldFormTemplateDetail>(`/field-form-templates/${id}`, {}, token);
    setDetail(data);
  }

  function openCreateEditor() {
    setEditorMode("create");
    setDraft(emptyDraft);
    setEditorMessage(null);
    setEditorOpen(true);
  }

  function openEditEditor() {
    if (!detail) {
      return;
    }
    setEditorMode("edit");
    setDraft(draftFromDetail(detail));
    setEditorMessage(null);
    setEditorOpen(true);
  }

  function openVersionEditor() {
    if (!detail) {
      return;
    }
    const latestVersion = detail.versions[0];
    setEditorMode("version");
    setDraft({
      name: detail.name,
      description: detail.description ?? "",
      isActive: detail.isActive,
      versionTitle: `v${(latestVersion?.versionNumber ?? 0) + 1}`,
      fields: latestVersion?.schema.fields.map(draftFieldFromSchema) ?? emptyDraft.fields
    });
    setEditorMessage(null);
    setEditorOpen(true);
  }

  function addField() {
    setDraft((current) => ({
      ...current,
      fields: [
        ...current.fields,
        {
          key: "",
          label: "",
          type: "TEXT",
          required: false,
          optionsText: ""
        }
      ]
    }));
  }

  function updateField(index: number, next: Partial<FieldDraft>) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field, currentIndex) =>
        currentIndex === index ? { ...field, ...next } : field
      )
    }));
  }

  function removeField(index: number) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.filter((_, currentIndex) => currentIndex !== index)
    }));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canSave) {
      return;
    }

    try {
      setSaving(true);
      if (editorMode === "create") {
        const response = await apiFetch<{ id: string }>(
          "/field-form-templates",
          {
            method: "POST",
            body: JSON.stringify({
              name: draft.name.trim(),
              description: draft.description.trim() || undefined,
              isActive: draft.isActive,
              versionTitle: draft.versionTitle.trim(),
              schema: buildSchema(draft.fields)
            })
          },
          token
        );
        await refreshTemplates();
        setSelectedTemplateId(response.id);
        await refreshDetail(response.id);
        setMessage("Saha form template'i olusturuldu.");
      } else if (editorMode === "edit") {
        await apiFetch(
          `/field-form-templates/${selectedTemplateId}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: draft.name.trim(),
              description: draft.description.trim() || undefined,
              isActive: draft.isActive
            })
          },
          token
        );
        await Promise.all([refreshTemplates(), refreshDetail(selectedTemplateId)]);
        setMessage("Saha form template'i guncellendi.");
      } else {
        await apiFetch(
          `/field-form-templates/${selectedTemplateId}/versions`,
          {
            method: "POST",
            body: JSON.stringify({
              title: draft.versionTitle.trim(),
              schema: buildSchema(draft.fields)
            })
          },
          token
        );
        await Promise.all([refreshTemplates(), refreshDetail(selectedTemplateId)]);
        setMessage("Yeni saha form versiyonu eklendi.");
      }

      setEditorOpen(false);
    } catch (error) {
      setEditorMessage(error instanceof Error ? error.message : "Saha form kaydi basarisiz.");
    } finally {
      setSaving(false);
    }
  }

  const formSignalCards = [
    {
      label: "Template",
      value: `${templates.length}`,
      detail: "Kayitli saha formu",
      icon: FileIcon
    },
    {
      label: "Aktif",
      value: `${templates.filter((template) => template.isActive).length}`,
      detail: "Kullanimda olan form template'leri",
      icon: CheckCircleIcon
    },
    {
      label: "Versiyon",
      value: `${detail?.versions.length ?? 0}`,
      detail: "Secili formun schema gecmisi",
      icon: TimelineIcon
    }
  ];

  return (
    <>
      <div className="manager-module manager-stack-layout">
        <section className="manager-overview-hero">
          <div className="manager-command-surface manager-overview-poster">
          <div className="manager-command-copy">
            <span className="manager-command-kicker">Saha formlari</span>
            <h2 className="manager-block-title">Yapilandirilmis formlari yonetin</h2>
            <p className="manager-block-copy manager-block-copy-visible">
              Template tanimlarini, aktiflik durumunu ve versiyonlarini ayni yonetim yuzeyinden kontrol edin.
            </p>
          </div>
          <div className="manager-overview-highlights">
            <div className="manager-inline-actions manager-inline-actions-wrap">
              <Link className="button ghost" href="/dashboard/form-responses" scroll={false}>
                Cevaplari Incele
              </Link>
              <button className="button ghost" onClick={openCreateEditor} type="button">
                Yeni Form
              </button>
              <button className="button ghost" disabled={!detail} onClick={openEditEditor} type="button">
                Formu Duzenle
              </button>
              <button className="button" disabled={!detail} onClick={openVersionEditor} type="button">
                Yeni Versiyon
              </button>
            </div>
            <div className="manager-overview-spotlights">
              {formSignalCards.map((item) => {
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
                <span className="manager-section-kicker">Secili form</span>
                <h3 className="manager-section-title">Schema ozeti</h3>
              </div>
              <span className="manager-mini-chip">{selectedTemplate?.isActive ? "Aktif" : "Pasif"}</span>
            </div>

            <div className="manager-overview-statuslist">
              <article className={`manager-overview-status ${selectedTemplate?.isActive ? "manager-overview-status-ok" : "manager-overview-status-warn"}`}>
                <span className="manager-overview-status-icon" aria-hidden="true">
                  <CheckCircleIcon />
                </span>
                <div>
                  <strong>Durum</strong>
                  <b>{selectedTemplate?.isActive ? "Hazir" : "Pasif"}</b>
                  <p>{selectedTemplate ? `${selectedTemplate.responseCount} cevap kaydi` : "Form secimi bekleniyor"}</p>
                </div>
              </article>
              <article className="manager-overview-status">
                <span className="manager-overview-status-icon" aria-hidden="true">
                  <TimelineIcon />
                </span>
                <div>
                  <strong>Son versiyon</strong>
                  <b>{detail?.versions[0] ? `v${detail.versions[0].versionNumber}` : "-"}</b>
                  <p>{detail?.versions[0]?.title ?? "Versiyon kaydi yok"}</p>
                </div>
              </article>
            </div>

            <div className="manager-overview-note">
              <strong>{selectedTemplate?.name ?? "Form secin"}</strong>
              <p>{detail?.description?.trim() || "Form aciklamasi bulunmuyor."}</p>
              <p>{detail?.versions[0] ? `${detail.versions[0].schema.fields.length} alan tanimli.` : "Schema detayi bekleniyor."}</p>
            </div>
          </aside>
        </section>

        {message ? <div className="alert">{message}</div> : null}

        <section className="manager-stat-ribbon manager-stat-ribbon-compact manager-stat-ribbon-premium">
          <article className="manager-stat-card">
            <span>Template</span>
            <strong>{loading ? "..." : templates.length}</strong>
            <small>Kayitli saha formu</small>
          </article>
          <article className="manager-stat-card">
            <span>Aktif</span>
            <strong>{templates.filter((template) => template.isActive).length}</strong>
            <small>Kullanimda olanlar</small>
          </article>
          <article className="manager-stat-card">
            <span>Cevap</span>
            <strong>{templates.reduce((sum, template) => sum + template.responseCount, 0)}</strong>
            <small>Toplam response sayisi</small>
          </article>
          <article className="manager-stat-card">
            <span>Secili form</span>
            <strong>{selectedTemplate ? "Hazir" : "Yok"}</strong>
            <small>{selectedTemplate?.name ?? "Listeden secin"}</small>
          </article>
        </section>

        <div className="manager-panel-split">
          <section className="manager-surface-card">
            <div className="manager-section-head compact">
              <div>
                <span className="manager-section-kicker">Template listesi</span>
                <h3 className="manager-section-title">Saha formlari</h3>
              </div>
              <span className="manager-mini-chip">{templates.length} kayit</span>
            </div>

            {loading ? (
              <div className="empty">Saha form template listesi yukleniyor.</div>
            ) : !templates.length ? (
              <div className="empty">Henuz kayitli saha form template'i bulunmuyor.</div>
            ) : (
              <div className="manager-directory-list">
                {templates.map((template) => (
                  <button
                    className={`manager-directory-row manager-directory-button ${
                      template.id === selectedTemplateId ? "active" : ""
                    }`}
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    type="button"
                  >
                    <div className="manager-directory-main">
                      <div>
                        <strong>{template.name}</strong>
                        <p className="muted">
                          {template.latestVersion
                            ? `Versiyon ${template.latestVersion.versionNumber} / ${template.latestVersion.title}`
                            : "Versiyon yok"}
                        </p>
                      </div>
                      <div className="manager-directory-meta">
                        <span className="manager-mini-chip">
                          {template.isActive ? "Aktif" : "Pasif"}
                        </span>
                        <span className="manager-mini-chip">{template.responseCount} cevap</span>
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
                <span className="manager-section-kicker">Form detayi</span>
                <h3 className="manager-section-title">
                  {detail?.name ?? "Detay icin soldan secim yapin"}
                </h3>
              </div>
              <div className="manager-inline-actions">
                <span className="manager-mini-chip">{detail?.isActive ? "Aktif" : "Pasif"}</span>
                <span className="manager-mini-chip">{detail?.versions.length ?? 0} versiyon</span>
              </div>
            </div>

            {!selectedTemplateId ? (
              <div className="empty">Detay gormek icin bir saha formu secin.</div>
            ) : detailLoading ? (
              <div className="empty">Saha form detayi yukleniyor.</div>
            ) : !detail ? (
              <div className="empty">Saha form detayi okunamadi.</div>
            ) : (
              <div className="stack">
                <div className="manager-table-wrap">
                  <table className="manager-table">
                    <tbody>
                      <tr>
                        <th>Aciklama</th>
                        <td>{detail.description?.trim() || "-"}</td>
                      </tr>
                      <tr>
                        <th>Durum</th>
                        <td>{detail.isActive ? "Aktif" : "Pasif"}</td>
                      </tr>
                      <tr>
                        <th>Guncelleme</th>
                        <td>{formatDisplayDate(detail.updatedAt)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {!detail.versions.length ? (
                  <div className="empty">Bu saha formu icin versiyon kaydi yok.</div>
                ) : (
                  <div className="manager-feed-list">
                    {detail.versions.map((version) => (
                      <article className="manager-feed-row" key={version.id}>
                        <div className="manager-feed-topline">
                          <div>
                            <strong>{version.title}</strong>
                            <p className="muted">{version.schema.fields.length} alan</p>
                          </div>
                          <span className="manager-mini-chip">
                            v{version.versionNumber}
                          </span>
                        </div>
                        <div className="manager-feed-inline">
                          {version.schema.fields.map((field) => (
                            <span className="manager-mini-chip" key={`${version.id}-${field.key}`}>
                              {field.label} / {field.type}
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
      </div>

      <ManagerDrawer
        onClose={() => setEditorOpen(false)}
        open={editorOpen}
        title={
          editorMode === "create"
            ? "Yeni Saha Formu"
            : editorMode === "edit"
              ? "Saha Formunu Duzenle"
              : "Yeni Form Versiyonu"
        }
        description="Template metadata ve schema alanlarini tek panelden yonetin."
      >
        <form className="stack" onSubmit={(event) => void handleSave(event)}>
          {editorMessage ? <div className="alert">{editorMessage}</div> : null}

          <ManagerDrawerSection
            eyebrow="Kimlik"
            title="Form bilgisi"
            description="Ad, aciklama ve aktiflik durumunu burada yonetin."
          >
            <input
              className="input"
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Form adi"
              required
              value={draft.name}
            />
            <textarea
              className="textarea"
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Form aciklamasi"
              value={draft.description}
            />
            {editorMode === "version" ? (
              <input
                className="input"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, versionTitle: event.target.value }))
                }
                placeholder="Versiyon basligi"
                required
                value={draft.versionTitle}
              />
            ) : (
              <label className="toggle-row">
                <span>Form aktif</span>
                <input
                  checked={draft.isActive}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, isActive: event.target.checked }))
                  }
                  type="checkbox"
                />
              </label>
            )}
          </ManagerDrawerSection>

          <ManagerDrawerSection
            eyebrow="Schema"
            title="Form alanlari"
            description="Alan anahtari, etiket ve veri tiplerini tanimlayin."
          >
            <div className="toolbar">
              <button className="button ghost" onClick={addField} type="button">
                Alan Ekle
              </button>
            </div>

            <div className="stack">
              {draft.fields.map((field, index) => (
                <section className="manager-drawer-section" key={`${field.key}-${index}`}>
                  <div className="manager-section-head compact">
                    <div>
                      <span className="manager-section-kicker">Alan #{index + 1}</span>
                      <h3 className="manager-section-title">{field.label || "Yeni alan"}</h3>
                    </div>
                    <button className="button ghost" onClick={() => removeField(index)} type="button">
                      Kaldir
                    </button>
                  </div>

                  <div className="split two">
                    <input
                      className="input"
                      onChange={(event) => updateField(index, { key: event.target.value })}
                      placeholder="Alan anahtari"
                      required
                      value={field.key}
                    />
                    <input
                      className="input"
                      onChange={(event) => updateField(index, { label: event.target.value })}
                      placeholder="Alan etiketi"
                      required
                      value={field.label}
                    />
                  </div>

                  <div className="split two">
                    <select
                      className="select"
                      onChange={(event) =>
                        updateField(index, { type: event.target.value as FieldFormFieldType })
                      }
                      value={field.type}
                    >
                      {fieldTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <label className="toggle-row">
                      <span>Zorunlu alan</span>
                      <input
                        checked={field.required}
                        onChange={(event) => updateField(index, { required: event.target.checked })}
                        type="checkbox"
                      />
                    </label>
                  </div>

                  {field.type === "SELECT" ? (
                    <textarea
                      className="textarea"
                      onChange={(event) =>
                        updateField(index, { optionsText: event.target.value })
                      }
                      placeholder="Secenekleri satir satir yazin"
                      value={field.optionsText}
                    />
                  ) : null}
                </section>
              ))}
            </div>
          </ManagerDrawerSection>

          <div className="toolbar manager-action-foot">
            <span className={`manager-inline-badge ${canSave ? "is-positive" : "is-warn"}`}>
              {canSave ? "Kayda hazir" : "Schema alanlari eksik"}
            </span>
            <button className="button" disabled={saving || !canSave} type="submit">
              {saving
                ? "Kaydediliyor..."
                : editorMode === "create"
                  ? "Formu Kaydet"
                  : editorMode === "edit"
                    ? "Degisiklikleri Kaydet"
                    : "Versiyonu Kaydet"}
            </button>
          </div>
        </form>
      </ManagerDrawer>
    </>
  );
}
