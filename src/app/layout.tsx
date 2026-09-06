import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export const dynamic = "force-dynamic";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Coleta · Inteligência Eleitoral",
  description: "Coleta estruturada de dados operacionais de campanha — Inteligência Eleitoral",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${montserrat.variable} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
