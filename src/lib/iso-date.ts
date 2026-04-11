/** “Hoje” no calendário de `America/Sao_Paulo` — usar em janelas de sync (evita UTC vs BR). */
export function getTodayIsoBrasil(): string {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
    .slice(0, 10);
}

/** Data civil local → `YYYY-MM-DD` (não usar `toISOString()` — desloca o dia em fusos ≠ UTC). */
export function localIsoDateFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Valida YYYY-MM-DD (calendário gregoriano). */
export function isValidIsoDate(s: string): boolean {
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const [y, m, d] = t.split("-").map((x) => Number.parseInt(x, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

export function periodoValido(inicio: string, fim: string): boolean {
  if (!isValidIsoDate(inicio) || !isValidIsoDate(fim)) return false;
  return inicio <= fim;
}
