import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Finding, TesterConfig } from "./types.js";

async function load(repoRoot: string, relativePath: string) {
  return await readFile(path.join(repoRoot, relativePath), "utf8");
}

export async function runStaticAudit(config: TesterConfig): Promise<Finding[]> {
  const [
    dashboardController,
    mainTs,
    fieldWorkspace,
    programsService,
    filePolicy
  ] = await Promise.all([
    load(config.repoRoot, "apps/api/src/dashboard/dashboard.controller.ts"),
    load(config.repoRoot, "apps/api/src/main.ts"),
    load(config.repoRoot, "apps/web/components/field-workspace.tsx"),
    load(config.repoRoot, "apps/api/src/programs/programs.service.ts"),
    load(config.repoRoot, "apps/api/src/common/utils/file-policy.ts")
  ]);

  const findings: Finding[] = [];

  if (dashboardController.includes('attachment; filename="kagu-dashboard-')) {
    findings.push({
      id: "audit-monthly-report-gap",
      severity: "Medium",
      category: "urun eksigi",
      title: "Urun icinde aylik rapor ve PDF cikti yuzeyi yok",
      detail:
        "Mevcut dashboard export yalniz gunluk CSV uretimine odakli. Aylik, grafik destekli ve paylasilabilir rapor ihtiyaci urun icine alinmamis.",
      recommendation:
        "Dashboard tarafina aylik rapor API'si, PDF cikti ve yonetici ozet paketleri eklenmeli.",
      evidence: [
        "apps/api/src/dashboard/dashboard.controller.ts",
        "apps/api/src/dashboard/dashboard.service.ts"
      ]
    });
  }

  if (programsService.includes("managerNote: dto.managerNote?.trim() || null")) {
    findings.push({
      id: "audit-program-note-history",
      severity: "High",
      category: "urun eksigi",
      title: "Gunluk program notu degisiklikleri audit izine dusmuyor",
      detail:
        "Gunluk program notu patch ile guncelleniyor ancak ayri bir timeline veya degisiklik kaydi uretilmiyor. Bu durum yonetsel karar zincirini sonradan okumayi zorlastirir.",
      recommendation:
        "Program note guncellemeleri icin degisiklik gecmisi veya audit entry modeli eklenmeli.",
      evidence: ["apps/api/src/programs/programs.service.ts"]
    });
  }

  if (mainTs.includes('const localOrigins = new Set(["http://localhost:3000"')) {
    findings.push({
      id: "audit-secure-context-limit",
      severity: "Medium",
      category: "ortam kisiti",
      title: "HTTP uzerindeki mobil oturumlar push ve geolocation tarafinda kisitli",
      detail:
        "Yerel testte tarayici secure-context istemedigi icin push ve konum akislarinda beklenen platform limitleri ortaya cikiyor.",
      recommendation:
        "Gercek pilot ve acceptance ortamlari HTTPS veya paketli PWA uzerinden calistirilmali.",
      evidence: [
        "apps/api/src/main.ts",
        "apps/web/components/field-workspace.tsx"
      ]
    });
  }

  if (fieldWorkspace.includes("Bildirim icin uygulamayi HTTPS uzerinden")) {
    findings.push({
      id: "audit-ui-limit-copy",
      severity: "Low",
      category: "kullanim sorunu",
      title: "Platform kisiti mesajlari var ancak aksiyon yonlendirmesi sinirli",
      detail:
        "Kullaniciya HTTPS veya desteklenen PWA moduna gecmesi gerektigi soyleniyor fakat nasil gececegi konusunda net yonlendirme sunulmuyor.",
      recommendation:
        "Bildirim ve konum bloklari icine daha acik eylem metni veya yardim baglantisi eklenmeli.",
      evidence: ["apps/web/components/field-workspace.tsx"]
    });
  }

  if (filePolicy.includes('".exe"') && filePolicy.includes('".svg"')) {
    findings.push({
      id: "audit-file-policy-coverage",
      severity: "Low",
      category: "urun eksigi",
      title: "Dosya politikasi guvenlik odakli ama kullanici geri bildirimi teknik kaliyor",
      detail:
        "Engellenen uzanti listesi genis; yine de kullaniciya dost hata kategorileri veya yuklenebilir izinli dosya listesi urun icinde gorunur degil.",
      recommendation:
        "Yukleme alanlarinda izinli ve engelli dosya tipleri kullaniciya acik sekilde gosterilmeli.",
      evidence: [
        "apps/api/src/common/utils/file-policy.ts",
        "apps/web/components/field-workspace.tsx",
        "apps/web/components/manager-projects-module.tsx"
      ]
    });
  }

  return findings;
}
