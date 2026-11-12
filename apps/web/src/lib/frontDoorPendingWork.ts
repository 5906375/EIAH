import { useMemo, useRef, useSyncExternalStore } from "react";

/**
 * Trabalho pendente compartilhado do Front Door (`/app/chat`): estado de apresentação da espera por qualquer solicitação
 * (mensagem, quick reply, ação, formulário, reivindicação, avaliação de handoff), independente de agente ou vertical.
 *
 * Cada solicitação tem identidade própria (`begin()` devolve o `end` dela) e vale só para a conversa (escopo) em que nasceu:
 *  - uma terminar não oculta outra pendente (conta-se o que está pendente, não só a mais nova);
 *  - ao trocar de conversa, as solicitações da anterior deixam de contar na hora, e o fim tardio delas não afeta a atual;
 *  - `end` é idempotente. Nada aqui usa timer nem deduz espera por texto ou quantidade de mensagens.
 */
export type PendingTrack = <R>(work: () => Promise<R>) => Promise<R>;

export function createPendingWorkTracker(getScope: () => string) {
  let sequence = 0;
  const items = new Map<number, string>();
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };

  /** Escopo (conversa) atual. Quem continua um trabalho mais tarde captura o de origem e o repassa a `begin`. */
  const currentScope = () => getScope();

  /** `origin`: escopo em que a solicitação nasceu (padrão: o atual). Uma continuação tardia de outra conversa nasce já fora do escopo atual. */
  function begin(origin: string = getScope()): () => void {
    // Solicitações de conversas anteriores nunca mais valem: sai do estado sem tocar nas da conversa atual.
    const current = getScope();
    for (const [id, itemScope] of items) if (itemScope !== current) items.delete(id);
    const id = ++sequence;
    items.set(id, origin);
    emit();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      if (items.delete(id)) emit();
    };
  }

  const track: PendingTrack = (work) => {
    const end = begin();
    try {
      return work().finally(end);
    } catch (error) {
      end();
      return Promise.reject(error);
    }
  };

  /** Quantas solicitações estão pendentes NA conversa atual. */
  function pendingCount(): number {
    const scope = getScope();
    let count = 0;
    for (const itemScope of items.values()) if (itemScope === scope) count += 1;
    return count;
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  return { begin, track, pendingCount, subscribe, scope: currentScope };
}

export type PendingWorkTracker = ReturnType<typeof createPendingWorkTracker>;

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";

/** Envolve os métodos que devolvem promessa (formulários, ações): cada chamada assíncrona vira trabalho pendente; as síncronas passam direto. */
export function trackAsyncMethods<T extends object>(target: T, track: PendingTrack): T {
  const wrapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(target)) {
    if (typeof value !== "function") { wrapped[key] = value; continue; }
    wrapped[key] = (...args: unknown[]) => {
      const result = (value as (...inner: unknown[]) => unknown).apply(target, args);
      return isPromiseLike(result) ? track(() => Promise.resolve(result)) : result;
    };
  }
  return wrapped as T;
}

/**
 * Acompanha a decisão do turno desde o início da cadeia até ela chegar (inclui a avaliação do handoff, ativação, cobrança e reivindicação). Se a decisão
 * encaminha o pedido adiante (`verticalHandoffForwardInput`, genérico, sem nome de vertical), a espera passa SEM intervalo para
 * `handover`, liberada pelo chamador depois que o encaminhamento é disparado: as mensagens intermediárias (aviso de handoff,
 * card de contexto) não encerram o trabalho que continua pendente.
 */
export async function trackDecision<D extends { verticalHandoffForwardInput?: string } | null | undefined>(
  tracker: Pick<PendingWorkTracker, "begin" | "scope">,
  handover: { release: () => void },
  decide: () => Promise<D>,
): Promise<D> {
  // A espera começa ANTES de a decisão ser computada (`decide` é chamada depois do begin): nada da cadeia fica fora do estado de espera.
  // A ponte nasce no escopo de ORIGEM do turno: se a conversa mudou enquanto a decisão era computada, a ponte já nasce fora da conversa atual.
  const origin = tracker.scope();
  const end = tracker.begin(origin);
  try {
    const resolved = await decide();
    if (resolved?.verticalHandoffForwardInput) handover.release = tracker.begin(origin);
    return resolved;
  } finally {
    end();
  }
}

/**
 * Há espera a mostrar? Trabalho pendente, ou um run em andamento ainda sem resposta aparecendo. Um run que já está exibindo
 * texto em streaming deixa de mostrar a espera (a transição para o streaming); o trabalho pendente rastreado continua
 * mostrando mesmo com mensagens intermediárias em digitação.
 */
export function isFrontDoorWaiting(state: { pendingCount: number; isStreaming: boolean; hasStreamingMessage: boolean }): boolean {
  return state.pendingCount > 0 || (state.isStreaming && !state.hasStreamingMessage);
}

/**
 * Chave de escopo para o que a geração da conversa NÃO cobre (ex.: usuário, sessão, agente). Cada dimensão separa três situações:
 *  - hidratação (ausente → definido, 1ª vez): NÃO muda a chave, para não esconder a solicitação que acabou de começar;
 *  - troca real (definido → outro valor definido): muda a chave;
 *  - remoção/invalidação (definido → ausente, ex.: logout, usuário removido): muda a chave e esquece o valor, então o que vier depois é hidratação NOVA.
 * A chave só avança (nunca repete): voltar ao contexto anterior não ressuscita pendências de antes. O store de sessão não expõe estado de
 * carregamento, então definido → ausente não é tratado como espera transitória. Quem chama passa só sinais já existentes (userId, presença de token…).
 */
export function createScopeKeyer() {
  const known = new Map<string, string>();
  let epoch = 0;
  return (dimensions: Record<string, string | null | undefined>): string => {
    for (const [name, value] of Object.entries(dimensions)) {
      const previous = known.get(name);
      if (!value) {
        if (previous !== undefined) { known.delete(name); epoch += 1; }
        continue;
      }
      if (previous !== undefined && previous !== value) epoch += 1;
      known.set(name, value);
    }
    return String(epoch);
  };
}

/** Tracker estável por componente; `getScope` identifica a conversa atual (geração, tenant, workspace, usuário e agente). */
export function useFrontDoorPendingWork(getScope: () => string) {
  const scopeRef = useRef(getScope);
  scopeRef.current = getScope;
  const tracker = useMemo(() => createPendingWorkTracker(() => scopeRef.current()), []);
  const pendingCount = useSyncExternalStore(tracker.subscribe, tracker.pendingCount, tracker.pendingCount);
  return { tracker, pendingCount };
}
