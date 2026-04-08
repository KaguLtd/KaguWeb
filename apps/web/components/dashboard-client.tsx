"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./auth-provider";
import { FieldWorkspace } from "./field-workspace";
import { ManagerOverviewModule } from "./manager-overview-module";
import { ManagerShell } from "./manager-shell";

export function DashboardClient() {
  const router = useRouter();
  const { logout, ready, token, user } = useAuth();

  useEffect(() => {
    if (ready && !user) {
      router.replace("/login");
      return;
    }

  }, [ready, router, user]);

  if (!ready || !token || !user) {
    return (
      <div className="login-shell">
        <div className="panel glass">Hazirlaniyor...</div>
      </div>
    );
  }

  if (user.role === "MANAGER") {
    return (
      <ManagerShell title="Operasyon Ozeti">
        <ManagerOverviewModule />
      </ManagerShell>
    );
  }

  return <FieldWorkspace onLogout={logout} token={token} user={user} />;
}
