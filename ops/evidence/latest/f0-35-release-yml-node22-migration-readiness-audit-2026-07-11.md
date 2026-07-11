# F0.35 — release.yml Node 22 migration readiness audit

## Data
2026-07-11

## Objetivo
Auditar o workflow produtivo `.github/workflows/release.yml` após o run verde do `ReleaseNode22Readiness` registrado em F0.34, sem migrar o release path produtivo.

## Escopo

Esta etapa é audit-only.

Não migra `release.yml`.
Não executa release produtivo.
Não usa secrets.
Não publica artefatos.
Não declara o release path fechado.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `.github/workflows/release.yml`
- `.github/workflows/release-node22-readiness.yml`

## Resultado da auditoria

### Readiness já evidenciado

F0.34 registrou um run verde real do `ReleaseNode22Readiness` em `main`, commit `164df7e`, status `Success`, com os jobs:

- `prepare_readiness`
- `detect_readiness`
- `validate_release_readiness`

Isso prova compatibilidade do caminho dry-run/readiness em Node 22, mas não equivale a validação do workflow produtivo de release.

### Diferenças críticas entre `release.yml` e `release-node22-readiness.yml`

#### 1. Runtime e toolchain ainda divergentes

`release.yml` ainda usa:

```yaml
NODE_VERSION: '20'
PNPM_VERSION: '9'
```

Enquanto o readiness verde usa:

```yaml
NODE_VERSION: '22'
PNPM_VERSION: '10.12.4'
```

Conclusão: o release produtivo ainda não herdou a baseline já validada no readiness.

#### 2. Instalação ainda segue caminho mais arriscado no release produtivo

`release.yml` usa:

```yaml
pnpm install --frozen-lockfile
```

`release-node22-readiness.yml` usa:

```yaml
pnpm install --frozen-lockfile --ignore-scripts
```

Conclusão: o readiness verde depende de uma estratégia de install mais controlada do que a do workflow produtivo atual.

#### 3. Ordem explícita de build existe só no readiness

`release-node22-readiness.yml` executa:

```yaml
pnpm --filter @repo/db build
pnpm --filter @eiah/core build
```

antes do `pnpm build`.

`release.yml` não possui essa etapa.

Conclusão: a estabilização obtida em F0.24 não está refletida no release produtivo.

#### 4. Validação Prisma do release produtivo continua desatualizada

No estado auditado, `release.yml` ainda contém:

```yaml
pnpm --filter @repo/db prisma validate --schema packages/db/prisma/schema.prisma
pnpm --filter @repo/db prisma format --schema packages/db/prisma/schema.prisma --check
pnpm --filter @repo/db prisma migrate diff \
--from-schema-datamodel ./packages/db/prisma/schema.prisma \
--to-schema-datamodel ./packages/db/prisma/schema.prisma
```

Enquanto o readiness verde já usa:

```yaml
pnpm --filter @repo/db prisma validate --schema ./prisma/schema.prisma
pnpm --filter @repo/db prisma format --schema ./prisma/schema.prisma --check
pnpm --filter @repo/db prisma migrate diff \
  --from-schema ./prisma/schema.prisma \
  --to-schema ./prisma/schema.prisma
```

Conclusão: o workflow produtivo ainda conserva exatamente os pontos corrigidos em F0.31–F0.33.

#### 5. Superfície produtiva adicional não foi exercitada pelo readiness

`release.yml` inclui etapas ausentes no readiness:

- `Publish CLI`
- login em GHCR
- `docker/build-push-action@v5`
- push de imagens API e workers
- uso de `secrets.NPM_TOKEN`
- uso de `secrets.REGISTRY_PAT`
- gatilho por tags `v*` e `release/v*`

Conclusão: mesmo com o readiness verde, publish e image push continuam não auditados por execução real nesta etapa.

## Riscos residuais identificados

### P0
- O release produtivo ainda não usa a mesma baseline Node/pnpm do readiness verde.
- O caminho produtivo ainda mantém comandos Prisma e install path divergentes do caminho já evidenciado.

### P1
- O workflow produtivo continua protegido porque nenhuma migração foi aplicada nesta etapa.

### P2
- O readiness verde reduz risco técnico de migração, mas não cobre publish real, GHCR ou secrets.

### P3
- Warnings de depreciação de Node.js 20 em actions externas permanecem rastreados como dívida técnica residual.

### P4
- Fora do escopo.

## Decisão

O audit conclui que:

- existe evidência suficiente para afirmar que o caminho de readiness Node 22 ficou verde em `main`;
- não existe evidência suficiente para migrar automaticamente `.github/workflows/release.yml`;
- a migração do release path produtivo deve ocorrer apenas em PR separado, com decisão explícita e escopo controlado;
- até lá, o status correto permanece conservador.

## Prova de isolamento

Esta PR é documental.

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

## Status
Status: parcial/evidenciado
