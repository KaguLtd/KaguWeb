import { ManagerFieldFormsModule } from "../../../../components/manager-field-forms-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerFieldFormsPage() {
  return (
    <ManagerShell title="Saha Formlari">
      <ManagerFieldFormsModule />
    </ManagerShell>
  );
}
