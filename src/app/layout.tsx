import type { Metadata } from "next";
import { Fraunces, Sora } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Coleta Campanha",
  description: "Coleta estruturada de dados operacionais de campanha — módulo isolado para Inteligência Eleitoral",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${sora.variable} ${fraunces.variable} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
