import { IMOB_ASSET_DEAL_KIND_LABELS, IMOB_ASSET_DEAL_STATE_LABELS, type ImobAssetDealKind } from "@eiah/contracts";
import type { ImobAssetDealCreateRequest, ImobPresentationForm } from "@/lib/api";
import { parseBrlToCents } from "./rentalLeaseForm";

/**
 * Venda e permuta do imóvel/unidade (`sale.deal` / `exchange.deal` sobre
 * `ImobCase`). Formulário local, enviado direto para `POST /imob/deals`, sem
 * virar texto de conversa. A regra de domínio (estados, duplicidade, projeção
 * do preço no imóvel) vive na API; aqui só entrada, validação de formato e
 * confirmação.
 */

export const ASSET_DEAL_SUBMIT_TARGET = "imob.deals.create";
export const ASSET_DEAL_ENTITY = "negocio_ativo";

export function isAssetDealForm(form: Pick<ImobPresentationForm, "submitTarget"> | null | undefined) {
  return form?.submitTarget === ASSET_DEAL_SUBMIT_TARGET;
}

/** O tipo do negócio (`venda` | `permuta`) vem do `action` do formulário. */
export function assetDealKindOf(form: Pick<ImobPresentationForm, "action"> | null | undefined): ImobAssetDealKind {
  return form?.action === "permuta" ? "permuta" : "venda";
}

const clean = (value: string | undefined) => (value ?? "").trim();

export function buildAssetDealForm(kind: ImobAssetDealKind): ImobPresentationForm {
  const money = (name: string, label: string, placeholder: string) => ({
    name,
    label,
    type: "text" as const,
    placeholder,
    inputMode: "numeric" as const,
    value: "",
  });
  return {
    entity: ASSET_DEAL_ENTITY,
    action: kind,
    submitTarget: ASSET_DEAL_SUBMIT_TARGET,
    label: kind === "venda" ? "Registrar venda" : "Registrar permuta",
    description:
      kind === "venda"
        ? "Negociação de venda do imóvel: em andamento ou já concluída. Só imóvel e situação são obrigatórios; o que ficar em branco continua em aberto."
        : "Negociação de permuta: o imóvel é oferecido em troca de outro bem, com torna se houver. Só imóvel e situação são obrigatórios.",
    fields: [
      {
        name: "propertyId",
        label: kind === "venda" ? "Imóvel à venda" : "Imóvel oferecido na permuta",
        type: "select",
        required: true,
        placeholder: "Selecione o imóvel",
        value: "",
        optionsSource: "imob_properties",
        options: [],
      },
      {
        name: "state",
        label: "Situação da negociação",
        type: "select",
        required: true,
        placeholder: "Selecione",
        value: "",
        options: [
          { value: "em_andamento", label: IMOB_ASSET_DEAL_STATE_LABELS.em_andamento },
          { value: "concluida", label: `${IMOB_ASSET_DEAL_STATE_LABELS.concluida} (já aconteceu — vai direto para o histórico)` },
        ],
      },
      {
        name: "counterpartyName",
        label: kind === "venda" ? "Comprador (opcional)" : "Outra parte (opcional)",
        type: "text",
        maxLength: 160,
        placeholder: "Nome completo ou razão social",
        value: "",
      },
      money("askingPrice", kind === "venda" ? "Valor pretendido (R$)" : "Valor atribuído ao imóvel oferecido (R$)", "250.000,00"),
      ...(kind === "permuta"
        ? [
            {
              name: "receivedAssetDescription",
              label: "Bem recebido (descrição)",
              type: "text" as const,
              maxLength: 400,
              placeholder: "Ex.: terreno de 300 m²",
              value: "",
            },
            money("receivedValue", "Valor atribuído ao bem recebido (R$)", "250.000,00"),
            money("torna", "Torna (diferença em dinheiro, R$)", "5.000,00"),
          ]
        : []),
      { name: "notes", label: "Observação (opcional)", type: "text", maxLength: 1000, placeholder: "Ex.: escritura marcada", value: "" },
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "submit", label: kind === "venda" ? "Registrar venda" : "Registrar permuta", kind: "primary" },
    ],
  };
}

export type AssetDealFormResult =
  | { ok: true; request: ImobAssetDealCreateRequest }
  | { ok: false; errors: Record<string, string> };

export function buildAssetDealRequest(kind: ImobAssetDealKind, values: Record<string, string>): AssetDealFormResult {
  const errors: Record<string, string> = {};
  const propertyId = clean(values.propertyId);
  if (!propertyId) errors.propertyId = "Selecione o imóvel.";
  const state = clean(values.state);
  if (state !== "em_andamento" && state !== "concluida") errors.state = "Informe se a negociação está em andamento ou já foi concluída.";

  const money = (field: string) => {
    const cents = parseBrlToCents(values[field]);
    if (Number.isNaN(cents) || (cents !== null && !Number.isSafeInteger(cents))) {
      errors[field] = "Informe o valor no formato 250.000,00.";
      return null;
    }
    return cents;
  };
  const askingPriceCents = money("askingPrice");
  const receivedValueCents = kind === "permuta" ? money("receivedValue") : null;
  const tornaCents = kind === "permuta" ? money("torna") : null;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    request: {
      propertyId,
      kind,
      state: state as "em_andamento" | "concluida",
      askingPriceCents,
      counterpartyName: clean(values.counterpartyName) || null,
      ...(kind === "permuta"
        ? { receivedAssetDescription: clean(values.receivedAssetDescription) || null, receivedValueCents, tornaCents }
        : {}),
      notes: clean(values.notes) || null,
    },
  };
}

const brl = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Confirmação na conversa: imóvel, tipo, situação e valor — sem nome de comprador/contraparte. */
export function buildAssetDealConfirmationText(data: {
  propertyLabel: string;
  kind: ImobAssetDealKind;
  state: "em_andamento" | "concluida";
  askingPriceCents: number | null;
  propertyProjection?: "applied" | "kept_in_deal_only" | "not_applicable";
}) {
  return [
    `${IMOB_ASSET_DEAL_KIND_LABELS[data.kind]} registrada: ${data.propertyLabel} — ${IMOB_ASSET_DEAL_STATE_LABELS[data.state].toLowerCase()}.`,
    data.askingPriceCents !== null ? `Valor: ${brl(data.askingPriceCents)}.` : null,
    data.propertyProjection === "kept_in_deal_only" ? "O valor integral ficou só no negócio (acima do limite do campo de preço do imóvel)." : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function describeAssetDealError(status: number, code: string | undefined) {
  if (code === "ASSET_DEAL_ALREADY_ACTIVE") return "Este imóvel já tem um negócio deste tipo em andamento. Nada foi gravado.";
  if (code === "PROPERTY_NOT_FOUND") return "Imóvel não encontrado neste workspace. Atualize a lista e tente de novo.";
  if (status === 403) return "Sua função atual não pode registrar negócios neste workspace. Nada foi gravado.";
  if (status === 400) return "Algum campo foi recusado pelo servidor. Confira os valores. Nada foi gravado.";
  return `Não foi possível registrar o negócio agora${status ? ` (HTTP ${status})` : ""}. Nada foi gravado; tente de novo.`;
}
