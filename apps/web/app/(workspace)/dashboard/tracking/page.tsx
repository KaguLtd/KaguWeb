import { ManagerShell } from "../../../../components/manager-shell";
import { ManagerTrackingModule } from "../../../../components/manager-tracking-module";

export default function ManagerTrackingPage() {
  return (
    <ManagerShell
      title="Takip"
      kicker="Canlı takip"
      description="Harita, saha hareketi ve bildirim akışlarını seçili tarih bağlamında izleyin."
      contextItems={["Harita bağı", "Bildirim akışı"]}
    >
      <ManagerTrackingModule />
    </ManagerShell>
  );
}
