# F1.6i — Chromium provisioning strategy for controlled mobile smoke

## Status

proposta/parcial

## Objetivo

Definir a estratégia canônica para provisionar Chromium no ambiente controlado do smoke mobile F1, após F1.6g/F1.6h classificarem os bloqueios reais de browser.

## Fontes lidas

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docker-compose.dev.yml`
- `package.json`
- `pnpm-lock.yaml`
- `scripts/smoke-f1-4-front-door-mobile.mjs`
- Evidências F1.6g/F1.6h

## Diagnóstico consolidado

| Etapa | Ambiente | Resultado | Classificação |
| --- | --- | --- | --- |
| F1.6g | host local | Chromium falha no launch por sandbox/permissão | `ENV_SANDBOX_BLOCKED` |
| F1.6h | container `eiah-web` | Playwright resolve, mas binário Chromium não existe | `CHROMIUM_BINARY_MISSING` |
| F1.6i | inspeção Docker/Playwright | `eiah-web` usa `node:20-bookworm` sem provisioning explícito de browsers | `PROVISIONING_STRATEGY_REQUIRED` |

## Constatações técnicas

- `playwright` está formalizado como devDependency root.
- O smoke usa `runnerImport="formal_dependency:playwright"`.
- O smoke preserva `fallbackUsed=false`.
- O serviço `web` em `docker-compose.dev.yml` usa `image: node:20-bookworm`.
- O serviço `web` monta o monorepo em `/app` e o volume `pnpm-store:/pnpm/store`.
- Não há volume/cache explícito para `/root/.cache/ms-playwright`.
- Não há etapa explícita de `playwright install chromium`.
- Não há imagem Playwright com browser pré-instalado no compose atual.

## Opções avaliadas

### Opção A — Imagem dedicada Playwright para smoke

Descrição:
Criar no futuro um serviço/runner dedicado para smoke browser, baseado em imagem Playwright oficial compatível com a versão usada no projeto.

Prós:
- Melhor isolamento.
- Mais reprodutível.
- Evita contaminar o serviço `web`.
- Melhor candidata futura para CI.

Contras:
- Exige nova decisão de compose/Docker.
- Aumenta escopo de ambiente.
- Deve ser executada somente em F1.6j ou etapa posterior aprovada.

### Opção B — Instalar Chromium no serviço `web`

Descrição:
Provisionar Chromium dentro do container `eiah-web`.

Prós:
- Mais direto.
- Pode resolver rapidamente `CHROMIUM_BINARY_MISSING`.

Contras:
- Mistura servidor web com runner de browser.
- Aumenta peso e responsabilidade do serviço `web`.
- Pode introduzir drift entre dev, smoke e CI.
- Menos recomendado como baseline canônico.

### Opção C — Cache/volume de browsers Playwright

Descrição:
Persistir `/root/.cache/ms-playwright` ou caminho equivalente entre execuções.

Prós:
- Pode reduzir tempo de execução.
- Útil como otimização futura.

Contras:
- Menos hermético.
- Risco de cache stale.
- Não deve ser baseline primário.

### Opção D — Comando manual `playwright install chromium`

Descrição:
Rodar instalação manual apenas para experimento local.

Prós:
- Rápido para diagnóstico.

Contras:
- Não é reprodutível o suficiente como estratégia canônica.
- Pode mascarar ausência de provisioning documentado.
- Não deve ser usado para declarar fechamento operacional.

### Opção E — Manter bloqueado até ambiente dedicado

Descrição:
Não provisionar browser até existir um runner dedicado aprovado.

Prós:
- Mais conservador.
- Zero mudança operacional.

Contras:
- Mantém smoke sem prova verde.

## Recomendação canônica

Recomenda-se a Opção A para F1.6j: criar/usar um ambiente dedicado de browser smoke, preferencialmente separado do serviço `web`.

A F1.6i não executa provisioning, não altera Dockerfile, não altera compose, não instala Chromium e não promove CI.

## Próxima microfase recomendada

F1.6j — controlled Chromium provisioning execution.

Escopo sugerido para F1.6j:
- aprovar explicitamente o método;
- criar ou usar runner dedicado;
- provisionar Chromium de forma controlada;
- rodar o mesmo `scripts/smoke-f1-4-front-door-mobile.mjs`;
- manter `fallbackUsed=false`;
- registrar saída JSON;
- não criar CI ainda.

## Bloqueios preservados

- Sem alteração em `ChatAgentLauncher`.
- Sem alteração em runtime.
- Sem alteração em engine.
- Sem alteração em apps/**.
- Sem alteração em packages/**.
- Sem alteração em workflows/CI.
- Sem alteração em `release.yml`.
- Sem `playwright install`.
- Sem Docker build.
- Sem publish.
- Sem secrets.
- Sem registry login.
- Sem Docker/GHCR push.
- Sem tags/releases.
- Sem avanço para F2/F3.

## Status final

proposta/parcial
