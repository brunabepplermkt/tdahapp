import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { AppShell } from "@/components/shell/AppShell";
import { ServiceWorker } from "@/components/shell/ServiceWorker";
import "./globals.css";

/** Outfit (SIL OFL): títulos e números com a leveza editorial; o corpo segue a fonte do sistema (SF Pro no iPhone). */
const outfit = Outfit({ subsets: ["latin", "latin-ext"], weight: ["300", "400", "500"], variable: "--font-outfit", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Leve", template: "%s · Leve" },
  description: "Um lugar para tirar as coisas da cabeça e ver o que merece atenção agora.",
  applicationName: "Leve",
  appleWebApp: { capable: true, title: "Leve", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121211" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`h-full ${outfit.variable}`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
        <ServiceWorker />
      </body>
    </html>
  );
}
