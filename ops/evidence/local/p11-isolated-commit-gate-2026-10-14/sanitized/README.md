# P11 — gate de commit isolado: alvo `e4575b0` × baseline `88bb3a2` (evidências sanitizadas de 14/10/2026)

Status: **parcial** — comparação histórica de testes dirigidos; não reexecutada contra `main`.
Resultado original registrado: `P11_ISOLATED_COMMIT_VALIDATED` (2026-10-14), para o commit local `e4575b033d35…` (pai exato `88bb3a2`, 17 arquivos). O resumo abaixo é derivado de `comparison_target_vs_baseline.md`, dos resumos de testes e das provas registradas (listados em `results.json` e `packaging-verification.json`); o README original está embutido, sanitizado, mais abaixo.

## Resumo (derivado dos originais)

- Matriz de requisitos A–G (original): 10 PASS.
- Comparação em worktrees temporários, um por commit (alvo `e4575b0` e baseline `88bb3a2`), removidos depois de verificar que estavam limpos.
- Testes adicionados pelo P11: 22 (nenhum teste preexistente removido ou renomeado).
- Falhas preexistentes, idênticas no baseline e no alvo (não são regressão): `imob-copilot-conversation` 2, `imob-crm-resolver` 5, `imob-owner-blocker-consult` 2.
- Typecheck: mesmos erros preexistentes nos dois commits (API 430, web 62; sem erros novos nem removidos). **Não é typecheck global aprovado.**
- Contadores de mutações comerciais ao final: ver `cleanlinessAndNoMutation` em `results.json`.
- As pendências preexistentes da rota normal `resolve-turn` (fallback "caso mais recente"; permissão de etapa só para o caso explícito; helper com 500) foram **registradas como presentes e não corrigidas** no commit sob teste (`preexistingNormalRoutePendingItems`).

## Dado original, derivação sanitizada e limitações

| Camada | Conteúdo |
| --- | --- |
| Dado original | 58 arquivos desta pasta, preservados fora do repositório (README, MANIFEST.sha256, capturas de tela, logs, registros de navegador/API, snapshots do banco descartável, provas de isolamento e estado Git, conforme a pasta). Nenhum foi alterado, movido ou versionado por este empacotamento. |
| Derivação sanitizada (esta pasta) | `README.md` (este arquivo), `results.json` (tabela, resumos, testes adicionados e hashes dos originais), `comparison_target_vs_baseline.md` (cópia sanitizada), `packaging-verification.json`, `target-tests.tap` (19 logs) e `baseline-tests.tap` (19 logs), concatenados. Hashes SHA-256 dos originais copiados do `MANIFEST.sha256` já existente (não recalculados). Caminhos locais, identificadores e URLs foram substituídos por marcadores nas cópias. |
| Limitações | Execução local histórica em ambiente descartável, com fixtures de teste e sem aceite manual humano. Referências a capturas de tela e a arquivos brutos no registro original (`A-*`, `B-*`, `*-result.json`, `logs/…`) apontam para originais que **não** estão nesta pasta. Ver também "Contexto posterior". |

## Contexto posterior (não faz parte da evidência original)

- Os artefatos descrevem execuções de 2026-10-14 sobre o código daquela época. **Não foram reexecutados** contra `origin/main` nem contra a branch de integração IMOB e **não afirmam o estado atual**.
- O commit local `e4575b03` (P11) foi classificado em 2026-11-06 como `SUPERSEDED_BY_CURRENT_HEAD`: a tentativa de aplicá-lo (cherry-pick) sobre `origin/main` (`249d6a5f`) mais dois commits resultou em 4 arquivos conflitantes em que o lado atual era igual ou mais novo, e os demais arquivos resolveram para conteúdo idêntico ao atual. A classificação se baseia em evidência de aplicação, não em patch-id idêntico.
- Os commits `77816561`, `8678347f` e `88bb3a2d` têm equivalentes em `origin/main` (`7102a82f`, `6fe4ae47`, `c6544125`), registrados como cherry-picks.

## Tabela de comparação

Ver `comparison_target_vs_baseline.md` (cópia sanitizada) e `comparisonTable` em `results.json`.

## Registro original (README original, sanitizado)

### Gate isolado do commit P11 — `e4575b033d35ecdc7572ccd93107f671d0526e24`

Resultado: **P11_ISOLATED_COMMIT_VALIDATED**. O commit (pai exato `88bb3a2`, 17 arquivos) reproduz os testes dirigidos sem depender do CRM/C4 não versionado,
sem nenhum artefato compilado de app e sem regressões em relação ao baseline.

#### Isolamento (ver `isolation_code_proof.txt`, `isolation_services_proof.txt`, `cleanliness_and_no_mutation_proof.txt`)
- Dois worktrees detached temporários (alvo `e4575b0`, baseline `88bb3a2`), fora da árvore principal, limpos (0 rastreados modificados, índice vazio) e sem CRM/C4 (router CRM com 25 ocorrências de `imob.chat.use`, contra 33 na principal; sem a guarda de membership; sem os 2 testes CRM/C4).
- Reuso de dependências só onde provado imutável: `packages/` é IDÊNTICO nos dois commits (0 linhas de diff) e a árvore principal não tem modificações em `packages/` — logo `node_modules` e `packages/*/dist` por link (somente leitura) correspondem ao código dos dois commits; o schema Prisma também é idêntico (client gerado, ignorado pelo Git, copiado). `apps/api` e `apps/web` rodam por `tsx` a partir do FONTE do commit: nenhum `dist` de app existe nem é usado.
- PostgreSQL 16 (pgvector) e Redis em contêineres próprios, só loopback, tmpfs, banco `eiah_p11_test`, workers não iniciados, `env -i`, guarda de rede com 0 bloqueios em todas as execuções, identidades 100% sintéticas, contêineres de desenvolvimento intocados.

#### Matriz dos requisitos A–G (testes do alvo; todos PASS; "novo" = adicionado pelo P11)
| Req. | Prova (arquivo → teste) | Resultado |
|---|---|---|
| A. caso explícito autorizado mantém o vínculo | integração → "P11 vínculo explícito…" (3 turnos encadeados, só o caso A, autoridade por pessoa); bridge → "COM caso explícito autorizado"; forms → "caso explícito confirmado pelo servidor fica na conversa" | PASS |
| B. sem `caseId` não seleciona o caso mais recente | integração → "P11 sem caseId: recomendação de MKT SEM caso…" (existem casos A e B; B mais recente; `caseContext` nulo, sem marcadores); bridge → "SEM caso explícito… NUNCA é lido (nem se fosse o único)" | PASS |
| C. solicitação ambígua não vincula caso arbitrário | integração (mesmo teste: "Quero divulgar meu apartamento.", "campanha para esse imóvel", "contratou o Marketing?") | PASS |
| D. conversa e retorno do Self-service preservam só contexto confirmado | forms → "resposta SEM caso renderiza… não grava caso" e "…uma resposta sem caso/negada o LIMPA (não reenvia caseId antigo)"; widgets → `safeImobReturnTo` (/app/chat) | PASS |
| E. inexistente/outro tenant/outro workspace sem fallback | integração → "P11 isolamento…" (`CASE_NOT_IN_SCOPE`, sem dados, sem ids, sem marcadores SEGREDO); acesso governado/revogação | PASS |
| F. etapa não autorizada impede dados do caso | integração → "P11 permissão de ETAPA" (`STAGE_DENIED` com 200 limpo; sem caseId só recomendação sem caso; controle: quem opera a etapa recebe o caso) | PASS |
| G. billing, convite, cadastro e contrato não interceptados | integração → "plataforma, convite, contrato, cadastro e demais mensagens NÃO são reivindicados e não deixam efeito"; bridge → "convite e turnos alheios…"; forms → "engine… casos protegidos nunca consultam" e "+ FDC-03A" | PASS |
| MKT sem caso continua possível | integração (sem caseId: cartão MKT com autoridade da pessoa: Ana `somente_consulta`, Bruno `contratacao_autorizada`) | PASS |
| `actionAuthorization: not_evaluated` ≠ autorização | `vertical-access-resolver` (decisão sempre `not_evaluated`); estático: o campo só é declarado no resolvedor, nenhuma condição o consome, `evaluateImobFrontDoorCapabilityAccess` devolve só `{allowed, reasonCode}`; o ramo `claimOnly` só lê | PASS |
| Sem mutações comerciais | integração (side effects iguais antes/depois) e DB global ao fim: 0 habilitações governadas, 0 billing_ledger, 0 invoices, 0 agent_installs, 0 execuções operacionais | PASS |

#### Alvo x baseline (ver `comparison_target_vs_baseline.md`)
- 19 arquivos de teste rodados nos dois commits. Alvo: 0 falhas novas. Adicionados pelo P11: 22 testes (bridge +3, access-resolver +4, integração +7, Front Door web +8); 0 testes preexistentes removidos/renomeados.
- Falhas PREEXISTENTES (iguais nos dois commits, mesmos testes): copilot-conversation 2, crm-resolver 5, owner-blocker-consult 2 — não são regressão do P11.
- Typecheck por arquivo+código+mensagem (caminhos normalizados): API 430 = 430, web 62 = 62, 0 novos, 0 removidos. Não é typecheck global aprovado: são os mesmos erros preexistentes nos dois commits.

#### Pendências preexistentes da rota normal `resolve-turn` (continuam abertas; o P11 não as altera — `pendencias_preexistentes.txt`)
1. **Bypass da permissão de etapa:** sem `caseId`, o consultivo normal lê o caso mais recente sem passar pela permissão de etapa (arquivo `imobCrmOperationalCase.ts` intacto no commit).
2. **500 em vez de 403:** `ensureImobStagePermission/WorkspacePermission(res, …)` chama `sendImobPermissionDenied(undefined, …)` ⇒ `tenantId=""` ⇒ erro de validação ⇒ 500. O diff do P11 em `routes/imob.ts` só acrescenta o ramo `claimOnly` e os imports (a única linha removida é a do import). A medição em execução dessas duas falhas (Carla, só etapa `proposal`) está em `p11-fix-case-binding-validation-2026-10-14/pendencias_independentes.json`; neste gate foram confirmadas apenas por evidência estática.

#### Limites
Sem navegador neste gate (a validação visual do P11 está nas pastas anteriores). Sem LLM (léxico fechado do P10). Não rodou a suíte de 213 arquivos nem CI. Nenhuma operação remota.


## Proveniência e sanitização

Os originais permanecem preservados localmente e fora do commit; a conferência de que nenhum foi modificado por este empacotamento (tamanho e data de modificação antes e depois) e a varredura de resíduos nas cópias estão registradas em `packaging-verification.json`. Capturas de tela, snapshots de banco, estado Git bruto, provas de infraestrutura e registros de cenários com identificadores foram omitidos; seus resultados úteis aparecem apenas nas cópias sanitizadas. O Evidence Index aponta somente para os arquivos desta pasta `sanitized/`.
