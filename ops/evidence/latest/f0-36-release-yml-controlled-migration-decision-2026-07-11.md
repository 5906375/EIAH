# F0.36 — release.yml controlled migration decision

## Data
2026-07-11

## Objetivo
Definir, de forma controlada e auditável, como aproximar `.github/workflows/release.yml` do readiness verde sem publish acidental.

## Escopo

Esta etapa é decision-only / audit-only.

Não altera `release.yml`.
Não altera `release-node22-readiness.yml`.
Não executa release produtivo.
Não usa secrets.
Não publica NPM.
Não faz Docker/GHCR push.
Não cria tags/releases.
Não declara release path fechado.

## Base documental considerada

- F0.34 registrou o primeiro run verde do `ReleaseNode22Readiness` em `main`.
- F0.35 auditou `.github/workflows/release.yml` e confirmou divergências técnicas remanescentes.

## Divergências ainda abertas

O estado atual de `.github/workflows/release.yml` ainda diverge do readiness verde em:

- `NODE_VERSION`
- `PNPM_VERSION`
- estratégia de install
- ordem explícita de build
- comandos Prisma

Além disso, o workflow produtivo ainda inclui superfícies não exercitadas pelo readiness:

- publish CLI
- GHCR login
- Docker build/push
- triggers por tag
- uso de `NPM_TOKEN`
- uso de `REGISTRY_PAT`

## Decisão controlada

### Decisão principal

Não migrar `.github/workflows/release.yml` diretamente com base apenas no readiness verde.

### Decisão operacional

Qualquer aproximação do release produtivo ao readiness verde deve acontecer em PR separado, com escopo controlado e dividido em camadas.

### Camadas permitidas para uma futura migração controlada

#### Camada A — alinhamento do caminho de validação

Pode ser avaliada em PR futuro dedicado:

- alinhar `NODE_VERSION` do release produtivo ao baseline evidenciado;
- alinhar `PNPM_VERSION` ao baseline evidenciado;
- alinhar install strategy ao caminho dry-run validado;
- alinhar ordem explícita de build;
- alinhar comandos Prisma ao caminho validado.

Condição:

- sem tocar ainda em publish CLI;
- sem tocar ainda em login GHCR;
- sem tocar ainda em Docker push;
- sem alterar triggers por tag;
- sem usar secrets reais nesta etapa.

#### Camada B — superfície de publish

Só pode ser discutida depois da Camada A estar:

- implementada em PR próprio;
- validada por checks reais;
- auditada documentalmente;
- aprovada explicitamente.

Inclui:

- `pnpm publish`
- `NODE_AUTH_TOKEN`
- `NPM_TOKEN`
- `REGISTRY_PAT`
- `docker/login-action`
- `docker/build-push-action`
- push para GHCR
- comportamento em tags/releases

### Decisão de segurança

Até nova autorização explícita:

- `release.yml` permanece intocado;
- `release-node22-readiness.yml` continua sendo a referência dry-run/readiness;
- nenhuma evidência atual autoriza publish real;
- nenhuma evidência atual autoriza push de imagem real;
- nenhuma evidência atual autoriza usar secrets de release.

## Recomendação conservadora

Se houver próximo passo, ele deve ser um PR de migração controlada apenas da Camada A, com:

- alteração isolada de validação/build;
- sem publish;
- sem Docker push;
- sem GHCR push;
- sem secrets;
- com nova evidência indexável própria;
- com decisão explícita antes de qualquer etapa de publish.

## O que continua proibido nesta etapa

- alterar `.github/workflows/release.yml`
- alterar `.github/workflows/release-node22-readiness.yml`
- usar `NPM_TOKEN`
- usar `REGISTRY_PAT`
- usar publish real
- fazer push para GHCR
- criar tag de release
- inferir que readiness green equivale a release green

## Prova de isolamento

Esta etapa é somente documental.

Não altera:

- `.github/workflows/release.yml`
- `.github/workflows/release-node22-readiness.yml`
- demais workflows
- `package.json`
- `pnpm-lock.yaml`
- `.nvmrc`
- `.node-version`
- apps
- packages
- scripts
- schema Prisma
- migrations
- `ChatAgentLauncher`
- IMOB UI

## Resultado

A decisão correta e auditável é:

- readiness verde reduz risco;
- não autoriza migração direta do release produtivo;
- a aproximação deve ser fatiada;
- primeiro validação/build;
- depois, se e somente se autorizado e evidenciado, publish.

## Status
Status: parcial/evidenciado
