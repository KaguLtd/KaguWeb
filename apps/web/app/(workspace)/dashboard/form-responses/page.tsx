import { ManagerFieldFormResponsesModule } from "../../../../components/manager-field-form-responses-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerFieldFormResponsesPage() {
  return (
    <ManagerShell
      title="Form Cevaplari"
      kicker="Saha cevaplari"
      description="Template, proje ve personel baglaminda kaydedilen cevaplari inceleyin."
      contextItems={["Response katalogu", "Payload ve proje baglami"]}
    >
      <ManagerFieldFormResponsesModule />
    </ManagerShell>
  );
}
