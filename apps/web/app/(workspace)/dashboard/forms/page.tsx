import { ManagerFieldFormsModule } from "../../../../components/manager-field-forms-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerFieldFormsPage() {
  return (
    <ManagerShell
      title="Saha Formlari"
      kicker="Yapilandirilmis formlar"
      description="Template, schema ve versiyon akislarini tek operatör yuzeyinde yonetin."
      contextItems={["Form template'leri", "Schema ve versiyon akisi"]}
    >
      <ManagerFieldFormsModule />
    </ManagerShell>
  );
}
