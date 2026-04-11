import { ManagerJobsModule } from "../../../../components/manager-jobs-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerJobsPage() {
  return (
    <ManagerShell
      title="Is Gecmisi"
      kicker="Arka plan isleri"
      description="Backup, restore check ve operasyon execution kayitlarini izleyin."
      contextItems={["Execution sagligi", "Artifact ve restore akisi"]}
    >
      <ManagerJobsModule />
    </ManagerShell>
  );
}
