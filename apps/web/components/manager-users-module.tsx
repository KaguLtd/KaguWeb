"use client";

import { ManagerUserSummary, UserRole } from "@kagu/contracts";
import { FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { formatDisplayDate } from "../lib/date";
import { AlertMessage } from "./alert-message";
import { useAuth } from "./auth-provider";
import { ManagerQuickAccessChip, QuickAccessRecord } from "./manager-quick-access";
import { ManagerDrawer, ManagerDrawerSection } from "./manager-ui";
import { DeviceIcon, KeyIcon, PowerIcon, UsersIcon } from "./ui-icons";

type UserFormState = {
  displayName: string;
  username: string;
  password: string;
  role: UserRole;
};

type UserEditState = {
  displayName: string;
  username: string;
  password: string;
  role: UserRole;
  isActive: boolean;
};

const emptyUserForm: UserFormState = {
  displayName: "",
  username: "",
  password: "",
  role: "FIELD"
};

const emptyUserEdit: UserEditState = {
  displayName: "",
  username: "",
  password: "",
  role: "FIELD",
  isActive: true
};

function roleLabel(role: UserRole) {
  return role === "FIELD" ? "Saha" : "Yonetici";
}

function buildUserRecord(user: ManagerUserSummary): QuickAccessRecord {
  return {
    id: user.id,
    title: user.displayName,
    subtitle: `@${user.username}`,
    description: `${roleLabel(user.role)} / ${user.isActive ? "Aktif" : "Pasif"}`,
    meta: [
      `${user.assignmentCount ?? 0} atama`,
      `${user.openSessionCount ?? 0} oturum`,
      `${user.subscriptionCount ?? 0} cihaz`
    ]
  };
}

export function ManagerUsersModule() {
  const { token } = useAuth();
  const [users, setUsers] = useState<ManagerUserSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [roleFilter, setRoleFilter] = useState<"" | UserRole>("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [createDraft, setCreateDraft] = useState<UserFormState>(emptyUserForm);
  const [editDraft, setEditDraft] = useState<UserEditState>(emptyUserEdit);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [detailMessage, setDetailMessage] = useState<string | null>(null);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingDetail, setSavingDetail] = useState(false);
  const [removingUser, setRemovingUser] = useState(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users]
  );
  const totalActive = users.filter((user) => user.isActive).length;
  const totalField = users.filter((user) => user.role === "FIELD").length;
  const totalManagers = users.filter((user) => user.role === "MANAGER").length;
  const totalDevices = users.reduce((sum, user) => sum + (user.subscriptionCount ?? 0), 0);
  const previewUser = selectedUser ?? users.find((user) => user.id === selectedUserId) ?? users[0] ?? null;
  const activeUserRecords = useMemo(
    () => users.filter((user) => user.isActive).map(buildUserRecord),
    [users]
  );
  const fieldUserRecords = useMemo(
    () => users.filter((user) => user.role === "FIELD").map(buildUserRecord),
    [users]
  );
  const managerUserRecords = useMemo(
    () => users.filter((user) => user.role === "MANAGER").map(buildUserRecord),
    [users]
  );
  const deviceRecords = useMemo(
    () =>
      users
        .filter((user) => (user.subscriptionCount ?? 0) > 0)
        .map((user) => ({
          ...buildUserRecord(user),
          description: `${user.subscriptionCount ?? 0} cihaz baglantisi`,
          meta: [`${user.subscriptionCount ?? 0} cihaz`, `${user.openSessionCount ?? 0} oturum`]
        })),
    [users]
  );
  const userSignalCards = [
    {
      label: "Aktif hesap",
      value: `${totalActive}`,
      detail: "Sistemde calisabilir durumda olan hesaplar",
      icon: PowerIcon
    },
    {
      label: "Saha rolu",
      value: `${totalField}`,
      detail: "Mobil operasyon icin ayrilmis personel",
      icon: UsersIcon
    },
    {
      label: "Cihaz kaydi",
      value: `${totalDevices}`,
      detail: "Push ve cihaz baglanti toplami",
      icon: DeviceIcon
    }
  ];

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    void refreshUsers(token)
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Kullanici listesi yuklenemedi.");
      })
      .finally(() => setLoading(false));
  }, [deferredQuery, roleFilter, statusFilter, token]);

  useEffect(() => {
    if (!selectedUser) {
      setEditDraft(emptyUserEdit);
      return;
    }
    setEditDraft({
      displayName: selectedUser.displayName,
      username: selectedUser.username,
      password: "",
      role: selectedUser.role,
      isActive: selectedUser.isActive
    });
  }, [selectedUser]);

  useEffect(() => {
    if (!createDrawerOpen) {
      setCreateMessage(null);
    }
  }, [createDrawerOpen]);

  useEffect(() => {
    if (!detailDrawerOpen) {
      setDetailMessage(null);
    }
  }, [detailDrawerOpen]);

  useEffect(() => {
    if (!users.length) {
      setSelectedUserId(null);
      return;
    }
    setSelectedUserId((current) =>
      current && users.some((user) => user.id === current) ? current : users[0].id
    );
  }, [users]);

  async function refreshUsers(currentToken: string) {
    const params = new URLSearchParams();
    params.set("status", statusFilter);
    if (roleFilter) {
      params.set("role", roleFilter);
    }
    if (deferredQuery.trim()) {
      params.set("query", deferredQuery.trim());
    }
    const data = await apiFetch<ManagerUserSummary[]>(`/users?${params.toString()}`, {}, currentToken);
    setUsers(data);
  }

  function openUserDetail(userId: string) {
    setSelectedUserId(userId);
    setDetailDrawerOpen(true);
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setCreateMessage("Oturum bulunamadi.");
      return;
    }
    if (createDraft.password.trim().length < 6) {
      setCreateMessage("Sifre en az 6 karakter olmalidir.");
      return;
    }
    try {
      setSavingCreate(true);
      setCreateMessage(null);
      await apiFetch<ManagerUserSummary>(
        "/users",
        {
          method: "POST",
          body: JSON.stringify({
            displayName: createDraft.displayName.trim(),
            username: createDraft.username.trim(),
            password: createDraft.password,
            role: createDraft.role
          })
        },
        token
      );
      setCreateDraft(emptyUserForm);
      setCreateDrawerOpen(false);
      setMessage("Yeni kullanici olusturuldu.");
      await refreshUsers(token);
    } catch (error) {
      setCreateMessage(error instanceof Error ? error.message : "Kullanici olusturulamadi.");
    } finally {
      setSavingCreate(false);
    }
  }

  async function handleUpdateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedUser) {
      setDetailMessage("Kullanici secimi bulunamadi.");
      return;
    }
    try {
      setSavingDetail(true);
      setDetailMessage(null);
      const updated = await apiFetch<ManagerUserSummary>(
        `/users/${selectedUser.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            displayName: editDraft.displayName,
            username: editDraft.username,
            password: editDraft.password || undefined,
            role: editDraft.role,
            isActive: editDraft.isActive
          })
        },
        token
      );
      setMessage("Kullanici bilgileri guncellendi.");
      await refreshUsers(token);
      setSelectedUserId(updated.id);
      setDetailDrawerOpen(false);
    } catch (error) {
      setDetailMessage(error instanceof Error ? error.message : "Kullanici guncellenemedi.");
    } finally {
      setSavingDetail(false);
    }
  }

  async function toggleUserActive() {
    if (!token || !selectedUser) {
      setDetailMessage("Kullanici secimi bulunamadi.");
      return;
    }
    try {
      setSavingDetail(true);
      setDetailMessage(null);
      await apiFetch<ManagerUserSummary>(
        `/users/${selectedUser.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ isActive: !selectedUser.isActive })
        },
        token
      );
      setMessage(selectedUser.isActive ? "Kullanici pasife alindi." : "Kullanici aktif edildi.");
      await refreshUsers(token);
    } catch (error) {
      setDetailMessage(error instanceof Error ? error.message : "Durum guncellenemedi.");
    } finally {
      setSavingDetail(false);
    }
  }

  async function deleteUser() {
    if (!token || !selectedUser) {
      setDetailMessage("Kullanici secimi bulunamadi.");
      return;
    }
    if (!window.confirm(`${selectedUser.displayName} icin silme/pasifleme islemi uygulansin mi?`)) {
      return;
    }
    try {
      setRemovingUser(true);
      setDetailMessage(null);
      const result = await apiFetch<{ mode: "deleted" | "deactivated" }>(
        `/users/${selectedUser.id}`,
        { method: "DELETE" },
        token
      );
      setMessage(
        result.mode === "deleted"
          ? "Kullanici silindi."
          : "Gecmis korumasi nedeniyle kullanici pasife alindi."
      );
      setDetailDrawerOpen(false);
      await refreshUsers(token);
    } catch (error) {
      setDetailMessage(error instanceof Error ? error.message : "Kullanici kaldirilamadi.");
    } finally {
      setRemovingUser(false);
    }
  }

  return (
    <>
      <div className="manager-module manager-stack-layout">
        <section className="manager-overview-hero">
          <div className="manager-command-surface manager-overview-poster">
            <div className="manager-command-copy">
              <span className="manager-command-kicker">Kullanicilar</span>
              <h2 className="manager-block-title">Rol, cihaz ve saha kapasitesini okunur bir ekip dizininde yonet</h2>
              <p className="manager-block-copy manager-block-copy-visible">
                Hesap durumu, aktif atama ve oturum sayilari artik taranabilir bir roster yapisinda.
              </p>
            </div>

            <div className="manager-overview-highlights">
              <div className="manager-inline-actions manager-inline-actions-wrap">
                <input
                  className="input"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ad veya kullanici ara"
                  value={query}
                />
                <select
                  className="select"
                  onChange={(event) => setRoleFilter((event.target.value as UserRole | "") || "")}
                  value={roleFilter}
                >
                  <option value="">Tum roller</option>
                  <option value="FIELD">Saha</option>
                  <option value="MANAGER">Yonetici</option>
                </select>
                <select
                  className="select"
                  onChange={(event) => setStatusFilter(event.target.value as "active" | "inactive" | "all")}
                  value={statusFilter}
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Pasif</option>
                  <option value="all">Tum hesaplar</option>
                </select>
              </div>

              <div className="manager-overview-spotlights">
                {userSignalCards.map((item) => {
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
                <span className="manager-section-kicker">Secili hesap</span>
                <h3 className="manager-section-title">Ekip ozeti</h3>
              </div>
              <span className="manager-mini-chip">{roleFilter || "Tum roller"}</span>
            </div>

            <div className="manager-overview-note">
              <strong>{previewUser?.displayName ?? "Kullanici secilmedi"}</strong>
              <p>{previewUser ? `@${previewUser.username}` : "Filtre sonucu hesap bulunmuyor."}</p>
              <p>{previewUser ? `${roleLabel(previewUser.role)} rolu ile listeleniyor.` : "Yeni bir hesap olusturabilirsiniz."}</p>
            </div>

            <div className="manager-overview-statuslist">
              <article className={`manager-overview-status ${previewUser?.isActive ? "manager-overview-status-ok" : "manager-overview-status-warn"}`}>
                <span className="manager-overview-status-icon" aria-hidden="true">
                  <PowerIcon />
                </span>
                <div>
                  <strong>Durum</strong>
                  <b>{previewUser?.isActive ? "Aktif" : "Pasif"}</b>
                  <p>{previewUser ? `${previewUser.assignmentCount ?? 0} aktif atama` : "Durum verisi yok"}</p>
                </div>
              </article>
              <article className="manager-overview-status">
                <span className="manager-overview-status-icon" aria-hidden="true">
                  <KeyIcon />
                </span>
                <div>
                  <strong>Oturum</strong>
                  <b>{previewUser?.openSessionCount ?? 0}</b>
                  <p>{previewUser ? `${previewUser.subscriptionCount ?? 0} cihaz kaydi` : "Oturum verisi yok"}</p>
                </div>
              </article>
            </div>

            <div className="manager-overview-actions">
              <button className="button" onClick={() => setCreateDrawerOpen(true)} type="button">
                Yeni Kullanici
              </button>
              <button
                className="button ghost"
                disabled={!previewUser}
                onClick={() => previewUser && openUserDetail(previewUser.id)}
                type="button"
              >
                Hesabi Ac
              </button>
            </div>
          </aside>
        </section>

        {message ? <AlertMessage message={message} /> : null}

        <section className="manager-stat-ribbon manager-stat-ribbon-compact manager-stat-ribbon-premium">
          <article className="manager-stat-card">
            <span>Toplam kayit</span>
            <strong>{loading ? "..." : users.length}</strong>
            <small>Mevcut filtre sonucu</small>
          </article>
          <article className="manager-stat-card">
            <span>Aktif hesap</span>
            <strong>
              <ManagerQuickAccessChip
                ariaLabel="Aktif hesaplari ac"
                payload={{
                  title: "Aktif hesaplar",
                  summary: "Su an aktif durumdaki hesaplar listeleniyor.",
                  records: activeUserRecords,
                  links: [{ href: "/dashboard/users", label: "Kullanicilar" }]
                }}
              >
                {loading ? "..." : totalActive}
              </ManagerQuickAccessChip>
            </strong>
            <small>Calisabilir kullanicilar</small>
          </article>
          <article className="manager-stat-card">
            <span>Saha</span>
            <strong>
              <ManagerQuickAccessChip
                ariaLabel="Saha kullanicilarini ac"
                payload={{
                  title: "Saha kullanicilari",
                  summary: "Mobil operasyon rolundeki hesaplar listeleniyor.",
                  records: fieldUserRecords,
                  links: [{ href: "/dashboard/users", label: "Kullanicilar" }]
                }}
              >
                {loading ? "..." : totalField}
              </ManagerQuickAccessChip>
            </strong>
            <small>Mobil saha rolunde</small>
          </article>
          <article className="manager-stat-card">
            <span>Yonetici</span>
            <strong>
              <ManagerQuickAccessChip
                ariaLabel="Yonetici hesaplarini ac"
                payload={{
                  title: "Yonetici hesaplari",
                  summary: "Panel operatoru rolundeki hesaplar listeleniyor.",
                  records: managerUserRecords,
                  links: [{ href: "/dashboard/users", label: "Kullanicilar" }]
                }}
              >
                {loading ? "..." : totalManagers}
              </ManagerQuickAccessChip>
            </strong>
            <small>Panel operatorleri</small>
          </article>
        </section>

        <section className="manager-panel-split">
          <section className="manager-surface-card">
            <div className="manager-section-head compact">
              <div>
                <span className="manager-section-kicker">Kullanici listesi</span>
                <h3 className="manager-section-title">Ekip rosteri</h3>
              </div>
              <ManagerQuickAccessChip
                ariaLabel="Filtrelenmis hesaplari ac"
                payload={{
                  title: "Filtrelenmis hesaplar",
                  summary: "Mevcut filtreye uyan tum hesaplar listeleniyor.",
                  records: users.map(buildUserRecord),
                  links: [{ href: "/dashboard/users", label: "Kullanicilar" }]
                }}
              >
                {loading ? "Yukleniyor..." : `${users.length} hesap`}
              </ManagerQuickAccessChip>
            </div>

            {!users.length ? (
              <div className="empty">Filtreye uygun kullanici bulunamadi.</div>
            ) : (
              <div className="manager-entity-list">
                {users.map((user) => (
                  <article
                    className={`manager-entity-row ${selectedUserId === user.id ? "is-selected" : ""}`}
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                  >
                    <div className="manager-entity-headline">
                      <div className="manager-table-primary">
                        <strong>{user.displayName}</strong>
                        <span>@{user.username}</span>
                      </div>
                      <div className="manager-directory-meta">
                        <span className={`manager-inline-badge ${user.isActive ? "is-positive" : "is-muted"}`}>
                          {user.isActive ? "Aktif" : "Pasif"}
                        </span>
                        <span className={`manager-inline-badge ${user.role === "FIELD" ? "is-info" : "is-warn"}`}>
                          {roleLabel(user.role)}
                        </span>
                      </div>
                    </div>

                    <div className="manager-entity-side">
                      <p className="muted">
                        {user.assignmentCount ?? 0} aktif atama / {user.openSessionCount ?? 0} acik oturum / {user.subscriptionCount ?? 0} cihaz
                      </p>
                      <div className="manager-directory-meta">
                        <ManagerQuickAccessChip
                          ariaLabel={`${user.displayName} atamalarini ve cihazlarini ac`}
                          payload={{
                            title: `${user.displayName} hesap ozeti`,
                            summary: "Secili kullanicinin atama, oturum ve cihaz baglantilari ozetleniyor.",
                            records: [buildUserRecord(user)],
                            links: [{ href: "/dashboard/users", label: "Kullanicilar" }]
                          }}
                        >
                          {`${user.assignmentCount ?? 0} atama`}
                        </ManagerQuickAccessChip>
                        <span className="manager-mini-chip">{formatDisplayDate(user.createdAt)}</span>
                      </div>
                    </div>

                    <div className="manager-entity-actions">
                      <button
                        className="button ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedUserId(user.id);
                        }}
                        type="button"
                      >
                        Sec
                      </button>
                      <button
                        className="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openUserDetail(user.id);
                        }}
                        type="button"
                      >
                        Hesabi Ac
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
                <span className="manager-section-kicker">Roster notu</span>
                <h3 className="manager-section-title">Hizli okuma paneli</h3>
              </div>
              <span className="manager-mini-chip">{previewUser ? roleLabel(previewUser.role) : "Kayit yok"}</span>
            </div>

            {!previewUser ? (
              <div className="empty">Secilecek bir ekip kaydi bulunmuyor.</div>
            ) : (
              <div className="manager-focus-stack">
                <div className="manager-focus-lead">
                  <strong>{previewUser.displayName}</strong>
                  <p className="muted">@{previewUser.username}</p>
                </div>

                <div className="manager-sheet-grid">
                  <div className="manager-sheet-card">
                    <span>Durum</span>
                    <strong>{previewUser.isActive ? "Aktif" : "Pasif"}</strong>
                  </div>
                  <div className="manager-sheet-card">
                    <span>Rol</span>
                    <strong>{roleLabel(previewUser.role)}</strong>
                  </div>
                  <div className="manager-sheet-card">
                    <span>Atama</span>
                    <strong>{previewUser.assignmentCount ?? 0}</strong>
                  </div>
                  <div className="manager-sheet-card">
                    <span>Oturum</span>
                    <strong>{previewUser.openSessionCount ?? 0}</strong>
                  </div>
                </div>

                <div className="manager-overview-note">
                  <strong>Kayit tarihi</strong>
                  <p>{formatDisplayDate(previewUser.createdAt)}</p>
                  <p>{previewUser.subscriptionCount ?? 0} cihaz baglantisi bu hesapla iliskili.</p>
                </div>

                <div className="manager-overview-actions">
                  <button className="button" onClick={() => openUserDetail(previewUser.id)} type="button">
                    Detay Cekmecesi
                  </button>
                  <button className="button ghost" onClick={() => setCreateDrawerOpen(true)} type="button">
                    Yeni Hesap
                  </button>
                </div>
              </div>
            )}
          </aside>
        </section>
      </div>

      <ManagerDrawer
        onClose={() => setCreateDrawerOpen(false)}
        open={createDrawerOpen}
        title="Yeni Kullanici"
        description="Yeni saha veya yonetici hesabi olusturun. Mevcut backend akisi ve zorunlu alanlar korunur."
      >
        <form className="stack" onSubmit={handleCreateUser}>
          {createMessage ? <AlertMessage message={createMessage} /> : null}

          <ManagerDrawerSection
            eyebrow="Kimlik"
            title="Temel kullanici bilgisi"
            description="Ad, rol ve giris bilgileri bu bolumden tanimlanir."
          >
            <div className="split two">
              <input
                className="input"
                onChange={(event) =>
                  setCreateDraft((current) => ({ ...current, displayName: event.target.value }))
                }
                placeholder="Ad soyad"
                required
                value={createDraft.displayName}
              />
              <input
                className="input"
                onChange={(event) =>
                  setCreateDraft((current) => ({ ...current, username: event.target.value }))
                }
                placeholder="Kullanici adi"
                required
                value={createDraft.username}
              />
            </div>
            <div className="split two">
              <select
                className="select"
                onChange={(event) =>
                  setCreateDraft((current) => ({ ...current, role: event.target.value as UserRole }))
                }
                value={createDraft.role}
              >
                <option value="FIELD">Saha</option>
                <option value="MANAGER">Yonetici</option>
              </select>
              <input
                className="input"
                onChange={(event) =>
                  setCreateDraft((current) => ({ ...current, password: event.target.value }))
                }
                placeholder="Sifre"
                required
                type="password"
                value={createDraft.password}
              />
            </div>
          </ManagerDrawerSection>

          <button className="button" disabled={savingCreate} type="submit">
            {savingCreate ? "Kaydediliyor..." : "Kullaniciyi Kaydet"}
          </button>
        </form>
      </ManagerDrawer>

      <ManagerDrawer
        onClose={() => setDetailDrawerOpen(false)}
        open={detailDrawerOpen && Boolean(selectedUser)}
        title={selectedUser?.displayName ?? "Kullanici"}
        description="Hesap bilgilerini guncelleyin, durumunu yonetin ve gerekli durumlarda kaldirma islemi uygulayin."
        badge={
          selectedUser ? (
            <span className={`manager-inline-badge ${selectedUser.isActive ? "is-positive" : "is-muted"}`}>
              {selectedUser.isActive ? "Aktif hesap" : "Pasif hesap"}
            </span>
          ) : null
        }
      >
        {selectedUser ? (
          <form className="stack" onSubmit={handleUpdateUser}>
            {detailMessage ? <AlertMessage message={detailMessage} /> : null}

            <ManagerDrawerSection
              eyebrow="Ozet"
              title="Hesap durumu"
              description="Bu blok sadece mevcut kaydi ozetler, form alanlarini degistirmez."
            >
              <div className="manager-sheet-grid">
                <div className="manager-sheet-card">
                  <span>Rol</span>
                  <strong>{roleLabel(selectedUser.role)}</strong>
                </div>
                <div className="manager-sheet-card">
                  <span>Durum</span>
                  <strong>{selectedUser.isActive ? "Aktif" : "Pasif"}</strong>
                </div>
                <div className="manager-sheet-card">
                  <span>Aktif atama</span>
                  <strong>{selectedUser.assignmentCount ?? 0}</strong>
                </div>
                <div className="manager-sheet-card">
                  <span>Acik oturum</span>
                  <strong>{selectedUser.openSessionCount ?? 0}</strong>
                </div>
              </div>
            </ManagerDrawerSection>

            <ManagerDrawerSection
              eyebrow="Duzenle"
              title="Kullanici bilgileri"
              description="Backend form alanlari korunur; yalnizca sunum bloklari yeniden duzenlenir."
            >
              <input
                className="input"
                onChange={(event) =>
                  setEditDraft((current) => ({ ...current, displayName: event.target.value }))
                }
                value={editDraft.displayName}
              />
              <div className="split two">
                <select
                  className="select"
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, role: event.target.value as UserRole }))
                  }
                  value={editDraft.role}
                >
                  <option value="FIELD">Saha</option>
                  <option value="MANAGER">Yonetici</option>
                </select>
                <input
                  className="input"
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, username: event.target.value }))
                  }
                  value={editDraft.username}
                />
              </div>
              <input
                className="input"
                onChange={(event) =>
                  setEditDraft((current) => ({ ...current, password: event.target.value }))
                }
                placeholder="Sifre degistirmek icin yeni sifre"
                type="password"
                value={editDraft.password}
              />
              <label className="toggle-row">
                <span>Hesap aktif</span>
                <input
                  checked={editDraft.isActive}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, isActive: event.target.checked }))
                  }
                  type="checkbox"
                />
              </label>
            </ManagerDrawerSection>

            <ManagerDrawerSection
              eyebrow="Aksiyonlar"
              title="Durum degisikligi"
              description="Kaydet, aktif/pasif gecisi ve kaldirma akislari ayni backend davranisiyla devam eder."
            >
              <div className="toolbar">
                <button className="button" disabled={savingDetail || removingUser} type="submit">
                  {savingDetail ? "Kaydediliyor..." : "Kaydet"}
                </button>
                <button
                  className="button ghost"
                  disabled={savingDetail || removingUser}
                  onClick={toggleUserActive}
                  type="button"
                >
                  {selectedUser.isActive ? "Pasife Al" : "Aktif Et"}
                </button>
              </div>
            </ManagerDrawerSection>

            <ManagerDrawerSection
              eyebrow="Riskli islem"
              title="Hesabi kaldir"
              description="Silme uygun degilse mevcut backend davranisi geregi hesap pasife cekilir."
              tone="danger"
            >
              <div className="danger-zone">
                <div className="manager-risk-copy">
                  <strong>Sil / Kaldir</strong>
                  <p className="muted">Gecmis kayitlar korunurken hesap sistemden kaldirilir veya pasife cekilir.</p>
                </div>
                <button
                  className="button danger-minimal"
                  disabled={savingDetail || removingUser}
                  onClick={deleteUser}
                  type="button"
                >
                  {removingUser ? "Isleniyor..." : "Sil / Kaldir"}
                </button>
              </div>
            </ManagerDrawerSection>
          </form>
        ) : null}
      </ManagerDrawer>
    </>
  );
}
