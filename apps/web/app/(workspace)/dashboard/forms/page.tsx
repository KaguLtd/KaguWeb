import { ManagerFieldFormsModule } from "../../../../components/manager-field-forms-module";
import { ManagerShell } from "../../../../components/manager-shell";

export default function ManagerFieldFormsPage() {
  return (
    <ManagerShell
      title="Saha Formları"
      kicker="Yapılandırılmış formlar"
      description="Form şablonlarını ve sürümlerini tek yüzeyde yönetin."
      contextItems={["Form şablonları", "Şema ve sürüm akışı"]}
    >
      <ManagerFieldFormsModule />
    </ManagerShell>
  );
}
