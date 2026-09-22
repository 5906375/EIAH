/* eslint-disable no-console */
// Radar Social — inicialização LOCAL mínima da API para a demonstração
// interna. Monta exatamente o mesmo `radarSocialRouter` de produção
// (apps/api/src/routes/radarSocial.ts) com o mesmo `enforceTenant`,
// `requireScope` e `governedErrorHandler` já usados em toda a aplicação —
// nenhuma lógica nova, nenhum bypass, nenhum atalho de autenticação.
//
// Por que não `apps/api/src/index.ts` diretamente: seu `app.listen(...)`
// só é alcançado quando `NODE_ENV !== "test"`, e esse mesmo caminho exige
// `resolveWorkerTopology` (EIAH_ENVIRONMENT_ID, SERVICE_ROLE e outras
// variáveis de topologia operacional), inicia o worker de fila de Runs, o
// reconciliador de billing e outros processos de fundo — infraestrutura
// operacional inteira, fora do escopo desta demonstração ("fila/worker
// operacional" e "provisionamento operacional" seguem excluídos). Com
// `NODE_ENV=test`, esse bloco inteiro (incluindo o próprio `app.listen`) é
// pulado, então a aplicação principal nunca abre uma porta real nesse modo.
// Este script evita as duas armadilhas: nenhum worker/fila é iniciado, e a
// API abre uma porta real para o navegador acessar.
import "dotenv/config";
import cors from "cors";
import express from "express";
import { radarSocialRouter } from "../src/routes/radarSocial";
import { governedErrorHandler } from "../src/middlewares/governedErrorHandler";
import { isRadarSocialDemoModeSyncEnabled } from "../src/routes/radarSocialDemoGate";

if (!isRadarSocialDemoModeSyncEnabled()) {
  console.error(
    "RADAR_DEMO_MODE/NODE_ENV/RADAR_DEMO_DB_MARKER não satisfazem a condição de habilitação — recusando iniciar. " +
      "Defina RADAR_DEMO_MODE=1, NODE_ENV=development (ou test) e RADAR_DEMO_DB_MARKER antes de rodar este script."
  );
  process.exit(1);
}

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.get("/api/health", (_req, res) => res.json({ ok: true, scope: "radar-social-demo-only" }));
app.use("/api/radar", radarSocialRouter);
app.use(governedErrorHandler);

const port = Number(process.env.PORT || 58080);
// Loopback explícito — sem isso, app.listen(port) do Express liga em todas
// as interfaces (0.0.0.0), o que violaria "sem exposição pública" desta
// demonstração.
app.listen(port, "127.0.0.1", () => {
  console.log(JSON.stringify({ event: "radar-demo-api.started", port, host: "127.0.0.1" }));
});
