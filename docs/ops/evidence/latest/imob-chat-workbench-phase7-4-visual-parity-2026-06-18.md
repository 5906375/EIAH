# IMOB Chat Workbench — Fase 7.4.1 Visual Parity Validation

Data: 2026-06-18  
Status da frente: PILOTO CONTROLADO  
Escopo: evidência indexável de paridade visual render-only do Workbench IMOB

## Objetivo

Validar que a aproximação visual da Fase 7.4 continua operacional no runtime local-docker e preserva o shell do Chat IMOB sem criar fonte nova de dados.

Itens verificados nesta rodada:

- `200` real em `/app/imob/chat`
- `200` real em `/src/pages/app/imob/chat.tsx`
- preservação visual do shell:
  - sidebar IMOB
  - header central
  - chat central
  - quick actions próximas ao input
  - painel direito
  - CTAs seguros
  - fallback de Dossiê
- ausência de hardcode de dados do mock como dado real
- ausência de PII na superfície validada

## Limitação operacional desta rodada

Tentativa de localizar browser/headless no host:

```bash
which chromium-browser
which chromium
which google-chrome
which firefox
```

Resultado observado:

- nenhum browser/headless browser disponível no host;
- portanto, não foi possível capturar screenshot real nesta rodada.

Decisão adotada:

- registrar a limitação explicitamente;
- usar validação real de runtime local-docker;
- complementar com renderização sanitizada via `renderToStaticMarkup(...)` dos componentes reais.

## Validação real do runtime local-docker

### Stack disponível

Comando:

```bash
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
```

Resultado observado:

- `eiah-web` ativo e saudável em `0.0.0.0:5173`
- `eiah-api` ativo e saudável em `0.0.0.0:8080`
- stack local-docker operacional durante a validação

### Página real do chat IMOB

Comando:

```bash
node -e "const urls=['http://127.0.0.1:5173/app/imob/chat','http://127.0.0.1:5173/src/pages/app/imob/chat.tsx'];(async()=>{for(const url of urls){const r=await fetch(url);console.log(url+'\t'+r.status);}})()"
```

Resultado observado:

- `http://127.0.0.1:5173/app/imob/chat    200`
- `http://127.0.0.1:5173/src/pages/app/imob/chat.tsx    200`

Leitura:

- o shell IMOB continua servindo no frontend real;
- o módulo da página continua sendo transpilado/servido pelo Vite no runtime local-docker.

## Validação visual equivalente via renderização sanitizada

Como não havia browser/headless browser instalado, a paridade visual foi validada por renderização estática dos componentes reais:

- `ImobWorkbenchShell`
- `ImobWorkbenchContextPanel`

Comando:

```bash
TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx -e "..."
```

### Shell do Workbench

Trecho observado:

```html
<p>IMOB Conversation Workbench</p>
<span>Piloto controlado</span>
<aside>Sidebar IMOB</aside>
<header>Header central</header>
<section>Chat central</section>
<div>Quick actions proximas ao input</div>
<section>Painel direito</section>
<span>Painel contextual IMOB</span>
```

Confirmação:

- o shell mantém a estrutura desktop em 3 colunas;
- a sidebar IMOB permanece separada do chat central;
- o painel direito continua dedicado ao contexto render-only;
- em viewport menor, o painel continua acessível pelo toggle mobile `Painel contextual IMOB`.

### Painel contextual — cenário com contexto específico

Trecho observado:

```html
<span>Piloto controlado</span>
<span>thread thread-intak…7890</span>
<a href="/app/imob/dashboard?caseId=case-1234567890&amp;threadId=thread-intake-1234567890">Abrir contexto no Command Center</a>
<a href="/app/imob/dashboard?tab=funil&amp;caseId=case-1234567890&amp;status=pending_confirmation">Abrir Funil deste caso</a>
<a href="/app/runs?domain=imob&amp;runId=run-1234567890">Abrir execução no RunArchive</a>
```

Confirmação:

- labels e hierarquia visual continuam claros;
- `Command Center`, `Funil` e `RunArchive` só aparecem com destino suportado;
- referências aparecem mascaradas/encurtadas;
- não há PII no HTML observado.

### Painel contextual — cenário com superfície geral + run

Trecho observado:

```html
<a href="/app/imob/dashboard">Abrir visão geral do Command Center</a>
<a href="/app/runs?domain=imob&amp;runId=run-1234567890">Abrir execução no RunArchive</a>
```

Confirmação:

- o label diferencia contexto específico de superfície geral;
- `Funil` não aparece sem `caseId`;
- nenhum parâmetro ausente é inventado.

### Painel contextual — fallback seguro

Trecho observado:

```html
<p>Dossiê indisponível neste piloto. Ainda não há rota frontend segura dedicada para essa abertura contextual.</p>
<p>Nenhum destino de navegação disponível no payload atual. O painel permanece informativo até que um contexto navegável seja emitido.</p>
```

Confirmação:

- o fallback de Dossiê permanece preservado;
- nenhum link novo é fabricado quando o payload não fornece destino seguro.

## Verificação de ausência de hardcode do mock como dado real

Arquivos verificados:

- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/features/imob/ImobWorkbenchShell.tsx`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`

Resultado observado:

- a sidebar usa contagens derivadas de estado real do chat (`filteredConversations.length`, `activeThreadCount`);
- o header central usa badges e microcopy visuais, sem nomes, matrículas, alertas ou documentos do mock;
- as quick actions reutilizam `QUICK_PROMPTS.slice(0, 4)` já existente;
- o painel contextual projeta apenas `intakeContext` e `hrefs` recebidos, sem gerar payload local.

Leitura:

- a aproximação visual do mock ficou restrita a layout, badges, microcopy e hierarquia visual;
- nenhum dado do mock foi hardcoded como fonte real nesta fase.

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
  - shell renderiza
  - painel direito renderiza
  - CTA seguro vs fallback
  - ausência de padrões de CPF/e-mail
  - preservação dos cards de intake
  - preservação do API client de export HTML/DOCX/PDF guidance

## Gate documental

Comando:

```bash
pnpm check:evidence-index
```

Resultado observado após indexação:

- `ok: true`

## Invariantes preservadas

- `ChatAgentLauncher` não foi alterado
- `worker` não foi alterado
- `backend export` não foi alterado
- endpoints de `upload/confirm/export` não foram alterados
- nenhuma rota de Dossiê foi criada
- nenhum destino/parâmetro foi inventado
- nenhum `stage/status/journeyType` novo foi criado
- nenhum dado do mock foi promovido a dado real
- PII não aparece na validação registrada
- status permanece `PILOTO CONTROLADO`
