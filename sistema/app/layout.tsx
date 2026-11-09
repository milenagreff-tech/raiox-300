import type { Metadata } from "next";
import { Archivo_Black, DM_Sans } from "next/font/google";
import "./globals.css";

const archivo = Archivo_Black({ weight: "400", subsets: ["latin"], variable: "--font-titulo" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-texto" });

export const metadata: Metadata = {
  title: "Raio-X de Conversão · Milena IA",
  description: "Análise de Instagram, link da bio e atendimento.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${archivo.variable} ${dmSans.variable}`}>{children}</body>
    </html>
  );
}
