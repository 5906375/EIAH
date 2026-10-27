// Processo-fixture do teste graceful-shutdown: servidor HTTP real + coordenador de encerramento.
// GET /slow responde após SLOW_MS; /fast responde na hora. Escreve "READY <port>" no stdout.
import http from "node:http";
import process from "node:process";
import { closeHttpServer, createShutdownCoordinator } from "../../services/gracefulShutdown";

const slowMs = Number(process.env.SLOW_MS ?? 600);
const events: string[] = [];
const logger = {
  info: (_obj: Record<string, unknown>, msg: string) => events.push(msg),
  warn: (_obj: Record<string, unknown>, msg: string) => events.push(msg),
  error: (_obj: Record<string, unknown>, msg: string) => events.push(msg),
};

const server = http.createServer((req, res) => {
  const delay = req.url === "/slow" ? slowMs : 0;
  setTimeout(() => res.end("ok"), delay);
});

const coordinator = createShutdownCoordinator({
  logger,
  timeoutMs: Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 5_000),
  onDeadline: () => server.closeAllConnections(),
  exit: (code) => {
    process.stdout.write(`EVENTS ${events.join(",")}\n`);
    process.exit(code);
  },
});
coordinator.installSignalHandlers(process);
coordinator.register({ name: "http-server", phase: "http", run: () => closeHttpServer(server) });
coordinator.register({
  name: "slow-consumer",
  phase: "consumers",
  run: () => new Promise((resolve) => setTimeout(resolve, Number(process.env.CONSUMER_MS ?? 0))),
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  process.stdout.write(`READY ${typeof address === "object" && address ? address.port : 0}\n`);
});
