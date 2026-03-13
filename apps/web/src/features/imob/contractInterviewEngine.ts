import {
  CONTRACT_SCHEMAS,
  CONTRACT_TYPE_OPTIONS,
  type ContractField,
  type ContractFieldType,
  type ContractType,
} from "./contractSchemas";

export type ContractInterviewStatus = "collecting" | "review" | "generating" | "generated";

export type ContractInterviewState = {
  contractType: ContractType | null;
  currentStep: number;
  answers: Record<string, unknown>;
  status: ContractInterviewStatus;
  runId?: string;
  updatedAt: string;
};

export function createInitialContractInterviewState(): ContractInterviewState {
  return {
    contractType: null,
    currentStep: 0,
    answers: {},
    status: "collecting",
    updatedAt: new Date().toISOString(),
  };
}

export function getContractTypePrompt() {
  return [
    "Vou ajudar voce a gerar um contrato.",
    "",
    "Qual tipo de contrato voce deseja?",
    "1) Locacao",
    "2) Compra e venda",
    "3) Administracao",
    "4) Temporada",
    "",
    "Responda com o numero ou nome da opcao.",
  ].join("\n");
}

export function getContractTypeByText(rawText: string): ContractType | null {
  const text = rawText.trim().toLowerCase();
  if (!text) return null;
  for (const option of CONTRACT_TYPE_OPTIONS) {
    if (option.aliases.some((alias) => text.includes(alias))) {
      return option.id;
    }
  }
  return null;
}

export function getContractTypeLabel(contractType: ContractType) {
  return CONTRACT_TYPE_OPTIONS.find((item) => item.id === contractType)?.label ?? contractType;
}

type ContractStep = ContractField;

function normalizeValue(value: unknown) {
  if (typeof value === "string") {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .trim();
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return value == null ? "" : String(value);
}

function valuesMatch(left: unknown, right: unknown) {
  return normalizeValue(left) === normalizeValue(right);
}

function shouldAskStep(step: ContractField, answers: Record<string, unknown>) {
  if (!step.dependsOn) return true;
  const current = answers[step.dependsOn.field];
  return valuesMatch(current, step.dependsOn.value);
}

function findNextVisibleStepIndex(
  steps: ContractField[],
  answers: Record<string, unknown>,
  fromIndex: number
) {
  for (let i = fromIndex; i < steps.length; i += 1) {
    if (shouldAskStep(steps[i], answers)) return i;
  }
  return null;
}

function getCurrentContractStepPosition(state: ContractInterviewState) {
  if (!state.contractType) return null;
  const schema = CONTRACT_SCHEMAS[state.contractType];
  if (!schema) return null;
  const index = findNextVisibleStepIndex(schema.fields, state.answers ?? {}, state.currentStep);
  if (index === null) return null;
  return {
    index,
    step: schema.fields[index],
  };
}

export function getCurrentContractStep(state: ContractInterviewState): ContractStep | null {
  return getCurrentContractStepPosition(state)?.step ?? null;
}

function normalizeChoice(step: ContractField, value: string) {
  if (!step.options?.length) return null;
  const text = value.trim().toLowerCase();
  const direct = step.options.find((option) => option.id.toLowerCase() === text || option.label.toLowerCase() === text);
  if (direct) return direct;
  const includes = step.options.find((option) => text.includes(option.id.toLowerCase()) || text.includes(option.label.toLowerCase()));
  if (includes) return includes;
  return null;
}

function parseByType(questionType: ContractFieldType, rawValue: string, step: ContractStep) {
  const text = rawValue.trim();
  if (!text) return { ok: false, error: "Resposta vazia." };

  if (questionType === "number") {
    const normalized = Number(text.replace(",", "."));
    if (!Number.isFinite(normalized)) return { ok: false, error: "Informe um numero valido." };
    return { ok: true, value: normalized };
  }

  if (questionType === "currency") {
    const normalized = Number(text.replace(/[^\d,.-]/g, "").replace(",", "."));
    if (!Number.isFinite(normalized)) return { ok: false, error: "Informe um valor monetario valido." };
    return { ok: true, value: normalized };
  }

  if (questionType === "date") {
    const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brMatch) {
      const [, ddRaw, mmRaw, yyyyRaw] = brMatch;
      const dd = Number(ddRaw);
      const mm = Number(mmRaw);
      const yyyy = Number(yyyyRaw);
      if (yyyy < 1900 || yyyy > 2100 || mm < 1 || mm > 12 || dd < 1 || dd > 31) {
        return { ok: false, error: "Informe uma data valida no formato DD/MM/AAAA." };
      }
      return { ok: true, value: `${ddRaw}/${mmRaw}/${yyyyRaw}` };
    }

    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, yyyyRaw, mmRaw, ddRaw] = isoMatch;
      const dd = Number(ddRaw);
      const mm = Number(mmRaw);
      const yyyy = Number(yyyyRaw);
      if (yyyy < 1900 || yyyy > 2100 || mm < 1 || mm > 12 || dd < 1 || dd > 31) {
        return { ok: false, error: "Informe uma data valida no formato DD/MM/AAAA." };
      }
      return { ok: true, value: `${ddRaw}/${mmRaw}/${yyyyRaw}` };
    }

    return { ok: false, error: "Use formato DD/MM/AAAA." };
  }

  if (questionType === "choice") {
    const option = normalizeChoice(step, text);
    if (!option) {
      return {
        ok: false,
        error: `Escolha uma opcao valida: ${(step.options ?? []).map((item) => item.label).join(" | ")}`,
      };
    }
    return { ok: true, value: option.label };
  }

  if (questionType === "percentage") {
    const normalized = Number(text.replace("%", "").replace(",", "."));
    if (!Number.isFinite(normalized)) return { ok: false, error: "Informe um percentual valido." };
    return { ok: true, value: normalized };
  }

  if (questionType === "boolean") {
    const lowered = text.toLowerCase();
    if (["sim", "s", "true", "1"].includes(lowered)) return { ok: true, value: true };
    if (["nao", "não", "n", "false", "0"].includes(lowered)) return { ok: true, value: false };
    return { ok: false, error: "Responda sim ou nao." };
  }

  return { ok: true, value: text };
}

function findFieldIndexByQuery(schema: { fields: ContractField[] }, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return -1;
  return schema.fields.findIndex((step) => {
    const id = step.id.toLowerCase();
    const question = step.question.toLowerCase();
    return id === normalized || id.includes(normalized) || question.includes(normalized);
  });
}

export function getStepQuestionText(state: ContractInterviewState) {
  const step = getCurrentContractStep(state);
  if (!step) return null;
  if (!state.contractType) return step.question;
  return `${getContractTypeLabel(state.contractType)} • ${step.question}`;
}

export function applyContractInterviewAnswer(state: ContractInterviewState, rawText: string) {
  if (!state.contractType) {
    const picked = getContractTypeByText(rawText);
    if (!picked) {
      return {
        ok: false as const,
        state,
        message: "Nao identifiquei o tipo de contrato. Responda com 1, 2, 3, 4 ou nome da opcao.",
      };
    }
    const nextState: ContractInterviewState = {
      ...state,
      contractType: picked,
      currentStep: 0,
      updatedAt: new Date().toISOString(),
    };
    return { ok: true as const, state: nextState, message: getStepQuestionText(nextState) };
  }

  const current = getCurrentContractStepPosition(state);
  if (!current) {
    return {
      ok: false as const,
      state,
      message: "Nao encontrei a proxima pergunta do contrato.",
    };
  }
  const step = current.step;

  const parsed = parseByType(step.type, rawText, step);
  if (!parsed.ok) {
    return { ok: false as const, state, message: parsed.error };
  }

  const updatedAnswers = {
    ...state.answers,
    [step.id]: parsed.value,
  };
  const schema = CONTRACT_SCHEMAS[state.contractType];
  const nextIndex = findNextVisibleStepIndex(schema.fields, updatedAnswers, current.index + 1);
  const isLast = nextIndex === null;
  const nextState: ContractInterviewState = {
    ...state,
    answers: updatedAnswers,
    currentStep: isLast ? current.index : nextIndex,
    status: isLast ? "review" : state.status,
    updatedAt: new Date().toISOString(),
  };
  if (isLast) {
    return { ok: true as const, state: nextState, message: buildContractInterviewReview(nextState) };
  }
  return { ok: true as const, state: nextState, message: getStepQuestionText(nextState) };
}

export function buildContractInterviewReview(state: ContractInterviewState) {
  if (!state.contractType) return "Nao ha dados para revisao.";
  return [
    `Rascunho de contrato (${getContractTypeLabel(state.contractType)}) atualizado.`,
    "Use os controles do rascunho para editar ou confirmar.",
  ].join("\n");
}

export function isAffirmativeAnswer(rawText: string) {
  const text = rawText.trim().toLowerCase();
  return ["sim", "s", "ok", "confirmo", "confirmar", "gerar", "pode gerar"].some((value) => text === value || text.includes(value));
}

export function isNegativeAnswer(rawText: string) {
  const text = rawText.trim().toLowerCase();
  return ["nao", "não", "n", "cancelar", "parar"].some((value) => text === value || text.includes(value));
}

export function getContractActionType(contractType: ContractType): "rent" | "sale" | "management" {
  if (contractType === "compra_venda") return "sale";
  if (contractType === "administracao") return "management";
  return "rent";
}

export function extractEditFieldQuery(rawText: string) {
  const normalized = rawText.trim();
  const matched = normalized.match(/^editar\s+(.+)$/i);
  if (!matched?.[1]) return null;
  return matched[1].replace(/^campo\s+/i, "").trim().toLowerCase();
}

export function moveInterviewToEditableField(state: ContractInterviewState, fieldQuery: string) {
  if (!state.contractType) {
    return { ok: false as const, message: "Ainda nao existe contrato selecionado para editar." };
  }
  const schema = CONTRACT_SCHEMAS[state.contractType];
  const normalized = fieldQuery.trim().toLowerCase();
  if (!normalized) {
    return {
      ok: false as const,
      message: `Informe o campo. Exemplo: editar ${schema.fields[0]?.id ?? "landlord_name"}`,
    };
  }
  const index = findFieldIndexByQuery(schema, normalized);
  if (index < 0) {
    return {
      ok: false as const,
      message: `Campo nao encontrado. Use um id valido, ex: ${schema.fields.map((step) => step.id).join(", ")}`,
    };
  }
  const step = schema.fields[index];
  const nextState: ContractInterviewState = {
    ...state,
    answers: { ...state.answers },
    currentStep: index,
    status: "collecting",
    updatedAt: new Date().toISOString(),
  };
  return {
    ok: true as const,
    fieldId: step.id,
    state: nextState,
    question: getStepQuestionText(nextState) ?? "Qual o novo valor deste campo?",
  };
}

export function applySingleFieldEditAnswer(
  state: ContractInterviewState,
  fieldId: string,
  rawText: string
) {
  if (!state.contractType) {
    return {
      ok: false as const,
      state,
      message: "Ainda nao existe contrato selecionado para editar.",
    };
  }
  const schema = CONTRACT_SCHEMAS[state.contractType];
  const targetField = schema.fields.find((step) => step.id === fieldId);
  if (!targetField) {
    return {
      ok: false as const,
      state,
      message: "Campo de edicao nao encontrado no contrato atual.",
    };
  }
  const parsed = parseByType(targetField.type, rawText, targetField);
  if (!parsed.ok) {
    return { ok: false as const, state, message: parsed.error };
  }
  const nextState: ContractInterviewState = {
    ...state,
    answers: {
      ...state.answers,
      [targetField.id]: parsed.value,
    },
    status: "review",
    updatedAt: new Date().toISOString(),
  };
  return {
    ok: true as const,
    state: nextState,
    message: buildContractInterviewReview(nextState),
  };
}
