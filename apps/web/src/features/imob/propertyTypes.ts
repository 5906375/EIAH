export type ImobPropertyType =
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

export type ImobPropertyTypeOption = {
  value: ImobPropertyType;
  label: string;
  category: "residential" | "commercial";
};

export const IMOB_PROPERTY_TYPE_OPTIONS: ImobPropertyTypeOption[] = [
  { value: "apartamento", label: "Apartamento", category: "residential" },
  { value: "casa", label: "Casa", category: "residential" },
  { value: "casa_condominio", label: "Casa em condomínio", category: "residential" },
  { value: "studio", label: "Studio", category: "residential" },
  { value: "kitnet", label: "Kitnet", category: "residential" },
  { value: "sobrado", label: "Sobrado", category: "residential" },
  { value: "geminado", label: "Geminado", category: "residential" },
  { value: "cobertura", label: "Cobertura", category: "residential" },
  { value: "loft", label: "Loft", category: "residential" },
  { value: "flat", label: "Flat", category: "residential" },
  { value: "duplex", label: "Duplex", category: "residential" },
  { value: "triplex", label: "Triplex", category: "residential" },
  { value: "terreno_residencial", label: "Terreno residencial", category: "residential" },
  { value: "imovel_rural", label: "Imóvel rural", category: "residential" },
  { value: "chacara", label: "Chácara", category: "residential" },
  { value: "sitio", label: "Sítio", category: "residential" },
  { value: "fazenda", label: "Fazenda", category: "residential" },
  { value: "sala_comercial", label: "Sala comercial", category: "commercial" },
  { value: "loja", label: "Loja", category: "commercial" },
  { value: "ponto_comercial", label: "Ponto comercial", category: "commercial" },
  { value: "conjunto_comercial", label: "Conjunto comercial", category: "commercial" },
  { value: "galpao", label: "Galpão", category: "commercial" },
  { value: "deposito", label: "Depósito", category: "commercial" },
  { value: "armazem", label: "Armazém", category: "commercial" },
  { value: "terreno_comercial", label: "Terreno comercial", category: "commercial" },
  { value: "predio_comercial", label: "Prédio comercial", category: "commercial" },
  { value: "laje_corporativa", label: "Laje corporativa", category: "commercial" },
  { value: "consultorio", label: "Consultório", category: "commercial" },
  { value: "clinica", label: "Clínica", category: "commercial" },
  { value: "restaurante", label: "Restaurante", category: "commercial" },
  { value: "estacionamento", label: "Estacionamento", category: "commercial" },
  { value: "hotel", label: "Hotel", category: "commercial" },
  { value: "pousada", label: "Pousada", category: "commercial" },
  { value: "imovel_industrial", label: "Imóvel industrial", category: "commercial" },
];

export function getImobPropertyTypeLabel(value: string | null | undefined) {
  if (!value) return null;
  return IMOB_PROPERTY_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
