# MCP Contract v1

Status: MCP parcial avancado. Guard estatico de drift ativo desde MCP-1C. Este documento nao altera runtime, nao adiciona provider, nao cria run e nao declara MCP como fechado — apenas descreve o que ja existe e roda hoje.

## Contratos

- `ToolContract` (`packages/mcp-runner/src/types/ToolContract.ts`): `name`, `version`, `tenantId`, `inputSchema`/`outputSchema`, `executor`, `trustLevel`, `policyId?`, `limits?`, `metadata?`, `status?`.
- `executor` e um union de 4 modos: `"http" | "db" | "web3" | "fs"`.
- `MCPExecutor.run()` (`packages/mcp-runner/src/executor/MCPExecutor.ts`) despacha por `contract.executor` num `switch` com exatamente esses 4 casos. `execWeb3` lanca erro explicito de nao implementado; os outros tres executam de fato.

## Executor DB fail-closed (MCP-1L)

- A fonte declarativa e `packages/mcp-runner/src/executor/dbAllowlist.ts`.
- A allowlist de producao nasce vazia (deny-all), conforme inventario MCP-1K:
  o banco `eiah_builder` tinha zero `ToolContract`.
- Cada entrada aprovada declara `model`, `tenantField`, `workspaceField` e
  `readOnly: true`. Inclusoes exigem aprovacao explicita do operador.
- Modelo ausente falha antes do carregamento do Prisma com
  `DB_MODEL_NOT_ALLOWLISTED`.
- Para modelos tenantizados, `MCPExecutor` recebe o escopo autenticado do
  caller, rejeita qualquer valor divergente com `DB_SCOPE_VIOLATION` e injeta
  tenant/workspace no `where`. O filtro do contrato nunca prevalece sobre o
  escopo autenticado.
- Ausencia de escopo exigido falha com `DB_SCOPE_MISSING`.
- Modelo global somente pode executar se estiver explicitamente allowlisted e
  gera o evento de log `mcp.db.global_access`.
- `ToolRegistry.get()` e `ToolRegistry.list()` enxergam apenas contratos
  `active`; `list()` ordena por `name`, depois `version`.
- A migration versionada no MCP-1N declara unicidade de
  `(tenantId, name, version)`, independentemente de `status`. Essa propriedade
  somente é efetiva em cada ambiente após a aplicação da migration; este
  documento não comprova que ela tenha sido aplicada.

## Call sites conhecidos

- **Assincrono** (`apps/workers/action-runner/src/services/mcpAdapter.ts`, via BullMQ): a esteira de `apps/workers/action-runner/src/index.ts` aplica Intent Gate -> Trust Gate -> Judge Gate -> `executeWithMCP()` -> audit, nessa ordem, antes de qualquer execucao via MCP.
- **Sincrono** (`apps/api/src/workers/runWorker.ts`, ativo quando `MCP_PROXY_ALL_ACTIONS=true`): monta um `mcpExecutorTool` inline que verifica `MCP_ENFORCE_CONTRACTS`, allowlist de acao do tenant e assinatura de intencao (`verifyIntentSignature`) — mas **nao aplica Trust Gate nem Judge Gate** antes de chamar `MCPExecutor`. Essa divergencia entre os dois caminhos e conhecida e nao e resolvida por este documento nem pelo guard estatico atual.

## Fail-closed conhecido / parcial conhecido

- `MCP_ENFORCE_CONTRACTS=false` falha fechado nos dois call sites (erro explicito, sem bypass silencioso).
- `ToolContract` ausente falha fechado no caminho assincrono (erro + `recordGuardrailAudit` com `mcp.tool.missing_contract`).
- Desde MCP-1I, `ToolContract` ativo ausente também falha fechado no caminho sincrono para qualquer acao MCP: o step assume o status canonico existente `failed`, o run assume `error` e o `errorCode`/evento `run.failed` recebem `MCP_TOOL_CONTRACT_MISSING`. O evento de auditoria e `mcp.tool.missing_contract`.
- Desde MCP-1J, falha de persistencia de audit em caminho MCP critico e governada como `AUDIT_WRITE_FAILED`: o worker registra log explicito e o run nao pode finalizar como `success`. Receipt Canon e bundle publicam estado de execucao e reason codes; output historico com `simulated:true` permanece legivel, mas falha na cadeia critica com `SIMULATED_OUTPUT_IN_CRITICAL_CHAIN`.
- O schema `simulatedToolExecutionResultSchema` e `shouldSkipImobPostRunMutationForSimulatedOutput` permanecem apenas como defesa em profundidade para runs historicos. O caminho sincrono atual nao produz mais `simulated: true` quando falta contrato.

## Guard estatico (MCP-1C, atualizado em MCP-1F)

`scripts/checkMcpContractDrift.ts` (`pnpm check:mcp-contract-drift`, rodando no job `orphan_tests_regression` do CI) cobre:

- drift entre o union `executor` de `ToolContract.ts` e os `case` do switch de `MCPExecutor.ts`;
- call sites de `MCPExecutor`/`ToolRegistry` fora de uma allowlist explicita (`mcpAdapter.ts`, `runWorker.ts`);
- presenca do fail-closed canonico no runtime (`runWorker.ts` + `runWorkerActionResolution.ts`), incluindo `MCP_TOOL_CONTRACT_MISSING` e `mcp.tool.missing_contract`;
- preservacao do detector `simulated` em `imobCanonical.ts` para dados historicos;
- parsing bruto de `process.env.MCP_ENFORCE_CONTRACTS`/`process.env.MCP_PROXY_ALL_ACTIONS` fora do helper canonico (ver abaixo);
- uso do helper canonico pelos 4 call sites conhecidos (evita remocao silenciosa ou regressao para parsing inline).

O guard **nao** cobre: propagacao completa com banco/Redis reais nem provisao
de contratos/entradas de allowlist. O hardening unitario de `execDb` e
`ToolRegistry` e coberto desde MCP-1L.

## Parsers de env de governanca (consolidado em MCP-1F)

Os 4 call sites que antes duplicavam parsing inline de `MCP_ENFORCE_CONTRACTS`/`MCP_PROXY_ALL_ACTIONS` (`mcpEnforcement.ts`, `runWorker.ts`, `agentOrchestrator.ts`, `intentValidator.ts`) agora chamam um helper puro unico: `packages/core/src/services/mcpGovernanceEnv.ts` (`parseMcpEnforceContractsEnv`, `parseMcpProxyAllActionsEnv`, `parseMcpDefaultVersionEnv`). Comportamento, defaults e truthy-set (`"1"|"true"|"on"`, case-insensitive, trim de bordas) foram preservados exatamente como estavam em cada call site — inclusive as diferencas de cobertura entre eles:

- `mcpEnforcement.ts` continua nao lendo `MCP_PROXY_ALL_ACTIONS`;
- `runWorker.ts` continua sendo o unico a ler as 3 vars (`enforce`, `proxy`, `defaultVersion`) para gate real + status de warning;
- `agentOrchestrator.ts` mantem o override `input.mcpProxyAllActions` com precedencia sobre o env, e a guarda `typeof process !== "undefined"`;
- `intentValidator.ts` continua warning-only (`assertGovernanceEnv`), sem gate real.

Esta consolidacao **nao** alterou nenhum default, nenhum gate, nem a semantica de `MCP_PROXY_ALL_ACTIONS`.

## Limites desta fase

- Sem alteracao de gates ou `MCP_PROXY_ALL_ACTIONS` semantics. MCP-1L altera
  apenas o runtime DB do `MCPExecutor`, o filtro do `ToolRegistry` e a passagem
  do contexto de escopo nos dois callers conhecidos.
- O tipo de output simulado permanece apenas para compatibilidade defensiva de dados historicos.
- LEG-015 e LEG-024 sao endurecidos no runtime. A constraint unica de
  `(tenantId,name,version)` foi versionada no MCP-1N, mas sua aplicação por
  ambiente permanece sem evidência neste contrato.
- Sem declarar MCP como operacionalmente fechado ou pronto — a divergencia de gates entre os dois call sites (async com Trust/Judge Gate vs. sincrono sem) permanece em aberto e nao foi tocada por esta consolidacao.
- Receipt Canon/bundle representam a semantica de execucao desde MCP-1J; SCL Canon permanece fora deste contrato.

## Proveniência pós-merge MCP-1H..1N

O snapshot
[`mcp-1h-1n-post-merge-provenance-2026-07-23.md`](../../ops/evidence/latest/mcp-1h-1n-post-merge-provenance-2026-07-23.md)
registra ancestralidade, arquivos presentes em `HEAD`, workflow runs
pré-merge, classificação canônica e `evidenceRef` dos itens MCP-1H, MCP-1I,
MCP-1J, MCP-1L e MCP-1N.

Essa proveniência é documental. Ela não transforma CI de PR em execução
pós-merge, não comprova aplicação da migration MCP-1N, não popula a allowlist
DB do MCP-1L e não declara o MCP operacionalmente fechado.

## Artefatos

- [ToolContract](../../packages/mcp-runner/src/types/ToolContract.ts)
- [MCPExecutor](../../packages/mcp-runner/src/executor/MCPExecutor.ts)
- [Guard de drift MCP](../../scripts/checkMcpContractDrift.ts)
- [Testes unitarios de packages/mcp-runner](../../packages/mcp-runner/src/executor/MCPCircuitBreaker.test.ts)
- [Helper canonico de parsing dos env vars de governanca MCP](../../packages/core/src/services/mcpGovernanceEnv.ts)
- [Evidence Index](../EVIDENCE_INDEX.md)
