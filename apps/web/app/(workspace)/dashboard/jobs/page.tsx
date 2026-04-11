import { ManagerJobsModule } from "../../../../components/manager-jobs-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerJobsPage() {
  return (
    <ManagerShell title="Is Gecmisi">
      <ManagerJobsModule />
    </ManagerShell>
  );
}
