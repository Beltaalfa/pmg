import { PmgShell } from "@/components/PmgShell";
import { getHubSetores, isHubDatabaseConfigured } from "@/lib/hub-setores";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  let setores: { id: string; name: string }[] = [];
  if (isHubDatabaseConfigured()) {
    try {
      const rows = await getHubSetores();
      setores = rows.map((s) => ({ id: s.id, name: s.name }));
    } catch {
      setores = [];
    }
  }

  return <PmgShell setores={setores}>{children}</PmgShell>;
}
