"use client";

import {
  DailyProgramDetail,
  DailyProgramMonthDaySummary,
  ManagerUserSummary,
  ProjectSummary
} from "@kagu/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, isAbortError } from "../lib/api";
import {
  createDateWindow,
  formatDisplayDate,
  normalizeDateForMonth,
  shiftDateString
} from "../lib/date";
import { useAuth } from "./auth-provider";
import { ManagerDrawer } from "./manager-ui";
import { useSyncedDashboardDate } from "./use-synced-dashboard-date";

const DATE_WINDOW_RADIUS = 45;

function formatDateLabel(value: string) {
  return formatDisplayDate(value);
}

export function ManagerProgramModule() {
  const { token } = useAuth();
  const [selectedDate, setSelectedDate] = useSyncedDashboardDate();
  const [monthSummary, setMonthSummary] = useState<DailyProgramMonthDaySummary[]>([]);
  const [program, setProgram] = useState<DailyProgramDetail | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [fieldUsers, setFieldUsers] = useState<ManagerUserSummary[]>([]);
  const [programDrawerOpen, setProgramDrawerOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [assignmentDraft, setAssignmentDraft] = useState<string[]>([]);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [entryNote, setEntryNote] = useState("");
  const [entryFiles, setEntryFiles] = useState<File[]>([]);
  const [moduleMessage, setModuleMessage] = useState<string | null>(null);
  const [drawerMessage, setDrawerMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const dayButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const projectPickerRef = useRef<HTMLDivElement | null>(null);
  const entryFileInputRef = useRef<HTMLInputElement | null>(null);

  const windowDays = useMemo(
    () => createDateWindow(selectedDate, DATE_WINDOW_RADIUS),
    [selectedDate]
  );
  const windowMonths = useMemo(
    () => [...new Set(windowDays.map((day) => day.slice(0, 7)))],
    [windowDays]
  );
  const windowMonthKey = windowMonths.join("|");
  const dayLookup = useMemo(
    () => new Map(monthSummary.map((day) => [day.date, day])),
    [monthSummary]
  );
  const selectedProgramProject = useMemo(
    () =>
      selectedProjectId
        ? program?.programProjects.find((item) => item.project.id === selectedProjectId) ?? null
        : null,
    [program, selectedProjectId]
  );
  const filteredFieldUsers = useMemo(() => {
    const query = assignmentSearch.trim().toLocaleLowerCase("tr-TR");
    if (!query) {
      return fieldUsers;
    }
    return fieldUsers.filter((user) =>
      `${user.displayName} ${user.username}`.toLocaleLowerCase("tr-TR").includes(query)
    );
  }, [assignmentSearch, fieldUsers]);
  const visibleFieldUsers = useMemo(
    () =>
      [...filteredFieldUsers].sort((left, right) => {
        const leftSelected = assignmentDraft.includes(left.id) ? 1 : 0;
        const rightSelected = assignmentDraft.includes(right.id) ? 1 : 0;
        if (leftSelected !== rightSelected) {
          return rightSelected - leftSelected;
        }
        return left.displayName.localeCompare(right.displayName, "tr");
      }),
    [assignmentDraft, filteredFieldUsers]
  );
  const selectedAssignmentUsers = useMemo(
    () => fieldUsers.filter((user) => assignmentDraft.includes(user.id)),
    [assignmentDraft, fieldUsers]
  );
  const initialAssignmentIds = useMemo(
    () =>
      selectedProgramProject
        ? [...selectedProgramProject.assignments.map((assignment) => assignment.user.id)].sort()
        : [],
    [selectedProgramProject]
  );
  const hasAssignmentChanges = useMemo(() => {
    const current = [...assignmentDraft].sort();
    if (current.length !== initialAssignmentIds.length) {
      return true;
    }
    return current.some((value, index) => value !== initialAssignmentIds[index]);
  }, [assignmentDraft, initialAssignmentIds]);
  const hasEntryDraft = Boolean(entryNote.trim() || entryFiles.length);
  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLocaleLowerCase("tr-TR");
    if (!query) {
      return projects;
    }
    return projects.filter((project) =>
      [
        project.name,
        project.code ?? "",
        project.customer?.name ?? "",
        project.locationLabel ?? ""
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(query)
    );
  }, [projectSearch, projects]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const controller = new AbortController();
    void refreshLookups(token, controller.signal).catch((error) => {
      if (!isAbortError(error)) {
        setModuleMessage(
          error instanceof Error ? error.message : "Program lookup verisi yuklenemedi."
        );
      }
    });
    return () => controller.abort();
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const controller = new AbortController();
    void refreshWindowMonths(token, windowMonths, controller.signal).catch((error) => {
      if (!isAbortError(error)) {
        setModuleMessage(
          error instanceof Error ? error.message : "Takvim ozetleri yuklenemedi."
        );
      }
    });
    return () => controller.abort();
  }, [token, windowMonthKey]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void refreshDay(token, selectedDate, controller.signal)
      .catch((error) => {
        if (!isAbortError(error)) {
          setModuleMessage(error instanceof Error ? error.message : "Gunluk program yuklenemedi.");
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
    const current = dayButtonRefs.current[selectedDate];
    if (!current) {
      return;
    }
    current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [selectedDate]);

  useEffect(() => {
    if (!projects.length) {
      setSelectedProjectId("");
      return;
    }

    setSelectedProjectId((current) => {
      if (current && projects.some((project) => project.id === current)) {
        return current;
      }
      const firstProgramProject = program?.programProjects[0]?.project.id;
      if (firstProgramProject) {
        return firstProgramProject;
      }
      return projects[0].id;
    });
  }, [program, projects]);

  useEffect(() => {
    if (!selectedProgramProject) {
      setAssignmentDraft([]);
      return;
    }
    setAssignmentDraft(selectedProgramProject.assignments.map((assignment) => assignment.user.id));
  }, [selectedProgramProject]);

  useEffect(() => {
    setDrawerMessage(null);
  }, [selectedDate, selectedProjectId]);

  useEffect(() => {
    setEntryNote("");
    setEntryFiles([]);
    if (entryFileInputRef.current) {
      entryFileInputRef.current.value = "";
    }
  }, [programDrawerOpen, selectedDate, selectedProgramProject?.id]);

  useEffect(() => {
    if (!projectPickerOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!projectPickerRef.current?.contains(event.target as Node)) {
        setProjectPickerOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [projectPickerOpen]);

  useEffect(() => {
    if (!programDrawerOpen) {
      setProjectPickerOpen(false);
      setProjectSearch("");
    }
  }, [programDrawerOpen]);

  async function refreshWindowMonths(
    currentToken: string,
    monthValues: string[],
    signal?: AbortSignal
  ) {
    const all = await Promise.all(
      monthValues.map((month) =>
        apiFetch<DailyProgramMonthDaySummary[]>(
          `/daily-programs?month=${month}`,
          { signal },
          currentToken
        ).catch(() => [])
      )
    );

    const merged = new Map<string, DailyProgramMonthDaySummary>();
    for (const rows of all) {
      for (const row of rows) {
        merged.set(row.date, row);
      }
    }
    setMonthSummary([...merged.values()].sort((left, right) => left.date.localeCompare(right.date)));
  }

  async function refreshDay(currentToken: string, dateValue: string, signal?: AbortSignal) {
    try {
      const data = await apiFetch<DailyProgramDetail | null>(
        `/daily-programs/${dateValue}`,
        { signal },
        currentToken
      );
      setProgram(data);
    } catch {
      setProgram(null);
    }
  }

  async function refreshLookups(currentToken: string, signal?: AbortSignal) {
    const [projectData, userData] = await Promise.all([
      apiFetch<ProjectSummary[]>("/projects?status=active", { signal }, currentToken),
      apiFetch<ManagerUserSummary[]>("/users?role=FIELD&status=active", { signal }, currentToken)
    ]);
    setProjects(projectData);
    setFieldUsers(userData);
  }

  async function ensureProgram(currentToken: string) {
    if (program) {
      return program.id;
    }
    const created = await apiFetch<{ id: string }>(
      "/daily-programs",
      { method: "POST", body: JSON.stringify({ date: selectedDate }) },
      currentToken
    );
    await Promise.all([
      refreshDay(currentToken, selectedDate),
      refreshWindowMonths(currentToken, windowMonths)
    ]);
    return created.id;
  }

  function selectDate(dateValue: string) {
    setSelectedDate(dateValue);
    setProgramDrawerOpen(true);
  }

  function scrollTimeline(direction: -1 | 1) {
    const node = stripRef.current;
    if (!node) {
      return;
    }
    const amount = Math.max(280, Math.floor(node.clientWidth * 0.8));
    node.scrollBy({ left: direction * amount, behavior: "smooth" });
  }

  async function addSelectedProjectToDay() {
    if (!token || !selectedProjectId || selectedProgramProject) {
      return;
    }
    try {
      setSaving(true);
      const programId = await ensureProgram(token);
      await apiFetch<{ id: string }>(
        `/daily-programs/${programId}/projects`,
        { method: "POST", body: JSON.stringify({ projectId: selectedProjectId }) },
        token
      );
      await Promise.all([
        refreshDay(token, selectedDate),
        refreshWindowMonths(token, windowMonths)
      ]);
      setDrawerMessage("Proje secili gun programina eklendi.");
    } catch (error) {
      setDrawerMessage(error instanceof Error ? error.message : "Proje eklenemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSelectedProjectFromDay() {
    if (!token || !selectedProgramProject) {
      return;
    }
    try {
      setSaving(true);
      await apiFetch(`/program-projects/${selectedProgramProject.id}`, { method: "DELETE" }, token);
      await Promise.all([
        refreshDay(token, selectedDate),
        refreshWindowMonths(token, windowMonths)
      ]);
      setDrawerMessage("Proje secili gunden kaldirildi.");
    } catch (error) {
      setDrawerMessage(error instanceof Error ? error.message : "Proje kaldirilamadi.");
    } finally {
      setSaving(false);
    }
  }

  function toggleAssignment(userId: string) {
    setAssignmentDraft((current) =>
      current.includes(userId)
        ? current.filter((value) => value !== userId)
        : [...current, userId]
    );
  }

  async function saveAndCloseDrawer() {
    if (!token) {
      return;
    }
    try {
      setSaving(true);

      if (selectedProgramProject && hasAssignmentChanges) {
        await apiFetch(
          `/program-projects/${selectedProgramProject.id}/assignments`,
          { method: "POST", body: JSON.stringify({ userIds: assignmentDraft }) },
          token
        );
      }

      if (selectedProgramProject && hasEntryDraft) {
        const form = new FormData();
        if (entryNote.trim()) {
          form.append("note", entryNote.trim());
        }
        entryFiles.forEach((file) => form.append("files", file));
        await apiFetch(
          `/program-projects/${selectedProgramProject.id}/entries`,
          { method: "POST", body: form },
          token
        );
      }

      if (selectedProgramProject && (hasAssignmentChanges || hasEntryDraft)) {
        setModuleMessage("Gunluk program kaydedildi.");
      }

      await Promise.all([
        refreshDay(token, selectedDate),
        refreshWindowMonths(token, windowMonths)
      ]);

      setEntryNote("");
      setEntryFiles([]);
      if (entryFileInputRef.current) {
        entryFileInputRef.current.value = "";
      }
      setProgramDrawerOpen(false);
    } catch (error) {
      setDrawerMessage(error instanceof Error ? error.message : "Program kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  const selectedProjectSummary = projects.find((project) => project.id === selectedProjectId) ?? null;

  return (
    <>
      <div className="manager-module manager-stack-layout">
        <section className="manager-command-surface">
          <div className="manager-command-copy">
            <span className="manager-command-kicker">Gunluk Program</span>
            <h2 className="manager-block-title">Secili gun atamalari</h2>
            {!program?.programProjects.length ? (
              <div className="empty">Secili gunde atama yok.</div>
            ) : (
              <div className="program-day-summary-list">
                {program.programProjects.map((item) => (
                  <div className="program-day-summary-row" key={item.id}>
                    <div className="program-day-summary-main">
                      <strong>{item.project.name}</strong>
                      <span>
                        {item.assignments.length
                          ? item.assignments.map((assignment) => assignment.user.displayName).join(", ")
                          : "Henuz ekip atanmadi"}
                      </span>
                    </div>
                    <div className="program-day-summary-meta">
                      <span>{item.assignments.length} ekip</span>
                      <span>{item.dayEntries?.length ?? 0} not</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="manager-command-controls">
            <div className="manager-inline-actions">
              <button
                className="button ghost"
                onClick={() => setSelectedDate((current) => shiftDateString(current, -1))}
                type="button"
              >
                Onceki gun
              </button>
              <input
                className="input"
                onChange={(event) =>
                  setSelectedDate(normalizeDateForMonth(selectedDate, event.target.value))
                }
                type="month"
                value={selectedDate.slice(0, 7)}
              />
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
          </div>
        </section>

        {moduleMessage ? <div className="alert">{moduleMessage}</div> : null}

        <section className="manager-surface-card">
          <div className="manager-section-head compact">
            <div>
              <span className="manager-section-kicker">Takvim</span>
              <h3 className="manager-section-title">Saga sola kaydirilabilir tarih seridi</h3>
            </div>
            <div className="manager-inline-actions">
              <button className="button ghost" onClick={() => scrollTimeline(-1)} type="button">
                Sola kaydir
              </button>
              <button className="button ghost" onClick={() => scrollTimeline(1)} type="button">
                Saga kaydir
              </button>
              <span className="manager-mini-chip">
                {loading ? "Yukleniyor..." : `${windowDays.length} gun`}
              </span>
            </div>
          </div>

          <div className="program-timeline-shell" ref={stripRef}>
            <div className="program-timeline-strip">
              {windowDays.map((day) => {
                const summary = dayLookup.get(day);
                const active = day === selectedDate;
                return (
                  <button
                    className={`program-day-card ${active ? "active" : ""}`}
                    key={day}
                    onClick={() => selectDate(day)}
                    ref={(node) => {
                      dayButtonRefs.current[day] = node;
                    }}
                    type="button"
                  >
                    <div className="program-day-label">{formatDateLabel(day)}</div>
                    <strong>{day.slice(-2)}</strong>
                    <div className="program-day-meta">
                      <span>{summary?.projectCount ?? 0} proje</span>
                      <span>{summary?.userCount ?? 0} ekip</span>
                    </div>
                    {summary?.projectNames?.length ? (
                      <div className="program-day-list">
                        {summary.projectNames.slice(0, 3).map((name) => (
                          <span key={name}>{name}</span>
                        ))}
                      </div>
                    ) : (
                      <div className="program-day-list">
                        <span>Program yok</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <ManagerDrawer
        onClose={() => setProgramDrawerOpen(false)}
        open={programDrawerOpen}
        title={`${formatDisplayDate(selectedDate)} Programi`}
      >
        <div className="stack">
          {drawerMessage ? <div className="alert">{drawerMessage}</div> : null}

          <section className="stack">
            <div className="manager-section-head compact">
              <h3 className="manager-section-title">Proje Secimi</h3>
              <span className="manager-mini-chip">
                {selectedProgramProject ? "Duzenleme" : "Gune ekleme"}
              </span>
            </div>
            <div className="split two">
              <div className="manager-combobox program-project-picker" ref={projectPickerRef}>
                <button
                  aria-expanded={projectPickerOpen}
                  className="manager-combobox-trigger program-project-picker-trigger"
                  onClick={() => setProjectPickerOpen((current) => !current)}
                  type="button"
                >
                  <div className="program-project-picker-copy">
                    <strong>{selectedProjectSummary?.name ?? "Proje secin"}</strong>
                    <div className="tiny">
                      {selectedProjectSummary?.customer?.name ??
                        selectedProjectSummary?.locationLabel ??
                        "Arama ile proje bulun"}
                    </div>
                  </div>
                  <span className="tiny program-project-picker-state">
                    {projectPickerOpen ? "Kapat" : "Sec"}
                  </span>
                </button>
                {projectPickerOpen ? (
                  <div className="manager-combobox-panel program-project-picker-panel">
                    <input
                      autoFocus
                      className="input"
                      onChange={(event) => setProjectSearch(event.target.value)}
                      placeholder="Proje ara"
                      value={projectSearch}
                    />
                    <div className="customer-select-list">
                      {filteredProjects.length ? (
                        filteredProjects.map((project) => {
                          const active = project.id === selectedProjectId;
                          return (
                            <button
                              className={`customer-select-row program-project-picker-option ${
                                active ? "active" : ""
                              }`}
                              key={project.id}
                              onClick={() => {
                                setSelectedProjectId(project.id);
                                setProjectPickerOpen(false);
                                setProjectSearch("");
                              }}
                              type="button"
                            >
                              <div className="program-project-picker-copy">
                                <strong>{project.name}</strong>
                                <div className="tiny">
                                  {project.customer?.name ?? project.locationLabel ?? "Konum yok"}
                                </div>
                              </div>
                              <span className="tiny program-project-picker-state">
                                {active ? "Secili" : project.code ?? ""}
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <div className="empty">Aramaya uygun proje bulunamadi.</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
              {!selectedProgramProject ? (
                <button
                  className="button"
                  disabled={saving || !selectedProjectId}
                  onClick={() => void addSelectedProjectToDay()}
                  type="button"
                >
                  Gune Ekle
                </button>
              ) : (
                <button
                  className="button danger"
                  disabled={saving}
                  onClick={() => void removeSelectedProjectFromDay()}
                  type="button"
                >
                  Gunden Kaldir
                </button>
              )}
            </div>
            {selectedProjectSummary ? (
              <div className="manager-table-wrap">
                <table className="manager-table">
                  <tbody>
                    <tr>
                      <th>Proje</th>
                      <td>{selectedProjectSummary.name}</td>
                    </tr>
                    <tr>
                      <th>Konum</th>
                      <td>{selectedProjectSummary.locationLabel ?? "-"}</td>
                    </tr>
                    <tr>
                      <th>Durum</th>
                      <td>{selectedProgramProject ? "Bugune atanmis" : "Henuz atanmadi"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          {!selectedProgramProject ? (
            <div className="empty">
              Secili proje bu gun icin programda degil. Gune Ekle ile kayit olusturabilirsiniz.
            </div>
          ) : (
            <>
              <section className="stack">
                <div className="manager-section-head compact">
                  <h3 className="manager-section-title">Ekip Atama</h3>
                  <span className="manager-mini-chip">{assignmentDraft.length} secili</span>
                </div>
                <div className="program-selected-assignees">
                  {selectedAssignmentUsers.length ? (
                    selectedAssignmentUsers.map((user) => (
                      <span className="manager-mini-chip" key={user.id}>
                        {user.displayName}
                      </span>
                    ))
                  ) : (
                    <span className="tiny">Henuz ekip secilmedi.</span>
                  )}
                </div>
                <input
                  className="input"
                  onChange={(event) => setAssignmentSearch(event.target.value)}
                  placeholder="Saha personeli ara"
                  value={assignmentSearch}
                />
                <div className="program-assignment-grid">
                  {visibleFieldUsers.map((user) => {
                    const selected = assignmentDraft.includes(user.id);
                    return (
                      <button
                        aria-pressed={selected}
                        className={`assign-pill ${selected ? "active" : ""}`}
                        key={user.id}
                        onClick={() => toggleAssignment(user.id)}
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

              <section className="stack">
                <div className="manager-section-head compact">
                  <h3 className="manager-section-title">Notlar</h3>
                  <span className="manager-mini-chip">
                    {selectedProgramProject.dayEntries?.length ?? 0}
                  </span>
                </div>
                {!selectedProgramProject.dayEntries?.length ? (
                  <div className="empty">Secili proje icin kayit yok.</div>
                ) : (
                  <div className="manager-table-wrap">
                    <table className="manager-table">
                      <thead>
                        <tr>
                          <th>Tarih</th>
                          <th>Kullanici</th>
                          <th>Not</th>
                          <th>Dosya</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedProgramProject.dayEntries.map((entry) => (
                          <tr key={entry.id}>
                            <td>{formatDisplayDate(entry.createdAt)}</td>
                            <td>{entry.actor.displayName}</td>
                            <td>{entry.note?.trim() || "-"}</td>
                            <td>{entry.files.length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="stack">
                  <textarea
                    className="textarea"
                    onChange={(event) => setEntryNote(event.target.value)}
                    placeholder="Secili proje icin not yazin"
                    value={entryNote}
                  />
                  <input
                    className="input"
                    multiple
                    onChange={(event) => setEntryFiles(Array.from(event.target.files ?? []))}
                    ref={entryFileInputRef}
                    type="file"
                  />
                </div>
              </section>
            </>
          )}

          <div className="toolbar">
            <button className="button" disabled={saving} onClick={() => void saveAndCloseDrawer()} type="button">
              Kaydet ve Kapat
            </button>
          </div>
        </div>
      </ManagerDrawer>
    </>
  );
}
