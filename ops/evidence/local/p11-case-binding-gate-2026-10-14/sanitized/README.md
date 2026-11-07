# P11 — gate de vínculo conversa↔caso (BLOQUEADO): evidências sanitizadas de 14/10/2026

Status: **parcial** — registro histórico que inclui **FAIL**s preservados; não reexecutado contra `main`.
Resultado original registrado: `P11_CASE_BINDING_AND_GOVERNANCE_BLOCKED` (2026-10-14). Nada foi corrigido nesta etapa (segundo o original).

## Resumo (derivado dos originais)

- Cenários com FAIL registrado (preservados): B; C; D; E1; E2; E3; F1.
- Cenários só com PASS: A; Isolamento; Banco/efeitos.
- Cenário F2 (`caseId` explícito de caso em etapa não operada): fail-closed, mas com código HTTP incorreto (500 em vez de 403), como registrado no original.
- As duas guardas de acesso foram revisadas sem divergência própria (`guards_review.md`); os achados estão no vínculo conversa↔caso (fallback silencioso ao caso mais recente, permissão de etapa ignorada no fallback, 500 em vez de 403).
- A correção do ramo `claimOnly` aparece na pasta `p11-fix-case-binding-validation-2026-10-14`.

## Dado original, derivação sanitizada e limitações

| Camada | Conteúdo |
| --- | --- |
| Dado original | 14 arquivos desta pasta, preservados fora do repositório (README, MANIFEST.sha256, capturas de tela, logs, registros de navegador/API, snapshots do banco descartável, provas de isolamento e estado Git, conforme a pasta). Nenhum foi alterado, movido ou versionado por este empacotamento. |
| Derivação sanitizada (esta pasta) | `README.md` (este arquivo), `results.json` (matriz de cenários, verificação de permissão de etapa e hashes dos originais), `guards_review.md` (cópia sanitizada), `packaging-verification.json`. Hashes SHA-256 dos originais copiados do `MANIFEST.sha256` já existente (não recalculados). Caminhos locais, identificadores e URLs foram substituídos por marcadores nas cópias. |
| Limitações | Execução local histórica em ambiente descartável, com fixtures de teste e sem aceite manual humano. Referências a capturas de tela e a arquivos brutos no registro original (`A-*`, `B-*`, `*-result.json`, `logs/…`) apontam para originais que **não** estão nesta pasta. Ver também "Contexto posterior". |

## Contexto posterior (não faz parte da evidência original)

- Os artefatos descrevem execuções de 2026-10-14 sobre o código daquela época. **Não foram reexecutados** contra `origin/main` nem contra a branch de integração IMOB e **não afirmam o estado atual**.
- O commit local `e4575b03` (P11) foi classificado em 2026-11-06 como `SUPERSEDED_BY_CURRENT_HEAD`: a tentativa de aplicá-lo (cherry-pick) sobre `origin/main` (`249d6a5f`) mais dois commits resultou em 4 arquivos conflitantes em que o lado atual era igual ou mais novo, e os demais arquivos resolveram para conteúdo idêntico ao atual. A classificação se baseia em evidência de aplicação, não em patch-id idêntico.
- Os commits `77816561`, `8678347f` e `88bb3a2d` têm equivalentes em `origin/main` (`7102a82f`, `6fe4ae47`, `c6544125`), registrados como cherry-picks.

## Registro original (README original, sanitizado)

### Gate final de case binding e governança — P11

Resultado: **P11_CASE_BINDING_AND_GOVERNANCE_BLOCKED** — as duas guardas de acesso estão corretas (ver `guards_review.md`), mas o VÍNCULO conversa↔caso
associa silenciosamente a conversa ao caso mais recente quando não há `caseId` válido. Nada foi corrigido nesta etapa; sem commit.

Ambiente: worktree P11 (16 arquivos não commitados, inalterados — hash do diff idêntico antes/depois), API (`NODE_ENV=test`, workers não iniciados) e Vite locais, PG/Redis
próprios em loopback (tmpfs), credenciais sintéticas (destruídas), guarda de rede 0 bloqueios. Fixtures descartáveis: Caso A (apartamento no Batel, `updatedAt` -1h), Caso B (imóvel no Centro,
`updatedAt` +1min = o MAIS RECENTE), caso de OUTRO workspace (mesmo tenant) e de OUTRO tenant (com marcadores "SEGREDO"), usuária Carla (`imob.chat.use` + só a etapa `proposal`).

#### Matriz dos cenários (`api_scenarios.json` = API; `ui_scenarios.json` + `ui-*.png` = /app/chat no navegador)
| Cenário | Esperado | Observado | Resultado |
|---|---|---|---|
| A. `caseId`=A explícito, 3 turnos encadeados | vincula A; nada do B; `caseId` preservado | A1/A2/A3 → CASE_A; só marcador "Batel"; próximo passo do A | **PASS** |
| B. sem `caseId`, "divulgar o apartamento do Batel" | achar o A por referência confiável, ou pedir esclarecimento/recomendação genérica; NUNCA vincular ao B em silêncio | vinculou **CASE_B (Centro)** (Ana e Bruno); card mostra "Próximo passo: ativar anúncio do imóvel do Centro"; texto "usando o imóvel deste caso"; nenhuma menção ao Batel | **FAIL** |
| B2. sem `caseId`, "…imóvel do Centro" | — | CASE_B (coincide por ser o mais recente, não por referência) | informativo |
| C. ambíguo "Quero divulgar meu apartamento." / "campanha para esse imóvel" | não escolher arbitrariamente | vinculou CASE_B nos dois | **FAIL** |
| D. continuidade: 3 turnos + Self-service + retorno (UI) | contexto estável | o `caseId` ficou estável (CASE_B) em todos os turnos e após ir ao Self-service e voltar; MAS o 4º turno ("Batel") continuou preso ao B | continuidade PASS; correção do vínculo **FAIL** |
| E1. `caseId` de outro workspace (mesmo tenant) | sem acesso/vazamento | sem vazamento de dados do outro workspace; porém caiu no CASE_B (fallback silencioso) | vazamento **PASS** / vínculo **FAIL** |
| E2. `caseId` de outro tenant | idem | idem | vazamento PASS / vínculo FAIL |
| E3. `caseId` inexistente | recusar ou pedir esclarecimento | caiu no CASE_B | **FAIL** |
| F1. usuária só com etapa `proposal`, sem `caseId` | não ver caso de etapa que não opera | recebeu o card do CASE_B (etapa `listing`) | **FAIL** (governança) |
| F2. idem com `caseId`=B explícito | negar (403) | 500 (fail-closed; bug preexistente de código de erro) | fail-closed; código incorreto |
| Isolamento | nenhum dado de outro workspace/tenant | marcadores "SEGREDO/Ecoville/Água Verde" nunca apareceram | **PASS** |
| Banco/efeitos | nenhuma escrita comercial | verificado nos testes P11; este gate só lê | **PASS** |

#### Onde ocorre o fallback (exatamente)
`routes/imob.ts` (ramo `claimOnly`): `caseId: existingScopedCase?.id ?? null` → `resolveImobTransversalTurnStage` → `resolveImobOperationalConsult` →
`imobCrmOperationalCase.ts`: `params.caseId ? findFirst({id,tenant,workspace}) : findFirst({tenant,workspace}, orderBy updatedAt desc)`.
Condições: (1) o corpo não traz `caseId` (1º turno de qualquer conversa do Front Door); (2) o `caseId` informado não existe no escopo do token. O Front Door só envia `caseId` depois que um turno anterior já devolveu `caseContext` — ou seja,
o 1º vínculo é sempre o "mais recente". A nota de seleção ("Usei o caso mais recente…") é removida da resposta transversal. Reforço: o vínculo, uma vez feito, é reenviado a cada turno (`useImobFrontDoorForms.latestContext().caseContext.caseId`).

#### Menor correção necessária (NÃO implementada)
Objetivo: nunca vincular sem referência confiável; manter o recomendado de MKT (que depende do workspace e da pessoa, não do caso).
1. `apps/api/src/routes/imob.ts` (ramo `claimOnly`): se o corpo traz `caseId` e `existingScopedCase` é nulo ⇒ `claimed:false` com `reasonCode:"CASE_NOT_IN_SCOPE"` (sem fallback); se existe, aplicar a permissão de etapa SEM enviar resposta (`canWorkspaceOperateImobStage`) ⇒ `claimed:false` `STAGE_DENIED`. Sem `caseId` ⇒ passar `claimOnly` adiante.
2. `apps/api/src/services/imob/crm/imobCrmOperationalResolverShared.ts` + `imobCrmOperationalCase.ts`: parâmetro `claimOnly`; sem `caseId` não ler "o mais recente": responder SEM caso — cartão de especialista transversal (a descoberta de capacidades já funciona sem `caseContext`; usar o `widget` `document_checklist` existente, título genérico) e texto de esclarecimento pedindo qual imóvel/caso, sem a frase "imóvel deste caso". (Variante ainda mais simples: auto-vincular só se houver EXATAMENTE um caso operável pela pessoa; senão, caso-less.)
3. `apps/api/src/services/imob/imobTransversalTurnCopy.ts`: texto caso-less (não afirma imóvel).
4. Web: nenhuma mudança obrigatória (o hook já aceita mensagem sem `caseContext`; o `caseId` só passa a ser enviado quando o servidor o devolver).
Testes: `imob-specialist-bridge.test.ts` (estágio sem caso/caso fora de escopo/etapa negada), `marketplace.installations.activate.test.ts` (cenários B, C, E, F deste gate; A preservado), `createImobStructuredForms.test.ts` (resposta caso-less renderiza o cartão, sem `caseId` no turno seguinte). Preexistentes fora do P11 (separar): 500 vs 403 em `ensureImobStagePermission/WorkspacePermission(res,…)` e o fallback "mais recente" ignorando etapa no `resolve-turn` normal.

#### Arquivos
`api_scenarios.json`, `ui_scenarios.json`, `ui-01..06*.png`, `stage_permission_check.json`, `guards_review.md`, `git_state_0_before.txt`, `git_state_1_after.txt`, `MANIFEST.sha256`.


## Proveniência e sanitização

Os originais permanecem preservados localmente e fora do commit; a conferência de que nenhum foi modificado por este empacotamento (tamanho e data de modificação antes e depois) e a varredura de resíduos nas cópias estão registradas em `packaging-verification.json`. Capturas de tela, snapshots de banco, estado Git bruto, provas de infraestrutura e registros de cenários com identificadores foram omitidos; seus resultados úteis aparecem apenas nas cópias sanitizadas. O Evidence Index aponta somente para os arquivos desta pasta `sanitized/`.
