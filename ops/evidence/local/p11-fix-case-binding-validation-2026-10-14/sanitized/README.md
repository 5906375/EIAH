# P11-FIX — vínculo conversa↔caso fail-closed no `claimOnly`: evidências sanitizadas de 14/10/2026

Status: **parcial** — validação local histórica, restrita ao ramo `claimOnly`; não reexecutada contra `main`.
Resultado original registrado: `P11_CASE_BINDING_FIXED_AND_VALIDATED` (2026-10-14).

## Resumo (derivado dos originais)

- Matriz de cenários (original): 1 PARCIAL, 11 PASS.
- Testes dirigidos (execução original): imob-specialist-bridge.test.ts 28/28, vertical-access-resolver.test.ts 20/20, chat-vertical-registry.test.ts 5/5, chat-vertical-imob-handoff.test.ts 13/13, vertical-access-revocation.test.ts 5/5, agents-public-view.contract.test.ts 37/37, createImobStructuredForms.test.ts 126/126, chatLauncherEngine.test.ts 112/112, verticalHandoffEngine.test.ts 30/30, frontDoorAccessEngine.test.ts 3/3, frontDoorBillingEngine.test.ts 6/6, FrontDoorSessionHeader.test.tsx 23/23, verticalActivationEngine.test.ts 15/15, ImobChatWidgets.test.tsx 16/16, imobCommandCenterHelper.test.ts 14/14, imob-copilot-conversation.test.ts 16/18, imob-crm-resolver.test.ts 39/44, imob-owner-blocker-consult.test.ts 2/4 (os arquivos com `fail` > 0 são os marcados como falhas preexistentes pelo próprio original).
- Linhas adicionais do resumo original: integration: # pass 32 # fail 0 | typecheck api: fix=430 baseline=430 idênticos=SIM | typecheck web: fix=62 baseline=62 idênticos=SIM
- **Pendências independentes preservadas** (abertas à época, fora do `claimOnly`): ver a seção correspondente no registro original e `independentPendingItemsPreserved` em `results.json`.

## Dado original, derivação sanitizada e limitações

| Camada | Conteúdo |
| --- | --- |
| Dado original | 70 arquivos desta pasta, preservados fora do repositório (README, MANIFEST.sha256, capturas de tela, logs, registros de navegador/API, snapshots do banco descartável, provas de isolamento e estado Git, conforme a pasta). Nenhum foi alterado, movido ou versionado por este empacotamento. |
| Derivação sanitizada (esta pasta) | `README.md` (este arquivo), `results.json` (matriz, testes, pendências independentes e hashes dos originais), `packaging-verification.json`, `selected-tests.tap` (19 logs TAP concatenados). Hashes SHA-256 dos originais copiados do `MANIFEST.sha256` já existente (não recalculados). Caminhos locais, identificadores e URLs foram substituídos por marcadores nas cópias. |
| Limitações | Execução local histórica em ambiente descartável, com fixtures de teste e sem aceite manual humano. Referências a capturas de tela e a arquivos brutos no registro original (`A-*`, `B-*`, `*-result.json`, `logs/…`) apontam para originais que **não** estão nesta pasta. Ver também "Contexto posterior". |

## Contexto posterior (não faz parte da evidência original)

- Os artefatos descrevem execuções de 2026-10-14 sobre o código daquela época. **Não foram reexecutados** contra `origin/main` nem contra a branch de integração IMOB e **não afirmam o estado atual**.
- O commit local `e4575b03` (P11) foi classificado em 2026-11-06 como `SUPERSEDED_BY_CURRENT_HEAD`: a tentativa de aplicá-lo (cherry-pick) sobre `origin/main` (`249d6a5f`) mais dois commits resultou em 4 arquivos conflitantes em que o lado atual era igual ou mais novo, e os demais arquivos resolveram para conteúdo idêntico ao atual. A classificação se baseia em evidência de aplicação, não em patch-id idêntico.
- Os commits `77816561`, `8678347f` e `88bb3a2d` têm equivalentes em `origin/main` (`7102a82f`, `6fe4ae47`, `c6544125`), registrados como cherry-picks.

## Registro original (README original, sanitizado)

### P11-FIX — vínculo conversa↔caso FAIL-CLOSED no `claimOnly`

Resultado: **P11_CASE_BINDING_FIXED_AND_VALIDATED**. Alterações NÃO commitadas no worktree `<P11_WORKTREE>`
(branch `feat/p11-front-door-transversal-orchestration`, base `88bb3a2`; 17 arquivos modificados, 0 novos); árvore principal e CRM/C4 intactos.

#### Regra implementada (somente no ramo `claimOnly`; o `resolve-turn` normal não mudou)
1. Com `caseId` explícito: só o caso desse id, no escopo (tenant+workspace do TOKEN) e na etapa que a pessoa opera; senão a negativa é APRESENTADA (`crm.case.transversal.case_denied`, `CASE_NOT_IN_SCOPE` ou `STAGE_DENIED`), sem ler nem vincular outro caso.
2. Sem `caseId`: nenhuma leitura de caso (nem "o mais recente", nem "o único"); recomendação de MKT sem caso (widget `document_checklist` existente) que pede a identificação do imóvel.
3. O servidor só devolve `caseContext` quando o vínculo foi explícito e autorizado; o hook do Front Door não herda caso anterior nas respostas reivindicadas (caso negado/sem caso não fica preso à conversa).
4. A negativa é decidida ANTES de qualquer resolução implícita (thread/mais recente) — o ramo foi movido para antes do `existingScopedCase`; assim a negativa chega até a apresentação, sem fallback e sem o 500 da rota normal.

#### Reuso (consultado → reutilizado → estendido)
`vertical.access.v1` e `chat.vertical_handoff.v2` (avaliação `evaluateImobFrontDoorCapabilityAccess`, sem mudança), `interpretTransversalTurn` e `resolveImobTransversalTurnStage` (estendida com `resolveCase`/`readTransversalCapabilities`), `discoverImobTransversalCapabilitiesForTurn` (descoberta sem caso), `canWorkspaceOperateImobStage` (permissão de etapa, versão sem resposta HTTP), widget `document_checklist` e `ImobChatWidgets` (render), `buildTransversalTurnText` (variante sem caso) + `buildCaseBindingDenialText` (única função nova, texto).

#### Matriz (API: `api_scenarios.json`; navegador: `A-*`/`B-*` + `*-result.json`)
| Cenário | Resultado |
|---|---|
| A. `caseId` explícito autorizado, 3 turnos encadeados (Ana) e Bruno | PASS: CASE_A nos 4; nada do B; autoridade correta (Ana somente consulta / Bruno autorizado) |
| B. sem `caseId`, "Batel" (Ana e Bruno) | PASS: sem caso, sem marcadores de imóvel, pede identificação; autoridade por pessoa |
| B2. sem `caseId`, "imóvel do Centro" | PASS: continua sem caso (não resolve por texto) |
| C. ambíguo ("meu apartamento", "campanha para esse imóvel", "contratou o Marketing?") | PASS: sem vínculo arbitrário |
| D. continuidade na UI: 3 turnos + Self-service + retorno + 4º turno (desktop e celular) | PASS: todos os pedidos `claimOnly` com `caseId` nulo; nenhum caso fixado; cartões restaurados |
| E. `caseId` de outro workspace / outro tenant / inexistente | PASS: negado (`CASE_NOT_IN_SCOPE`), sem fallback, sem marcadores "SEGREDO", sem ids de caso |
| F1. só etapa `proposal`, sem `caseId` | PASS: recomendação sem caso (nada do caso lido) |
| F2/F3. só etapa `proposal`, `caseId` A e B | PASS: `STAGE_DENIED` com 200 limpo (sem 500), sem dados |
| G. billing, convite, contrato, cadastro, "bom dia" | PASS: `claimed:false` / fluxos do Front Door intactos (UI: 0 reivindicações nos 3 primeiros; cadastro = handoff existente) |
| Ana e Bruno em `/app/chat` (desktop e celular), MKT sem caso, sem passar por `/app/imob/chat` | PASS: cartão sem caso; links de detalhes ao Self-service com retorno à conversa |
| Mutações comerciais / banco | PASS: `blocked-mutations=[]`; snapshot do banco idêntico antes x depois |
| Erros de console | PARCIAL: 404 herdado de `runtime-shadow-state` (handoff IMOB existente) |

#### Testes dirigidos
API: bridge 28/28 (+3 reescritos/novos de vínculo), access-resolver 20/20, registry 5/5, handoff 13/13, revocação 5/5, agents-public-view 37/37, integração HTTP+PostgreSQL 32/32
(novos: vínculo explícito, sem caseId, isolamento, etapa). Web: `createImobStructuredForms` 126/126 (+2), `chatLauncherEngine` 112/112, handoff 30, access 3, billing 6, header 23, activation 15, widgets 16, helper 14.
Falhas preexistentes inalteradas: copilot 16/2, crm-resolver 39/5, owner-blocker 2/2. Typecheck API 430 / web 62 com diagnósticos idênticos ao baseline.
Mutações: 7/7 detectadas (fallback sem caso, negativa ignorada, texto afirmando caso, hook herdando caso, escopo do caso ignorado, etapa ignorada, "mais recente" por rota).

#### Pendências INDEPENDENTES preservadas (não resolvidas; evidência em `pendencias_independentes.json`)
1. Rota normal `resolve-turn` sem `caseId` ainda usa o caso mais recente e ignora a permissão de etapa (Carla: 200 com o caso B).
2. `ensureImobStagePermission/WorkspacePermission(res, …)` ainda responde 500 em vez de 403 na rota normal (Carla com `caseId` explícito: 500).

#### Limites
Sem LLM (léxico fechado do P10). O 1º turno de uma conversa do Front Door nunca traz caso: o vínculo exige um `caseId` explícito, hoje fornecido por fluxos do IMOB que devolvem `caseContext`; identificar o imóvel por texto/lista é decisão de produto futura. Fixtures: habilitação do EIAH e designação do Bruno são de teste.


## Proveniência e sanitização

Os originais permanecem preservados localmente e fora do commit; a conferência de que nenhum foi modificado por este empacotamento (tamanho e data de modificação antes e depois) e a varredura de resíduos nas cópias estão registradas em `packaging-verification.json`. Capturas de tela, snapshots de banco, estado Git bruto, provas de infraestrutura e registros de cenários com identificadores foram omitidos; seus resultados úteis aparecem apenas nas cópias sanitizadas. O Evidence Index aponta somente para os arquivos desta pasta `sanitized/`.
