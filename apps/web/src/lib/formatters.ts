export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatPct(
  value: number | null | undefined,
  options?: {
    digits?: number;
    fallback?: string;
  }
): string {
  const digits = options?.digits ?? 1;
  const fallback = options?.fallback ?? "—";
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return `${value.toFixed(digits)}%`;
}
