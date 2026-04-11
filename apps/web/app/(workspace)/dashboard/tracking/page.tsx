import { ManagerShell } from "../../../../components/manager-shell";
import { ManagerTrackingModule } from "../../../../components/manager-tracking-module";

export default function ManagerTrackingPage() {
  return (
    <ManagerShell
      title="Takip"
      kicker="Canli takip"
      description="Harita, saha hareketi ve bildirim akislarini secili tarih baglaminda izleyin."
      contextItems={["Harita baglami", "Feed ve kampanya sinyali"]}
    >
      <ManagerTrackingModule />
    </ManagerShell>
  );
}
