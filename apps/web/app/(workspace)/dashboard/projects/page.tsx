import { ManagerProjectsModule } from "../../../../components/manager-projects-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerProjectsPage() {
  return (
    <ManagerShell
      title="Projeler"
      kicker="Kayıt yönetimi"
      description="Cari, konum ve dosya akışlarını birleştiren proje çalışma alanı."
      contextItems={["Proje klasörleri", "Cari ve konum bağı"]}
    >
      <ManagerProjectsModule />
    </ManagerShell>
  );
}
