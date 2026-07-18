# IMOB-PILOT-7A - Front Door IMOB Fixture Preview Decision Gate

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.

## Objetivo

IMOB-PILOT-7A define a decisao de escopo para o primeiro resultado visual IMOB read-only no frontend, acessado pelo Chat universal / Front Door EIAH em `/app/chat`.

Esta fase nao implementa preview, nao altera frontend, nao altera `ChatAgentLauncher`, nao altera runtime/API, nao altera CI, nao altera `package.json`, nao altera scripts/testes, nao altera `docs/EVIDENCE_INDEX.md`, nao executa dry-run real, nao inicia shadow real, nao chama provider, nao escreve DB, ledger ou audit, nao gera receipt, bundle ou proof e nao declara operacao IMOB fechada.

## Pre-condicao comprovada

- IMOB-PILOT-6J mergeado no topo `a0b5088`.
- `CI Monorepo` pos-merge run `29648861701`: `completed success`.
- `IMOB Worker Mutation E2E` run `29648861691`: `completed success`.
- Job `OrphanTestsRegression`: `completed success`.
- Step `Run IMOB static harness contract gate`: `completed success`.
- Worktree limpa antes das alteracoes.

Pre-check local executado antes de alteracao:

- `git switch main`: ja em `main`.
- `git pull --ff-only origin main`: `Already up to date`.
- `git fetch --prune`: concluido.
- `git status --short`: limpo.
- `git log --oneline -5`: topo `a0b5088 Merge pull request #346 from 5906375/docs/imob-pilot-6j-ci-gate-stabilization-review`.

## Entrada do Usuario

Decisao:

- Entrada primaria: `/app/chat`.
- O usuario final usa o Chat universal / Front Door EIAH.
- O IMOB aparece como vertical/handoff anunciado dentro da experiencia do Front Door.
- Nao criar chat IMOB paralelo para este preview.
- `/app/imob/chat` pode ser mencionado apenas como rota/contexto existente mapeado ou transicional, nunca como entrada primaria do preview.

Motivo:

- O roadmap e a arquitetura `agent-driven` tratam o EIAH como front door da conversa.
- O `ChatAgentLauncher` deve continuar renderizando resultado ja decidido, sem criar regra cognitiva local.
- A decisao preserva continuidade de conversa e evita apresentar IMOB como bot separado para o primeiro preview visual.

## Rota Provavel para 7B

Rota/local provavel para a implementacao 7B:

`/app/chat?agent=eiah&domain=imob&fixture=imob-pilot-2-shadow-dry-run#chat-agent-launcher`

Esta rota deve preservar a experiencia de Front Door e nao transformar IMOB em chat separado. O parametro `fixture` deve acionar somente renderizacao fixture-only/read-only, sem chamada operacional, sem leitura produtiva e sem mutacao.

## Resultado Visual Esperado

O preview do 7B deve mostrar um primeiro painel/card visual IMOB read-only contendo:

- Painel/card IMOB read-only.
- Badge/contexto vertical IMOB.
- Handoff message.
- HITL gate state read-only.
- Proof/receipt/bundle state read-only.
- ReasonCodes.
- RiskLevel.
- Banner `Preview IMOB nao operacional`.

Nenhum CTA mutacional deve aparecer. Qualquer acao permitida deve ser visual, informativa ou read-only.

## Componente Visual

Componente escolhido para o handoff:

- `ChatVerticalHandoffSurface`

Leitura para 7B:

- `ChatVerticalHandoffSurface` cobre a camada de handoff read-only.
- 7B provavelmente precisara de um wrapper leve fixture-only para:
  - banner non-operational;
  - HITL read-only;
  - proof/receipt/bundle state read-only;
  - organizacao visual no Front Door.

Esse wrapper deve receber dados ja resolvidos a partir da fixture e nao deve decidir policy, autorizacao, aprovacao ou execucao.

## Dados

Fixture escolhida:

- `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json`

Uso esperado:

- Dados sinteticos e sanitizados.
- Sem dados reais.
- Sem provider.
- Sem leitura produtiva.
- Sem DB, ledger ou audit.
- Sem receipt, bundle ou proof real.

Campos relevantes da fixture para o preview:

- `expectedHandoffSnapshot`
- `expectedHitlGateState`
- `expectedProofReceiptBundleState`
- `expectedReasonCodes`
- `renderExpectation`
- `nonAuthorization`

## Arquivos Provaveis para 7B

Arquivos provaveis para IMOB-PILOT-7B, sem alteracao nesta fase:

- `apps/web/src/pages/app/agents/index.tsx`
- Novo wrapper em `apps/web/src/components/chat/*`
- Teste TSX correspondente
- Helper fixture-only em `apps/web/src/features/imob/*`, se necessario

Arquivos que 7B deve tratar com cuidado:

- `apps/web/src/components/agents/ChatAgentLauncher.tsx`: nao deve receber regra cognitiva nova.
- `apps/web/src/App.tsx`: nao deve criar rota primaria paralela se a decisao permanecer Front Door.
- `apps/web/src/pages/app/imob/chat.tsx`: contexto existente, nao entrada primaria do preview.

## Boundaries

IMOB-PILOT-7A preserva:

- Sem preview implementado no 7A.
- Sem provider.
- Sem DB, ledger ou audit.
- Sem receipt, bundle ou proof real.
- Sem CTA mutacional.
- Sem aprovacao real.
- Sem policy decision no frontend.
- Sem regra no `ChatAgentLauncher`.
- Sem dry-run real.
- Sem shadow real.
- Sem pilot ou small rollout.
- Sem operacao IMOB fechada.
- Sem Receipt Canon fechado.
- Sem alteracao de frontend, runtime/API, CI, `package.json`, scripts/testes ou Evidence Index.

## Proxima Fase

Proxima fase proposta:

- `IMOB-PILOT-7B - Front Door IMOB Fixture Preview Implementation`

O 7B deve implementar o primeiro resultado visual read-only no frontend pelo Front Door em `/app/chat`, usando a fixture IMOB-PILOT-2 e preservando todos os boundaries desta decisao.
