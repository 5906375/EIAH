# F0.39 — release publish layer risk model

## Data
2026-07-11

## Objetivo
Documentar a decisão e o modelo de risco da Camada B do release path: publish, secrets, GHCR/Docker push, tags/releases e rollback.

## Escopo

Esta etapa é documental/audit-only.

Não implementa publish.
Não altera `release.yml`.
Não altera workflows existentes.
Não usa secrets.
Não publica NPM.
Não faz Docker/GHCR push.
Não cria tags/releases.
Não declara release path fechado.

## Base considerada

- F0.36 separou a migração em:
  - Camada A: validação/build
  - Camada B: publish/secrets/GHCR/Docker/tags
- F0.37 implementou a ponte manual da Camada A
- F0.38 registrou o primeiro run verde real do `ReleaseNode22ValidationBuildDryRun`

## Superfícies reais da Camada B no `release.yml`

O workflow produtivo ainda concentra as seguintes superfícies de risco:

### 1. Publish CLI

Bloco real:

- `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`
- `pnpm --filter ./apps/cli... publish --access public --no-git-checks`

Risco:

- publicação acidental em registry público;
- version bump incorreto;
- divergência entre artefato publicado e estado validado;
- irreversibilidade parcial do publish.

### 2. Login e push para GHCR

Blocos reais:

- `docker/login-action@v3`
- `password: ${{ secrets.REGISTRY_PAT }}`
- `docker/build-push-action@v5`
- tags `eiah-api:${release_version}`, `latest`
- tags `eiah-workers:${release_version}`, `latest`

Risco:

- push de imagem incorreta;
- overwrite de `latest`;
- imagem não alinhada à revisão validada;
- dependência de credenciais sensíveis;
- impacto operacional imediato em consumidores downstream.

### 3. Triggers por tag

Bloco real:

```yaml
push:
  tags:
    - 'v*'
    - 'release/v*'
```

Risco:

- disparo produtivo a partir de tag criada cedo demais;
- acoplamento entre naming de tag e side effects irreversíveis;
- promoção involuntária sem etapa documental intermediária.

### 4. Segredos produtivos

Segredos/superfícies identificadas:

- `NPM_TOKEN`
- `NODE_AUTH_TOKEN`
- `REGISTRY_PAT`
- `github.actor` combinado com push para registry

Risco:

- uso fora de contexto controlado;
- vazamento indireto por configuração incorreta;
- dependência de ambiente que o readiness e o dry-run não exercitam.

## Modelo de risco da Camada B

### Classe B1 — irreversibilidade externa

Inclui:

- `pnpm publish`
- push para GHCR
- atualização de tags `latest`

Natureza:

- efeitos externos persistentes;
- rollback incompleto ou custoso;
- impacto fora do repositório.

### Classe B2 — dependência de secrets

Inclui:

- `NPM_TOKEN`
- `REGISTRY_PAT`

Natureza:

- não auditável plenamente em modo dry-run local;
- exige boundary operacional separado;
- precisa de política explícita de quem autoriza e quando usa.

### Classe B3 — promoção por trigger

Inclui:

- `push.tags`
- `workflow_dispatch` com versão de release

Natureza:

- converte decisão documental em side effect produtivo;
- erro de trigger vira incidente de publish.

### Classe B4 — rollback operacional

Inclui:

- desfazer publish de pacote;
- lidar com imagem errada em `latest`;
- reetiquetar imagem;
- bloquear consumo downstream;
- reconciliar versão/tag/documentação.

Natureza:

- rollback não é simétrico ao deploy do artefato;
- precisa de runbook explícito antes de qualquer ativação.

## Gates mínimos propostos para uma futura Camada B

### Gate 1 — pré-condição de Camada A

Só considerar Camada B se existir:

- F0.38 verde documentado;
- workflow da Camada A estável e reexecutável;
- `release.yml` produtivo ainda protegido até PR separado.

### Gate 2 — decisão explícita de ativação

Antes de qualquer PR que toque publish:

- decisão documental explícita;
- escopo separado;
- sem mistura com mudanças de build/Node/Prisma.

### Gate 3 — segregação por superfície

Recomendação:

- CLI publish em etapa separada de imagens;
- API image separada de worker image;
- sem acoplar todas as promoções em um único salto, se não houver forte justificativa operacional.

### Gate 4 — política de rollback

Obrigatório antes de ativar:

- como reagir a publish CLI incorreto;
- como reagir a imagem incorreta em GHCR;
- como lidar com `latest`;
- quem aprova rollback;
- como revalidar o estado após rollback.

### Gate 5 — observabilidade e evidência

Só promover Camada B com:

- evidência real por superfície;
- artefatos/resultados indexáveis;
- registro explícito de versão, imagem e destino;
- distinção clara entre sucesso parcial e sucesso total.

## Decisão

A decisão correta é:

- a Camada B permanece não autorizada;
- readiness verde e dry-run verde da Camada A não equivalem a publish green;
- publish, secrets, GHCR/Docker push, tags/releases e rollback exigem PR separado, gates próprios e evidência específica.

## Prova de isolamento

Esta etapa é somente documental.

Não altera:

- `.github/workflows/release.yml`
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
