import { notFound } from "next/navigation";
import { ManagerFieldFormResponsesModule } from "../../../../components/manager-field-form-responses-module";
import { ManagerShell } from "../../../../components/manager-shell";
import { dashboardFeatureFlags } from "../../../../lib/feature-flags";

export default function ManagerFieldFormResponsesPage() {
  if (!dashboardFeatureFlags.fieldForms) {
    notFound();
  }

  return (
    <ManagerShell
      title="Form Yanitlari"
      kicker="Saha yanitlari"
      description="Kaydedilen form yanitlarini inceleyin."
      contextItems={["Yanit katalogu", "Yuk ve proje bagi"]}
    >
      <ManagerFieldFormResponsesModule />
    </ManagerShell>
  );
}
