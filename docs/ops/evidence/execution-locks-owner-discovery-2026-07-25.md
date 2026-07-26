# Execution locks owner discovery — entrega 3, fatia 1/6

| Campo | Valor |
| --- | --- |
| Data da execução | `2026-07-26` |
| Baseline | `main@eba88a218ce5ec6471508230f736d69709e7b354` |
| Escopo | `RunExecutionLock` / `run_execution_locks` |
| Ambiente observado | repositório local; sem staging/produção |
| Resultado | `owner-deferred` |
| Melhor achado | `existing-service-candidate` |

## Limite e método

- A descoberta foi somente leitura em código, documentação, schema e histórico
  de migrations; o dump SQL não foi aberto.
- As buscas canônicas usaram fontes versionadas e excluíram `dist`,
  `node_modules`, Prisma gerado e o dump SQL.
- Nomes genéricos foram tratados como colisões conceituais. Schema e migrations
  materializam o contrato, mas não provam uso runtime nem atribuição de owner.
- A classificação de agente exigiu cumulativamente nome/AgentId estável, escopo,
  policy/RBAC, trilha auditável, limite de autoridade e escalação humana.

## Code discovery — execution locks

| Busca | Resultado | Classificação | EvidenceRef | Observação |
| --- | --- | --- | --- | --- |
| `RunExecutionLock`, `run_execution_locks`, `execution lock`, `execution-lock` em TypeScript canônico | `0` arquivos fora de schema/migrations/docs | `no-existing-owner` para uso do contrato DB | `{ artifactId: EXLOCK-DB-RUNTIME-20260726, location: main@eba88a218ce5ec6471508230f736d69709e7b354, hash: aa34ee881077af5d9f26239cf123d2f749e234fa1e8d5e23aef60087d1dd0e55 }` | O hash é de `packages/db/prisma/schema.prisma`; a busca reproduz a ausência de client/model/table no runtime, sem converter grep negativo em prova de desuso. |
| `Run Governance Agent`, `RunGovernance`, `runner guardian`, `run guardian`, `governance agent` nos agentes, services e workers canônicos | `0` candidatos formais; `RunGovernance` fora desse escopo é nome de consulta/API de apresentação | `no-existing-owner` para agente formal | `{ artifactId: EXLOCK-AGENT-REGISTRY-20260726, location: packages/core/src/actions/agents/registry.ts@eba88a218ce5ec6471508230f736d69709e7b354, hash: d2ae2f1ed360ac5d79f2ac264d1e7088d99fa6ff8f017b08e76331f37f975d6b }` | Nenhum perfil registrado declara custódia de execution locks ou do contrato DB. |
| `flow-orchestrator` | Agente estável, mas restrito a fluxos DeFi multi-chain; não possui tools nem escopo de execution locks | `no-existing-owner` para este domínio | `{ artifactId: EXLOCK-FLOW-ORCHESTRATOR-20260726, location: packages/core/src/actions/agents/flowOrchestratorAction.ts@eba88a218ce5ec6471508230f736d69709e7b354, hash: 9e8958e40a50b6b51eb636f248c0f0ced3e778fdfa0af403d3f8ec5fe1a3a3ba }` | O nome “orchestrator” isolado não satisfaz escopo, autoridade ou delegação sobre locks. |
| `guardian`, ledger, receipt e evidenceRef | Guardian é agente formal de evidências/verificabilidade e fail-closed, mas seu contrato não atribui monitoramento ou custódia de execution locks | `no-existing-owner` para este domínio | `{ artifactId: EXLOCK-GUARDIAN-20260726, location: packages/core/src/actions/agents/guardianAction.ts@eba88a218ce5ec6471508230f736d69709e7b354, hash: 765f1ae14b2542979dd1b6adf2657408869d58cc82635c12a8ed0f6e85f6df27 }` | Trilha auditável genérica não equivale a autoridade operacional sobre o contrato. |
| `lease`, `leases`, `duplicateSideEffects`, `runWorker`, `maintenance-worker` | Existe `workerOwnershipLease`: acquire Redis `SET NX PX`, renew/release por Lua CAS e fechamento fail-closed; integrado à API, run-worker e maintenance-worker | `existing-service-candidate` | `{ artifactId: EXLOCK-WORKER-LEASE-20260726, location: packages/core/src/queue/workerOwnershipLease.ts@eba88a218ce5ec6471508230f736d69709e7b354, hash: dc243c73303fc5af609b2506b7a69edbde0c0815d9ceece3a503c6ad5eac5f86 }` | É o candidato técnico mais próximo, porém protege fila por `(environmentId, queue)`, não lock por `(tenantId, workspaceId, runId)`, e não usa a tabela Prisma. |
| Topologia, policy gate e limite operacional do lease | Matriz versionada define os serviços consumidores e o lease obrigatório antes de iniciar consumidor crítico | `existing-service-candidate` | `{ artifactId: EXLOCK-WORKER-TOPOLOGY-20260726, location: docs/architecture/worker-topology.md@eba88a218ce5ec6471508230f736d69709e7b354, hash: 231fef55c85d20cc77ab6e9908cf78dc8d4ce640b3fb1083d59bb1ef52975a0c }` | A policy é de topology/queue ownership; não registra owner humano do contrato `RunExecutionLock`. |
| Evidência de lease e duplicidade | Teste local-docker previamente versionado registra `tests 10 / pass 10 / fail 0`, `acquiredCount=1`, `sideEffectCount=1`, `duplicateSideEffects=0` | `existing-service-candidate` | `{ artifactId: EXLOCK-WORKER-LEASE-RUNTIME-20260701, location: ops/evidence/latest/p0-b2-redis-ownership-runtime-2026-07-01.md@eba88a218ce5ec6471508230f736d69709e7b354, hash: be55849f88ccaa13f3e483eebe1c62434aace50f25609579f8f7a411f0918852 }` | Evidência local real do serviço Redis; não é staging/prod e não prova wiring ou owner do contrato DB. |
| Histórico do contrato e do lease | `RunExecutionLock` entrou por commits DB históricos; o lease Redis entrou separadamente em `5da397e` | `existing-service-candidate` com contratos distintos | `{ artifactId: EXLOCK-HISTORY-20260726, location: git-log@eba88a218ce5ec6471508230f736d69709e7b354, hash: dc243c73303fc5af609b2506b7a69edbde0c0815d9ceece3a503c6ad5eac5f86 }` | Não foi localizada unificação histórica entre a tabela por run e o lease por fila. |
| Atribuição/ratificação humana para execution locks | Nenhuma atribuição versionada ou ratificação explícita localizada | `owner-deferred` | `{ artifactId: EXLOCK-LIFECYCLE-DECISION-20260725, location: docs/ops/evidence/db-contract-lifecycle-decisions-2026-07-25.md@eba88a218ce5ec6471508230f736d69709e7b354, hash: ca24c1600c536d0a1c173f7ed949967105a0023c8e82f4ba9c29892b7bcb34c8 }` | A entrega 2 já registra owner não atribuído e exige owner de execução + mapa de lease/lock. |

## Decisão

| Item | Domínio | Autoridade final | Owner operacional delegado | OwnerStatus | Classificação | Limite | Próxima ação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RunExecutionLock` / `run_execution_locks` | execution locks + tenant/workspace | Carlos Alberto Merlo | não confirmado | `owner-deferred` | `existing-service-candidate` — `workerOwnershipLease` é referência técnica, não owner delegado | Não apagar contrato DB, não alterar política e não executar ação sensível sem aprovação humana explícita de Carlos Alberto Merlo. | Carlos Alberto Merlo deve ratificar um owner operacional; depois, o owner deve decidir e evidenciar se a tabela terá wiring com o serviço de lease, suporte legado ou fluxo futuro de sunset. |

## Conclusão

Não existe `Run Governance Agent` formal nem outro agente registrado com
evidência cumulativa suficiente para ser recomendado como owner operacional
delegado deste domínio. Existe um serviço técnico próximo e ativo,
`workerOwnershipLease`, por isso o melhor achado é
`existing-service-candidate`. A diferença de granularidade e persistência
impede tratá-lo como wiring da tabela ou delegação de owner.

Sem owner formalmente confirmado e sem ratificação explícita de Carlos Alberto
Merlo, o estado final obrigatório permanece `owner-deferred`; o lifecycle de
`RunExecutionLock` continua `needs-human-decision`.

## Pendências fora desta fatia

- Entrega 3, fatias 2–6: RBAC, wallet/identity, connectors, agent installs e
  tenant custom roles.
- Dump `AR-002`: permanece `defer-with-blocker`.
- Staging/produção: não observados e não declarados fechados.

## Controles desta execução

- Agentes novos: `0`.
- Alterações em schema/migrations/runtime/dump: `0`.
- DROP ou migration destrutiva: `0`.
- `.env` ou secrets tocados: `0`.
- Push: `0`.
