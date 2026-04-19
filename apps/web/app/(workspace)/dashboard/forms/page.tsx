import { notFound } from "next/navigation";
import { ManagerFieldFormsModule } from "../../../../components/manager-field-forms-module";
import { ManagerShell } from "../../../../components/manager-shell";
import { dashboardFeatureFlags } from "../../../../lib/feature-flags";

export default function ManagerFieldFormsPage() {
  if (!dashboardFeatureFlags.fieldForms) {
    notFound();
  }

  return (
    <ManagerShell
      title="Saha Formlari"
      kicker="Yapilandirilmis formlar"
      description="Form sablonlarini ve surumlerini tek yuzeyde yonetin."
      contextItems={["Form sablonlari", "Sema ve surum akisi"]}
    >
      <ManagerFieldFormsModule />
    </ManagerShell>
  );
}
