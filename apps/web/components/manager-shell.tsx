"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { dashboardFeatureFlags } from "../lib/feature-flags";
import { useAuth } from "./auth-provider";
import {
  CalendarIcon,
  DashboardIcon,
  FileIcon,
  FolderIcon,
  LogoutIcon,
  MapIcon,
  TimelineIcon,
  UsersIcon
} from "./ui-icons";

type NavigationHref =
  | "/dashboard"
  | "/dashboard/projects"
  | "/dashboard/users"
  | "/dashboard/program"
  | "/dashboard/templates"
  | "/dashboard/forms"
  | "/dashboard/form-responses"
  | "/dashboard/jobs"
  | "/dashboard/tracking";

type NavigationItem = {
  href: NavigationHref;
  label: string;
  feature?: keyof typeof dashboardFeatureFlags;
};

const navigation: readonly NavigationItem[] = [
  { href: "/dashboard", label: "Genel Bakis" },
  { href: "/dashboard/projects", label: "Projeler" },
  { href: "/dashboard/users", label: "Kullanicilar" },
  { href: "/dashboard/program", label: "Gunluk Program" },
  { href: "/dashboard/templates", label: "Tekrarli Isler" },
  { href: "/dashboard/forms", label: "Saha Formlari", feature: "fieldForms" },
  { href: "/dashboard/form-responses", label: "Form Yanitlari", feature: "fieldForms" },
  { href: "/dashboard/jobs", label: "Is Gecmisi" },
  { href: "/dashboard/tracking", label: "Takip" }
] as const;

const iconByHref: Record<NavigationHref, typeof DashboardIcon> = {
  "/dashboard": DashboardIcon,
  "/dashboard/projects": FolderIcon,
  "/dashboard/users": UsersIcon,
  "/dashboard/program": CalendarIcon,
  "/dashboard/templates": TimelineIcon,
  "/dashboard/forms": FileIcon,
  "/dashboard/form-responses": FileIcon,
  "/dashboard/jobs": TimelineIcon,
  "/dashboard/tracking": MapIcon
};

const routeCopy = {
  dashboard: { kicker: "Operasyon merkezi" },
  projects: { kicker: "Kayit yonetimi" },
  users: { kicker: "Ekip dizini" },
  program: { kicker: "Gun plani" },
  templates: { kicker: "Tekrarli planlar" },
  forms: { kicker: "Yapilandirilmis formlar" },
  "form-responses": { kicker: "Saha yanitlari" },
  jobs: { kicker: "Arka plan isleri" },
  tracking: { kicker: "Canli takip" }
} as const;

type ManagerShellProps = {
  title: string;
  children: React.ReactNode;
  kicker?: string;
  description?: string;
  contextItems?: string[];
};

function isActivePath(pathname: string, href: NavigationHref) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

function resolveTheme(pathname: string) {
  if (pathname === "/dashboard") return "dashboard";
  if (pathname.startsWith("/dashboard/projects")) return "projects";
  if (pathname.startsWith("/dashboard/users")) return "users";
  if (pathname.startsWith("/dashboard/program")) return "program";
  if (pathname.startsWith("/dashboard/templates")) return "templates";
  if (pathname.startsWith("/dashboard/forms")) return "forms";
  if (pathname.startsWith("/dashboard/form-responses")) return "form-responses";
  if (pathname.startsWith("/dashboard/jobs")) return "jobs";
  if (pathname.startsWith("/dashboard/tracking")) return "tracking";
  return "dashboard";
}

export function ManagerShell({
  title,
  children,
  kicker,
  description: _description,
  contextItems
}: ManagerShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, ready, token, user } = useAuth();
  const scrollKey = `kagu.manager.scroll:${pathname}`;
  const visibleNavigation = navigation.filter(
    (item) => !item.feature || dashboardFeatureFlags[item.feature]
  );

  useEffect(() => {
    document.body.style.overflow = "";
  }, [pathname]);

  useEffect(() => {
    const restoreId = window.requestAnimationFrame(() => {
      const saved = window.sessionStorage.getItem(scrollKey);
      if (!saved) return;

      const next = Number(saved);
      if (Number.isFinite(next)) {
        window.scrollTo({ top: next, left: 0, behavior: "auto" });
      }
    });

    const saveScrollPosition = () => {
      window.sessionStorage.setItem(scrollKey, `${window.scrollY}`);
    };

    window.addEventListener("pagehide", saveScrollPosition);

    return () => {
      window.cancelAnimationFrame(restoreId);
      saveScrollPosition();
      window.removeEventListener("pagehide", saveScrollPosition);
    };
  }, [scrollKey]);

  useEffect(() => {
    if (ready && !user) {
      router.replace("/login");
      return;
    }

    if (ready && user?.role === "FIELD") {
      router.replace("/dashboard");
    }
  }, [ready, router, user]);

  if (!ready || !token || !user) {
    return (
      <div className="login-shell">
        <div className="panel glass shell-loading-card">
          <div className="shell-loading-copy">
            <strong>Calisma alani hazirlaniyor</strong>
            <span>Oturum baglami yukleniyor.</span>
          </div>
        </div>
      </div>
    );
  }

  const theme = resolveTheme(pathname);
  const descriptor = routeCopy[theme];
  const initials = user.displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const defaultContextItems = [
    `${visibleNavigation.find((item) => isActivePath(pathname, item.href))?.label ?? title}`,
    "Yonetim oturumu"
  ];

  const resolvedContextItems = contextItems?.length ? contextItems : defaultContextItems;

  return (
    <div className="app-shell manager-shell-v3" data-manager-theme={theme}>
      <div className="manager-shell-aura" aria-hidden="true" />
      <div className="manager-workbench">
        <aside className="manager-rail manager-rail-wide" aria-label="Yonetici gezinme">
          <div className="manager-rail-brand">
            <div className="manager-rail-mark manager-rail-mark-logo">
              <Image alt="Kagu" height={32} priority src="/icon.svg" width={32} />
            </div>
            <div className="manager-rail-brandcopy">
              <strong>Kagu</strong>
              <span>Ltd. operasyon merkezi</span>
            </div>
          </div>

          <nav className="manager-rail-nav">
            {visibleNavigation.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = iconByHref[item.href];

              return (
                <Link
                  key={item.href}
                  className={`manager-rail-link manager-rail-link-wide ${active ? "active" : ""}`}
                  href={item.href}
                  scroll={false}
                >
                  <span className="manager-rail-link-marker" aria-hidden="true" />
                  <span className="manager-rail-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="manager-rail-copy">
                    <strong>{item.label}</strong>
                    <small>{active ? "Secili ekran" : "Calisma alani"}</small>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="manager-rail-foot manager-rail-foot-wide">
            <div className="manager-rail-user">
              <div className="manager-rail-avatar">{initials || "K"}</div>
              <div className="manager-rail-usercopy">
                <strong>{user.displayName}</strong>
                <span>@{user.username}</span>
              </div>
            </div>
            <button
              aria-label="Oturumu kapat"
              className="manager-rail-link manager-rail-link-wide manager-rail-action"
              onClick={logout}
              type="button"
            >
              <span className="manager-rail-icon" aria-hidden="true">
                <LogoutIcon />
              </span>
              <span className="manager-rail-copy">
                <strong>Oturumu Kapat</strong>
                <small>Bu cihazdan cikis yap</small>
              </span>
            </button>
          </div>
        </aside>

        <div className="manager-canvas-shell manager-canvas-shell-compact">
          <header className="manager-topbar manager-topbar-compact">
            <div className="manager-topbar-copy">
              <div className="manager-topbar-brandlock">
                <div className="manager-topbar-brandmark">
                  <Image alt="Kagu" height={36} src="/icon.svg" width={36} />
                </div>
                <div className="manager-topbar-brandcopy">
                  <strong>Kagu Ltd.</strong>
                  <span>Yonetim calisma alani</span>
                </div>
              </div>
              <div className="manager-page-heading">
                <div className="manager-page-kicker">{kicker ?? descriptor.kicker}</div>
                <h1 className="manager-page-title manager-page-title-compact">{title}</h1>
              </div>
              <div className="manager-shell-context">
                {resolvedContextItems.map((item) => (
                  <span className="manager-shell-context-pill" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="manager-topbar-actions">
              <div className="manager-topbar-user manager-topbar-user-compact">
                <div className="manager-topbar-avatar">{initials || "K"}</div>
                <div className="manager-topbar-usercopy">
                  <strong>{user.displayName}</strong>
                  <span>@{user.username}</span>
                </div>
              </div>

              <button className="button ghost manager-mobile-logout" onClick={logout} type="button">
                <LogoutIcon />
                <span>Cikis</span>
              </button>
            </div>
          </header>

          <main className="manager-canvas">{children}</main>
        </div>
      </div>

      <nav className="manager-mobile-nav" aria-label="Yonetici mobil gezinme">
        {visibleNavigation.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = iconByHref[item.href];

          return (
            <Link
              key={`mobile-${item.href}`}
              className={`manager-mobile-link ${active ? "active" : ""}`}
              href={item.href}
              scroll={false}
            >
              <Icon />
              <span className="manager-mobile-link-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
