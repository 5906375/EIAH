# Continuidade contextual do cadastro IMOB — validação local

Data: 2026-11-14. Status: **parcial** (provider real e navegador não executados).
Branch preservada: `feat/front-door-intake-run-lifecycle-imob-evaluation`.
HEAD preservado: `453a3b0bf5e666e227a129b4930399e5ffac6efb`.
Executor: Codex, sem subagentes. As alterações preexistentes em CLAUDE.md e CODEX.md foram preservadas.

## Causa localizada

- `apps/web/src/pages/app/imob/proposalForm.ts`, `resolveProposalTurnContinuation`: a continuidade anterior só consumia `proposal.create`.
- `apps/web/src/features/imob/structured/useImobFrontDoorForms.ts`: o formulário de cadastro já tinha valores atuais por mensagem, mas não reivindicava perguntas livres enquanto aberto.
- `apps/web/src/components/agents/legalContextResolver.ts`, `isLegalRoutingQuestion`: a heurística ampla inclui `imovel`. Sem continuidade do formulário, a mensagem de reprodução podia seguir para `legal_context_entry` no `chatLauncherEngine.ts`.
- `buildLegalContextEntryReply`, no mesmo resolver jurídico, produz literalmente “Isso parece um caso jurídico.”; `buildLegalQuickRepliesForInput` e `buildLegalInputPlaceholderForInput` fornecem a apresentação jurídica. Não foi inferida a causa apenas pela descrição de staging.

## Fluxo aplicado

O agente IMOB define `IMOB_PROPERTY_CAPTURE_POLICY` e `IMOB_PROPERTY_CAPTURE_SYSTEM_PROMPT`. O engine do Front Door prioriza o formulário ativo antes das heurísticas isoladas de jurídico/help/handoff. `continuePropertyCapture` coleta os valores vivos de `useImobFormState`, incluindo edições manuais, e histórico limitado à região do formulário.

A rota existente `POST /imob/chat/resolve-turn`, com `intake=property_draft`, reutiliza enforceTenant, revogação, instalação, membership, workspace access, `imob.chat.use` e entitlement IMOB. Perfil/modelo vêm da sessão no servidor; o executor é `executeLlmStep`, o mesmo runtime central utilizado pelo intake do Front Door. A policy do perfil é preservada e o masking é obrigatório. O corpo não autoriza nada, não vincula caso e não escolhe tenant/workspace/permissões.

O provider propõe um patch com evidência literal na mensagem, campo, valor e indicação de correção explícita. Schema, catálogo real de opções e validação do cadastro protegem os valores. Conflito sem correção explícita, baixa confiança ou ambiguidade preservam todos os campos. Quartos e vagas já existem no cadastro; nenhum schema de persistência foi ampliado.

Campos obrigatórios, opções e orientação são derivados de `buildPropertyCreateForm`, reutilizado do runtime IMOB. A resposta só altera os campos do mesmo formulário. Nenhum método de criação de imóvel, dispatch operacional ou confirmação de escrita é chamado pelo intake. Salvar continua sendo uma ação explícita do formulário, com a validação existente.

Snapshots do adaptador resolvem sugestões e placeholder durante o cadastro e a pausa. `ChatAgentLauncher.tsx` recebeu somente o transporte de `propertyCaptureContext`. Perguntas intermediárias não encerram a operação; saída explícita pausa e preserva o rascunho, e a retomada exata reutiliza o formulário.

Respostas são descartadas após mudança de usuário, token, tenant, workspace, domínio, agente/escopo, geração da conversa, formulário, thread, caso ou turno. A revisão síncrona dos valores também invalida respostas após edição, inclusive editar e voltar ao valor anterior. Salvar/cancelar o formulário invalida a aplicação tardia. Timeout, indisponibilidade e payload inválido terminam a espera compartilhada, preservam o formulário e permitem reenviar a mensagem.

## Última edição e retomada

O último ajuste de produção em `useImobFrontDoorForms.ts` acrescentou o vínculo com `thread.id`/`caseContext.caseId` na guarda de respostas tardias e a limpeza apenas dos erros dos campos efetivamente atualizados pelo patch. Foram acrescentadas asserções para os dois pontos, e reexecutados somente os sete testes de cadastro afetados. Os 173 testes anteriores do mesmo arquivo foram reaproveitados da execução completa válida de 180 testes.

O prompt foi realocado do intake para o contrato do agente, sem alteração de conteúdo nem acréscimo de dependências externas. Os nove testes novos do intake foram revalidados após a realocação. O gate sem DB autorizado terminou com 2/2 e saída 0. O typecheck com `vite-env.d.ts` foi efetivamente executado e terminou com saída 0.

## Resultados reais

Contagens e códigos de saída recuperados das execuções estão em `results.json`; logs originais foram preservados neste diretório. Nenhuma chamada paga foi executada. Os testes novos usam respostas sintéticas injetadas.

| Validação | Resultado | Saída | Executados/aprovados/reprovados/ignorados |
| --- | --- | --- | --- |
| Intake e callback real da rota com dependências injetadas, após realocação do prompt | APROVADO | 0 | 9/9/0/0 |
| Formulários, execução completa anterior | APROVADO | 0 | 180/180/0/0 |
| Cadastro afetado pela última edição, execução final focal | APROVADO | 0 | 7/7/0/0 |
| Engine sem DB, fora do sandbox autorizado | APROVADO | 0 | 2/2/0/0 |
| Regressões selecionadas, execução inicial | REPROVADO | 1 | 6 arquivos: 5 aprovados, 1 reprovado pelo ambiente |
| Launcher render-only | APROVADO | 0 | gate sem violações |
| Entrypoint debt | APROVADO | 0 | gate sem violações |
| Presentation snapshot contract | APROVADO | 0 | contrato v1 consistente |
| Typecheck focal com vite-env | APROVADO no recorte | 0 | 12 fontes, zero diagnósticos focais; 17 diagnósticos de dependências excluídos |
| Typecheck de packages/contracts sem emissão | APROVADO | 0 | pacote de contratos |
| Evidence Index, fora do sandbox autorizado | APROVADO | 0 | 8/8/0/0; 950 referências conferidas |
| Diff-check e stage | APROVADO | 0 | sem erros de whitespace; stage vazio |
| Provider real, HTTP com banco e navegador | NÃO EXECUTADO | — | sem autorização de execução real nesta etapa |

Os cinco arquivos de regressão aprovados, reaproveitados sem repetição: `imob-agent-contract.test.ts`, `chatLauncherEngine.test.ts`, `imobCepAutofill.test.ts`, `propertyCreateForm.test.ts` e `unitSuiteInventory.test.ts`. O sexto arquivo era `imob-turn-engine-no-db-import.test.ts`: a tentativa no sandbox perdeu a captura de saída dos subprocessos. Um diagnóstico isolado registrou `error=EPERM`, `stdoutBytes=0`, `stderrBytes=0`; o teste passou fora do sandbox com autorização específica. Isso não foi corrigido alterando o código de produção.

A falha inicial de um teste novo veio de uma asserção que confundia o nome do campo `ownerId` na descrição do formulário com o envio de um identificador. A asserção foi corrigida para verificar a ausência de identificadores no draft, e os nove testes passaram. O typecheck inicial omitira a declaração global `vite-env.d.ts`; o diagnóstico focal corrigido inclui a declaração existente. Falhas iniciais permanecem nos logs e não são apresentadas como aprovações.

O gate do Evidence Index também encontrou a limitação de captura de subprocessos no sandbox, pois testa referências históricas com Git. Após autorização específica, `pnpm check:evidence-index` passou fora do sandbox com 8 testes e 950 referências válidas. Os dois logs foram preservados (`evidence-gate.log` e `evidence-gate-authorized.log`).

## Comandos e CI

- Testes focais: `TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx apps/api/src/tests/imob-property-capture-intake.test.ts`.
- Formulários: mesmo ambiente com `node --import tsx apps/web/src/features/imob/structured/createImobStructuredForms.test.ts`; última edição: `node --import tsx --test-name-pattern='^cadastro' apps/web/src/features/imob/structured/createImobStructuredForms.test.ts`.
- Nas execuções de testes, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` e `DEEPSEEK_API_KEY` foram explicitamente esvaziadas no processo. Nenhuma configuração persistente foi alterada.
- Isolamento: `TSX_TSCONFIG_PATH=apps/web/tsconfig.json node --import tsx --test apps/api/src/tests/imob-turn-engine-no-db-import.test.ts`, com a mesma neutralização de chaves e autorização de execução fora do sandbox.
- Tipagem: `node ops/evidence/latest/imob-property-capture-context-2026-11-14/typecheck-focused.mjs`; `pnpm exec tsc -p packages/contracts/tsconfig.json --noEmit`.
- Gates: `pnpm check:chat-launcher-render-only`, `pnpm check:chat-runtime-entrypoint-debt`, `pnpm check:presentation-snapshot-contract`.
- O teste novo da API foi incluído em `scripts/unit-tests-manifest.txt` e no script correspondente `test:ci-unit-suite` de `package.json`. O arquivo de testes de formulários já integra esse mecanismo. A reconciliação manifesto/comando passou; a suíte inteira não foi repetida.

## Diff consolidado e arquivos

`changes.diff` reúne as alterações da tarefa, inclusive os três novos arquivos de código/testes, sem incluir as modificações preexistentes de CLAUDE.md/CODEX.md nem os próprios artefatos de evidência.

- Contratos: `packages/contracts/src/imobPropertyCapture.ts`, `packages/contracts/src/index.ts`, `apps/api/src/services/imob/imobAgentContract.ts`.
- Engine/intake/API: `apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts`, `apps/api/src/services/imob/crm/imobCrmTurnEngine.ts`, `apps/api/src/services/imob/imobTurnResolver.ts`, `apps/api/src/routes/imob.ts`, `apps/web/src/lib/api.ts`.
- Engine e coleta/renderização: `apps/web/src/components/agents/chatLauncherEngine.ts`, `apps/web/src/components/agents/ChatAgentLauncher.tsx`, `apps/web/src/features/imob/structured/useImobFrontDoorForms.ts`, `apps/web/src/features/imob/structured/useImobFormState.ts`, `apps/web/src/features/imob/structured/types.ts`.
- Testes/CI: `apps/api/src/tests/imob-property-capture-intake.test.ts`, `apps/web/src/features/imob/structured/createImobStructuredForms.test.ts`, `scripts/unit-tests-manifest.txt`, `package.json`.
- Evidência: este diretório e a entrada correspondente em `docs/EVIDENCE_INDEX.md`.

## Limitações e reteste posterior

- Dublês comprovam despacho, validação, patch, continuidade, erros e descarte tardio. Não comprovam interpretação semântica de nenhum provider real.
- O callback da rota foi exercitado com dependências injetadas; não equivale a HTTP com sessão/DB reais. Gates de autorização existentes foram reutilizados; não houve alteração de staging.
- O typecheck é focal, não aprovação global do monorepo. Os 17 diagnósticos de dependências não foram corrigidos nem classificados como preexistentes por uma comparação que não ocorreu.
- O incremento cobre o formulário de cadastro pendente no Front Door. Não redesenha a abertura inicial, o roteamento geral, o cockpit dedicado, billing ou outras verticais. Formulários em lote continuam com o fluxo já existente.
- Navegador e capturas não foram executados nesta etapa; não há evidência visual fabricada.

Roteiro posterior, em ambiente e com uso de provider autorizados: abrir `/app/chat`, iniciar o cadastro de apartamento para locação em Balneário Camboriú; sem salvar, informar quartos e vaga e perguntar o que falta. Conferir um só formulário, valores 2/1, orientação de endereço e placeholder de cadastro. Editar manualmente um campo, enviar uma correção de outro campo e conferir preservação. Simular resposta lenta e editar/trocar conversa: o retorno deve ser descartado. Simular indisponibilidade: a espera termina e o draft permanece. Pedir mudança de assunto e retomar pelo botão, sem salvar o imóvel.

Logs locais e `typecheck-focused.mjs` foram preservados para rastreabilidade e reprodução, todos criados por esta execução. Nenhum arquivo temporário fora deste diretório foi criado ou removido. Sem stage, commit, push, PR, merge, deploy, alteração externa ou gravação real de imóvel.
