import { ManagerJobsModule } from "../../../../components/manager-jobs-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerJobsPage() {
  return (
    <ManagerShell
      title="İş Geçmişi"
      kicker="Arka plan işleri"
      description="Yedekleme ve operasyon kayıtlarını izleyin."
      contextItems={["Çalışma sağlığı", "Yedek ve geri yükleme"]}
    >
      <ManagerJobsModule />
    </ManagerShell>
  );
}
