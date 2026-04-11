import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "../components/auth-provider";
import { ServiceWorkerRegister } from "../components/service-worker-register";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./theme-overrides.css";
import "./theme-mobile.css";

const body = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  title: "Kagu Saha Takip",
  description: "Yönetici ve saha ekipleri için proje bazlı saha operasyon paneli.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kagu"
  }
};

export const viewport: Viewport = {
  themeColor: "#23313f"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" className={body.variable}>
      <body>
        <AuthProvider>
          <ServiceWorkerRegister />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
