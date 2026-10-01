import type { ImobPresentationForm, ImobPropertyUpdateRequest } from "@/lib/api";
import { IMOB_PROPERTY_TYPE_OPTIONS } from "@/features/imob/propertyTypes";
import { buildPropertyCreateRequest, findDuplicateProperty } from "./propertyCreateForm";

/**
 * Formulários "Editar imóvel" e "Arquivar imóvel" do chat IMOB, abertos por
 * ação explícita do menu. Editar usa `PATCH /imob/properties/:id`; arquivar
 * usa `DELETE /imob/properties/:id` (bloqueado se houver caso ligado).
 */

export const PROPERTY_EDIT_SUBMIT_TARGET = "imob.properties.update";

export function isPropertyEditForm(form: Pick<ImobPresentationForm, "submitTarget"> | null | undefined) {
  return form?.submitTarget === PROPERTY_EDIT_SUBMIT_TARGET;
}

const PROPERTY_GOAL_OPTIONS = [
  { value: "venda", label: "Venda" },
  { value: "locacao", label: "Locação" },
  { value: "aluguel_por_temporada", label: "Aluguel por temporada" },
];

const propertyPicker = {
  name: "propertyId",
  label: "Imóvel",
  type: "select" as const,
  required: true,
  placeholder: "Selecione o imóvel",
  value: "",
  optionsSource: "imob_properties" as const,
  options: [],
};

export function buildPropertyEditForm(mode: "edit" | "archive" = "edit"): ImobPresentationForm {
  if (mode === "archive") {
    return {
      entity: "imovel",
      action: "archive",
      submitTarget: PROPERTY_EDIT_SUBMIT_TARGET,
      label: "Arquivar imóvel",
      description: "O imóvel sai das listas; o histórico fica guardado. Imóvel com locação ou caso ligado não pode ser arquivado.",
      fields: [propertyPicker],
      actions: [
        { id: "cancel", label: "Cancelar", kind: "secondary" },
        { id: "archive", label: "Arquivar", kind: "primary" },
      ],
    };
  }
  return {
    entity: "imovel",
    action: "update",
    submitTarget: PROPERTY_EDIT_SUBMIT_TARGET,
    label: "Editar imóvel",
    description: "Escolha o imóvel; os dados atuais aparecem nos campos para você corrigir.",
    fields: [
      propertyPicker,
      {
        name: "propertyType",
        label: "Tipo",
        type: "select",
        required: true,
        value: "",
        options: IMOB_PROPERTY_TYPE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
          group: option.category === "residential" ? "Residencial" : "Comercial",
        })),
      },
      { name: "goal", label: "Finalidade", type: "select", required: true, value: "", options: PROPERTY_GOAL_OPTIONS },
      { name: "unitLabel", label: "Identificação da unidade", type: "text", placeholder: "Ex.: Kitnet 01", value: "" },
      {
        name: "ownerId",
        label: "Proprietário",
        type: "select",
        placeholder: "Sem proprietário vinculado",
        value: "",
        optionsSource: "imob_owners",
        options: [],
      },
      {
        name: "occupancy",
        label: "Situação",
        type: "select",
        placeholder: "Não informada",
        value: "",
        options: [
          { value: "locado", label: "Locado" },
          { value: "vago", label: "Vago" },
          { value: "em_obra", label: "Em obra / construção" },
        ],
      },
      { name: "cep", label: "CEP", type: "text", inputMode: "numeric", maxLength: 9, value: "" },
      { name: "city", label: "Cidade", type: "text", required: true, value: "" },
      { name: "neighborhood", label: "Bairro", type: "text", value: "" },
      { name: "address", label: "Endereço", type: "text", required: true, value: "" },
      { name: "areaM2", label: "Área (m²)", type: "text", inputMode: "numeric", maxLength: 6, value: "" },
      { name: "bedrooms", label: "Quartos", type: "text", inputMode: "numeric", maxLength: 2, value: "" },
      { name: "bathrooms", label: "Banheiros", type: "text", inputMode: "numeric", maxLength: 2, value: "" },
      { name: "garageSpots", label: "Vagas de garagem", type: "text", inputMode: "numeric", maxLength: 2, value: "" },
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "submit", label: "Salvar alterações", kind: "primary" },
    ],
  };
}

type PropertyRecord = {
  id: string;
  status?: string | null;
  ownerId?: string | null;
  propertyType?: string | null;
  goal?: string | null;
  address?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  areaM2?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  garageSpots?: number | null;
  metadata?: unknown;
};

const asRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const numberText = (value: number | null | undefined) => (typeof value === "number" ? String(value) : "");

/** Valores atuais do imóvel para preencher o formulário. */
export function propertyToEditValues(property: PropertyRecord): Record<string, string> {
  const metadata = asRecord(property.metadata);
  const occupancy = asRecord(metadata.occupancy).value;
  return {
    propertyId: property.id,
    propertyType: property.propertyType ?? "",
    goal: property.goal ?? "",
    unitLabel: typeof metadata.externalPropertyRef === "string" ? metadata.externalPropertyRef : "",
    ownerId: property.ownerId ?? "",
    occupancy: typeof occupancy === "string" ? occupancy : "",
    cep: typeof metadata.cep === "string" ? metadata.cep : "",
    city: property.city ?? "",
    neighborhood: property.neighborhood ?? "",
    address: property.address ?? "",
    areaM2: numberText(property.areaM2),
    bedrooms: numberText(property.bedrooms),
    bathrooms: numberText(property.bathrooms),
    garageSpots: numberText(property.garageSpots),
  };
}

export type PropertyEditFormResult =
  | { ok: true; propertyId: string; request: ImobPropertyUpdateRequest }
  | { ok: false; errors: Record<string, string> };

export function buildPropertyUpdateRequest(values: Record<string, string>, properties: PropertyRecord[]): PropertyEditFormResult {
  const propertyId = (values.propertyId ?? "").trim();
  if (!propertyId) return { ok: false, errors: { propertyId: "Selecione o imóvel." } };
  const current = properties.find((item) => item.id === propertyId);
  if (!current) return { ok: false, errors: { propertyId: "Imóvel não encontrado. Atualize a lista e tente de novo." } };

  const built = buildPropertyCreateRequest(values);
  if (!built.ok) return built;
  const duplicate = findDuplicateProperty(built.request, properties.filter((item) => item.id !== propertyId));
  if (duplicate) {
    return { ok: false, errors: { address: "Já existe outro imóvel com este endereço e esta identificação de unidade." } };
  }

  // O PATCH substitui a metadata inteira: parte da existente e troca só o que o formulário edita.
  const { source: _source, ...edited } = built.request.metadata as Record<string, unknown>;
  const metadata: Record<string, unknown> = { ...asRecord(current.metadata), ...edited };
  if (!("externalPropertyRef" in edited)) delete metadata.externalPropertyRef;
  if (!("cep" in edited)) delete metadata.cep;

  const unset = (field: "areaM2" | "bedrooms" | "bathrooms" | "garageSpots") =>
    (values[field] ?? "").trim() === "" ? null : built.request[field];
  return {
    ok: true,
    propertyId,
    request: {
      ownerId: built.request.ownerId ?? null,
      propertyType: built.request.propertyType,
      goal: built.request.goal,
      address: built.request.address,
      city: built.request.city,
      neighborhood: built.request.neighborhood,
      areaM2: unset("areaM2"),
      bedrooms: unset("bedrooms"),
      bathrooms: unset("bathrooms"),
      garageSpots: unset("garageSpots"),
      metadata,
    },
  };
}
