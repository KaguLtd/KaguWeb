import { ManagerProgramTemplatesModule } from "../../../../components/manager-program-templates-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerProgramTemplatesPage() {
  return (
    <ManagerShell
      title="Program Template'leri"
      kicker="Tekrarli planlar"
      description="Template, preview ve materialize akislarini tek yonetim workspace'inde izleyin."
      contextItems={["Template katalogu", "Preview ve materialize sinyali"]}
    >
      <ManagerProgramTemplatesModule />
    </ManagerShell>
  );
}
