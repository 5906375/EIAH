# IMOB Chat Workbench — Fase 7.1 CTA Links Validation

Data: 2026-06-18  
Status da frente: PILOTO CONTROLADO  
Escopo: evidência indexável dos CTAs render-only da Fase 7.1

## Objetivo

Materializar evidência real de que o Workbench IMOB:

- continua carregando no runtime local-docker;
- renderiza CTAs apenas quando existe destino seguro;
- mantém fallback seguro quando o payload não traz destino;
- não inventa rota de Dossiê;
- não expõe PII;
- preserva os botões de export HTML/DOCX/PDF guidance.

## Artefatos validados

- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`
- `apps/web/src/features/imob/imobWorkbenchContext.test.ts`

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
- Vite transformou e serviu o módulo `chat.tsx`
- resposta inclui HMR preamble e imports transpilados
- evidência de que a página alterada segue resolvida no runtime real local-docker

## Validação dos CTAs render-only

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
- os testes focados confirmam:
  - `Ver no Command Center` só renderiza quando existe `caseId`, `runId` ou `threadId` suficiente para gerar destino seguro;
  - `Ver no Funil` só renderiza quando existe `caseId` e também `status` ou `stage`;
  - `Abrir RunArchive` só renderiza quando existe `runId`;
  - `Dossiê indisponível neste piloto` aparece quando não há destino seguro para dossiê/runarchive;
  - `Nenhum destino de navegação disponível no payload atual` aparece quando não há CTA seguro disponível;
  - `Abrir no chat` não é renderizado como destino inventado;
  - não há padrão de CPF nem e-mail no output renderizado;
  - os botões `Exportar HTML`, `Exportar DOCX` e `Orientação PDF` continuam presentes;
  - o shell continua com classe desktop de 3 colunas e toggle mobile.

## Condições documentadas de renderização

### 1. Command Center

Destino:

- `/app/imob/dashboard` com contexto seguro anexado pelo helper existente

Renderiza quando:

- `caseId` ou `runId` ou `threadId` estão presentes no contexto extraído do payload

### 2. Funil

Destino:

- `/app/imob/dashboard?tab=funil` com contexto seguro anexado pelo helper existente

Renderiza quando:

- `caseId` está presente
- e `status` ou `stage` também estão presentes

### 3. RunArchive

Destino:

- `/app/runs?domain=imob&runId=...`

Renderiza quando:

- `runId` está presente

### 4. Dossiê

Estado atual:

- não existe rota frontend dedicada e comprovadamente segura para Dossiê nesta fase

Comportamento:

- o painel não inventa rota nova
- o fallback discreto exibido é `Dossiê indisponível neste piloto`

## Invariantes preservadas

- ChatAgentLauncher não recebeu lógica de negócio
- worker não foi alterado
- backend export não foi alterado
- endpoints de upload/confirm/export não foram alterados
- nenhum `stage/status/journeyType` novo foi criado
- nenhum destino sensível foi inventado
- painel contextual segue como projeção render-only
- PII não aparece nos testes de renderização
- status permanece `PILOTO CONTROLADO`

## Gate documental

Comando previsto após geração da evidência:

```bash
pnpm check:evidence-index
```

Resultado observado:

- `ok: true`
