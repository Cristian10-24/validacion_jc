import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Valida tus datos · Jóvenes creaTIvos",
  description: "Confirma tu nombre y correo para tu certificado de Jóvenes creaTIvos.",
  robots: { index: false, follow: false },
  icons: { icon: "/logo-jc.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F25C2A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
