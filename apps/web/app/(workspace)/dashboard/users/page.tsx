import { ManagerShell } from "../../../../components/manager-shell";
import { ManagerUsersModule } from "../../../../components/manager-users-module";

export default function ManagerUsersPage() {
  return (
    <ManagerShell
      title="Kullanicilar"
      kicker="Ekip dizini"
      description="Roller, cihaz baglantilari ve hesap durumu icin taranabilir roster yuzeyi."
      contextItems={["Ekip rosteri", "Rol ve oturum sinyali"]}
    >
      <ManagerUsersModule />
    </ManagerShell>
  );
}
