"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Início" },
  { href: "/sessoes", label: "Sessões" },
  { href: "/campanhas", label: "Campanhas" },
  { href: "/tipos", label: "Tipos de documento" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicJourney = pathname.startsWith("/r/");

  if (isPublicJourney) {
    return (
      <div className="shell shell-public">
        <main className="main main-public">{children}</main>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <Image
            src="/brand/logo-horizontal.png"
            alt="Inteligência Eleitoral"
            width={188}
            height={56}
            className="brand-logo"
            priority
          />
          <span>Coleta operacional de campanha</span>
        </div>
        <nav className="nav">
          {links.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} data-active={active}>
                {link.label}
              </Link>
            );
          })}
        </nav>
        <p className="rail-foot">Módulo Coleta · Inteligência Eleitoral</p>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
