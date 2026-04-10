"use client";

import Link from "next/link";
import { ProjectSummary } from "@kagu/contracts";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, isAbortError } from "../lib/api";
import { formatDisplayDateTime } from "../lib/date";
import { useAuth } from "./auth-provider";
import { ManagerDrawer, ManagerDrawerSection } from "./manager-ui";

type ResponseSummary = {
  id: string;
  templateId: string;
  templateName: string;
  templateVersionId: string;
  templateVersionNumber: number;
  templateVersionTitle: string;
  projectId: string;
  projectName: string;
  dailyProgramProjectId: string | null;
  projectEntryId: string | null;
  actorId: string;
  actor: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
};

type FieldFormTemplateOption = {
  id: string;
  name: string;
};

type FilterDraft = {
  templateId: string;
  projectId: string;
  actorId: string;
};

const emptyFilters: FilterDraft = {
  templateId: "",
  projectId: "",
  actorId: ""
};

export function ManagerFieldFormResponsesModule() {
  const { token } = useAuth();
  const [responses, setResponses] = useState<ResponseSummary[]>([]);
  const [templates, setTemplates] = useState<FieldFormTemplateOption[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [filters, setFilters] = useState<FilterDraft>(emptyFilters);
  const [selectedResponseId, setSelectedResponseId] = useState("");
  const [selectedResponse, setSelectedResponse] = useState<ResponseSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const actorOptions = useMemo(() => {
    const map = new Map<string, ResponseSummary["actor"]>();
    for (const response of responses) {
      map.set(response.actor.id, response.actor);
    }
    return [...map.values()].sort((left, right) =>
      left.displayName.localeCompare(right.displayName, "tr")
    );
  }, [responses]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    void Promise.all([
      apiFetch<Array<{ id: string; name: string }>>(
        "/field-form-templates",
        { signal: controller.signal },
        token
      ),
      apiFetch<ProjectSummary[]>("/projects?status=active", { signal: controller.signal }, token),
      fetchResponses(controller.signal)
    ])
      .then(([templateData, projectData]) => {
        setTemplates(templateData.map((template) => ({ id: template.id, name: template.name })));
        setProjects(projectData);
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          setMessage(error instanceof Error ? error.message : "Form cevaplari yuklenemedi.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [token]);

  async function fetchResponses(signal?: AbortSignal) {
    if (!token) {
      return;
    }

    const params = new URLSearchParams();
    if (filters.templateId) {
      params.set("templateId", filters.templateId);
    }
    if (filters.projectId) {
      params.set("projectId", filters.projectId);
    }
    if (filters.actorId) {
      params.set("actorId", filters.actorId);
    }

    const path = params.size ? `/field-form-responses?${params.toString()}` : "/field-form-responses";
    const data = await apiFetch<ResponseSummary[]>(path, { signal }, token);
    setResponses(data);
    if (selectedResponseId && !data.some((response) => response.id === selectedResponseId)) {
      setSelectedResponseId("");
      setSelectedResponse(null);
    }
  }

  async function applyFilters() {
    if (!token) {
      return;
    }
    try {
      setLoading(true);
      await fetchResponses();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Filtreli cevap listesi alinamadi.");
    } finally {
      setLoading(false);
    }
  }

  async function openResponseDetail(responseId: string) {
    if (!token) {
      return;
    }
    try {
      setDetailLoading(true);
      const data = await apiFetch<ResponseSummary>(`/field-form-responses/${responseId}`, {}, token);
      setSelectedResponseId(responseId);
      setSelectedResponse(data);
      setDetailOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Form cevap detayi alinamadi.");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <>
      <div className="manager-module manager-stack-layout">
        <section className="manager-command-surface manager-command-surface-grid">
          <div className="manager-command-copy">
            <span className="manager-command-kicker">Form cevaplari</span>
            <h2 className="manager-block-title">Kaydedilen saha cevaplarini inceleyin</h2>
            <p className="manager-block-copy">
              Template, proje ve personel bazinda filtreleyin; sonra detay drawer’inda payload’i okuyun.
            </p>
          </div>
          <div className="manager-command-controls manager-command-controls-left">
            <div className="manager-inline-actions">
              <Link className="button ghost" href="/dashboard/forms" scroll={false}>
                Formlara Don
              </Link>
              <select
                className="select"
                onChange={(event) =>
                  setFilters((current) => ({ ...current, templateId: event.target.value }))
                }
                value={filters.templateId}
              >
                <option value="">Tum template'ler</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <select
                className="select"
                onChange={(event) =>
                  setFilters((current) => ({ ...current, projectId: event.target.value }))
                }
                value={filters.projectId}
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
                onChange={(event) =>
                  setFilters((current) => ({ ...current, actorId: event.target.value }))
                }
                value={filters.actorId}
              >
                <option value="">Tum personel</option>
                {actorOptions.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.displayName}
                  </option>
                ))}
              </select>
              <button className="button" onClick={() => void applyFilters()} type="button">
                Filtreyi Uygula
              </button>
            </div>
          </div>
        </section>

        {message ? <div className="alert">{message}</div> : null}

        <section className="manager-stat-ribbon manager-stat-ribbon-compact">
          <article className="manager-stat-card">
            <span>Cevap</span>
            <strong>{loading ? "..." : responses.length}</strong>
            <small>Mevcut filtre sonucu</small>
          </article>
          <article className="manager-stat-card">
            <span>Template</span>
            <strong>{new Set(responses.map((response) => response.templateId)).size}</strong>
            <small>Farkli form kaynagi</small>
          </article>
          <article className="manager-stat-card">
            <span>Proje</span>
            <strong>{new Set(responses.map((response) => response.projectId)).size}</strong>
            <small>Dokunulan proje</small>
          </article>
          <article className="manager-stat-card">
            <span>Personel</span>
            <strong>{new Set(responses.map((response) => response.actorId)).size}</strong>
            <small>Cevap yazan saha</small>
          </article>
        </section>

        <section className="manager-surface-card">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Response listesi</span>
              <h3 className="manager-section-title">Son kayitlar</h3>
            </div>
            <span className="manager-mini-chip">{responses.length} cevap</span>
          </div>

          {loading ? (
            <div className="empty">Form cevap listesi yukleniyor.</div>
          ) : !responses.length ? (
            <div className="empty">Secili filtreye uygun form cevabi bulunmuyor.</div>
          ) : (
            <div className="manager-feed-list">
              {responses.map((response) => (
                <button
                  className="manager-feed-row manager-directory-button"
                  key={response.id}
                  onClick={() => void openResponseDetail(response.id)}
                  type="button"
                >
                  <div className="manager-feed-topline">
                    <div>
                      <strong>{response.templateName}</strong>
                      <p className="muted">
                        {response.projectName} • {response.actor.displayName}
                      </p>
                    </div>
                    <span className="manager-mini-chip">
                      {formatDisplayDateTime(response.createdAt)}
                    </span>
                  </div>
                  <div className="manager-feed-inline">
                    <span className="manager-mini-chip">
                      v{response.templateVersionNumber}
                    </span>
                    <span className="manager-mini-chip">{response.templateVersionTitle}</span>
                    {response.projectEntryId ? (
                      <span className="manager-mini-chip">Timeline bagli</span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <ManagerDrawer
        onClose={() => setDetailOpen(false)}
        open={detailOpen && Boolean(selectedResponse)}
        title={selectedResponse?.templateName ?? "Form Cevabi"}
        description="Kaydedilen payload, bagli proje ve timeline iliskisi bu panelde gorunur."
      >
        {selectedResponse ? (
          <div className="stack">
            {detailLoading ? <div className="empty">Detay yukleniyor.</div> : null}

            <ManagerDrawerSection
              eyebrow="Baglam"
              title="Kayit ozeti"
              description="Response kaydinin kaynak template ve proje bilgisi."
            >
              <div className="manager-table-wrap">
                <table className="manager-table">
                  <tbody>
                    <tr>
                      <th>Template</th>
                      <td>{selectedResponse.templateName}</td>
                    </tr>
                    <tr>
                      <th>Versiyon</th>
                      <td>{`v${selectedResponse.templateVersionNumber} • ${selectedResponse.templateVersionTitle}`}</td>
                    </tr>
                    <tr>
                      <th>Proje</th>
                      <td>{selectedResponse.projectName}</td>
                    </tr>
                    <tr>
                      <th>Personel</th>
                      <td>{selectedResponse.actor.displayName}</td>
                    </tr>
                    <tr>
                      <th>Zaman</th>
                      <td>{formatDisplayDateTime(selectedResponse.createdAt)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </ManagerDrawerSection>

            <ManagerDrawerSection
              eyebrow="Payload"
              title="Kaydedilen cevap"
              description="Sisteme yazilan alanlar ham JSON olarak korunur."
            >
              <pre className="manager-json-block">
                {JSON.stringify(selectedResponse.payload, null, 2)}
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
