export type ImobCanonicalLocationSource =
  | "user"
  | "scan"
  | "tenant_inventory"
  | "ibge_catalog";

export type ImobCanonicalLocation = {
  raw: string;
  normalizedKey: string;
  canonicalName: string;
  ibgeCode?: string;
  uf?: string;
  confidence: number;
  source: ImobCanonicalLocationSource;
  locked: boolean;
};

export function normalizeImobGeoText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function resolveCanonicalCityName(normalized: string, raw: string) {
  if (normalized.includes("balnepario camboriu") || normalized.includes("balneario camboriu") || /\bbc\b/.test(normalized)) {
    return "Balneário Camboriú";
  }
  if (normalized.includes("camboriu")) return "Camboriú";
  if (normalized.includes("itapema")) return "Itapema";
  if (normalized.includes("itajai")) return "Itajaí";
  if (normalized.includes("sao paulo")) return "São Paulo";
  if (normalized.includes("rio de janeiro")) return "Rio de Janeiro";
  return titleCaseWords(raw.trim());
}

function resolveUf(normalized: string) {
  if (
    normalized.includes("balnepario camboriu")
    || normalized.includes("balneario camboriu")
    || normalized.includes("camboriu")
    || normalized.includes("itapema")
    || normalized.includes("itajai")
  ) return "SC";
  if (normalized.includes("sao paulo")) return "SP";
  if (normalized.includes("rio de janeiro")) return "RJ";
  return undefined;
}

export function canonicalizeImobCity(
  raw: string | null | undefined,
  params?: {
    source?: ImobCanonicalLocationSource;
    locked?: boolean;
  },
): ImobCanonicalLocation | null {
  if (!raw || raw.trim().length === 0) return null;
  const normalizedKey = normalizeImobGeoText(raw);
  if (!normalizedKey) return null;
  return {
    raw: raw.trim(),
    normalizedKey,
    canonicalName: resolveCanonicalCityName(normalizedKey, raw),
    uf: resolveUf(normalizedKey),
    confidence: 0.95,
    source: params?.source ?? "user",
    locked: params?.locked ?? false,
  };
}

export function canonicalizeImobCityName(
  raw: string | null | undefined,
  params?: {
    source?: ImobCanonicalLocationSource;
    locked?: boolean;
  },
) {
  return canonicalizeImobCity(raw, params)?.canonicalName ?? null;
}
