import type { Persona } from "./types.js";

export const managerPersonas: Persona[] = [
  {
    username: "merve.kaya",
    displayName: "Merve Kaya",
    role: "MANAGER",
    device: "desktop",
    archetype: "duzenli koordinasyon yoneticisi",
    traits: ["detayci", "takipci", "dosya odakli"],
    summary: "Proje, dosya ve not akislarini duzenli ve kontrollu ilerletir."
  },
  {
    username: "deniz.arslan",
    displayName: "Deniz Arslan",
    role: "MANAGER",
    device: "mobile",
    archetype: "aceleci mobil yonetici",
    traits: ["hizli", "dalgin", "riskli hamle yapan"],
    summary: "Mobilde hizli is yaparken yanlis proje acma ve silme denemeleriyle guardrail testlerini zorlar."
  }
];

export const fieldPersonas: Persona[] = [
  {
    username: "emre",
    displayName: "Emre Aydin",
    role: "FIELD",
    device: "mobile",
    archetype: "cok hizli saha personeli",
    traits: ["erken baslar", "hizli tamamlar", "duzenli kapanis yapar"],
    summary: "Is basi ve gun sonu akisini duzenli kapatan, hizli ve verimli saha personelidir."
  },
  {
    username: "baris",
    displayName: "Baris Demir",
    role: "FIELD",
    device: "mobile",
    archetype: "sistemi zorlayan personel",
    traits: ["cift tiklar", "tekrar gonderir", "yetki zorlar"],
    summary: "Yetkisiz ve gecersiz isteklerle yazilimin hata toleransini test eder."
  },
  {
    username: "sibel",
    displayName: "Sibel Yilmaz",
    role: "FIELD",
    device: "mobile",
    archetype: "yavas ve sarkan personel",
    traits: ["gec baslar", "gecikir", "bazi gunler gun sonunu unutur"],
    summary: "Gecikmeli ve eksik kapanis akislariyla operasyonel sarkma senaryolarini uretir."
  },
  {
    username: "ayse",
    displayName: "Ayse Cakir",
    role: "FIELD",
    device: "mobile",
    archetype: "dokumantasyon odakli personel",
    traits: ["cok dosya yukler", "dosya indirir", "net not yazar"],
    summary: "Dosya inceleme, indirme ve zengin saha girdisi tarafini yogun kullanan personeldir."
  },
  {
    username: "hakan",
    displayName: "Hakan Kurt",
    role: "FIELD",
    device: "mobile",
    archetype: "gps gurultulu saha personeli",
    traits: ["rota disina cikar", "gecikmeli veri yollar", "konum gurultuludur"],
    summary: "Gurultulu GPS ve hareketli saha akislariyla takip modulu dayanikliligini test eder."
  }
];

export const allPersonas = [...managerPersonas, ...fieldPersonas];
