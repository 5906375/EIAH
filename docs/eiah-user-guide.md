# Guia do Usuario EIAH Builder

Guia de referencia rapida para operadores, product managers e desenvolvedores que utilizam a plataforma EIAH Builder. Resume como autenticar, executar runs, acompanhar resultados e acionar funcionalidades adjacentes (billing, memoria, workers).

## 1. Componentes principais
- **API HTTP (`apps/api`)**: Express multi-tenant com rotas de runs, billing, agents, defi e uploads. Requer tokens registrados no Prisma.
- **Orquestrador (`packages/core/orchestrator`)**: AgentOrchestrator executa ciclos perceive/plan/act/reflect, publica RunEvents e coordena execucao de acoes.
- **Fila de runs (`packages/core/queue/runQueue.ts`)**: Encapsula BullMQ para orquestrar execucoes assinc cronologicas.
- **Fila de acoes (`packages/core/queue/actionQueue.ts`)** e **worker de acoes (`apps/workers/action-runner`)**: tratam steps que dependem de ferramentas especializadas (DeFi, notificacoes, billing).
- **Motor de recomendacoes (`packages/core/recommendations`)**: gera planos otimizados com base em feedback historico e estado persistido.
- **Frontend (`apps/web`)**: dashboards de runs, agents e billing com store multi-tenant. Paginas self-service geram prompts guiados.
- **Banco (`apps/api/prisma`)**: schema multi-tenant com Run, RunEvent, AgentProfile, Pricing, PlanQuota, AgentRecommendationState e UploadedDocument.

## 2. Autenticacao e contexto
1. Gere tokens com `pnpm tsx apps/api/scripts/createApiToken.ts`.
2. Cada requisicao deve enviar:
   - `Authorization: Bearer <token>`
   - `x-tenant-id` e `x-workspace-id` (se usar cliente HTTP; no frontend esses cabecalhos sao configurados por `sessionStore`).
3. O middleware `enforceTenant` valida expiracao, escopo e injeta `authContext` com tenant/workspace/user.

## 3. Executando runs via API
1. Endpoint: `POST /api/runs`.
2. Payload:
   ```json
   {
     "agent": "EIAH",
     "prompt": "Resuma o estado atual das filas agenticas.",
     "metadata": { "cliente": "demo", "prioridade": "alta" }
   }
   ```
3. Response `202` indica enfileiramento. Campos relevantes:
   - `id`: identificador do run.
   - `status`: `pending` ate que worker finalize.
4. Eventos:
   - `GET /api/runs/:id` retorna estado atual.
   - `GET /api/runs/:id/events` lista cronologia de RunEvents (planos, actions, conclusao).
5. Sistema de cobranca:
   - `estimateCostCents` calcula custo antes da execucao.
   - `chargeRun` debita o workspace ao final.

## 4. Fluxo interno do worker
1. `runWorker` consome fila `agent-run-executions`.
2. Carrega `AgentProfile`, historico de runs (`listRecentRunsForAgent`) e estado de recomendacoes (`getAgentRecommendationState`).
3. Monta prompt contextual enriquecendo com historico e estado.
4. Orquestrador gera plano:
   - Steps com `action` -> `publishAction` => worker de acoes aguarda `job.waitUntilFinished`.
   - Steps sem `action` -> `simpleExecuteAgentRun` chama modelo OpenAI.
5. Ao final:
   - `generateStatefulRecommendations` ajusta output.
   - `finalizeRunRecord` salva resposta estruturada (`plan`, `outputs`, `memory`).
   - RunEvents registrados para cada etapa (`run.step.*`, `run.action.*`, `run.completed`).

## 5. Dashboard web (`/app/runs`)
- Apresenta cards com runs recentes, resumo de sucesso/erro e custos.
- Permite enviar prompts diretamente, com guia onboarding (videos, REST, SDK, low-code).
- `RunViewer` mostra eventos em tempo real (polling a cada 3s quando `pending/running/blocked`).
- Download de JSON/PDF do run e exibicao de outputs estruturados.

## 6. Paginas self-service (`/self-service`)
- Configuracoes em `apps/web/src/pages/self-service/config.ts`.
- Agentes disponiveis:
  - `MKT`: briefing de campanha (landing, email, chatbot).
  - `J_360`: diagnostico 360 com recomendacoes priorizadas.
  - `flow-orchestrator`: plano de execucao DeFi com guardrails.
  - `risk-analyzer`: checklist de risco/compliance.
- Cada fluxo coleta dados no front, constroi prompt e chama `POST /runs` com `metadata` enriquecida.

## 7. Billing e quotas
- `GET /api/billing/estimate` (ver `runsRouter`) usa tabelas `Pricing` e `PlanQuota`.
- Acoes do modulo `packages/core/actions/billing.ts` permitem criar planos white-label e registrar auditoria (fila de actions).
- KPIs monitorados: total de runs, custo por agente, uso por workspace (consultar views do Prisma ou montar queries customizadas).

## 8. Memoria
- `packages/core/memory` define interfaces short-term, long-term e vetor.
- Implementacoes atuais sao in-memory; roadmap inclui conectar Redis/Postgres e vector store.
- `MemoryService` pode ser plugado ao Orchestrator para carregar contexto antes de planejar passos.

## 9. Seguranca e governanca
- Tokens por workspace/tenant com suporte a expiracao/rotacao (implementar via secret manager).
- RBAC planejado acima de `ApiToken`.
- Guardrails de acoes (rate limit, idempotencia) protegem chamadas sensiveis.
- Dados sensiveis devem ser mascarados antes de registrar em eventos (TODO em `runWorker`).

## 10. Observabilidade
- Estruturar logs com `ConsoleTelemetryBridge` e, futuramente, pino/winston.
- Integrar OpenTelemetry para latencia de run, backlog de filas, erros por agente.
- Health-check `/health` verifica apenas API; extender para Redis, fila e dependencias externas.

## 11. Troubleshooting rapido
- **Run travado em pending**: verificar se worker esta rodando (`RUN_QUEUE_WORKER`), se Redis esta acessivel e se ha eventos `run.action.failed`.
- **Action falhando**: consultar `apps/workers/action-runner` logs; verificar guardrails de idempotencia/rate limit.
- **Custo zerado**: confirma se `estimateCostCents` recebeu ferramentas do perfil.
- **Token invalido**: rodar script de criacao novamente e conferir tenant/workspace enviados no header.

## 12. Recursos adicionais
- `infra-overview.html`: mapa interativo dos componentes.
- `architecture-future.txt`: roadmap de evolucao agentica, memoria e observabilidade.
- `docs/self-service-agent-forms.md`: referencia original dos formularios self-service.
- `apps/api/prisma/seed.ts`: base para reproduzir ambiente demo.

Mantido pela equipe EIAH. Sugestoes ou duvidas: registre um run para o agente EIAH com assunto "Feedback do Guia do Usuario".
