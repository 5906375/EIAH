# IMOB Chat Workbench — Fase 7.2.1 Visual/Runtime Validation

Data: 2026-06-18  
Status da frente: PILOTO CONTROLADO  
Escopo: validação visual/runtime dos labels e fluxos de navegação do Workbench IMOB

## Objetivo

Validar em execução real que os fluxos do painel contextual do Workbench IMOB permanecem seguros:

- Chat → Command Center
- Chat → Funil
- Chat → RunArchive
- fallback de `Dossiê indisponível neste piloto`

E confirmar que:

- os labels distinguem superfície geral de contexto específico;
- `RunArchive` só aparece com `runId`;
- `Funil` só aparece com `caseId + status/stage`;
- `Command Center` não inventa contexto;
- PII não aparece.

## Limitação operacional desta rodada

Tentativa de validação por browser/headless local:

- `which chromium-browser || which chromium || which google-chrome || which google-chrome-stable || which chrome || which firefox`
- `ls /usr/bin | rg 'chrom|chrome|firefox'`

Resultado observado:

- nenhum browser/headless browser disponível no host;
- portanto, não foi possível capturar screenshot real nesta rodada.

Decisão:

- registrar a limitação explicitamente;
- usar o melhor substituto executável disponível no ambiente:
  - runtime real do Vite/local-docker;
  - renderização estática sanitizada do componente em cenários controlados;
  - testes focados da frente.

## Validação real do runtime local-docker

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
- bootstrap presente:
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
- resposta inclui preamble de HMR e imports transpilados

## Validação visual equivalente via renderização sanitizada

Como não havia browser/headless browser instalado, os labels e CTAs foram validados por `renderToStaticMarkup(...)` do painel real em três cenários.

### Cenário A — contexto específico completo

Contexto renderizado:

- `threadId`
- `caseId`
- `runId`
- `status`
- `stage`

Resultado observado no HTML sanitizado:

- label `Ver contexto no Command Center`
- label `Ver Funil deste caso`
- label `Abrir execução no RunArchive`
- `thread` mascarada: `thread-intak…7890`
- `case` e `run` exibidos sem PII
- sem rota inventada de Dossiê

Trecho observado:

```html
<a href="/app/imob/dashboard?conversationId=conv-1&amp;threadId=thread-intake-1234567890&amp;caseId=case-1234567890">Ver contexto no Command Center</a>
<a href="/app/imob/dashboard?tab=funil&amp;conversationId=conv-1&amp;threadId=thread-intake-1234567890&amp;caseId=case-1234567890">Ver Funil deste caso</a>
<a href="/app/runs?domain=imob&amp;runId=run-1234567890&amp;conversationId=conv-1&amp;threadId=thread-intake-1234567890&amp;caseId=case-1234567890">Abrir execução no RunArchive</a>
```

### Cenário B — superfície geral + run disponível

Contexto renderizado:

- apenas `runId`
- sem `caseId`
- sem `threadId`

Resultado observado no HTML sanitizado:

- label `Ver visão geral no Command Center`
- `RunArchive` continua disponível
- `Funil` não aparece

Trecho observado:

```html
<a href="/app/imob/dashboard">Ver visão geral no Command Center</a>
<a href="/app/runs?domain=imob&amp;runId=run-archive-999999">Abrir execução no RunArchive</a>
```

Leitura:

- o painel não inventa `caseId` nem `threadId`;
- `Command Center` cai corretamente para superfície geral;
- `RunArchive` só depende de `runId`.

### Cenário C — sem destinos seguros

Contexto renderizado:

- payload do intake presente
- todos os CTAs desabilitados por ausência de `href`

Resultado observado no HTML sanitizado:

- `Dossiê indisponível neste piloto.`
- `Nenhum destino de navegação disponível no payload atual.`
- nenhum link inventado de chat/dossiê

Trecho observado:

```html
<p>Dossiê indisponível neste piloto.</p>
<p>Nenhum destino de navegação disponível no payload atual.</p>
```

## Regras confirmadas na validação

### Command Center

- abre contexto específico quando existem parâmetros reais suportados;
- abre visão geral quando só a rota base é segura;
- não inventa contexto ausente.

### Funil

- só aparece quando o payload permite `caseId + status/stage`;
- usa a rota existente `/app/imob/dashboard?tab=funil`.

### RunArchive

- só aparece quando existe `runId`;
- usa a rota existente `/app/runs?domain=imob&runId=...`.

### Dossiê

- continua sem rota frontend segura nesta fase;
- fallback `Dossiê indisponível neste piloto` preservado.

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
- cobertura confirma:
  - labels geral vs contexto específico;
  - presença/ausência segura de `Funil` e `RunArchive`;
  - ausência de destino inventado;
  - ausência de padrões de CPF/e-mail;
  - preservação de cards de intake e ações de export.

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
- CTAs continuam render-only
- nenhum destino foi inventado
- PII não aparece na validação registrada
- status permanece `PILOTO CONTROLADO`
