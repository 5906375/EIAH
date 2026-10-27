import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  closeHttpServer,
  createShutdownCoordinator,
  drainHttpServer,
  resolveHttpDrainMs,
  resolveShutdownTimeoutMs,
} from "../services/gracefulShutdown";

// Encerramento controlado da API: coordenador puro (fases, prazo, falhas, sinais repetidos) e um
// processo real que recebe SIGTERM com requisição em andamento. Sem Postgres/Redis.

function harness(timeoutMs = 1_000) {
  const log: string[] = [];
  const exits: number[] = [];
  const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
  let deadlineHits = 0;
  const coordinator = createShutdownCoordinator({
    logger: {
      info: (_o, msg) => log.push(msg),
      warn: (_o, msg) => log.push(msg),
      error: (_o, msg) => log.push(msg),
    },
    exit: (code) => exits.push(code),
    timeoutMs,
    onDeadline: () => {
      deadlineHits += 1;
    },
    setTimer: (fn, ms) => {
      const timer = { fn, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      (handle as { cleared: boolean }).cleared = true;
    },
  });
  return { coordinator, log, exits, timers, deadlineHits: () => deadlineHits };
}

test("fases rodam em ordem (http → consumers → schedulers → connections) e o processo sai com 0", async () => {
  const { coordinator, exits, timers } = harness();
  const order: string[] = [];
  coordinator.register({ name: "db", phase: "connections", run: () => void order.push("connections") });
  coordinator.register({ name: "timer", phase: "schedulers", run: () => void order.push("schedulers") });
  coordinator.register({ name: "worker", phase: "consumers", run: async () => void order.push("consumers") });
  coordinator.register({ name: "server", phase: "http", run: async () => void order.push("http") });

  await coordinator.shutdown("SIGTERM");

  assert.deepEqual(order, ["http", "consumers", "schedulers", "connections"]);
  assert.deepEqual(exits, [0]);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 1_000);
  assert.equal(timers[0].cleared, true, "o prazo é cancelado quando o encerramento termina");
});

test("tarefas da mesma fase rodam em paralelo; a fase seguinte só começa depois delas", async () => {
  const { coordinator } = harness();
  const events: string[] = [];
  let releaseA!: () => void;
  coordinator.register({ name: "a", phase: "consumers", run: () => new Promise<void>((resolve) => { events.push("a:start"); releaseA = () => { events.push("a:end"); resolve(); }; }) });
  coordinator.register({ name: "b", phase: "consumers", run: async () => void events.push("b:run") });
  coordinator.register({ name: "c", phase: "connections", run: async () => void events.push("c:run") });

  const done = coordinator.shutdown("SIGTERM");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["a:start", "b:run"], "b não espera a; c ainda não começou");
  releaseA();
  await done;
  assert.deepEqual(events, ["a:start", "b:run", "a:end", "c:run"]);
});

test("falha em uma tarefa não interrompe as demais e o processo sai com 1", async () => {
  const { coordinator, exits, log } = harness();
  const ran: string[] = [];
  coordinator.register({ name: "broken", phase: "consumers", run: async () => { throw new Error("boom"); } });
  coordinator.register({ name: "ok", phase: "consumers", run: async () => void ran.push("ok") });
  coordinator.register({ name: "db", phase: "connections", run: async () => void ran.push("db") });

  await coordinator.shutdown("SIGTERM");

  assert.deepEqual(ran, ["ok", "db"]);
  assert.deepEqual(exits, [1]);
  assert.ok(log.includes("api.shutdown_task_failed"));
});

test("prazo estourado: chama onDeadline e sai com 1, sem sair de novo quando a tarefa termina depois", async () => {
  const { coordinator, exits, timers, deadlineHits, log } = harness(2_500);
  let release!: () => void;
  coordinator.register({ name: "stuck", phase: "consumers", run: () => new Promise<void>((resolve) => { release = resolve; }) });

  const done = coordinator.shutdown("SIGTERM");
  await new Promise((resolve) => setImmediate(resolve));
  timers[0].fn(); // o prazo expira

  assert.equal(deadlineHits(), 1);
  assert.deepEqual(exits, [1]);
  assert.ok(log.includes("api.shutdown_deadline_exceeded"));

  release();
  await done;
  assert.deepEqual(exits, [1], "exit é chamado uma única vez");
});

test("sinal repetido durante o encerramento força saída imediata com 1", async () => {
  const { coordinator, exits, log } = harness();
  let release!: () => void;
  coordinator.register({ name: "slow", phase: "consumers", run: () => new Promise<void>((resolve) => { release = resolve; }) });
  const source = new EventEmitter();
  coordinator.installSignalHandlers(source as unknown as NodeJS.Process);

  source.emit("SIGTERM", "SIGTERM");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(coordinator.isShuttingDown(), true);
  assert.deepEqual(exits, []);

  source.emit("SIGINT", "SIGINT");
  assert.deepEqual(exits, [1]);
  assert.ok(log.some((msg) => msg.startsWith("api.shutdown_forced")));

  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(exits, [1], "o término posterior não chama exit outra vez");
});

test("recurso registrado depois do início do encerramento é fechado imediatamente", async () => {
  const { coordinator } = harness();
  let release!: () => void;
  coordinator.register({ name: "slow", phase: "consumers", run: () => new Promise<void>((resolve) => { release = resolve; }) });
  const done = coordinator.shutdown("SIGTERM");

  let lateClosed = false;
  coordinator.register({ name: "late", phase: "consumers", run: async () => { lateClosed = true; } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(lateClosed, true);
  release();
  await done;
});

test("API_SHUTDOWN_TIMEOUT_MS: padrão quando ausente; inteiro entre 1000 e 300000; inválido falha fechado", () => {
  assert.equal(resolveShutdownTimeoutMs(undefined), DEFAULT_SHUTDOWN_TIMEOUT_MS);
  assert.equal(resolveShutdownTimeoutMs(""), DEFAULT_SHUTDOWN_TIMEOUT_MS);
  assert.equal(resolveShutdownTimeoutMs("15000"), 15_000);
  for (const bad of ["abc", "999", "300001", "1.5e3", "-1", "2500.5"]) {
    assert.throws(() => resolveShutdownTimeoutMs(bad), /API_SHUTDOWN_TIMEOUT_MS/);
  }
});

test("closeHttpServer aguarda a requisição em andamento e recusa conexões novas", async () => {
  const server = http.createServer((req, res) => setTimeout(() => res.end("done"), req.url === "/slow" ? 300 : 0));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };

  const inFlight = new Promise<{ status?: number; body: string }>((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: "/slow", agent: false }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    }).on("error", reject);
  });
  await new Promise((resolve) => setTimeout(resolve, 50));

  const closed = closeHttpServer(server);
  const refused = await new Promise<string>((resolve) => {
    http.get({ host: "127.0.0.1", port, path: "/fast", agent: false }, () => resolve("accepted")).on("error", (err: NodeJS.ErrnoException) => resolve(err.code ?? "error"));
  });

  assert.equal(refused, "ECONNREFUSED");
  assert.deepEqual(await inFlight, { status: 200, body: "done" });
  await closed;
});

test("drainHttpServer: conexão longa (SSE) é derrubada após o sub-prazo e não bloqueia as fases seguintes", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write("data: open\n\n"); // nunca termina
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  const streamEnded = new Promise<string>((resolve) => {
    http.get({ host: "127.0.0.1", port, path: "/events", agent: false }, (res) => {
      res.on("data", () => undefined);
      res.on("close", () => resolve("closed"));
    }).on("error", () => resolve("closed"));
  });
  await new Promise((resolve) => setTimeout(resolve, 50));

  const warned: string[] = [];
  const started = Date.now();
  const drained = await drainHttpServer(server, 300, { warn: (_o, msg) => warned.push(msg) });

  assert.equal(drained, false);
  assert.ok(Date.now() - started >= 250 && Date.now() - started < 2_000);
  assert.equal(await streamEnded, "closed");
  assert.ok(warned[0]?.startsWith("api.shutdown_http_drain_timeout"));
});

test("drainHttpServer: sem conexões pendentes resolve true sem esperar o sub-prazo; sub-prazo = metade do prazo", async () => {
  const server = http.createServer((_req, res) => res.end("ok"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const started = Date.now();
  assert.equal(await drainHttpServer(server, 5_000, { warn: () => undefined }), true);
  assert.ok(Date.now() - started < 1_000);
  assert.equal(resolveHttpDrainMs(25_000), 12_500);
});

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "support", "gracefulShutdownFixture.ts");

function startFixture(env: Record<string, string>) {
  const child = spawn(process.execPath, ["--import", "tsx", fixture], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  const ready = new Promise<number>((resolve, reject) => {
    const onData = () => {
      const match = /READY (\d+)/.exec(stdout);
      if (match) resolve(Number(match[1]));
    };
    child.stdout.on("data", onData);
    child.on("exit", (code) => reject(new Error(`fixture exited early with ${code}`)));
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: () => string }>((resolve) =>
    child.on("exit", (code, signal) => resolve({ code, signal, stdout: () => stdout })),
  );
  return { child, ready, exited };
}

function getSlow(port: number) {
  return new Promise<number | undefined>((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: "/slow", agent: false }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode));
    }).on("error", reject);
  });
}

test("processo real: SIGTERM com requisição em andamento termina a requisição e sai com 0", async () => {
  const { child, ready, exited } = startFixture({ SLOW_MS: "700" });
  const port = await ready;
  const inFlight = getSlow(port);
  await new Promise((resolve) => setTimeout(resolve, 100));

  const sentAt = Date.now();
  child.kill("SIGTERM");
  const result = await exited;

  assert.equal(await inFlight, 200, "a requisição iniciada antes do sinal foi respondida");
  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  assert.ok(Date.now() - sentAt < 5_000, "terminou antes do prazo");
  assert.match(result.stdout(), /api\.shutdown_started.*api\.shutdown_completed/);
});

test("processo real: segundo SIGTERM durante o encerramento força saída com 1", async () => {
  const { child, ready, exited } = startFixture({ CONSUMER_MS: "10000", SHUTDOWN_TIMEOUT_MS: "20000" });
  await ready;
  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 200));
  child.kill("SIGTERM");
  const result = await exited;
  assert.equal(result.code, 1);
  assert.match(result.stdout(), /api\.shutdown_forced/);
});

test("processo real: prazo estourado sai com 1 sem esperar a tarefa presa", async () => {
  const { child, ready, exited } = startFixture({ CONSUMER_MS: "60000", SHUTDOWN_TIMEOUT_MS: "1000" });
  await ready;
  const sentAt = Date.now();
  child.kill("SIGTERM");
  const result = await exited;
  const elapsed = Date.now() - sentAt;
  assert.equal(result.code, 1);
  assert.ok(elapsed >= 900 && elapsed < 5_000, `saiu no prazo (${elapsed}ms)`);
  assert.match(result.stdout(), /api\.shutdown_deadline_exceeded/);
});
