import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kagu Saha Takip",
    short_name: "Kagu",
    description: "Saha ekipleri ve yoneticiler icin proje bazli operasyon paneli",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f3f6fb",
    theme_color: "#26425f",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml"
      }
    ]
  };
}
