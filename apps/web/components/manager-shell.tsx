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
  TimelineIcon,
  FileIcon,
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
    href: "/dashboard/templates",
    label: "Template'ler"
  },
  {
    href: "/dashboard/forms",
    label: "Saha Formlari"
  },
  {
    href: "/dashboard/form-responses",
    label: "Form Cevaplari"
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
  "/dashboard/templates": TimelineIcon,
  "/dashboard/forms": FileIcon,
  "/dashboard/form-responses": FileIcon,
  "/dashboard/tracking": MapIcon
} as const;

const routeCopy = {
  dashboard: {
    kicker: "Operasyon merkezi",
    description: "Saha durumu, raporlar ve bildirim ozetleri tek calisma yuzeyinde."
  },
  projects: {
    kicker: "Kayit yonetimi",
    description: "Proje klasorleri, konum bilgisi ve ana dosya akislarini birlikte yonetin."
  },
  users: {
    kicker: "Ekip dizini",
    description: "Hesaplari, rollerini ve kullanilabilirlik durumlarini kontrollu sekilde yonetin."
  },
  program: {
    kicker: "Gun plani",
    description: "Secili tarih icin proje secimini, ekip atamalarini ve not akislarini yonetin."
  },
  templates: {
    kicker: "Tekrarli planlar",
    description: "Program template'lerini, preview ve materialize akislarini tek panelden yonetin."
  },
  forms: {
    kicker: "Yapilandirilmis formlar",
    description: "Saha form template'lerini, versiyonlarini ve kullanim hazirligini yonetin."
  },
  "form-responses": {
    kicker: "Saha cevaplari",
    description: "Kaydedilen form cevaplarini proje, actor ve template bazinda inceleyin."
  },
  tracking: {
    kicker: "Canli takip",
    description: "Harita, saha hareketi ve bildirim kampanyalarini ayni panelde izleyin."
  }
} as const;

type ManagerShellProps = {
  title: string;
  children: React.ReactNode;
  kicker?: string;
  description?: string;
  contextItems?: string[];
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
  if (pathname.startsWith("/dashboard/templates")) {
    return "templates";
  }
  if (pathname.startsWith("/dashboard/forms")) {
    return "forms";
  }
  if (pathname.startsWith("/dashboard/form-responses")) {
    return "form-responses";
  }
  if (pathname.startsWith("/dashboard/tracking")) {
    return "tracking";
  }
  return "dashboard";
}

export function ManagerShell({
  title,
  children,
  kicker,
  description,
  contextItems
}: ManagerShellProps) {
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
        <div className="panel glass shell-loading-card">
          <div className="shell-loading-copy">
            <strong>Calisma alani hazirlaniyor</strong>
            <span>Oturum ve sayfa baglami yukleniyor.</span>
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
    `${navigation.find((item) => isActivePath(pathname, item.href))?.label ?? title}`,
    "Manager oturumu"
  ];

  const resolvedContextItems = contextItems?.length ? contextItems : defaultContextItems;

  return (
    <div className="app-shell manager-shell-v3" data-manager-theme={theme}>
      <div className="manager-shell-aura" aria-hidden="true" />
      <div className="manager-workbench">
        <aside className="manager-rail manager-rail-wide" aria-label="Yonetici gezinme">
          <div className="manager-rail-brand">
            <div className="manager-rail-mark">K</div>
            <div className="manager-rail-brandcopy">
              <strong>Kagu</strong>
              <span>Warm Ops Workspace</span>
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
                    <small>{active ? "Secili yuzey" : "Calisma alani"}</small>
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
              <div className="manager-page-heading">
                <div className="manager-page-kicker">{kicker ?? descriptor.kicker}</div>
                <h1 className="manager-page-title manager-page-title-compact">{title}</h1>
                <p className="manager-page-description">{description ?? descriptor.description}</p>
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
