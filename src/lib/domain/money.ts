const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export function formatBRL(cents: number, compact = false): string {
  return (compact ? brlCompact : brl).format(cents / 100);
}

/** Aceita "120", "120,50", "1.200,00", "R$ 89,90", "1200.5" → centavos. */
export function parseBRL(input: string): number | null {
  const cleaned = input
    .replace(/r\$\s*/i, "")
    .replace(/\s/g, "")
    .trim();
  if (!cleaned) return null;
  let normalized = cleaned;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "");
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}
