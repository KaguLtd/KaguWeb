import { ManagerProgramModule } from "../../../../components/manager-program-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerProgramPage() {
  return (
    <ManagerShell
      title="Günlük Program"
      kicker="Gün planı"
      description="Takvim, proje atama ve ekip notlarını yönetin."
      contextItems={["Takvim şeridi", "Ekip ve not akışı"]}
    >
      <ManagerProgramModule />
    </ManagerShell>
  );
}
