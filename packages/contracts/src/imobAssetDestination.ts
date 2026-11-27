/**
 * IMOB — destinação inicial do ativo (imóvel/unidade) e interpretação de
 * múltiplas unidades.
 *
 * Helpers puros e sem dependências: a mesma normalização serve ao
 * Front Door (`/app/chat`), ao chat dedicado (`/app/imob/chat`) e à API.
 * A autoridade de domínio continua no IMOB (serviços/rotas); aqui só vive a
 * validação canônica e "qual o próximo passo". Linguagem livre pertence ao
 * intake agêntico do IMOB, não ao parser nem às superfícies.
 *
 * A destinação NÃO é estado permanente nem substitui ocupação: ela orienta a
 * próxima jornada. Ausência (nunca informada) e `sem_destinacao` (escolha
 * explícita) são estados diferentes.
 */

// ---------------------------------------------------------------------------
// Destinação
// ---------------------------------------------------------------------------

/** Valores canônicos. `aluguel_por_temporada` é o valor legado de "temporada". */
export const IMOB_ASSET_DESTINATIONS = [
  "locacao",
  "venda",
  "aluguel_por_temporada",
  "permuta",
  "uso_proprio",
  "manutencao",
  "sem_destinacao",
] as const;

export type ImobAssetDestination = (typeof IMOB_ASSET_DESTINATIONS)[number];

export type ImobAssetDestinationOption = {
  value: ImobAssetDestination;
  label: string;
  aliases: string[];
};

export const IMOB_ASSET_DESTINATION_OPTIONS: ImobAssetDestinationOption[] = [
  { value: "venda", label: "Venda", aliases: ["venda", "vender", "comprar", "compra", "compra e venda"] },
  { value: "locacao", label: "Locação", aliases: ["locacao", "locação", "aluguel", "alugar", "locar"] },
  {
    value: "aluguel_por_temporada",
    label: "Aluguel por temporada",
    aliases: ["temporada", "aluguel por temporada", "locacao por temporada", "locação por temporada", "seasonal rental"],
  },
  { value: "permuta", label: "Permuta", aliases: ["permuta", "permutar"] },
  { value: "uso_proprio", label: "Uso próprio", aliases: ["uso proprio", "uso_proprio", "uso do proprietario"] },
  {
    value: "manutencao",
    label: "Manutenção / indisponibilidade",
    aliases: [
      "manutencao",
      "em manutencao",
      "manutencao / indisponibilidade",
      "manutencao/indisponibilidade",
      "indisponivel",
      "indisponibilidade",
    ],
  },
  {
    value: "sem_destinacao",
    label: "Sem destinação definida",
    aliases: ["sem destinacao", "sem destinacao definida", "sem_destinacao", "sem destino", "sem finalidade"],
  },
];

function foldText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

/**
 * Texto/valor livre → destinação canônica. `null` significa "não informada"
 * (vazio ou irreconhecível); `sem_destinacao` só sai de escolha explícita.
 */
export function normalizeImobAssetDestination(value: string | null | undefined): ImobAssetDestination | null {
  if (!value) return null;
  const normalized = foldText(value);
  if (!normalized) return null;
  for (const option of IMOB_ASSET_DESTINATION_OPTIONS) {
    if (option.aliases.some((alias) => foldText(alias) === normalized)) return option.value;
  }
  if (normalized.includes("sem destin") || normalized.includes("sem finalid")) return "sem_destinacao";
  if (normalized.includes("permut")) return "permuta";
  if (normalized.includes("uso proprio")) return "uso_proprio";
  if (normalized.includes("manuten") || normalized.includes("indisponi")) return "manutencao";
  if (normalized.includes("temporada")) return "aluguel_por_temporada";
  if (normalized.includes("loca") || normalized.includes("alug")) return "locacao";
  if (normalized.includes("vend") || normalized.includes("compr")) return "venda";
  return null;
}

export function getImobAssetDestinationLabel(value: string | null | undefined) {
  const normalized = normalizeImobAssetDestination(value);
  if (!normalized) return null;
  return IMOB_ASSET_DESTINATION_OPTIONS.find((option) => option.value === normalized)?.label ?? null;
}

// ---------------------------------------------------------------------------
// Próximas ações orientadas pela destinação
// ---------------------------------------------------------------------------

export type ImobAssetNextActionIntent =
  | "lease_register_current"
  | "lease_register_historical"
  | "lease_start_new"
  | "sale_register_existing"
  | "sale_start_new"
  | "exchange_register_existing"
  | "exchange_start_new";

export type ImobAssetNextAction = {
  intent: ImobAssetNextActionIntent;
  /** Rótulo curto, válido como input do usuário (chip). */
  label: string;
};

export type ImobAssetNextSteps = {
  destination: ImobAssetDestination;
  /** Uma operação (locação/venda/permuta) pode ser aberta a partir daqui. */
  startsOperation: boolean;
  /** Texto de orientação já resolvido; as superfícies só renderizam. */
  message: string;
  /** No máximo 3 ações, nunca abrem nada sozinhas. */
  actions: ImobAssetNextAction[];
};

/**
 * Destinação → próximos passos. Uso próprio, manutenção, temporada (sem fluxo
 * ainda) e sem destinação NÃO abrem contrato, locação, venda nem permuta.
 *
 * `unitLabel` é o sujeito já resolvido ("Kitnet 101"); `unitCount >= 2` troca o
 * sujeito por "as N unidades" (cadastro em lote). Frases neutras de gênero:
 * "Você definiu {sujeito} para/como …".
 */
export function resolveImobAssetNextSteps(
  destination: string | null | undefined,
  unitLabel?: string | null,
  options?: { unitCount?: number },
): ImobAssetNextSteps | null {
  const normalized = normalizeImobAssetDestination(destination);
  if (!normalized) return null;
  const count = options?.unitCount ?? 1;
  const subject = count >= 2 ? `as ${count} unidades` : unitLabel?.trim() || "o imóvel";
  switch (normalized) {
    case "locacao":
      return {
        destination: normalized,
        startsOperation: true,
        message: `Você definiu ${subject} para locação. Deseja registrar uma locação já existente, uma locação encerrada ou iniciar uma nova?`,
        actions: [
          { intent: "lease_register_current", label: "Registrar locação atual" },
          { intent: "lease_register_historical", label: "Registrar locação encerrada" },
          { intent: "lease_start_new", label: "Iniciar nova locação" },
        ],
      };
    case "venda":
      return {
        destination: normalized,
        startsOperation: true,
        message: `Você definiu ${subject} para venda. Deseja registrar uma negociação existente ou iniciar uma nova?`,
        actions: [
          { intent: "sale_register_existing", label: "Registrar venda existente" },
          { intent: "sale_start_new", label: "Iniciar venda" },
        ],
      };
    case "permuta":
      return {
        destination: normalized,
        startsOperation: true,
        message: `Você definiu ${subject} para permuta. Deseja iniciar ou registrar uma negociação?`,
        actions: [
          { intent: "exchange_register_existing", label: "Registrar permuta existente" },
          { intent: "exchange_start_new", label: "Iniciar permuta" },
        ],
      };
    case "aluguel_por_temporada":
      return {
        destination: normalized,
        startsOperation: false,
        message: `Você definiu ${subject} como aluguel por temporada. Ainda não há contrato nem negócio para essa destinação; o cadastro está concluído.`,
        actions: [],
      };
    case "uso_proprio":
      return {
        destination: normalized,
        startsOperation: false,
        message: `Você definiu ${subject} como uso próprio. Nenhum contrato ou negócio foi iniciado; você pode alterar a destinação depois.`,
        actions: [],
      };
    case "manutencao":
      return {
        destination: normalized,
        startsOperation: false,
        message: `Você definiu ${subject} como manutenção/indisponível. Nenhum contrato ou negócio foi iniciado; o cadastro segue ativo e você pode alterar a destinação depois.`,
        actions: [],
      };
    case "sem_destinacao":
      return {
        destination: normalized,
        startsOperation: false,
        message: `Você definiu ${subject} sem destinação. Você pode definir a destinação quando quiser.`,
        actions: [],
      };
  }
}

// ---------------------------------------------------------------------------
// Negócios do ativo (venda / permuta) — estados mínimos
// ---------------------------------------------------------------------------

export const IMOB_ASSET_DEAL_KINDS = ["venda", "permuta"] as const;
export type ImobAssetDealKind = (typeof IMOB_ASSET_DEAL_KINDS)[number];

export const IMOB_ASSET_DEAL_STATES = ["em_andamento", "concluida"] as const;
export type ImobAssetDealState = (typeof IMOB_ASSET_DEAL_STATES)[number];

export const IMOB_ASSET_DEAL_STATE_LABELS: Record<ImobAssetDealState, string> = {
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

export const IMOB_ASSET_DEAL_KIND_LABELS: Record<ImobAssetDealKind, string> = {
  venda: "Venda",
  permuta: "Permuta",
};

// ---------------------------------------------------------------------------
// Múltiplas unidades
// ---------------------------------------------------------------------------

export type ImobParsedUnit = {
  /** Rótulo canônico, ex.: "Kitnet 101", "Sala 01". */
  label: string;
  /** Tipo canônico no singular, ex.: "Kitnet". */
  kind: string;
  /** Número como informado (preserva zero à esquerda). */
  number: string;
};

export type ImobParsedUnits = {
  units: ImobParsedUnit[];
  /** Rótulos repetidos dentro da própria entrada (mantidos só uma vez em `units`). */
  duplicates: string[];
  /** Faixas inválidas (ex.: "105 a 101") — nada é inventado para elas. */
  invalidRanges: string[];
};

export const IMOB_MAX_UNITS_PER_BATCH = 200;

/** Contrato de saída do intake IMOB. Nunca concede autorização de cadastro. */
export type ImobPropertyUnitIntake =
  | { status: "resolved"; unitLabels: string[]; source: "canonical" | "openai"; confidence?: number | null }
  | { status: "needs_clarification"; unitLabels: []; message: string; confidence?: number | null }
  | { status: "not_mentioned"; unitLabels: [] };

export const IMOB_PROPERTY_UNIT_INTAKE_POLICY = Object.freeze({
  owner: "IMOB",
  kind: "property_units",
  minimumConfidence: 0.85,
  clarification: "Quais unidades você deseja cadastrar? Confirme os tipos e as identificações; nada foi cadastrado.",
  unavailable: "Não consegui interpretar as unidades com segurança agora. Podemos retomar essa identificação antes de cadastrar; nada foi gravado.",
  batchConfirmationRequired: true,
  writesAllowed: false,
} as const);

const UNIT_KINDS: Record<string, string> = {
  kitnet: "Kitnet",
  kitnets: "Kitnet",
  kitinete: "Kitnet",
  kitinetes: "Kitnet",
  kit: "Kitnet",
  sala: "Sala",
  salas: "Sala",
  apto: "Apto",
  aptos: "Apto",
  ap: "Apto",
  aps: "Apto",
  apartamento: "Apto",
  apartamentos: "Apto",
  loja: "Loja",
  lojas: "Loja",
  casa: "Casa",
  casas: "Casa",
  studio: "Studio",
  studios: "Studio",
  estudio: "Studio",
  estudios: "Studio",
  conjunto: "Conjunto",
  conjuntos: "Conjunto",
  box: "Box",
  boxes: "Box",
  galpao: "Galpão",
  galpoes: "Galpão",
  cobertura: "Cobertura",
  coberturas: "Cobertura",
  unidade: "Unidade",
  unidades: "Unidade",
};

const RANGE_CONNECTORS = new Set(["a", "ao", "ate", "-"]);
const LIST_CONNECTORS = new Set([",", ";", "e"]);
const NUMBER_PREFIXES = new Set(["de", "n", "no", "numero", "num", "nro"]);

function tokenize(text: string) {
  return foldText(text).match(/\d+|[a-z]+|[,;-]/g) ?? [];
}

const isNumber = (token: string | undefined) => token !== undefined && /^\d+$/.test(token);

function padLike(reference: string, value: number) {
  const raw = String(value);
  return reference.length > raw.length && reference.startsWith("0") ? raw.padStart(reference.length, "0") : raw;
}

/**
 * "kitnets 101 a 105 e salas 01 e 02" → Kitnet 101…105, Sala 01, Sala 02.
 * Determinístico: só expande o que foi dito (lista e faixa ascendente) depois
 * de um tipo de unidade conhecido; nunca infere números nem endereços.
 */
export function parseImobUnits(text: string | null | undefined): ImobParsedUnits {
  const result: ImobParsedUnits = { units: [], duplicates: [], invalidRanges: [] };
  if (!text) return result;
  const tokens = tokenize(text);
  const seen = new Set<string>();

  const add = (kind: string, number: string) => {
    const label = `${kind} ${number}`;
    const key = foldText(label);
    if (seen.has(key)) {
      if (!result.duplicates.includes(label)) result.duplicates.push(label);
      return;
    }
    if (result.units.length >= IMOB_MAX_UNITS_PER_BATCH) {
      if (!result.invalidRanges.includes("Limite de unidades excedido")) result.invalidRanges.push("Limite de unidades excedido");
      return;
    }
    seen.add(key);
    result.units.push({ label, kind, number });
  };

  let kind: string | null = null;
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    const mapped = UNIT_KINDS[token];
    if (mapped) {
      kind = mapped;
      index += 1;
      continue;
    }
    if (kind && NUMBER_PREFIXES.has(token) && isNumber(tokens[index + 1])) {
      index += 1;
      continue;
    }
    if (kind && isNumber(token)) {
      const start = token;
      const connector = tokens[index + 1];
      if (connector && RANGE_CONNECTORS.has(connector) && isNumber(tokens[index + 2])) {
        const end = tokens[index + 2];
        const from = Number(start);
        const to = Number(end);
        if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to < from || to - from + 1 > IMOB_MAX_UNITS_PER_BATCH) {
          result.invalidRanges.push(`${kind} ${start} a ${end}`);
        } else {
          for (let value = from; value <= to; value += 1) add(kind, padLike(start, value));
        }
        index += 3;
      } else {
        add(kind, start);
        index += 1;
      }
      continue;
    }
    if (kind && LIST_CONNECTORS.has(token)) {
      index += 1;
      continue;
    }
    // Qualquer outra palavra encerra o grupo atual (ex.: "todas no mesmo endereço").
    kind = null;
    index += 1;
  }
  return result;
}

/** Reconhece SOMENTE expressão canônica completa. Não extrai significado de frases livres. */
export function parseCanonicalImobUnits(text: string | null | undefined): ImobParsedUnits | null {
  const raw = foldText(text ?? "");
  // Após caixa/acentos/espaços, só caracteres que o tokenizer consome integralmente.
  // Letras/números Unicode desconhecidos não podem desaparecer e transformar frase em expressão canônica.
  if (!raw || !/^[a-z0-9\s,;-]+$/.test(raw)) return null;
  const kind = `(?:${Object.keys(UNIT_KINDS).join("|")})`;
  const number = "\\d+(?: (?:a|ao|ate|-) \\d+)?";
  const group = `${kind} ${number}(?: (?:,|;|e) ${number})*`;
  if (!new RegExp(`^${group}(?: (?:,|;|e) ${group})*$`).test(tokenize(raw).join(" "))) return null;
  return parseImobUnits(raw);
}

/** Formas no plural da tabela de tipos acima: indício de que a pessoa quis dizer "várias". */
const PLURAL_UNIT_WORDS = new Set([
  "kitnets", "kitinetes", "salas", "aptos", "aps", "apartamentos", "lojas", "casas",
  "studios", "estudios", "conjuntos", "boxes", "galpoes", "coberturas", "unidades",
]);

/**
 * Indício claro de VÁRIAS unidades na entrada, independente do que `parseImobUnits` conseguiu ler:
 * uma faixa ("102 a 104") ou uma palavra de unidade no plural com dois ou mais números.
 * Serve para falhar fechado quando há indício de lote mas o parser não achou 2+ unidades
 * (ex.: "Kitnets TESTE 102 a 104"). Uma unidade singular ("Kit IC 1730", "Apto 301 bloco B") não dispara.
 * Não interpreta nem inventa unidades.
 */
export function looksLikeMultipleUnits(text: string | null | undefined): boolean {
  if (!text) return false;
  const tokens = tokenize(text);
  const numbers = tokens.filter((token) => isNumber(token)).length;
  const hasRange = tokens.some(
    (token, index) => RANGE_CONNECTORS.has(token) && isNumber(tokens[index - 1]) && isNumber(tokens[index + 1]),
  );
  const hasPlural = tokens.some((token) => PLURAL_UNIT_WORDS.has(token));
  return hasRange || (hasPlural && numbers >= 2);
}

/** Lista canônica, reaproveitável como valor de campo e re-interpretável por `parseImobUnits`. */
export function formatImobUnitList(units: Array<Pick<ImobParsedUnit, "label">>) {
  return units.map((unit) => unit.label).join(", ");
}
