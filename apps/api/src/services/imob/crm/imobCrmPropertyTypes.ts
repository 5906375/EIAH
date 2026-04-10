export type ImobCrmPropertyCategory = "residential" | "commercial";

export type ImobCrmPropertyType =
  | "apartamento"
  | "casa"
  | "sobrado"
  | "geminado"
  | "studio"
  | "kitnet"
  | "loft"
  | "cobertura"
  | "duplex"
  | "triplex"
  | "flat"
  | "casa_condominio"
  | "terreno_residencial"
  | "chacara"
  | "sitio"
  | "fazenda"
  | "imovel_rural"
  | "sala_comercial"
  | "conjunto_comercial"
  | "loja"
  | "ponto_comercial"
  | "galpao"
  | "deposito"
  | "armazem"
  | "predio_comercial"
  | "laje_corporativa"
  | "terreno_comercial"
  | "hotel"
  | "pousada"
  | "clinica"
  | "consultorio"
  | "restaurante"
  | "estacionamento"
  | "imovel_industrial";

export type ImobCrmPropertyTypeOption = {
  value: ImobCrmPropertyType;
  label: string;
  category: ImobCrmPropertyCategory;
  synonyms: string[];
};

export const IMOB_CRM_PROPERTY_TYPE_OPTIONS: ImobCrmPropertyTypeOption[] = [
  { value: "apartamento", label: "Apartamento", category: "residential", synonyms: ["apartamento", "apto", "ap"] },
  { value: "casa", label: "Casa", category: "residential", synonyms: ["casa", "residencia", "residência"] },
  { value: "casa_condominio", label: "Casa em condomínio", category: "residential", synonyms: ["casa em condominio", "casa em condomínio", "condominio fechado", "condomínio fechado"] },
  { value: "studio", label: "Studio", category: "residential", synonyms: ["studio", "estudio", "estúdio"] },
  { value: "kitnet", label: "Kitnet", category: "residential", synonyms: ["kitnet", "kitchenette", "quitinete"] },
  { value: "sobrado", label: "Sobrado", category: "residential", synonyms: ["sobrado"] },
  { value: "geminado", label: "Geminado", category: "residential", synonyms: ["geminado", "casa geminada"] },
  { value: "cobertura", label: "Cobertura", category: "residential", synonyms: ["cobertura", "penthouse"] },
  { value: "loft", label: "Loft", category: "residential", synonyms: ["loft"] },
  { value: "flat", label: "Flat", category: "residential", synonyms: ["flat", "apart-hotel", "aparthotel"] },
  { value: "duplex", label: "Duplex", category: "residential", synonyms: ["duplex"] },
  { value: "triplex", label: "Triplex", category: "residential", synonyms: ["triplex"] },
  { value: "terreno_residencial", label: "Terreno residencial", category: "residential", synonyms: ["terreno residencial", "lote residencial"] },
  {
    value: "imovel_rural",
    label: "Imóvel rural",
    category: "residential",
    synonyms: ["imovel rural", "imóvel rural", "area rural", "área rural"],
  },
  { value: "chacara", label: "Chácara", category: "residential", synonyms: ["chacara", "chácara"] },
  { value: "sitio", label: "Sítio", category: "residential", synonyms: ["sitio", "sítio"] },
  { value: "fazenda", label: "Fazenda", category: "residential", synonyms: ["fazenda"] },
  { value: "sala_comercial", label: "Sala comercial", category: "commercial", synonyms: ["sala comercial", "sala empresarial", "sala"] },
  { value: "loja", label: "Loja", category: "commercial", synonyms: ["loja"] },
  { value: "ponto_comercial", label: "Ponto comercial", category: "commercial", synonyms: ["ponto comercial"] },
  {
    value: "conjunto_comercial",
    label: "Conjunto comercial",
    category: "commercial",
    synonyms: ["conjunto comercial", "conjunto empresarial"],
  },
  { value: "galpao", label: "Galpão", category: "commercial", synonyms: ["galpao", "galpão", "barracao", "barracão"] },
  { value: "deposito", label: "Depósito", category: "commercial", synonyms: ["deposito", "depósito"] },
  { value: "armazem", label: "Armazém", category: "commercial", synonyms: ["armazem", "armazém", "warehouse"] },
  {
    value: "terreno_comercial",
    label: "Terreno comercial",
    category: "commercial",
    synonyms: ["terreno comercial", "lote comercial"],
  },
  {
    value: "predio_comercial",
    label: "Prédio comercial",
    category: "commercial",
    synonyms: ["predio comercial", "prédio comercial", "edificio comercial", "edifício comercial"],
  },
  { value: "laje_corporativa", label: "Laje corporativa", category: "commercial", synonyms: ["laje corporativa"] },
  { value: "consultorio", label: "Consultório", category: "commercial", synonyms: ["consultorio", "consultório"] },
  { value: "clinica", label: "Clínica", category: "commercial", synonyms: ["clinica", "clínica"] },
  { value: "restaurante", label: "Restaurante", category: "commercial", synonyms: ["restaurante"] },
  { value: "estacionamento", label: "Estacionamento", category: "commercial", synonyms: ["estacionamento", "garagem comercial"] },
  { value: "hotel", label: "Hotel", category: "commercial", synonyms: ["hotel"] },
  { value: "pousada", label: "Pousada", category: "commercial", synonyms: ["pousada"] },
  {
    value: "imovel_industrial",
    label: "Imóvel industrial",
    category: "commercial",
    synonyms: ["imovel industrial", "imóvel industrial", "industrial"],
  },
];

function normalizePropertyTypeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

const PROPERTY_TYPE_SYNONYM_MAP = new Map<string, ImobCrmPropertyType>();
for (const option of IMOB_CRM_PROPERTY_TYPE_OPTIONS) {
  PROPERTY_TYPE_SYNONYM_MAP.set(normalizePropertyTypeText(option.value), option.value);
  PROPERTY_TYPE_SYNONYM_MAP.set(normalizePropertyTypeText(option.label), option.value);
  for (const synonym of option.synonyms) {
    PROPERTY_TYPE_SYNONYM_MAP.set(normalizePropertyTypeText(synonym), option.value);
  }
}

const SORTED_PROPERTY_TYPE_SYNONYMS = Array.from(PROPERTY_TYPE_SYNONYM_MAP.entries()).sort(
  (left, right) => right[0].length - left[0].length
);

export function normalizeImobCrmPropertyType(raw: string | null | undefined): ImobCrmPropertyType | null {
  if (!raw) return null;
  const normalized = normalizePropertyTypeText(raw);
  if (!normalized) return null;
  return PROPERTY_TYPE_SYNONYM_MAP.get(normalized) ?? findImobCrmPropertyTypeInText(normalized);
}

export function findImobCrmPropertyTypeInText(raw: string | null | undefined): ImobCrmPropertyType | null {
  if (!raw) return null;
  const normalized = normalizePropertyTypeText(raw);
  if (!normalized) return null;
  for (const [synonym, value] of SORTED_PROPERTY_TYPE_SYNONYMS) {
    const pattern = new RegExp(`(^|[^a-z0-9])${synonym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    if (pattern.test(normalized)) {
      return value;
    }
  }
  return null;
}

export function getImobCrmPropertyTypeLabel(value: string | null | undefined) {
  const normalized = normalizeImobCrmPropertyType(value);
  if (!normalized) return value?.trim() ?? null;
  return IMOB_CRM_PROPERTY_TYPE_OPTIONS.find((option) => option.value === normalized)?.label ?? normalized;
}

export function getImobCrmPropertyTypeKeywordPattern() {
  return SORTED_PROPERTY_TYPE_SYNONYMS.map(([synonym]) => synonym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}
