"use client";

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

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <strong>Coleta</strong>
          <span>Operação de campanha · módulo IE</span>
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
        <p style={{ marginTop: "auto", fontSize: "0.75rem", color: "var(--ink-soft)", padding: "0 0.4rem" }}>
          App isolado. Destino: Inteligência Eleitoral.
        </p>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
