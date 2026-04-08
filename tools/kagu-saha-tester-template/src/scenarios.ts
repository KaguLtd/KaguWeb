import type { ProjectBlueprint } from "./types.js";

export const projectBlueprints: ProjectBlueprint[] = [
  {
    code: "TST-001",
    name: "Atasehir Plaza VRF Servis",
    description: "Merkezi iklimlendirme bakim ve ariza takibi.",
    locationLabel: "Atasehir Finans Merkezi",
    latitude: 40.994,
    longitude: 29.127
  },
  {
    code: "TST-002",
    name: "Pendik Depo Yangin Hatti",
    description: "Depo mekanik hat kontrol ve saha dosya revizyonu.",
    locationLabel: "Pendik Organize Sanayi",
    latitude: 40.888,
    longitude: 29.236
  },
  {
    code: "TST-003",
    name: "Maslak Ofis Chiller Revizyonu",
    description: "Ofis chiller ekipmanlari revizyon takibi.",
    locationLabel: "Maslak 1453",
    latitude: 41.112,
    longitude: 29.017
  },
  {
    code: "TST-004",
    name: "Kartal Hastane Klima Zonlama",
    description: "Hastane kat bazli klima zon ve balans ayarlari.",
    locationLabel: "Kartal Dr. Lutfi Kirdar",
    latitude: 40.901,
    longitude: 29.174
  },
  {
    code: "TST-005",
    name: "Esenyurt Fabrika Basincli Hava",
    description: "Fabrika basincli hava hattinin gunluk takibi.",
    locationLabel: "Esenyurt Sanayi Sitesi",
    latitude: 41.028,
    longitude: 28.676
  },
  {
    code: "TST-006",
    name: "Beylikduzu Soguk Oda Bakim",
    description: "Soguk oda termal log ve saha not takibi.",
    locationLabel: "Beylikduzu Liman Yolu",
    latitude: 40.987,
    longitude: 28.646
  },
  {
    code: "TST-ANOM-01",
    name: "Yanlis Acilan Demo Proje",
    description: "Deniz tarafindan aceleyle acilip silinmeye calisilan anomali proje.",
    locationLabel: "Dummy Mobil Lokasyon",
    latitude: 41.045,
    longitude: 28.975,
    anomaly: true
  },
  {
    code: "TST-ANOM-02",
    name: "Korunan Gecmisli Proje",
    description: "Silme ve programdan cikarma guardrail testleri icin kullanilan anomali proje.",
    locationLabel: "Teknik Test Koridoru",
    latitude: 41.047,
    longitude: 28.981,
    anomaly: true
  }
];
