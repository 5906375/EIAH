/**
 * Encerramento controlado do processo da API (SIGTERM/SIGINT).
 *
 * Fases executadas em ordem; tarefas da mesma fase rodam em paralelo:
 *   1. http        — para de aceitar conexões e aguarda as requisições em andamento;
 *   2. consumers   — fecha consumidores de fila (aguardam os jobs ativos) e só então libera leases;
 *   3. schedulers  — para os timers de workers periódicos;
 *   4. connections — fecha clientes Redis/Prisma.
 *
 * Prazo explícito: se as fases não terminarem em `timeoutMs`, executa `onDeadline` e sai com 1.
 * Falha em qualquer tarefa não interrompe as demais; ao final sai com 1. Sucesso: sai com 0.
 * Sinal repetido durante o encerramento força a saída imediata com 1.
 *
 * Sem um listener próprio, o Node como PID 1 de um container ignora SIGTERM (o kernel descarta a
 * ação padrão reenviada pelo handler interno do Node) e o processo só termina por SIGKILL.
 */

export const SHUTDOWN_PHASES = ["http", "consumers", "schedulers", "connections"] as const;
export type ShutdownPhase = (typeof SHUTDOWN_PHASES)[number];

export type ShutdownTask = {
  name: string;
  phase: ShutdownPhase;
  run: () => Promise<void> | void;
};

type ShutdownLogger = {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
};

type SignalSource = {
  on: (signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void) => unknown;
};

export type ShutdownCoordinatorDeps = {
  logger: ShutdownLogger;
  exit: (code: number) => void;
  timeoutMs: number;
  /** Chamado uma vez quando o prazo expira, antes de sair (ex.: derrubar conexões HTTP restantes). */
  onDeadline?: () => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
};

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 25_000;

export function resolveShutdownTimeoutMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const value = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
  if (!Number.isInteger(value) || value < 1_000 || value > 300_000) {
    throw new Error(`API_SHUTDOWN_TIMEOUT_MS must be an integer between 1000 and 300000, got "${raw}"`);
  }
  return value;
}

export function createShutdownCoordinator(deps: ShutdownCoordinatorDeps) {
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as NodeJS.Timeout));
  const now = deps.now ?? Date.now;
  const tasks: ShutdownTask[] = [];
  let shuttingDown = false;
  let exited = false;
  let completion: Promise<void> | null = null;

  const exitOnce = (code: number) => {
    if (exited) return;
    exited = true;
    deps.exit(code);
  };

  function register(task: ShutdownTask) {
    if (shuttingDown) {
      // Recurso criado depois do início do encerramento: ainda precisa ser fechado.
      void Promise.resolve()
        .then(task.run)
        .catch((err: unknown) => deps.logger.error({ task: task.name, phase: task.phase, err }, "api.shutdown_task_failed"));
      return;
    }
    tasks.push(task);
  }

  async function runPhases(): Promise<boolean> {
    let ok = true;
    for (const phase of SHUTDOWN_PHASES) {
      const phaseTasks = tasks.filter((task) => task.phase === phase);
      if (phaseTasks.length === 0) continue;
      const started = now();
      const results = await Promise.allSettled(phaseTasks.map(async (task) => task.run()));
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          ok = false;
          deps.logger.error({ task: phaseTasks[index].name, phase, err: result.reason }, "api.shutdown_task_failed");
        }
      });
      deps.logger.info({ phase, tasks: phaseTasks.map((task) => task.name), durationMs: now() - started }, "api.shutdown_phase_completed");
    }
    return ok;
  }

  function shutdown(reason: string): Promise<void> {
    if (shuttingDown) {
      deps.logger.warn({ reason }, "api.shutdown_forced — repeated signal during shutdown");
      exitOnce(1);
      return completion ?? Promise.resolve();
    }
    shuttingDown = true;
    const started = now();
    deps.logger.info({ reason, timeoutMs: deps.timeoutMs }, "api.shutdown_started");

    const deadline = setTimer(() => {
      deps.logger.error({ reason, timeoutMs: deps.timeoutMs }, "api.shutdown_deadline_exceeded");
      try {
        deps.onDeadline?.();
      } catch (err) {
        deps.logger.error({ err }, "api.shutdown_on_deadline_failed");
      }
      exitOnce(1);
    }, deps.timeoutMs);

    completion = runPhases()
      .catch((err: unknown) => {
        deps.logger.error({ err }, "api.shutdown_unexpected_error");
        return false;
      })
      .then((ok) => {
        clearTimer(deadline);
        deps.logger.info({ reason, ok, durationMs: now() - started }, "api.shutdown_completed");
        exitOnce(ok ? 0 : 1);
      });
    return completion;
  }

  function installSignalHandlers(source: SignalSource, signals: NodeJS.Signals[] = ["SIGTERM", "SIGINT"]) {
    for (const signal of signals) {
      source.on(signal, () => void shutdown(signal));
    }
  }

  return {
    register,
    shutdown,
    installSignalHandlers,
    isShuttingDown: () => shuttingDown,
  };
}

export type ShutdownCoordinator = ReturnType<typeof createShutdownCoordinator>;

type ClosableHttpServer = {
  close: (callback: (err?: Error) => void) => unknown;
  closeIdleConnections?: () => void;
  closeAllConnections?: () => void;
};

/** Fecha o servidor HTTP: recusa novas conexões e resolve quando as requisições em andamento terminarem. */
export function closeHttpServer(server: ClosableHttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err && (err as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") reject(err);
      else resolve();
    });
    server.closeIdleConnections?.();
  });
}

/**
 * Drena o servidor HTTP por no máximo `drainMs`. Conexões que não terminam nesse prazo (ex.: SSE,
 * keep-alive ocupado) são derrubadas para que as fases seguintes não fiquem bloqueadas.
 * Resolve `true` quando todas terminaram sozinhas.
 */
export async function drainHttpServer(
  server: ClosableHttpServer,
  drainMs: number,
  logger: Pick<ShutdownLogger, "warn">,
): Promise<boolean> {
  const closed = closeHttpServer(server);
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), drainMs);
  });
  const outcome = await Promise.race([closed.then(() => "closed" as const), timedOut]);
  clearTimeout(timer);
  if (outcome === "closed") return true;
  logger.warn({ drainMs }, "api.shutdown_http_drain_timeout — closing remaining connections");
  server.closeAllConnections?.();
  await closed;
  return false;
}

/** Prazo da fase HTTP: metade do prazo total, para sobrar tempo às demais fases. */
export function resolveHttpDrainMs(timeoutMs: number): number {
  return Math.floor(timeoutMs / 2);
}
