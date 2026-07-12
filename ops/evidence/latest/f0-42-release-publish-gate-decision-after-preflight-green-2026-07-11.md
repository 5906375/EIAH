# F0.42 — release publish gate decision after preflight green

## Data
2026-07-11

## Objetivo
Documentar a decisão de gate da Camada B após o run verde do `ReleasePublishPreflight` registrado em F0.41.

## Escopo

Esta etapa é documental/audit-only.

Não implementa publish.
Não altera `release.yml`.
Não altera workflows existentes.
Não usa secrets produtivos.
Não publica NPM.
Não faz Docker/GHCR push.
Não cria tags/releases.
Não declara release path fechado.

## Base considerada

- `release.yml` continua contendo as superfícies produtivas reais da Camada B:
  - `pnpm --filter ./apps/cli... publish --access public --no-git-checks`
  - `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`
  - `docker/login-action@v3`
  - `docker/build-push-action@v5`
  - `REGISTRY_PAT`
  - triggers por tag `v*` e `release/v*`
- F0.39 modelou os riscos da Camada B.
- F0.40 criou o workflow `ReleasePublishPreflight` sem side effects.
- F0.41 registrou o primeiro run verde real do `ReleasePublishPreflight #1` em `main`, commit `6174fc9`, status `Success`.

## Achado principal

O run verde de F0.41 comprova somente que:

- a resolução de metadados funciona;
- a versão sintática do preflight é válida;
- as superfícies de artefato existem;
- o workflow manual de preflight permanece sem efeitos externos;
- os comandos candidatos de publish podem ser renderizados sem executar publish real.

O run verde de F0.41 não comprova:

- uso correto de `NPM_TOKEN` em contexto controlado;
- login em GHCR com `REGISTRY_PAT`;
- push seguro de imagens;
- comportamento de tags/releases;
- idempotência de publish;
- retry controlado;
- rollback operacional executável;
- segregação de aprovação entre CLI publish, API image e worker image.

## Decisão de gate

A decisão correta após F0.41 é:

- não aproximar `release.yml` diretamente do publish real;
- não autorizar PR de publish real como próximo passo imediato;
- inserir antes um gate mínimo separado, ainda sem side effects externos.

## Gate mínimo decidido antes de qualquer publish real

O próximo gate mínimo deve ser um **gate documental/operacional de autorização de publish e rollback**, ainda sem `publish`, sem login e sem push.

Esse gate deve cobrir, no mínimo:

### 1. Segregação por superfície

Separar explicitamente:

- CLI publish
- API image publish
- Worker image publish

Sem acoplar as três promoções em um único salto.

### 2. Autorização explícita

Exigir decisão explícita para:

- versão alvo;
- superfície a promover;
- owner técnico;
- owner operacional;
- janela operacional;
- critério de abort/rollback.

### 3. Readiness de rollback

Registrar runbook mínimo para:

- pacote CLI publicado incorretamente;
- imagem API incorreta;
- imagem worker incorreta;
- impacto em `latest`;
- revalidação pós-rollback.

### 4. Boundary de secrets

Confirmar que secrets permanecem fora do caminho até gate posterior específico de execução:

- `NPM_TOKEN`
- `REGISTRY_PAT`

Sem uso real desses secrets nesta fase.

### 5. Evidência de promoção controlada

Preparar evidência indexável por superfície futura:

- versão promovida;
- artefato alvo;
- destino;
- owner;
- janela;
- rollback associado;
- status por superfície.

## Decisão operacional conservadora

O próximo PR aceitável não é “publish real”.

O próximo PR aceitável é um **publish activation gate package**, ainda audit-only, que formalize:

- owners;
- janela;
- segregação CLI/API/worker;
- política de rollback;
- boundary de secrets;
- critérios de autorização de execução.

Somente depois disso um PR separado poderá discutir:

- uso real de secrets;
- publish CLI real;
- login GHCR;
- push de imagens;
- tags/releases;
- aproximação controlada de `release.yml`.

## Warnings residuais

Warnings de depreciação de Node.js 20 em actions externas continuam como dívida técnica residual não bloqueante.

## Prova de isolamento

Esta etapa é somente documental.

Não altera:

- `.github/workflows/release.yml`
- `.github/workflows/release-publish-preflight.yml`
- `.github/workflows/release-node22-readiness.yml`
- `.github/workflows/release-node22-validation-build-dry-run.yml`
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

## Status
Status: parcial/evidenciado
