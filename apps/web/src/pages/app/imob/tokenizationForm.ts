import type { ImobCaseCreateRequest, ImobPresentationForm } from "@/lib/api";

/**
 * "Tokenização de ativos" nos menus do chat IMOB.
 *
 * Tokenização NÃO está disponível no EIAH (execução on-chain e tokenização
 * seguem como proposta no roadmap). Este formulário só (A) explica o que
 * seria tokenizado em cada assunto e os pré-requisitos, e (B) permite
 * registrar interesse como um caso `tokenization.interest`, para alimentar
 * um desenho futuro. Nenhum token é emitido nem simulado.
 */

export const TOKENIZATION_SUBMIT_TARGET = "imob.tokenization.interest";
export const TOKENIZATION_INTEREST_FLOW = "tokenization.interest";

export type TokenizationSubject = "owners" | "properties" | "rentals" | "deals";

export function isTokenizationForm(form: Pick<ImobPresentationForm, "submitTarget"> | null | undefined) {
  return form?.submitTarget === TOKENIZATION_SUBMIT_TARGET;
}

const SUBJECTS: Record<TokenizationSubject, { title: string; what: string; prerequisites: string }> = {
  owners: {
    title: "Proprietários",
    what: "Participações sobre a carteira de um proprietário (um conjunto de imóveis).",
    prerequisites: "Imóveis com matrícula regular, estrutura jurídica que detenha os imóveis e regras de oferta a investidores.",
  },
  properties: {
    title: "Imóveis",
    what: "Frações de um imóvel específico (participação no ativo e nos seus resultados).",
    prerequisites: "Matrícula regular em cartório, avaliação do imóvel e estrutura jurídica para as frações.",
  },
  rentals: {
    title: "Locações",
    what: "Os recebíveis do aluguel de uma locação vigente (antecipação ou cessão dos aluguéis futuros).",
    prerequisites: "Contrato de locação assinado, garantia definida e instrumento de cessão dos recebíveis.",
  },
  deals: {
    title: "Negócios",
    what: "Participação em um negócio ou empreendimento (ex.: uma obra ou uma incorporação).",
    prerequisites: "Projeto e orçamento do negócio, estrutura jurídica do empreendimento e regras de oferta a investidores.",
  },
};

const COMMON_NOTICE =
  "Ainda não disponível no EIAH: nada é emitido nem simulado aqui. Ofertas de participação a terceiros podem envolver regras da CVM, registro em cartório e tributação, e exigem análise jurídica antes.";

export function buildTokenizationForm(subject: TokenizationSubject): ImobPresentationForm {
  const info = SUBJECTS[subject];
  const picker =
    subject === "owners"
      ? [{
          name: "ownerId",
          label: "Proprietário (opcional)",
          type: "select" as const,
          placeholder: "Não vincular",
          value: "",
          optionsSource: "imob_owners" as const,
          options: [],
        }]
      : subject === "properties" || subject === "rentals"
        ? [{
            name: "propertyId",
            label: subject === "rentals" ? "Imóvel da locação (opcional)" : "Imóvel (opcional)",
            type: "select" as const,
            placeholder: "Não vincular",
            value: "",
            optionsSource: "imob_properties" as const,
            options: [],
          }]
        : [];
  return {
    entity: "tokenizacao",
    action: subject,
    submitTarget: TOKENIZATION_SUBMIT_TARGET,
    label: `Tokenização de ativos — ${info.title}`,
    description: `O que seria tokenizado: ${info.what} Pré-requisitos: ${info.prerequisites} ${COMMON_NOTICE}`,
    fields: [
      ...picker,
      {
        name: "objective",
        label: "Seu objetivo (opcional)",
        type: "select",
        placeholder: "Não informado",
        value: "",
        options: [
          { value: "captar_recursos", label: "Captar recursos" },
          { value: "antecipar_recebiveis", label: "Antecipar recebíveis" },
          { value: "fracionar_propriedade", label: "Fracionar a propriedade" },
          { value: "liquidez", label: "Dar liquidez ao ativo" },
          { value: "outro", label: "Outro" },
        ],
      },
      { name: "notes", label: "Observações (opcional)", type: "text", maxLength: 500, placeholder: "Ex.: só a sala comercial", value: "" },
    ],
    actions: [
      { id: "cancel", label: "Fechar", kind: "secondary" },
      { id: "submit", label: "Registrar interesse", kind: "primary" },
    ],
  };
}

export function buildTokenizationInterestRequest(subject: TokenizationSubject, values: Record<string, string>): ImobCaseCreateRequest {
  const clean = (value: string | undefined) => (value ?? "").trim();
  const ownerId = clean(values.ownerId);
  const propertyId = clean(values.propertyId);
  return {
    flow: TOKENIZATION_INTEREST_FLOW,
    stage: "interest",
    status: "open",
    ...(ownerId ? { ownerId } : {}),
    ...(propertyId ? { propertyId } : {}),
    nextStep: "Avaliar viabilidade jurídica e regulatória antes de qualquer estruturação.",
    metadata: {
      source: "imob_chat_tokenization_interest_v1",
      subject,
      objective: clean(values.objective) || null,
      notes: clean(values.notes) || null,
      availability: "not_available",
    },
  };
}

export function buildTokenizationInterestConfirmationText(subject: TokenizationSubject) {
  return `Interesse em tokenização registrado (${SUBJECTS[subject].title}). Nada foi emitido; o registro fica no histórico de casos para quando a tokenização for desenhada.`;
}
