import { ManagerShell } from "../../../../components/manager-shell";
import { ManagerUsersModule } from "../../../../components/manager-users-module";

export default function ManagerUsersPage() {
  return (
    <ManagerShell title="Kullanicilar">
      <ManagerUsersModule />
    </ManagerShell>
  );
}
