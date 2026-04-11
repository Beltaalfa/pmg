"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { IconChartLine, IconDatabase, IconMenu2, IconX } from "@tabler/icons-react";
import { comercialReportHref, isComercialGroupName } from "@/lib/pmg-comercial";
import styles from "./pmg-shell.module.css";
import { OverviewNavIcon, SetorNavIcon } from "./SetorNavIcon";

export type PmgShellSetor = { id: string; name: string };

type Props = {
  setores: PmgShellSetor[];
  children: React.ReactNode;
};

export function PmgShell({ setores, children }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className={styles.shell}>
      <button
        type="button"
        className={styles.menuBtn}
        aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
        onClick={() => setMobileOpen((o) => !o)}
      >
        {mobileOpen ? <IconX size={22} stroke={2} /> : <IconMenu2 size={22} stroke={2} />}
      </button>

      {mobileOpen && (
        <button type="button" className={styles.overlay} aria-label="Fechar menu" onClick={closeMobile} />
      )}

      <aside
        className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}
        aria-label="Navegação por setor"
      >
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>PMG</span>
        </div>
        <nav className={styles.navLabel}>Navegação</nav>
        <ul className={styles.navList}>
          <li className={styles.navItem}>
            <Link
              href="/"
              className={`${styles.navLink} ${pathname === "/" ? styles.navLinkActive : ""}`}
              onClick={closeMobile}
            >
              <OverviewNavIcon />
              Início
            </Link>
          </li>
          <li className={styles.navItem}>
            <Link
              href="/admin/cache-quantidade-margem"
              className={`${styles.navLink} ${pathname === "/admin/cache-quantidade-margem" ? styles.navLinkActive : ""}`}
              onClick={closeMobile}
            >
              <IconDatabase size={20} stroke={2} aria-hidden />
              Cache margem
            </Link>
          </li>
          {setores.map((s) => {
            const href = `/setor/${s.id}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            const comercial = isComercialGroupName(s.name);
            const margemHref = comercial ? comercialReportHref(s.id) : "";
            const margemActive =
              comercial &&
              (pathname === margemHref || pathname.startsWith(`${margemHref}/`));

            return (
              <li key={s.id} className={styles.navItem}>
                <Link
                  href={href}
                  className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                  onClick={closeMobile}
                >
                  <SetorNavIcon name={s.name} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                  </span>
                </Link>
                {comercial ? (
                  <ul className={styles.navSubList}>
                    <li className={styles.navSubItem}>
                      <Link
                        href={margemHref}
                        className={`${styles.navSubLink} ${margemActive ? styles.navSubLinkActive : ""}`}
                        onClick={closeMobile}
                      >
                        <IconChartLine size={18} stroke={2} />
                        <span>Análise de Margem e Venda</span>
                      </Link>
                    </li>
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </aside>

      <div className={styles.main}>
        <div className={styles.mainInner}>{children}</div>
      </div>
    </div>
  );
}
