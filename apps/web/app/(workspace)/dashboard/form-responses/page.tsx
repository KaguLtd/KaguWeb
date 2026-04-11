import { ManagerFieldFormResponsesModule } from "../../../../components/manager-field-form-responses-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerFieldFormResponsesPage() {
  return (
    <ManagerShell
      title="Form Yanıtları"
      kicker="Saha yanıtları"
      description="Kaydedilen form yanıtlarını inceleyin."
      contextItems={["Yanıt kataloğu", "Yük ve proje bağı"]}
    >
      <ManagerFieldFormResponsesModule />
    </ManagerShell>
  );
}
