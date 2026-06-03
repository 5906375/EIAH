# Guardian Tools And Checklist Steps — 2026-06-02

## Objetivo

Aproximar o `guardian` da resolução real das receitas operacionais, reduzindo o modo apenas consultivo e introduzindo:

- tools reais de verificação
- checklist probatório por etapa
- síntese final apoiada nos resultados do runtime

## Mudanças aplicadas

### Backend

- novas actions core:
  - `guardian.checkRuntimeHealth`
  - `guardian.checkGoLiveArtifacts`
  - `guardian.checkRollbackReadiness`
  - `guardian.checkGoLivePolicy`
- novo planner específico em `apps/api/src/workers/guardianPlanManager.ts`
- rota `go_live_controlado.domain_dns_api_evidencias` passa a gerar plano com:
  1. health runtime
  2. artefatos canônicos
  3. rollback
  4. policy/ADR fail-closed
  5. síntese final
- o `runWorker` agora injeta `orchestratorOutputs`, `groundedContext` e `resolvedSources` no passo final de LLM
- `toolsUsed` passa a refletir actions realmente executadas, não apenas tools declaradas no profile

### Contrato do agente

- `packages/core/src/actions/agents/guardianAction.ts` agora declara as tools reais do Guardian

### Frontend

- `self-service` do Guardian instrui o modelo a usar checks executados em runtime como fonte primária
- `RunViewer` passa a exibir bloco `Checks executados` no contexto probatório do Guardian

## Escopo atual

O planner especializado foi implementado para a rota:

- `go_live_controlado.domain_dns_api_evidencias`

Outras rotas do Guardian mantêm fallback conservador para o fluxo já existente.

## Validação

Comandos executados:

```bash
TSX_TSCONFIG_PATH=packages/core/tsconfig.json node --import tsx --test packages/core/src/actions/__tests__/guardianChecklistTools.test.ts
TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test apps/api/src/tests/guardian-plan-manager.test.ts apps/api/src/tests/run-events-redis-transport.test.ts apps/api/src/tests/trust-score-engine.test.ts
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/web/src/pages/self-service/recipePrefill.test.ts
pnpm check:self-service-runtime-graph
pnpm check:frontend-duplication
```

## Impacto esperado

- o Guardian fica mais próximo de validar a recipe em vez de apenas descrevê-la
- `toolsUsed` tende a sair de `0` para o número real de checks executados nessa rota
- o parecer final passa a se apoiar em evidências do próprio runtime/repositorio

## Limites conhecidos

- ainda não há checks externos live para DNS/WAF/ALB fora do ambiente local
- o planner especializado cobre primeiro a receita de go-live controlado
- o campo final de recomendação ainda passa pelo motor de recomendações já existente
