# IMOB Conversation Workbench UI Shell — Fase 7.0.1 Validation

Data: 2026-06-18  
Status da frente: PILOTO CONTROLADO  
Escopo: validação local-docker do shell UI do Chat IMOB + follow-up do typecheck do pacote web

## Objetivo

Validar que o shell visual da Fase 7:

- continua carregando no frontend real local-docker;
- preserva o Chat IMOB existente;
- mantém o painel contextual render-only baseado em payload real;
- não expõe PII;
- resolve ou explica o bloqueio de typecheck do pacote web.

## Arquivos da frente validados

- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/features/imob/imobWorkbenchContext.ts`
- `apps/web/src/features/imob/ImobWorkbenchShell.tsx`
- `apps/web/src/features/imob/ImobIntakeSummaryPanel.tsx`
- `apps/web/src/features/imob/ImobWorkbenchContextPanel.tsx`
- `apps/web/src/features/imob/imobWorkbenchContext.test.ts`
- `apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx`

## Validação real no ambiente local-docker

### Containers ativos

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
node -e "fetch('http://127.0.0.1:5173/app/imob/chat').then(async r=>{console.log('status',r.status);const t=await r.text();console.log(t.slice(0,1200))})"
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
node -e "fetch('http://127.0.0.1:5173/src/pages/app/imob/chat.tsx').then(async r=>{console.log('status',r.status);const t=await r.text();console.log(t.slice(0,1200))})"
```

Resultado observado:

- `status 200`
- Vite transformou e serviu o módulo `chat.tsx`
- resposta inclui preamble de HMR e imports transpilados
- evidência de que a página alterada está sendo resolvida no runtime real local-docker

## Validação de UI focada

Comando:

```bash
pnpm --filter @eiah/web exec node --import tsx --test \
  src/features/imob/imobWorkbenchContextPanel.test.tsx \
  src/features/imob/imobWorkbenchContext.test.ts \
  src/features/imob/imobContractIntakeDraftCard.test.tsx \
  src/features/imob/imobContractIntakeResultCard.test.tsx \
  src/features/imob/imobContractIntakeApiClient.test.ts
```

Resultado observado:

- `5/5` arquivos de teste passaram
- cobertura confirmada para:
  - painel contextual `loading`
  - painel contextual `error`
  - painel contextual `empty`
  - painel contextual `ready`
  - shell responsivo com classe desktop de 3 colunas
  - cards de intake preservados
  - API client de HTML/DOCX/PDF guidance preservado
  - ausência de padrões de PII em output renderizado

## Follow-up do typecheck

### Ajuste aplicado

A correção mínima e segura foi:

- remover `types: ["vite/client"]` de `apps/web/tsconfig.json`
- adicionar `apps/web/src/vite-env.d.ts` com declaração local de `ImportMetaEnv`

Objetivo do ajuste:

- eliminar o bloqueio artificial de resolução de `vite/client` no pacote web fora do runtime do Vite;
- manter o uso tipado de `import.meta.env` sem alterar o comportamento da aplicação.

### Diagnóstico após o ajuste

Comando:

```bash
pnpm --filter @eiah/web exec tsc -p tsconfig.json --noEmit
```

Resultado observado:

- o erro específico de `vite/client` deixou de ser o bloqueio principal;
- o typecheck completo do pacote web continua falhando por problemas mais amplos e pré-existentes no workspace, incluindo:
  - resolução de dependências/tipos de `react-router-dom`, `react-markdown` e `jspdf`;
  - imports de assets sem declaração de módulo;
  - erros de tipagem não relacionados ao shell do chat IMOB.

Conclusão:

- a Fase 7.0.1 removeu o bloqueio localizado de `vite/client`;
- o pacote `@eiah/web` ainda não está em estado de typecheck limpo por causas estruturais anteriores e não específicas deste patch.

## Gate documental

Comando:

```bash
pnpm check:evidence-index
```

Resultado observado:

- `ok: true`

## Invariantes preservadas

- Chat IMOB existente preservado
- ChatAgentLauncher sem lógica nova de negócio
- worker não alterado
- backend export não alterado
- endpoints de upload/confirm/export não alterados
- nenhum `stage/status/journeyType` novo criado
- painel direito segue render-only
- PII não aparece nos testes de renderização
- status permanece `PILOTO CONTROLADO`

## Limitações desta validação

- a validação real foi feita por runtime local-docker HTTP + testes focados de UI; não houve captura visual automatizada de browser com screenshot nesta rodada;
- o typecheck global do pacote web permanece parcial por drift estrutural fora do escopo desta frente.
