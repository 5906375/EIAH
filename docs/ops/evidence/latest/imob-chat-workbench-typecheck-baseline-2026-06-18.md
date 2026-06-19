# IMOB Chat Workbench — Typecheck Baseline / Debt Register

Data: 2026-06-18  
Status da frente: PILOTO CONTROLADO  
Escopo: Fase 7.0.2 — baseline do typecheck global do pacote `@eiah/web`

## Objetivo

Separar:

- dívida legada já existente no `@eiah/web`;
- bloqueios amplos de dependência/tipos/assets;
- possíveis regressões ligadas ao IMOB Conversation Workbench;
- ajustes mínimos aplicados nesta rodada para limpar apenas regressão do patch.

## Comando executado

```bash
pnpm --filter @eiah/web exec tsc -p tsconfig.json --noEmit
```

Saída bruta materializada em:

```text
/tmp/imob-chat-workbench-typecheck-baseline-2026-06-18.log
```

Resultado:

- `exit code 2`
- `105` linhas no log capturado

## Classificação do baseline

### 1. Dependência / tipos ausentes

Contagem observada no log:

- `37` ocorrências

Principais módulos afetados:

- `react-router-dom`
- `react-markdown`
- `jspdf`

Leitura:

- esse grupo aparece espalhado por `App.tsx`, páginas, componentes de billing, runs, IMOB e self-service;
- não é específico do Workbench IMOB;
- indica drift estrutural do pacote web em resolução de tipos/dependências.

### 2. Imports de assets sem declaração de módulo

Contagem observada no log:

- `20` ocorrências

Extensões observadas:

- `.png`
- `.svg`
- `.mp4`

Leitura:

- afeta assets de branding, playbook e self-service;
- não está concentrado na frente do Workbench IMOB;
- é baseline global de declaração de módulos de asset no pacote web.

### 3. Drift de tipagem legado

Contagem observada no log:

- `33` ocorrências

Exemplos representativos:

- `src/components/agents/eiahTutorContracts.ts`
  - `Property 'vertical' does not exist on type 'IntentLibraryEntryV1'`
- `src/hooks/useAgentExecution.ts`
  - `ExecutePayload` incompatível com `CreateRunBody`
- `src/pages/profile.tsx`
  - campos ausentes como `totalSessions`, `workspaceName`, `bucketStart`
- `src/pages/app/imob/dashboard.tsx`
  - `reasonCode` incompatível
  - `averageDurationHours` possivelmente `null`
- `src/pages/app/imob/processes.tsx`
  - `reasonCode` incompatível
- `src/pages/self-service/pitch.tsx`
  - comparação inconsistente de tipos (`"custom"` vs `"generic"`)

Leitura:

- o drift está distribuído por várias superfícies do pacote web;
- é anterior e mais amplo que a Fase 7 do Workbench IMOB.

### 4. Possível regressão Workbench

#### Arquivos novos do Workbench

Busca por erros envolvendo:

- `ImobWorkbenchShell.tsx`
- `ImobWorkbenchContextPanel.tsx`
- `ImobIntakeSummaryPanel.tsx`
- `imobWorkbenchContext.ts`

Resultado:

- `0` ocorrências no log do typecheck

Conclusão:

- os arquivos novos do Workbench **não aparecem** no baseline de erros.

#### Arquivo alterado da Fase 7: `src/pages/app/imob/chat.tsx`

Ocorrências remanescentes no log:

1. `Cannot find module 'react-router-dom'`
2. `Cannot find module 'jspdf'`
3. `Property 'proof' does not exist on type 'ImobPresentationCard'`

Leitura:

- os itens `react-router-dom` e `jspdf` fazem parte do grupo estrutural de dependências/tipos ausentes e também aparecem em outros arquivos;
- o acesso a `ImobPresentationCard.proof` já existia fora do shell novo e permanece como dívida de tipagem entre contratos/frontend.

#### Regressão direta identificada e corrigida nesta fase

Durante a revisão do baseline, havia um erro adicional em `src/pages/app/imob/chat.tsx`:

- incompatibilidade de tipo ao passar `messageCard` para `resolveVisibleMessageProof(...)`

Situação:

- esse erro era compatível com regressão local introduzida pelo patch do shell;
- foi corrigido com diff mínimo via normalização explícita do `proof` do card antes da chamada do helper.

Resultado após o ajuste:

- o erro específico de compatibilidade em `chat.tsx` deixou de aparecer no typecheck;
- não restou erro do baseline apontando para os novos arquivos Workbench.

## Conclusão operacional

1. o baseline de typecheck do pacote `@eiah/web` continua falhando;
2. o conjunto dominante de falhas é estrutural e pré-existente;
3. os arquivos novos do Workbench IMOB não aparecem na lista de erros;
4. a única regressão plausível do patch foi removida com correção mínima local em `chat.tsx`;
5. o restante do débito deve ser tratado como frente própria de saneamento do pacote web, fora do escopo da Fase 7.

## Invariantes preservadas

- ChatAgentLauncher não recebeu lógica de negócio
- worker não foi alterado
- backend export não foi alterado
- endpoints de upload/confirm/export não foram alterados
- nenhum `stage/status/journeyType` novo foi criado
- status permanece `PILOTO CONTROLADO`
