import { ManagerProgramModule } from "../../../../components/manager-program-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerProgramPage() {
  return (
    <ManagerShell
      title="Gunluk Program"
      kicker="Gun plani"
      description="Takvim, proje atama ve ekip notlarini ayni program workspace'inde yonetin."
      contextItems={["Takvim seridi", "Ekip ve not akisi"]}
    >
      <ManagerProgramModule />
    </ManagerShell>
  );
}
