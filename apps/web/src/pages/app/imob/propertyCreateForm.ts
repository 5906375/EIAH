import {
  IMOB_ASSET_DESTINATION_OPTIONS,
  looksLikeMultipleUnits,
  normalizeImobAssetDestination,
  parseCanonicalImobUnits,
  IMOB_MAX_UNITS_PER_BATCH,
  IMOB_PROPERTY_UNIT_INTAKE_POLICY,
} from "@eiah/contracts";
import type { ImobPresentationForm, ImobPresentationFormFieldOption, ImobPropertyCreateRequest } from "@/lib/api";

/**
 * Formulário "Cadastrar imóvel" do chat IMOB, enviado de forma estruturada
 * direto para `POST /imob/properties`: não dispara execução de agente e os
 * campos não viram texto de conversa.
 *
 * Várias unidades no mesmo endereço (ex.: "Kitnets 101 a 105 e Salas 01 e 02")
 * passam por uma confirmação do lote ANTES de gravar: destinação geral
 * opcional, destinação individual por unidade, edição/remoção/adição e
 * pré-validação. Linguagem livre passa pelo intake do IMOB; contracts normaliza/valida.
 */

export const PROPERTY_CREATE_SUBMIT_TARGET = "imob.properties.create";
export const PROPERTY_BATCH_SUBMIT_TARGET = "imob.properties.batch";
export const PROPERTY_CREATE_SOURCE = "imob_chat_property_form_v1";

export function isPropertyCreateForm(form: Pick<ImobPresentationForm, "submitTarget"> | null | undefined) {
  return form?.submitTarget === PROPERTY_CREATE_SUBMIT_TARGET;
}

export function isPropertyBatchForm(form: Pick<ImobPresentationForm, "submitTarget"> | null | undefined) {
  return form?.submitTarget === PROPERTY_BATCH_SUBMIT_TARGET;
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

/**
 * Uma unidade. Destinação é opcional: vazio = ainda não informada (nada é gravado);
 * "Sem destinação definida" é escolha explícita. Várias unidades na identificação
 * não cabem aqui — o cadastro em lote (`planPropertyCreate`) cuida delas.
 */
export function buildPropertyCreateRequest(values: Record<string, string>): PropertyCreateFormResult {
  const errors: Record<string, string> = {};
  const propertyType = clean(values.propertyType);
  if (!propertyType) errors.propertyType = "Selecione o tipo do imóvel.";
  const goalRaw = clean(values.goal);
  const goal = goalRaw ? normalizeImobAssetDestination(goalRaw) : null;
  if (goalRaw && !goal) errors.goal = "Destinação inválida.";
  if ((parseCanonicalImobUnits(values.unitLabel)?.units.length ?? 0) >= 2 || looksLikeMultipleUnits(values.unitLabel)) {
    errors.unitLabel = "Estas unidades precisam de confirmação no cadastro em lote antes de gravar.";
  }
  const city = clean(values.city);
  if (!city) errors.city = "Informe a cidade.";
  const address = clean(values.address);
  if (!address) errors.address = "Informe o endereço.";
  else if (address.length < 5) errors.address = "Endereço muito curto.";

  const cep = clean(values.cep).replace(/\D/g, "");
  if (clean(values.cep) && (!/^\d{5}-?\d{3}$/.test(clean(values.cep)) || cep.length !== 8)) errors.cep = "CEP deve ter 8 dígitos.";

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
      ...(goal ? { goal } : {}),
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

const NAME_STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e"]);
const nameTokens = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").split(/[^a-z0-9]+/).filter((token) => token && !NAME_STOPWORDS.has(token));

/**
 * Nome citado no chat → cadastro existente. Cada parte do nome digitado tem
 * de iniciar uma parte do nome cadastrado ("carlos a merlo" ↔ "Carlos Alberto
 * Merlo"). Só devolve quando há um único compatível (ou um idêntico); nunca cria.
 */
export function matchOptionByName(options: ImobPresentationFormFieldOption[], hint: string | null | undefined) {
  const wanted = nameTokens(hint ?? "");
  if (wanted.length === 0) return null;
  const candidates = options.filter((option) => {
    const have = nameTokens(option.label);
    return wanted.every((token) => have.some((part) => part.startsWith(token)));
  });
  if (candidates.length === 1) return candidates[0].value;
  const exact = candidates.filter((option) => nameTokens(option.label).join(" ") === wanted.join(" "));
  return exact.length === 1 ? exact[0].value : null;
}

// ---------------------------------------------------------------------------
// Cadastro em lote (várias unidades no mesmo endereço)
// ---------------------------------------------------------------------------

export type PropertyCreatePlan =
  | { ok: true; mode: "single"; request: ImobPropertyCreateRequest }
  | { ok: true; mode: "batch"; units: string[]; duplicatesInInput: string[] }
  | { ok: false; errors: Record<string, string>; needsIntake?: true };

export const AMBIGUOUS_UNITS_MESSAGE =
  IMOB_PROPERTY_UNIT_INTAKE_POLICY.clarification;

/** Uma unidade grava direto; duas ou mais abrem a confirmação do lote (nada é gravado antes dela). */
export function planPropertyCreate(values: Record<string, string>, resolvedUnitLabels?: string[]): PropertyCreatePlan {
  const parsed = parseCanonicalImobUnits(values.unitLabel);
  if (!resolvedUnitLabels && clean(values.unitLabel) && !parsed) {
    return { ok: false, needsIntake: true, errors: { unitLabel: AMBIGUOUS_UNITS_MESSAGE } };
  }
  if (parsed?.invalidRanges.length) {
    return {
      ok: false,
      errors: { unitLabel: `Faixa inválida: ${parsed.invalidRanges.join("; ")}. Confirme quais unidades fazem parte do cadastro.` },
    };
  }
  const units = resolvedUnitLabels ?? parsed?.units.map((unit) => unit.label) ?? [];
  if (units.length > IMOB_MAX_UNITS_PER_BATCH || units.some((label) => !label.trim() || label.length > 80 || looksLikeMultipleUnits(label))) {
    return { ok: false, errors: { unitLabel: AMBIGUOUS_UNITS_MESSAGE } };
  }
  if (units.length >= 2) {
    // Valida os campos comuns uma vez, com a primeira unidade como amostra.
    const probe = buildPropertyCreateRequest({ ...values, unitLabel: units[0] });
    if (!probe.ok) return probe;
    return { ok: true, mode: "batch", units: [...new Set(units)], duplicatesInInput: parsed?.duplicates ?? [] };
  }
  const single = buildPropertyCreateRequest({ ...values, unitLabel: units[0] ?? values.unitLabel });
  return single.ok ? { ok: true, mode: "single", request: single.request } : single;
}

/** Valores do formulário original guardados (com este prefixo) junto aos valores da confirmação do lote. */
export const PROPERTY_BATCH_BASE_PREFIX = "base:";

export const PROPERTY_BATCH_UNIT_FIELD = (index: number) => `unit_${index}`;
export const PROPERTY_BATCH_DESTINATION_FIELD = (index: number) => `dest_${index}`;
const MAX_UNIT_LABEL_LENGTH = 80;

const destinationOptions = IMOB_ASSET_DESTINATION_OPTIONS.map((option) => ({ value: option.value, label: option.label }));

export function propertyBatchBaseValues(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([key]) => key.startsWith(PROPERTY_BATCH_BASE_PREFIX))
      .map(([key, value]) => [key.slice(PROPERTY_BATCH_BASE_PREFIX.length), value]),
  );
}

export function toPropertyBatchBaseValues(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [`${PROPERTY_BATCH_BASE_PREFIX}${key}`, value]));
}

/** Confirmação do lote: destinação geral opcional, destinação por unidade, editar/remover/adicionar. */
export function buildPropertyBatchForm(
  units: string[],
  base: Record<string, string>,
  duplicatesInInput: string[] = [],
  batchId = "",
): ImobPresentationForm {
  const place = [clean(base.address), clean(base.city)].filter(Boolean).join(" — ");
  const general = normalizeImobAssetDestination(base.goal) ?? "";
  return {
    entity: "imovel_lote",
    // `action` único por lote: o preenchimento por histórico de formulários iguais nunca reaproveita linhas de outro lote.
    action: `create_batch:${batchId}`,
    submitTarget: PROPERTY_BATCH_SUBMIT_TARGET,
    label: `Confirmar ${units.length} unidades`,
    description:
      "Revise antes de gravar: nada foi cadastrado ainda. Edite o nome de uma unidade, apague para removê-la, adicione outras ou defina a destinação — para todas ou unidade por unidade.",
    infoLines: [
      place ? `Endereço: ${place}` : "",
      duplicatesInInput.length > 0 ? `Repetidas na sua frase e mantidas uma vez: ${duplicatesInInput.join(", ")}.` : "",
    ].filter(Boolean),
    fields: [
      {
        name: "generalDestination",
        label: "Destinação para todas as unidades (opcional)",
        type: "select",
        placeholder: "Definir depois",
        value: general,
        options: destinationOptions,
        helperText: "Vale para as unidades sem destinação própria abaixo.",
      },
      ...units.flatMap((label, index) => [
        {
          name: PROPERTY_BATCH_UNIT_FIELD(index),
          label: `Unidade ${index + 1}`,
          type: "text" as const,
          maxLength: MAX_UNIT_LABEL_LENGTH,
          value: label,
          ...(index === 0 ? { helperText: "Apague o nome para remover a unidade deste lote." } : {}),
        },
        {
          name: PROPERTY_BATCH_DESTINATION_FIELD(index),
          label: `Destinação da unidade ${index + 1}`,
          type: "select" as const,
          placeholder: "Usar a destinação de todas",
          value: "",
          options: destinationOptions,
        },
      ]),
      {
        name: "extraUnits",
        label: "Adicionar unidades",
        type: "text" as const,
        placeholder: "Ex.: Kitnets 106 a 108",
        value: "",
        helperText: "Entram no lote com a destinação de todas.",
      },
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "submit", label: "Confirmar e cadastrar", kind: "primary" },
    ],
  };
}

/** `field`: de onde veio a unidade (`unit_N` ou `extraUnits`), para devolver só as pendentes ao formulário. */
export type PropertyBatchItem = { field: string; label: string; destination: string | null; request: ImobPropertyCreateRequest };
export type PropertyBatchResult =
  | { ok: true; items: PropertyBatchItem[] }
  | { ok: false; errors: Record<string, string> };

/**
 * Pré-validação completa do lote, sem tocar na API de escrita: nomes, repetições
 * (no lote e contra imóveis já cadastrados), destinações e campos comuns.
 * Qualquer erro bloqueia o lote inteiro — nada é gravado parcialmente por erro de entrada.
 */
export function buildPropertyBatchRequests(
  values: Record<string, string>,
  existing: Array<{ id: string; status?: string | null; address?: string | null; city?: string | null; metadata?: unknown }>,
): PropertyBatchResult {
  const errors: Record<string, string> = {};
  const base = propertyBatchBaseValues(values);

  const generalRaw = clean(values.generalDestination);
  const general = generalRaw ? normalizeImobAssetDestination(generalRaw) : null;
  if (generalRaw && !general) errors.generalDestination = "Destinação inválida.";

  const entries: Array<{ field: string; label: string; destinationField: string | null; destinationRaw: string }> = [];
  const rowIndexes = Object.keys(values)
    .map((key) => /^unit_(\d+)$/.exec(key))
    .flatMap((match) => (match ? [Number(match[1])] : []))
    .sort((a, b) => a - b);
  for (const index of rowIndexes) {
    const label = clean(values[PROPERTY_BATCH_UNIT_FIELD(index)]);
    if (!label) continue; // apagado = removido do lote
    entries.push({
      field: PROPERTY_BATCH_UNIT_FIELD(index),
      label,
      destinationField: PROPERTY_BATCH_DESTINATION_FIELD(index),
      destinationRaw: clean(values[PROPERTY_BATCH_DESTINATION_FIELD(index)]),
    });
  }
  const extras = parseCanonicalImobUnits(values.extraUnits) ?? { units: [], invalidRanges: [], duplicates: [] };
  if (extras.invalidRanges.length > 0) {
    errors.extraUnits = `Faixa inválida: ${extras.invalidRanges.join("; ")}. Confirme quais unidades deseja adicionar.`;
  } else if (clean(values.extraUnits) && extras.units.length === 0) {
    errors.extraUnits = IMOB_PROPERTY_UNIT_INTAKE_POLICY.clarification;
  }
  for (const unit of extras.units) {
    entries.push({ field: "extraUnits", label: unit.label, destinationField: null, destinationRaw: "" });
  }

  if (entries.length === 0) errors._form = "Nenhuma unidade para cadastrar. Adicione ao menos uma ou cancele.";
  if (entries.length > IMOB_MAX_UNITS_PER_BATCH) errors._form = `Confirme no máximo ${IMOB_MAX_UNITS_PER_BATCH} unidades por lote.`;

  const seen = new Set<string>();
  const items: PropertyBatchItem[] = [];
  for (const entry of entries) {
    if (entry.label.length > MAX_UNIT_LABEL_LENGTH) {
      errors[entry.field] = `Nome muito longo (máx. ${MAX_UNIT_LABEL_LENGTH} caracteres).`;
      continue;
    }
    const key = normalizeKey(entry.label);
    if (seen.has(key)) {
      errors[entry.field] = `“${entry.label}” aparece mais de uma vez neste lote. Remova a repetida.`;
      continue;
    }
    seen.add(key);

    let destination = general;
    if (entry.destinationRaw) {
      destination = normalizeImobAssetDestination(entry.destinationRaw);
      if (!destination && entry.destinationField) {
        errors[entry.destinationField] = "Destinação inválida.";
        continue;
      }
    }
    const built = buildPropertyCreateRequest({ ...base, unitLabel: entry.label, goal: destination ?? "" });
    if (!built.ok) {
      errors[entry.field] = built.errors.unitLabel ?? errors[entry.field] ?? "Dados comuns do imóvel inválidos; cancele e refaça o cadastro.";
      continue;
    }
    if (findDuplicateProperty(built.request, existing)) {
      errors[entry.field] = `Já existe um imóvel com este endereço e a unidade “${entry.label}”. Remova-a do lote.`;
      continue;
    }
    items.push({ field: entry.field, label: entry.label, destination, request: built.request });
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, items };
}

/** Resultado do lote: só o que foi gravado e o que falhou; nunca desfaz o que já entrou. */
export function buildPropertyBatchConfirmationText(params: {
  created: Array<{ label: string }>;
  failed: Array<{ label: string }>;
  place?: string | null;
  ownerName?: string | null;
}) {
  const names = (items: Array<{ label: string }>) => items.map((item) => item.label).join(", ");
  return [
    params.created.length > 0
      ? `${params.created.length} ${params.created.length === 1 ? "imóvel cadastrado" : "imóveis cadastrados"}${params.place ? ` em ${params.place}` : ""}: ${names(params.created)}.`
      : "Nenhum imóvel foi cadastrado.",
    params.ownerName ? `Proprietário: ${params.ownerName}.` : null,
    params.failed.length > 0
      ? `Não foi possível cadastrar: ${names(params.failed)}. Os demais já estão gravados; o formulário segue aberto só com as pendentes.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}
