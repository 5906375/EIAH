# MCP Contract v1

Status: MCP parcial avancado. Guard estatico de drift ativo desde MCP-1C. Este documento nao altera runtime, nao adiciona provider, nao cria run e nao declara MCP como fechado — apenas descreve o que ja existe e roda hoje.

## Contratos

- `ToolContract` (`packages/mcp-runner/src/types/ToolContract.ts`): `name`, `version`, `tenantId`, `inputSchema`/`outputSchema`, `executor`, `trustLevel`, `policyId?`, `limits?`, `metadata?`, `status?`.
- `executor` e um union de 4 modos: `"http" | "db" | "web3" | "fs"`.
- `MCPExecutor.run()` (`packages/mcp-runner/src/executor/MCPExecutor.ts`) despacha por `contract.executor` num `switch` com exatamente esses 4 casos. `execWeb3` lanca erro explicito de nao implementado; os outros tres executam de fato.

## Call sites conhecidos

- **Assincrono** (`apps/workers/action-runner/src/services/mcpAdapter.ts`, via BullMQ): a esteira de `apps/workers/action-runner/src/index.ts` aplica Intent Gate -> Trust Gate -> Judge Gate -> `executeWithMCP()` -> audit, nessa ordem, antes de qualquer execucao via MCP.
- **Sincrono** (`apps/api/src/workers/runWorker.ts`, ativo quando `MCP_PROXY_ALL_ACTIONS=true`): monta um `mcpExecutorTool` inline que verifica `MCP_ENFORCE_CONTRACTS`, allowlist de acao do tenant e assinatura de intencao (`verifyIntentSignature`) — mas **nao aplica Trust Gate nem Judge Gate** antes de chamar `MCPExecutor`. Essa divergencia entre os dois caminhos e conhecida e nao e resolvida por este documento nem pelo guard estatico atual.

## Fail-closed conhecido / parcial conhecido

- `MCP_ENFORCE_CONTRACTS=false` falha fechado nos dois call sites (erro explicito, sem bypass silencioso).
- `ToolContract` ausente falha fechado no caminho assincrono (erro + `recordGuardrailAudit` com `mcp.tool.missing_contract`).
- No caminho sincrono, uma acao `realestate.*` sem `ToolContract` **nao** falha fechado: cai em execucao simulada (`simulated: true`, `status: "success"`) em vez de erro. O unico consumidor conhecido desse sinal e `apps/api/src/services/imob/imobCanonical.ts` (`shouldSkipImobPostRunMutationForSimulatedOutput`), que usa `simulated` para nunca disparar mutacao de `ImobCase` sobre uma execucao simulada.

## Guard estatico (MCP-1C, atualizado em MCP-1F)

`scripts/checkMcpContractDrift.ts` (`pnpm check:mcp-contract-drift`, rodando no job `orphan_tests_regression` do CI) cobre:

- drift entre o union `executor` de `ToolContract.ts` e os `case` do switch de `MCPExecutor.ts`;
- call sites de `MCPExecutor`/`ToolRegistry` fora de uma allowlist explicita (`mcpAdapter.ts`, `runWorker.ts`);
- presenca do token `simulated` nos dois arquivos acoplados (`runWorker.ts`, `imobCanonical.ts`);
- parsing bruto de `process.env.MCP_ENFORCE_CONTRACTS`/`process.env.MCP_PROXY_ALL_ACTIONS` fora do helper canonico (ver abaixo);
- uso do helper canonico pelos 4 call sites conhecidos (evita remocao silenciosa ou regressao para parsing inline).

O guard **nao** cobre: shape estrutural do output simulado (so verifica a palavra `simulated`, nao o formato), execucao real de `execDb`/`ToolRegistry`.

## Parsers de env de governanca (consolidado em MCP-1F)

Os 4 call sites que antes duplicavam parsing inline de `MCP_ENFORCE_CONTRACTS`/`MCP_PROXY_ALL_ACTIONS` (`mcpEnforcement.ts`, `runWorker.ts`, `agentOrchestrator.ts`, `intentValidator.ts`) agora chamam um helper puro unico: `packages/core/src/services/mcpGovernanceEnv.ts` (`parseMcpEnforceContractsEnv`, `parseMcpProxyAllActionsEnv`, `parseMcpDefaultVersionEnv`). Comportamento, defaults e truthy-set (`"1"|"true"|"on"`, case-insensitive, trim de bordas) foram preservados exatamente como estavam em cada call site — inclusive as diferencas de cobertura entre eles:

- `mcpEnforcement.ts` continua nao lendo `MCP_PROXY_ALL_ACTIONS`;
- `runWorker.ts` continua sendo o unico a ler as 3 vars (`enforce`, `proxy`, `defaultVersion`) para gate real + status de warning;
- `agentOrchestrator.ts` mantem o override `input.mcpProxyAllActions` com precedencia sobre o env, e a guarda `typeof process !== "undefined"`;
- `intentValidator.ts` continua warning-only (`assertGovernanceEnv`), sem gate real.

Esta consolidacao **nao** alterou nenhum default, nenhum gate, nem a semantica de `MCP_PROXY_ALL_ACTIONS`.

## Limites desta fase

- Sem alteracao de runtime MCP, gates, `MCP_PROXY_ALL_ACTIONS` semantics, `packages/mcp-runner/src/**` ou `MCPExecutor`/`ToolRegistry`.
- Sem tipo compartilhado para o output simulado — o acoplamento `runWorker.ts` <-> `imobCanonical.ts` continua implicito.
- Sem cobertura de teste para `ToolRegistry` ou para o branch `execDb` de `MCPExecutor`.
- Sem declarar MCP como operacionalmente fechado ou pronto — a divergencia de gates entre os dois call sites (async com Trust/Judge Gate vs. sincrono sem) permanece em aberto e nao foi tocada por esta consolidacao.
- Sem correcao do fallback simulado nao-fail-closed em `realestate.*` no caminho sincrono.

## Artefatos

- [ToolContract](../../packages/mcp-runner/src/types/ToolContract.ts)
- [MCPExecutor](../../packages/mcp-runner/src/executor/MCPExecutor.ts)
- [Guard de drift MCP](../../scripts/checkMcpContractDrift.ts)
- [Testes unitarios de packages/mcp-runner](../../packages/mcp-runner/src/executor/MCPCircuitBreaker.test.ts)
- [Helper canonico de parsing dos env vars de governanca MCP](../../packages/core/src/services/mcpGovernanceEnv.ts)
- [Evidence Index](../EVIDENCE_INDEX.md)
