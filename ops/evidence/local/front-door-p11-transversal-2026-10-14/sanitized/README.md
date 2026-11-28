# P11 — Front Door transversal: evidências sanitizadas de 14/10/2026

Status: **parcial** — validação local histórica; não reexecutada contra `main`.
Resultado original registrado: `P11_FRONT_DOOR_TRANSVERSAL_VALIDATED` (2026-10-14), em worktree local sobre a base `88bb3a2`, com alterações então não commitadas (hoje no commit local `e4575b03`).

## Resumo (derivado dos originais)

- Critérios da matriz original: 1 NOT_DEMONSTRATED, 1 PARCIAL, 10 PASS.
- Testes dirigidos (execução original): imob-specialist-bridge.test.ts 27/27, vertical-access-resolver.test.ts 20/20, chat-vertical-registry.test.ts 5/5, chat-vertical-imob-handoff.test.ts 13/13, vertical-access-revocation.test.ts 5/5, agents-public-view.contract.test.ts 37/37, createImobStructuredForms.test.ts 124/124, chatLauncherEngine.test.ts 112/112, verticalHandoffEngine.test.ts 30/30, frontDoorAccessEngine.test.ts 3/3, frontDoorBillingEngine.test.ts 6/6, FrontDoorSessionHeader.test.tsx 23/23, verticalActivationEngine.test.ts 15/15, ImobChatWidgets.test.tsx 16/16, imobCommandCenterHelper.test.ts 14/14; todos com `fail=0`.
- Linhas adicionais do resumo original: integration: # pass 29 # fail 0  netguard BLOCK=0 | typecheck api: p11=430 baseline(88bb3a2)=430 diagnosticos idênticos ao baseline=SIM | typecheck web: p11=62 baseline(88bb3a2)=62 diagnosticos idênticos ao baseline=SIM
- Nada aqui afirma a correção do vínculo conversa↔caso: o gate seguinte (`p11-case-binding-gate-2026-10-14`) registra **FAIL histórico** nesse ponto, tratado depois em `p11-fix-case-binding-validation-2026-10-14`.

## Dado original, derivação sanitizada e limitações

| Camada | Conteúdo |
| --- | --- |
| Dado original | 70 arquivos desta pasta, preservados fora do repositório (README, MANIFEST.sha256, capturas de tela, logs, registros de navegador/API, snapshots do banco descartável, provas de isolamento e estado Git, conforme a pasta). Nenhum foi alterado, movido ou versionado por este empacotamento. |
| Derivação sanitizada (esta pasta) | `README.md` (este arquivo), `results.json` (matriz, testes e hashes dos originais), `packaging-verification.json`, `selected-tests.tap` (16 logs TAP concatenados). Hashes SHA-256 dos originais copiados do `MANIFEST.sha256` já existente (não recalculados). Caminhos locais, identificadores e URLs foram substituídos por marcadores nas cópias. |
| Limitações | Execução local histórica em ambiente descartável, com fixtures de teste e sem aceite manual humano. Referências a capturas de tela e a arquivos brutos no registro original (`A-*`, `B-*`, `*-result.json`, `logs/…`) apontam para originais que **não** estão nesta pasta. Ver também "Contexto posterior". |

## Contexto posterior (não faz parte da evidência original)

- Os artefatos descrevem execuções de 2026-10-14 sobre o código daquela época. **Não foram reexecutados** contra `origin/main` nem contra a branch de integração IMOB e **não afirmam o estado atual**.
- O commit local `e4575b03` (P11) foi classificado em 2026-11-06 como `SUPERSEDED_BY_CURRENT_HEAD`: a tentativa de aplicá-lo (cherry-pick) sobre `origin/main` (`249d6a5f`) mais dois commits resultou em 4 arquivos conflitantes em que o lado atual era igual ou mais novo, e os demais arquivos resolveram para conteúdo idêntico ao atual. A classificação se baseia em evidência de aplicação, não em patch-id idêntico.
- Os commits `77816561`, `8678347f` e `88bb3a2d` têm equivalentes em `origin/main` (`7102a82f`, `6fe4ae47`, `c6544125`), registrados como cherry-picks.

## Registro original (README original, sanitizado)

### P11 — Front Door como condução única: divulgação de imóvel → recomendação governada de MKT na MESMA conversa de /app/chat

Resultado: **P11_FRONT_DOOR_TRANSVERSAL_VALIDATED** (alterações NÃO commitadas, no worktree `<P11_WORKTREE>`,
branch `feat/p11-front-door-transversal-orchestration`, base `88bb3a2`; árvore principal e CRM/C4 intactos).

Ambiente da validação visual: API (`NODE_ENV=test`, workers não iniciados) e Vite locais a partir do worktree, PostgreSQL/Redis em contêineres próprios
só em loopback (`eiah-p11-*`, tmpfs), credenciais sintéticas (arquivo privado destruído), guarda de rede com 0 bloqueios, sem provedores nem cobrança.
**Fixture declarada:** habilitação sintética do agente de Front Door **EIAH** (sem agente habilitado `/app/chat` não tem agente selecionável); MKT não habilitado.
Ana = corretora sem autoridade comercial; Bruno = gestor com `holder` de fixture. Caso sintético `listing.activate` (Batel). Ver `isolation_proof.txt`.

#### Jornada validada (desktop 1366x900 e celular 390x844; sessões isoladas; sempre a partir de /app/chat; nenhuma visita a /app/imob/chat)
1. Login → `/app/chat`, agente EIAH. 2. Em conversa NOVA: "Quero divulgar este apartamento do Batel." → na própria conversa: texto honesto + "Resumo do negócio" +
cartão "Especialistas transversais" (MKT, "habilitável (ainda não habilitado)"). Ana: `somente_consulta`, sem botões, só "Ver os detalhes de MKT (somente consulta)".
Bruno: `contratacao_autorizada`, "Ver os detalhes comerciais de MKT no Self-service". 3. "O Marketing pode ajudar a anunciar essa unidade?" e "Isso já contratou o
Marketing?" ("Ainda não…", sem "caso jurídico"). 4. A conversa continua (3 cartões, 3 perguntas na tela, caso reaproveitado: 1º `caseId` nulo → servidor devolve o caso do
workspace; os próximos turnos já o enviam). 5. Link do cartão → Self-service com o MKT destacado e `returnTo=/app/chat`: Ana sem controle de assinatura; Bruno vê "Assinar" (NÃO acionado).
6. "Voltar à conversa" → `/app/chat` com a conversa restaurada (3 cartões e as mensagens) e continuação (4º cartão).

#### Matriz PASS / FAIL / NOT_DEMONSTRATED (somente o visto na tela)
| # | Critério | Resultado | Evidência |
|---|---|---|---|
| 1 | Divulgação em conversa nova de /app/chat recebe, na mesma conversa, a recomendação governada de MKT | PASS | `*-03-divulgacao`, `*-03b-card-mkt`; `claimOnly=true`, `claimed=true`, ação `crm.case.transversal.request_capability` |
| 2 | Ana: sem autoridade → sem CTA acionável; detalhes só de consulta | PASS | `A-03b`, `A-07`; `controlesDeAssinatura=[]` |
| 3 | Bruno: autoridade (servidor) reconhecida; MKT correto no Self-service; sem assinar | PASS | `B-03b`, `B-07`; "Assinar" visível, 0 mutações |
| 4 | "Contratou o Marketing?" não vira contrato imobiliário/jurídico | PASS | `*-05-ja-contratou`; sem "caso jurídico"; "Ainda não…" |
| 5 | Conversa e caso preservados (turnos seguintes, ida ao Self-service e volta) | PASS | `*-05b`, `*-08-retorno-a-conversa`, `*-09`; cartões restaurados; `caseId` reenviado |
| 6 | Perguntas de plataforma, convite, contrato, cadastro e "bom dia" não são interceptados | PASS | `*-06-protegido-*`; billing/convite/contrato: 0 chamadas de reivindicação; cadastro: handoff existente; "bom dia": `claimed=false` |
| 7 | Convite governado do Front Door intacto (Ana restrita; Bruno vê o formulário, não enviado) | PASS | `A-06-protegido-convidar`, `B-06-protegido-convidar` |
| 8 | Sem navegação para /app/imob/chat; resposta renderizada com `ImobChatWidgets` | PASS | `urls-visitadas` em `*-result.json` |
| 9 | Nenhuma contratação/habilitação/delegação/cobrança/campanha; 0 mutações no navegador; banco idêntico antes x depois | PASS | `db_snapshot_*`; `blocked-mutations=[]` |
| 10 | Celular sem overflow horizontal (Front Door e Self-service) | PASS | `*-10`..`*-13`; overflow=false |
| 11 | Erros de console | PARCIAL | 2× 404 por execução (`runtime-shadow-state` do handoff IMOB existente; sem efeito visível) |
| 12 | Seleção do agente após navegar e voltar | NOT_DEMONSTRATED (limite herdado) | o seletor volta a "Selecione um agente" no celular ao recarregar; as mensagens são restauradas; não alterado (launcher restrito) |

#### Testes dirigidos (worktree P11; ver `tests_summary.txt` e `logs/`)
API: bridge 27/27 (+2 etapa transversal/claim), vertical-access-resolver 20/20 (+4 acesso do Front Door), registry/handoff/revocação 5/5, 13/13, 5/5, agents-public-view 37/37,
integração HTTP+PostgreSQL `marketplace.installations.activate` 29/29 (+4 `claimOnly`). Web: `createImobStructuredForms` 124/124 (+8: hook, renderer, engine, FDC-03A),
`chatLauncherEngine` 112/112, `verticalHandoffEngine` 30/30, access/billing/session-header/activation 3/6/23/15, `ImobChatWidgets` 16/16. Typecheck API 430 / web 62, diagnósticos idênticos ao baseline.
Mutações: 7/8 detectadas; a sobrevivente (ignorar revisão de proposta pendente no engine) é defesa em profundidade — a continuidade da revisão já consome o turno antes do ponto da reivindicação.

#### Limites conhecidos
- Sem LLM: a vertical só reivindica o que o interpretador P10 (léxico fechado) reconhece; o resto segue o Front Door como antes.
- Sem `caseId` na conversa, o servidor usa o caso mais recente do workspace (com várias frentes abertas pode não ser o pretendido; depois do 1º turno o `caseId` fica preso à conversa).
- A reivindicação só é tentada quando a decisão local do Front Door é um palpite genérico (fallback/esclarecimento/roteamento por palavra) e o IMOB está instalado; respostas exatas de plataforma nunca consultam a vertical.
- Liberação do IMOB revogada (bloqueio total ou somente leitura): o gate de revogação existente do IMOB recusa o POST (403) → nada é reivindicado (fail-closed). O `vertical.access.v1` permitiria a consulta em somente leitura, mas o gate vem antes.
- Ações de recomendação do resumo (ex.: "Publicar anúncio") não são oferecidas no Front Door; ficam no chat do caso.
- Fixtures: habilitação do EIAH e designação do Bruno são de teste (bootstrap real da 1ª autoridade segue bloqueado).


## Proveniência e sanitização

Os originais permanecem preservados localmente e fora do commit; a conferência de que nenhum foi modificado por este empacotamento (tamanho e data de modificação antes e depois) e a varredura de resíduos nas cópias estão registradas em `packaging-verification.json`. Capturas de tela, snapshots de banco, estado Git bruto, provas de infraestrutura e registros de cenários com identificadores foram omitidos; seus resultados úteis aparecem apenas nas cópias sanitizadas. O Evidence Index aponta somente para os arquivos desta pasta `sanitized/`.
