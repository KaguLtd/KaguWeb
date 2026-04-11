import { ManagerProgramTemplatesModule } from "../../../../components/manager-program-templates-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerProgramTemplatesPage() {
  return (
    <ManagerShell
      title="Tekrarlı İşler"
      kicker="Tekrarlı planlar"
      contextItems={["Tekrarlı iş kataloğu", "Önizleme akışı"]}
    >
      <ManagerProgramTemplatesModule />
    </ManagerShell>
  );
}
