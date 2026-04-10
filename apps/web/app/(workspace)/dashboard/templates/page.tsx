import { ManagerProgramTemplatesModule } from "../../../../components/manager-program-templates-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerProgramTemplatesPage() {
  return (
    <ManagerShell title="Program Template'leri">
      <ManagerProgramTemplatesModule />
    </ManagerShell>
  );
}
