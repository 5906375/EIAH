import type { ImobPresentationForm, ImobPresentationFormFieldOption, ImobPropertyCreateRequest } from "@/lib/api";

/**
 * Formulário "Cadastrar imóvel" do chat IMOB, enviado de forma estruturada
 * direto para `POST /imob/properties`: não dispara execução de agente e os
 * campos não viram texto de conversa.
 */

export const PROPERTY_CREATE_SUBMIT_TARGET = "imob.properties.create";
export const PROPERTY_CREATE_SOURCE = "imob_chat_property_form_v1";

export function isPropertyCreateForm(form: Pick<ImobPresentationForm, "submitTarget"> | null | undefined) {
  return form?.submitTarget === PROPERTY_CREATE_SUBMIT_TARGET;
}

const clean = (value: string | undefined) => (value ?? "").trim();
const normalizeKey = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function parseCount(value: string | undefined, max: number) {
  const raw = clean(value);
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return Number.NaN;
  const parsed = Number(raw);
  return parsed <= max ? parsed : Number.NaN;
}

export type PropertyCreateFormResult =
  | { ok: true; request: ImobPropertyCreateRequest }
  | { ok: false; errors: Record<string, string> };

export function buildPropertyCreateRequest(values: Record<string, string>): PropertyCreateFormResult {
  const errors: Record<string, string> = {};
  const propertyType = clean(values.propertyType);
  if (!propertyType) errors.propertyType = "Selecione o tipo do imóvel.";
  const goal = clean(values.goal);
  if (!goal) errors.goal = "Selecione a finalidade.";
  const city = clean(values.city);
  if (!city) errors.city = "Informe a cidade.";
  const address = clean(values.address);
  if (!address) errors.address = "Informe o endereço.";
  else if (address.length < 5) errors.address = "Endereço muito curto.";

  const cep = clean(values.cep).replace(/\D/g, "");
  if (cep && cep.length !== 8) errors.cep = "CEP deve ter 8 dígitos.";

  const counts = {
    areaM2: parseCount(values.areaM2, 100000),
    bedrooms: parseCount(values.bedrooms, 50),
    bathrooms: parseCount(values.bathrooms, 50),
    garageSpots: parseCount(values.garageSpots, 100),
  };
  for (const [field, parsed] of Object.entries(counts)) {
    if (Number.isNaN(parsed)) errors[field] = "Use só números inteiros.";
  }

  const occupancy = clean(values.occupancy);
  if (occupancy && !["locado", "vago", "em_obra"].includes(occupancy)) errors.occupancy = "Situação inválida.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const unitLabel = clean(values.unitLabel);
  const ownerId = clean(values.ownerId);
  return {
    ok: true,
    request: {
      ...(ownerId ? { ownerId } : {}),
      propertyType,
      goal,
      city,
      address,
      neighborhood: clean(values.neighborhood) || null,
      ...(counts.areaM2 !== null ? { areaM2: counts.areaM2 } : {}),
      ...(counts.bedrooms !== null ? { bedrooms: counts.bedrooms } : {}),
      ...(counts.bathrooms !== null ? { bathrooms: counts.bathrooms } : {}),
      ...(counts.garageSpots !== null ? { garageSpots: counts.garageSpots } : {}),
      status: "ready",
      metadata: {
        source: PROPERTY_CREATE_SOURCE,
        ...(unitLabel ? { externalPropertyRef: unitLabel } : {}),
        ...(cep ? { cep } : {}),
        occupancy: occupancy
          ? { value: occupancy, origin: "informed_by_manager" }
          : { value: null, origin: "unknown" },
        underConstruction: occupancy === "em_obra",
      },
    },
  };
}

/** Mesmo endereço + cidade + identificação da unidade de um imóvel não arquivado. */
export function findDuplicateProperty(
  request: ImobPropertyCreateRequest,
  items: Array<{ id: string; status?: string | null; address?: string | null; city?: string | null; metadata?: unknown }>,
) {
  const unit = normalizeKey((request.metadata as Record<string, unknown>)?.externalPropertyRef as string | undefined);
  return (
    items.find((item) => {
      if (item.status === "archived") return false;
      const metadata = item.metadata && typeof item.metadata === "object" ? (item.metadata as Record<string, unknown>) : {};
      const itemUnit = normalizeKey(typeof metadata.externalPropertyRef === "string" ? metadata.externalPropertyRef : "");
      return (
        normalizeKey(item.address) === normalizeKey(request.address)
        && normalizeKey(item.city) === normalizeKey(request.city)
        && itemUnit === unit
      );
    }) ?? null
  );
}

export function buildPropertyCreateConfirmationText(data: { label: string; ownerName?: string | null; occupancyLabel?: string | null }) {
  return [
    `Imóvel cadastrado: ${data.label}.`,
    data.ownerName ? `Proprietário: ${data.ownerName}.` : "Sem proprietário vinculado.",
    data.occupancyLabel ? `Situação: ${data.occupancyLabel}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export const OCCUPANCY_LABELS: Record<string, string> = { locado: "Locado", vago: "Vago", em_obra: "Em obra" };

/** Opções do campo "Proprietário": proprietários não arquivados do workspace. */
export function buildImobOwnerOptions(items: Array<{ id: string; name: string; status?: string | null }>): ImobPresentationFormFieldOption[] {
  return items
    .filter((item) => item.status !== "archived")
    .map((item) => ({ value: item.id, label: item.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}
