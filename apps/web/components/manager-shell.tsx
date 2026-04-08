"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./auth-provider";
import {
  CalendarIcon,
  DashboardIcon,
  FolderIcon,
  LogoutIcon,
  MapIcon,
  UsersIcon
} from "./ui-icons";

const navigation = [
  {
    href: "/dashboard",
    label: "Dashboard"
  },
  {
    href: "/dashboard/projects",
    label: "Projeler"
  },
  {
    href: "/dashboard/users",
    label: "Kullanicilar"
  },
  {
    href: "/dashboard/program",
    label: "Gunluk Program"
  },
  {
    href: "/dashboard/tracking",
    label: "Takip"
  }
] as const;

const iconByHref = {
  "/dashboard": DashboardIcon,
  "/dashboard/projects": FolderIcon,
  "/dashboard/users": UsersIcon,
  "/dashboard/program": CalendarIcon,
  "/dashboard/tracking": MapIcon
} as const;

type ManagerShellProps = {
  title: string;
  children: React.ReactNode;
};

function isActivePath(pathname: string, href: (typeof navigation)[number]["href"]) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

function resolveTheme(pathname: string) {
  if (pathname === "/dashboard") {
    return "dashboard";
  }
  if (pathname.startsWith("/dashboard/projects")) {
    return "projects";
  }
  if (pathname.startsWith("/dashboard/users")) {
    return "users";
  }
  if (pathname.startsWith("/dashboard/program")) {
    return "program";
  }
  if (pathname.startsWith("/dashboard/tracking")) {
    return "tracking";
  }
  return "dashboard";
}

export function ManagerShell({ title, children }: ManagerShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, ready, token, user } = useAuth();
  const scrollKey = `kagu.manager.scroll:${pathname}`;

  useEffect(() => {
    document.body.style.overflow = "";
  }, [pathname]);

  useEffect(() => {
    const restoreId = window.requestAnimationFrame(() => {
      const saved = window.sessionStorage.getItem(scrollKey);
      if (!saved) {
        return;
      }

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
        <div className="panel glass">Hazirlaniyor...</div>
      </div>
    );
  }

  const theme = resolveTheme(pathname);
  const initials = user.displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="app-shell manager-shell-v3" data-manager-theme={theme}>
      <div className="manager-shell-aura" aria-hidden="true" />
      <div className="manager-workbench">
        <aside className="manager-rail manager-rail-wide" aria-label="Yonetici gezinme">
          <div className="manager-rail-brand">
            <div className="manager-rail-mark">K</div>
            <div className="manager-rail-brandcopy">
              <strong>Kagu</strong>
              <span>Manager Panel</span>
            </div>
          </div>

          <nav className="manager-rail-nav">
            {navigation.map((item) => {
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
              </span>
            </button>
          </div>
        </aside>

        <div className="manager-canvas-shell manager-canvas-shell-compact">
          <header className="manager-topbar manager-topbar-compact">
            <div className="manager-topbar-copy">
              <div className="manager-page-heading">
                <h1 className="manager-page-title manager-page-title-compact">{title}</h1>
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
        {navigation.map((item) => {
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
