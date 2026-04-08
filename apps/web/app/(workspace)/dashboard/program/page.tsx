import { ManagerProgramModule } from "../../../../components/manager-program-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerProgramPage() {
  return (
    <ManagerShell title="Gunluk Program">
      <ManagerProgramModule />
    </ManagerShell>
  );
}
