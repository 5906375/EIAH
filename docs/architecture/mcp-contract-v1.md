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

## Guard estatico (MCP-1C)

`scripts/checkMcpContractDrift.ts` (`pnpm check:mcp-contract-drift`, rodando no job `orphan_tests_regression` do CI) cobre:

- drift entre o union `executor` de `ToolContract.ts` e os `case` do switch de `MCPExecutor.ts`;
- call sites de `MCPExecutor`/`ToolRegistry` fora de uma allowlist explicita (`mcpAdapter.ts`, `runWorker.ts`);
- presenca do token `simulated` nos dois arquivos acoplados (`runWorker.ts`, `imobCanonical.ts`);
- parsers de `MCP_ENFORCE_CONTRACTS`/`MCP_PROXY_ALL_ACTIONS` fora de uma allowlist explicita de 4 arquivos conhecidos.

O guard **nao** cobre: shape estrutural do output simulado (so verifica a palavra `simulated`, nao o formato), execucao real de `execDb`/`ToolRegistry`, nem a duplicacao em si dos 4 parsers de env (so impede um quinto surgir sem decisao consciente).

## Limites desta fase

- Sem alteracao de runtime MCP, `runWorker.ts`, `apps/workers/action-runner/src/**`, `imobCanonical.ts`, `agentOrchestrator.ts` ou `intentValidator.ts`.
- Sem tipo compartilhado para o output simulado — o acoplamento `runWorker.ts` <-> `imobCanonical.ts` continua implicito.
- Sem consolidacao dos 4 parsers de `MCP_ENFORCE_CONTRACTS`/`MCP_PROXY_ALL_ACTIONS` ja existentes.
- Sem cobertura de teste para `ToolRegistry` ou para o branch `execDb` de `MCPExecutor`.
- Sem declarar MCP como operacionalmente fechado ou pronto — a divergencia de gates entre os dois call sites permanece em aberto.

## Artefatos

- [ToolContract](../../packages/mcp-runner/src/types/ToolContract.ts)
- [MCPExecutor](../../packages/mcp-runner/src/executor/MCPExecutor.ts)
- [Guard de drift MCP](../../scripts/checkMcpContractDrift.ts)
- [Testes unitarios de packages/mcp-runner](../../packages/mcp-runner/src/executor/MCPCircuitBreaker.test.ts)
- [Evidence Index](../EVIDENCE_INDEX.md)
