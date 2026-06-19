# IMOB Chat Workbench — Fase 7.2 Safe Deeplinks Validation

Data: 2026-06-18  
Status da frente: PILOTO CONTROLADO  
Escopo: aprofundamento de deeplinks seguros e enriquecimento render-only do painel contextual

## Objetivo

Validar que a Fase 7.2:

- aprofunda deeplinks apenas onde a rota frontend e os parâmetros já existem;
- diferencia visualmente quando o CTA abre uma superfície geral vs contexto específico;
- enriquece o painel contextual apenas com dados reais e mascarados do payload;
- preserva fallbacks seguros quando não há rota/parâmetro suficiente;
- não expõe PII nem inventa destino.

## Arquivos da frente validados

- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`

## Mapeamento de rotas frontend existentes

### 1. Command Center

Rota existente:

- `/app/imob/dashboard`

Parâmetros frontend suportados já existentes em `dashboard.tsx`:

- `conversationId`
- `threadId`
- `caseId`

Uso na Fase 7.2:

- quando `caseId` ou `threadId` existem no contexto real, o CTA abre o dashboard com contexto específico;
- quando só existe destino seguro para a superfície geral, o CTA abre `/app/imob/dashboard` sem inventar query nova.

### 2. Funil

Rota existente:

- `/app/imob/dashboard?tab=funil`

Parâmetros frontend suportados já existentes em `dashboard.tsx`:

- `tab=funil`
- `conversationId`
- `threadId`
- `caseId`

Uso na Fase 7.2:

- o CTA só existe quando há `caseId` e também `status` ou `stage` no payload;
- o link abre a aba real do funil com o contexto já suportado pelo dashboard.

### 3. RunArchive

Rota existente:

- `/app/runs`

Parâmetros frontend suportados já existentes em `runs/index.tsx`:

- `domain`
- `runId`
- `conversationId`
- `threadId`
- `caseId`

Uso na Fase 7.2:

- o CTA só existe quando `runId` está presente no payload;
- o link abre a investigação do run existente via `/app/runs?domain=imob&runId=...`.

### 4. Dossiê

Estado atual:

- não foi encontrada rota frontend dedicada e comprovadamente segura para Dossiê nesta fase

Comportamento preservado:

- o painel não inventa rota nova;
- o fallback continua: `Dossiê indisponível neste piloto`.

## Enriquecimento render-only do painel

Adição validada:

- seção `Referências seguras` com IDs reais do payload em formato mascarado/encurtado:
  - `thread`
  - `case`
  - `run`
  - `draft`, quando existir

Invariante:

- o painel apenas projeta payload/contexto já disponível;
- não calcula `status`, `stage`, `riskFlags` ou `pendingItems` localmente.

## Labels de navegação validados

- `Ver contexto no Command Center`
  - quando existe contexto específico suportado (`caseId` ou `threadId`)
- `Ver visão geral no Command Center`
  - quando só a superfície geral é segura
- `Ver Funil deste caso`
  - quando há contexto suportado para funil
- `Abrir execução no RunArchive`
  - quando existe `runId`

## Validação real no runtime local-docker

### Stack disponível

Comando:

```bash
docker ps
```

Resultado observado:

- `eiah-web` ativo e saudável em `0.0.0.0:5173`
- `eiah-api` ativo e saudável em `0.0.0.0:8080`
- stack local-docker operacional durante a validação

### Página real do chat IMOB

Comando:

```bash
node -e "fetch('http://127.0.0.1:5173/app/imob/chat').then(async r=>{console.log('status',r.status);const t=await r.text();console.log(t.slice(0,800))})"
```

Resultado observado:

- `status 200`
- resposta HTML do Vite servida corretamente
- bootstrap do app presente:
  - `@vite/client`
  - `div id="root"`
  - `src/main.tsx`

### Módulo real da página do chat IMOB

Comando:

```bash
node -e "fetch('http://127.0.0.1:5173/src/pages/app/imob/chat.tsx').then(async r=>{console.log('status',r.status);const t=await r.text();console.log(t.slice(0,800))})"
```

Resultado observado:

- `status 200`
- o módulo `chat.tsx` foi servido/transpilado pelo Vite
- resposta inclui HMR preamble e imports transpilados

## Testes focados

Comando:

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test \
  apps/web/src/features/imob/imobWorkbenchContext.test.ts \
  apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx \
  apps/web/src/features/imob/imobContractIntakeDraftCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeResultCard.test.tsx \
  apps/web/src/features/imob/imobContractIntakeApiClient.test.ts
```

Resultado observado:

- `5/5` arquivos de teste passaram
- cobertura confirmada para:
  - CTA específico vs superfície geral no Command Center
  - deep-link do Funil só com `caseId + status/stage`
  - deep-link de RunArchive só com `runId`
  - fallback seguro sem rota de dossiê
  - ausência de destino inventado
  - referências mascaradas no painel
  - ausência de padrões de CPF/e-mail
  - cards de intake e API client preservados
  - shell responsivo com 3 colunas + toggle mobile

## Gate documental

Comando:

```bash
pnpm check:evidence-index
```

Resultado observado:

- `ok: true`

## Invariantes preservadas

- ChatAgentLauncher não recebeu lógica de negócio
- worker não foi alterado
- backend export não foi alterado
- endpoints de upload/confirm/export não foram alterados
- nenhum `stage/status/journeyType` novo foi criado
- nenhum destino foi inventado
- nenhum dado sensível foi exposto
- status permanece `PILOTO CONTROLADO`
