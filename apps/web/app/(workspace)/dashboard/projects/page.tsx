import { ManagerProjectsModule } from "../../../../components/manager-projects-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerProjectsPage() {
  return (
    <ManagerShell title="Projeler">
      <ManagerProjectsModule />
    </ManagerShell>
  );
}
