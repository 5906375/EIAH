# F1.6e — Relink Stabilization After Host Ownership Repair

## Resumo
- Objetivo: validar a estabilização do workspace após correção operacional de ownership herdado em node_modules.
- Status: evidenciado como estabilização operacional de relink.
- Não formaliza Playwright.
- Não altera smoke.
- Não promove CI.
- Não altera package.json nem pnpm-lock.yaml.

## Contexto
A sequência F1.6a–F1.6d confirmou drift de store/relink e bloqueios por ownership legado. A F1.6e foi executada após correção manual com TTY/sudo real no host, preservando o escopo em diretórios gerados de dependência.

## Correções operacionais aplicadas
Foram corrigidos ownerships herdados em caminhos gerados de dependência, sem tocar código versionado:
- packages/core/node_modules
- packages/contracts/node_modules
- packages/providers/node_modules
- packages/mcp-runner/node_modules
- apps/web/node_modules/.bin
- apps/api/node_modules
- apps/cli/node_modules
- apps/workers/action-runner/node_modules/.bin
- apps/workers/maintenance-worker/node_modules/.bin
- apps/workers/run-worker/node_modules/.bin
- packages/db/node_modules/.bin
- node_modules/.pnpm
- node_modules/.pnpm/node_modules
- node_modules/.bin

A auditoria de node_modules/.pnpm registrou 3666 entradas root-owned antes da correção restrita da árvore .pnpm.

## Resultado do relink
Comando executado:

    pnpm install --ignore-scripts

Resultado:

    Done in 2.3s using pnpm v10.12.4

## Validações pós-relink
node_modules/.modules.yaml restaurado:

    -rw-r--r-- 1 jusall jusall 45211 Jul 14 14:36 node_modules/.modules.yaml

pnpm check:docs-link-integrity:

    ok: true
    filesChecked: 15

Isolamento versionado:

    git diff -- package.json pnpm-lock.yaml scripts .github/workflows apps packages
    git status --short

Resultado:
- sem saída;
- nenhum diff versionado em package/lock/scripts/workflows/apps/packages;
- worktree limpo antes da documentação.

## Checks de baseline na branch F1.6e
pnpm check:evidence-index:

    ok: true
    refsChecked: 502

pnpm check:docs-link-integrity:

    ok: true
    filesChecked: 15

pnpm check:w4-non-regression:

    ok: true
    hardMetricsGo: true
    nonRegressionGo: true
    moduleActivationSuccessRatePct: 100
    moduleActivationP95Seconds: 8
    timeToFirstRunP95Minutes: 14
    receiptCoveragePct: 100
    crossTenantAuthFailures: 0
    duplicateSideEffects: 0

git diff --check:
- sem saída.

## Prova de não escopo
Confirmado:
- sem Playwright;
- sem alteração em package.json;
- sem alteração em pnpm-lock.yaml;
- sem alteração em scripts;
- sem alteração em workflows;
- sem alteração em apps/packages versionados;
- sem alteração em runtime/engine/APIs/contracts;
- sem alteração em ChatAgentLauncher;
- sem promoção CI.

## Conclusão
A F1.6e estabilizou o workspace e restaurou o relink com pnpm install --ignore-scripts, incluindo a restauração de node_modules/.modules.yaml.

Esta etapa não conclui a F1.6 funcional. Ela apenas remove o bloqueio operacional de ownership/relink para permitir retomar a normalização Playwright em etapa posterior.
