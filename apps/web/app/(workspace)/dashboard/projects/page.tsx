import { ManagerProjectsModule } from "../../../../components/manager-projects-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerProjectsPage() {
  return (
    <ManagerShell
      title="Projeler"
      kicker="Kayit yonetimi"
      description="Cari, konum ve dosya akislarini birlestiren proje workspace'i."
      contextItems={["Proje klasorleri", "Cari ve konum baglami"]}
    >
      <ManagerProjectsModule />
    </ManagerShell>
  );
}
