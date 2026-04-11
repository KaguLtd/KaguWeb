import { ManagerShell } from "../../../../components/manager-shell";
import { ManagerUsersModule } from "../../../../components/manager-users-module";

export default function ManagerUsersPage() {
  return (
    <ManagerShell
      title="Kullanıcılar"
      kicker="Ekip dizini"
      description="Roller, cihaz bağlantıları ve hesap durumunu yönetin."
      contextItems={["Ekip listesi", "Rol ve oturum durumu"]}
    >
      <ManagerUsersModule />
    </ManagerShell>
  );
}
