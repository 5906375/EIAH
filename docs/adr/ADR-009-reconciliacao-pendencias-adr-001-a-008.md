# ADR-009 — Reconciliação das decisões e pendências das ADR-001 a ADR-008

## Status

Proposta

## Data

2026-09-26

## Responsável pela decisão

Carlos Alberto Merlo

## Escopo

Consistência documental, evidência e acompanhamento de gates entre as oito ADRs existentes. Esta ADR **não** altera regras remotas do GitHub, infraestrutura, código operacional, `docs/EVIDENCE_INDEX.md` ou issues por si só. Não reabre nem prorroga o modelo de administrador único da [`ADR-008`](./ADR-008-sole-administrator-review-model.md) — essa decisão permanece como está, sem exigência de segundo revisor.

## 1. Contexto

Uma revisão de leitura de 2026-09-26 identificou divergências entre o texto de algumas ADRs, o estado observado do código, do ruleset remoto e de `docs/EVIDENCE_INDEX.md`. Um rascunho de reconciliação foi recebido para servir de base a esta ADR, com a ressalva explícita de não ser copiado sem verificação. Cada afirmação do rascunho foi conferida nesta sessão contra o checkout atual (`HEAD` = `c26593052f2ebbe2938f35eb3384160bf334d897`, branch `governance/issue-426-sole-admin-decision`) antes de entrar aqui; onde a verificação divergiu do rascunho ou não pôde ser concluída, isso está registrado explicitamente na seção 5 do relatório desta tarefa, não silenciado.

## 2. Fatos verificados nesta sessão, com referência precisa

### 2.1 Contagem de required contexts: de 18 (pós-F-1) para 19 (hoje) — causa raiz não documentada

| # | Fato | Fonte |
| --- | --- | --- |
| 1 | Em 2026-08-08, após a aplicação de F-1, o ruleset `main-protection-hard-gates` (ID `13498700`) tinha exatamente 18 required contexts: `build_validate`, `lint`, `CiUnitSuite`, `EvidenceIndex`, `ReceiptCanonCompat`, `P0CriticalityAudit`, `P1CriticalChain`, `RbacGuardrailRegression`, `AgentsPolicyFailClosed`, `AgentProtocolCompat`, `P2AuditInterop`, `ProviderBoundary`, `P3EconomyHardening`, `P3SettlementSupportByEnv`, `SettlementContractDrift`, `W4NonRegression`, `DbPreviewPostgresValidate`, `PublicHealthContract`. | `ops/evidence/ci/f1-gate-relocation-applied-2026-08-08/f1-ruleset-post-mutation.json` (lido integralmente nesta sessão) |
| 2 | Em 2026-09-26, consulta ao vivo à API do GitHub (`GET /repos/5906375/EIAH/rulesets/13498700`) retorna 19 required contexts: os mesmos 18 do item 1, mais **`AssignmentFailClosedHttp`**. | `gh api repos/5906375/EIAH/rulesets/13498700`, executado nesta sessão |
| 3 | O job `assignment_fail_closed_http` (`name: AssignmentFailClosedHttp`) existe em `.github/workflows/ci.yml:794-795`, e foi introduzido no commit `9f618e4` ("fix(authz): enforce fail-closed agent assignments"), datado de 2026-08-12. | `.github/workflows/ci.yml:794-795`; `git log -S"assignment_fail_closed_http" -- .github/workflows/ci.yml` |
| 4 | Em `docs/EVIDENCE_INDEX.md:862`, um registro datado por volta de 2026-08-13 afirma explicitamente: "`AssignmentFailClosedHttp` não é required status check no ruleset — a regressão é detectada em CI, mas não bloqueia merge." | `docs/EVIDENCE_INDEX.md:862` |
| 5 | O campo `updated_at` do ruleset ao vivo é `2026-09-02T14:09:13.830-03:00` — a última modificação registrada pela própria plataforma, posterior a `2026-08-08T15:14:38-03:00` (o `updated_at` do snapshot pós-F-1 do item 1). | `gh api repos/5906375/EIAH/rulesets/13498700 --jq '{updated_at, created_at}'`, executado nesta sessão |
| 6 | Busca por `AssignmentFailClosedHttp` em `docs/`, `docs/adr/` e por qualquer arquivo sob `ops/evidence/` contendo simultaneamente `required_status_checks` e `AssignmentFailClosedHttp` não encontra nenhum registro de quando ou por que o context passou de não-required (item 4) para required (item 2). | Buscas executadas nesta sessão, sem resultado além do já citado no item 4 |

**Conclusão registrada, não inventada:** o `AssignmentFailClosedHttp` foi promovido a required context entre 2026-08-13 (documentado como não-required) e 2026-09-26 (confirmado required), muito provavelmente em 2026-09-02 (única modificação de ruleset registrada pela plataforma nesse intervalo) — mas **nenhum commit, PR, ADR ou arquivo de evidência no repositório documenta essa mudança específica**. Esta ADR não afirma quem fez a mudança, por que decisão, ou se seguiu processo equivalente ao da F-1. Trata-se de uma lacuna de rastreabilidade, registrada como tal.

### 2.2 F-1 (ADR-007) — aplicação confirmada; reavaliação de 2026-09-18 mantida separada e não realizada

- F-1 foi de fato aplicada em 2026-08-08, com pacote de evidência que cobre snapshot anterior, ator, payload, snapshot posterior e confirmação de preservação dos demais campos — `ops/evidence/ci/f1-gate-relocation-applied-2026-08-08/` (arquivos `f1-ruleset-pre-mutation.json`, `f1-put-response.json`, `f1-ruleset-post-mutation.json`, `f1-actor.json`, `f1-repository-permissions.json`, lidos integralmente nesta sessão); `docs/EVIDENCE_INDEX.md:36-37`.
- A `docs/adr/ADR-007-temporary-required-gate-relocation-p1-p2.md` §23 ("Estado da decisão") continua afirmando "F-1 ainda não ativa. Ruleset não alterado." — texto desatualizado em relação ao item acima, nunca corrigido.
- A "Reavaliação obrigatória: 2026-09-18" (`ADR-007`, cabeçalho) está **8 dias vencida** nesta data (2026-09-26) — não localizei nenhum registro de reavaliação, decisão de prorrogação, ou decisão de restauração/encerramento posterior a essa data. Esta ADR **não declara essa reavaliação como realizada**, seguindo a própria regra da ADR-007 §17 ("silêncio não autoriza reintroduzir os contexts, renovar waivers ou declarar saúde").

### 2.3 P2 interop em `docs/EVIDENCE_INDEX.md` — verificado contra o gerador real

- `docs/EVIDENCE_INDEX.md:218` ainda afirma: "Prova de implementação das rotas `POST /api/agents/discovery|negotiate|execute`", referenciando `ops/evidence/latest/interop-routes-smoke-2026-03-09.json`.
- `scripts/generateP2InteropEvidence.ts` (lido integralmente nesta sessão) continua fixando `ok: true` em 4 pontos do arquivo sem executar chamada HTTP real — o mesmo comportamento que a `ADR-005` já havia identificado como declarativo em 2026-08-04.
- Das outras duas afirmações que a `ADR-005` citou como problemáticas: a frase "Prova da trilha `discovery -> negotiate -> execute -> verify receipt`" **não existe mais** em `docs/EVIDENCE_INDEX.md` (busca por texto, zero ocorrências); a entrada sobre `tier=HIGH`/`txIdRequired=true` foi reescrita e hoje diz explicitamente "não prova execução terminal nem receipt" (`docs/EVIDENCE_INDEX.md:270`).
- **Conclusão:** 2 das 3 afirmações que a ADR-005 sinalizou já foram corrigidas; 1 (linha 218) permanece exatamente como identificada há 53 dias.

### 2.4 ADR-002 e ADR-004 — implementação verificada separando teste local, CI e produção

| Item | Teste local | Mudança em CI (configuração/workflow real) | Operação em produção |
| --- | --- | --- | --- |
| ADR-002, Fase A (sair da Neon no CI/PR) | — | **Confirmada.** `docs/ops/neon-github-preview-branches.md:3-5` autodeclara "Deprecated para Pull Requests desde 2026-07-25"; `grep -rl neon .github/workflows/*.yml` retorna zero; `db-preview-postgres.yml` existe e seu job `DbPreviewPostgresValidate` é required context (confirmado na lista viva de 19, seção 2.1) | Não se aplica — Fase A é sobre CI/PR, não produção |
| ADR-002 §7.1, pré-condição `tenantGuard` | **Confirmada agora**: `node --import tsx --test packages/db/src/middleware/tenantGuard.test.ts` → 29/29 passando (era "pass 1 / fail 3" na época do ADR) | **Não confirmada.** Busca em `package.json` e em todos os `.github/workflows/*.yml` não encontra `tenantGuard.test` referenciado em nenhum alvo executado por CI — o teste roda hoje só por invocação manual, como fiz agora | Não verificável a partir do repositório |
| ADR-002, Fase B (Postgres self-hosted staging/produção) | — | — | **Não implementada** — confirmado em tarefa anterior desta sessão: não existe staging real (issue #456) |
| ADR-004, etapa 2 (`generateP3EconomyEvidence.ts` alinhado ao contrato) | — | **Confirmada.** `scripts/generateP3EconomyEvidence.ts:46-49` emite hoje `mode: "simulated"` para stripe/crypto/bank, não mais `"full"` | Consequência direta da etapa 2 sendo código de geração de evidência, não runtime de produção |
| ADR-004, etapa 3 (remover `continue-on-error` de `P3SettlementSupportByEnv`) | — | **Confirmada.** `.github/workflows/ci.yml` hoje só tem 1 `continue-on-error`, no job `imob_frontdoor_mobile_smoke_informative` — não mais em `P3SettlementSupportByEnv` | **Confirmada em execução real de CI hoje**: rodei `gh run view` na run mais recente de `main` (`36231136158`, commit `c265930`, 2026-09-26T08:53:31Z) — job `P3SettlementSupportByEnv` concluiu `success` por mérito, sem supressão |

### 2.5 Estado da ADR-008

Reconfirmado nesta sessão: `docs/adr/ADR-008-sole-administrator-review-model.md` continua **staged** (`git diff --cached --stat` mostra só ela, `A`), não commitada, exatamente como estava. A decisão registrada nela — Carlos Alberto Merlo como único dono/administrador/revisor, sem exigência de segundo revisor — **não é reaberta, alterada ou condicionada por esta ADR-009**. A issue #426 permanece aberta pelos critérios técnicos de P1/P2, não pelo critério de revisor (já tratado pela ADR-008).

## 3. Decisão proposta

Adotar esta ADR como registro de reconciliação, com correções de afirmações factuais comprovadas nesta sessão e acompanhamento explícito do que permanece aberto. Nenhuma mudança de status documental é aplicada por esta própria ADR além do que está registrado nela; alterações nos textos das ADR-002/004/007 e em `docs/EVIDENCE_INDEX.md` são trabalho subsequente, não executado aqui. Mudança de ruleset, tratamento de exceções vencidas, condições de retorno de P1/P2 e arquitetura de produção continuam exigindo decisões e evidências próprias — esta ADR não as autoriza.

### 3.1 Correções documentais verificáveis, prontas para execução

| Origem | Correção proposta | Base da verificação (seção 2) |
| --- | --- | --- |
| `docs/adr/ADR-007-...md` §23 | Registrar a aplicação real de F-1 em 2026-08-08 (remetendo a `ops/evidence/ci/f1-gate-relocation-applied-2026-08-08/` e a `docs/EVIDENCE_INDEX.md:36-37`); manter a reavaliação de 2026-09-18 como pendente, não realizada. Adicionalmente, registrar a lacuna sobre `AssignmentFailClosedHttp` (§2.1) como achado novo desta reconciliação, já que a ADR-007 é o documento mais próximo do tema de contagem de required contexts. | §2.1, §2.2 |
| `docs/EVIDENCE_INDEX.md:218` | Rebaixar a afirmação de "prova de implementação das rotas" ao que `generateP2InteropEvidence.ts` de fato produz (leitura textual sem chamada HTTP), preservando a referência ao arquivo real — não removê-la, apenas não afirmar mais do que o gerador executa. | §2.3 |
| `docs/adr/ADR-004-...md` (campo Status) | Atualizar de `Proposta` para `Implementada`, citando os commits/estado que fecham as etapas 2 e 3, e a execução real confirmada na run `36231136158` de 2026-09-26. | §2.4 |
| `docs/adr/ADR-002-...md` (campo Status/§7.1) | Distinguir explicitamente: Fase A implementada e confirmada em CI; pré-condição `tenantGuard` confirmada **só localmente**, sem cobertura de CI; Fase B/produção continua não implementada. Não declarar `tenantGuard` "resolvido" sem a ressalva de que falta um alvo de CI que o execute. | §2.4 |

### 3.2 Pendências que permanecem abertas

| Origem | Pendência | Critério de resolução | Responsável |
| --- | --- | --- | --- |
| Ruleset / ADR-007 | `AssignmentFailClosedHttp` tornou-se required sem registro documentado de quando/por quem/por quê (§2.1). | Localizar (se existir fora do repositório, ex. log de auditoria do GitHub não acessível por esta sessão) ou assumir formalmente a lacuna e registrar a partir de agora um processo de evidência para qualquer futura alteração de required context, equivalente ao já usado para F-1. | Carlos Alberto Merlo |
| ADR-007 | Reavaliação obrigatória vencida em 2026-09-18; P1/P2 continuam `temporarily_non_required`. | Decisão explícita e datada, com condições e novo prazo se houver extensão. Silêncio não prorroga nem restaura os gates (regra da própria ADR-007 §17). | Carlos Alberto Merlo |
| ADR-005 | Segmentos 1 e 2 (captura real de `discovery`/`negotiate`/`execute`) não implementados; segmento 3 (rebaixar afirmação de trilha completa) parcialmente feito, mas a afirmação de `docs/EVIDENCE_INDEX.md:218` continua pendente (ver §3.1). | Execução real observável com Postgres/Redis reais, conforme já mapeado pela própria ADR-005. | Execução técnica |
| ADR-006 | Exceção `p2_audit_interop` vencida desde 2026-09-02 (confirmei rodando `pnpm check:structural-circularity` em tarefa anterior desta sessão: exit 1); duas exceções `p3_economy_hardening` órfãs (par estrutural não existe mais); o check não está conectado a nenhum workflow de CI, nem em modo informativo. | Decidir tratamento da exceção vencida (renovar com justificativa nova ou corrigir a causa); remover as exceções órfãs após confirmar que o par estrutural de fato não existe mais; conectar o check a `.github/workflows/ci.yml`, decidindo explicitamente se será informativo ou bloqueante. | Carlos Alberto Merlo (decisão) + execução técnica (conexão ao CI) |
| ADR-001 × ADR-002 | ADR-001 declara "Neon Postgres" como banco oficial; ADR-002 decidiu sair da Neon e sua Fase A já está implementada (§2.4). Nenhuma das duas ADRs foi emendada para reconciliar. ADR-002 §7.2 também registra, como P0 aberto, que "a conversa de origem assume AWS ALB/ACM/ECS/Fargate", contradizendo o compute oficial da ADR-001 (Render). | Decisão arquitetural explícita — nova ADR ou emenda — que reconcilie os dois textos. Fase B da ADR-002 não é considerada executada por esta reconciliação. | Carlos Alberto Merlo |
| ADR-003 | `docs/EVIDENCE_INDEX.md:117` continua indexando `ADR-001` como se fosse evidência de execução real, o que a própria ADR-003 já classificou como drift normativo (a linha era 89 quando a ADR-003 foi escrita; hoje é 117 — o conteúdo do índice cresceu, a divergência não foi corrigida). | Decisão sobre classificação e correção do índice (remover a entrada ou formalizar uma exceção à norma), sem apagar evidência real de outras entradas. | Carlos Alberto Merlo |
| Issue #426 | Critérios de proveniência/medição real de P1/P2 continuam não atendidos (independente do critério de revisor, já resolvido pela ADR-008). | Ver condições de retorno já detalhadas na `ADR-007` §15/§16. | Execução técnica + decisão de Carlos Alberto Merlo |

## 4. Ordem de execução proposta

1. Corrigir `docs/EVIDENCE_INDEX.md:218` (afirmação P2 interop além do que o gerador executa) — item isolado, sem dependência de decisão de terceiros.
2. Atualizar `docs/adr/ADR-004-...md` (Status) e `docs/adr/ADR-002-...md` (Status/§7.1), com as ressalvas de local-vs-CI já registradas em §2.4 desta ADR.
3. Atualizar `docs/adr/ADR-007-...md` §23 para refletir a aplicação real de F-1 (sem declarar a reavaliação de 2026-09-18 como feita), e registrar nela a lacuna de `AssignmentFailClosedHttp` (§2.1).
4. Obter de Carlos Alberto Merlo a decisão explícita sobre a reavaliação vencida da ADR-007 (extensão, restauração ou outro destino de P1/P2, com prazo e condições mensuráveis) e sobre a lacuna de rastreabilidade do `AssignmentFailClosedHttp`.
5. Tratar a exceção vencida e as órfãs da ADR-006; conectar `check:structural-circularity` a um workflow, com decisão explícita sobre semântica informativa ou bloqueante.
6. Executar a captura real dos segmentos 1/2 da ADR-005.
7. Reconciliar ADR-001/ADR-002 (banco e compute) e resolver a indexação indevida da ADR-003 em decisões específicas, cada uma com sua própria ADR ou emenda se necessário.

## 5. Critérios verificáveis de conclusão desta reconciliação

- Cada ADR referenciada tem campo `Status` compatível com sua implementação comprovada nesta sessão, distinguindo fases parciais (ex.: ADR-002 Fase A vs. Fase B).
- Toda afirmação de "implementado" cita se a confirmação foi por teste local, por configuração/execução real de CI, ou por observação de produção — nunca as trata como equivalentes.
- Prazos vencidos (reavaliação da ADR-007) aparecem como pendentes até decisão explícita, datada e atribuída a Carlos Alberto Merlo — nunca resolvidos por silêncio ou pela passagem da data.
- Nenhuma afirmação em `docs/EVIDENCE_INDEX.md` excede o que o artefato ou gerador referenciado de fato executa.
- A lacuna de rastreabilidade sobre `AssignmentFailClosedHttp` está registrada e associada a uma decisão (mesmo que a decisão seja "aceitar a lacuna retroativamente e reforçar o processo daqui para frente").
- A exceção `p2_audit_interop` vencida e as exceções órfãs da ADR-006 têm destino decidido e registrado, não apenas diagnosticado.

## 6. Limites do que esta ADR autoriza

Esta ADR organiza o fechamento de dívidas de decisão e evidência já identificadas. Ela **não**:

- ratifica retroativamente a `ADR-007` nem declara a reavaliação de 2026-09-18 como realizada;
- habilita staging ou produção para qualquer componente;
- renova, remove ou estende automaticamente nenhuma exceção de `ops/contracts/circularity-exceptions.v1.json` ou `ops/contracts/gate-waivers.v1.json`;
- modifica o ruleset `main-protection-hard-gates`, `.github/workflows/*.yml`, ou qualquer código operacional;
- altera `docs/EVIDENCE_INDEX.md`;
- reabre, condiciona ou substitui a decisão de administrador único da `ADR-008`;
- declara qualquer agente interno (ex.: I_BC ou outro) auditado individualmente por consequência desta reconciliação;
- fecha a issue #426 ou qualquer outra issue.

## 7. Evidências obrigatórias desta decisão

Esta decisão não constitui evidência de execução e não exige entrada em `docs/EVIDENCE_INDEX.md`, seguindo a mesma disciplina já registrada nas ADR-003 a ADR-006. Suas fontes são as citadas na seção 2, todas lidas ou executadas ao vivo nesta sessão: `ops/evidence/ci/f1-gate-relocation-applied-2026-08-08/`, `docs/EVIDENCE_INDEX.md` (linhas 36-37, 218, 270, 862, 117), `docs/ops/neon-github-preview-branches.md`, `.github/workflows/ci.yml`, `scripts/generateP3EconomyEvidence.ts`, `scripts/generateP2InteropEvidence.ts`, `packages/db/src/middleware/tenantGuard.test.ts`, o ruleset `13498700` (consultado ao vivo via `gh api`), e a run de CI `36231136158`.

## 8. Gatilhos para revisão

- Localização de qualquer registro (log de auditoria da plataforma, PR, commit) que explique a adição de `AssignmentFailClosedHttp` ao ruleset.
- Decisão explícita de Carlos Alberto Merlo sobre a reavaliação vencida da ADR-007.
- Execução dos itens da seção 4.
- Nova divergência entre texto de ADR e estado observado do repositório ou da plataforma.

## 9. Nota de execução — correções documentais de 2026-09-26

Duas rodadas de execução documental ocorreram nesta mesma data (2026-09-26), no mesmo worktree, ambas
ainda **não commitadas** ao final desta nota (apenas alterações de working tree; `git status --short`
segue mostrando as mesmas entradas não commitadas de antes de ambas as rodadas, mais os arquivos
modificados por elas). Esta seção diferencia as duas, conforme pedido nesta segunda rodada.

### 9.1 Rodada 1 (já concluída antes desta nota)

- `docs/EVIDENCE_INDEX.md:218` ("Smoke de rotas interop"): a alegação "Prova de implementação das
  rotas `POST /api/agents/discovery|negotiate|execute`." foi substituída por um texto que distinguia
  implementação a nível de código de execução HTTP real, preservando a referência ao artefato
  (`ops/evidence/latest/interop-routes-smoke-2026-03-09.json`).
- `docs/adr/ADR-007-...md` §23 ("Estado da decisão"): reescrita para registrar que F-1 foi de fato
  aplicada em 2026-08-08 (remetendo a `ops/evidence/ci/f1-gate-relocation-applied-2026-08-08/`), que o
  ruleset ao vivo em 2026-09-26 tem 19 required contexts (os 18 do snapshot pós-F-1 mais
  `AssignmentFailClosedHttp`, cuja origem e data de inclusão seguem não comprovadas), e que a
  reavaliação obrigatória de 2026-09-18 (seção 17) permanece pendente — não realizada, não prorrogada,
  não encerrada por esse registro.
- Checks executados nessa rodada: `pnpm check:evidence-index` (pass, 8/8 testes unitários, 628 refs,
  exit 0); `git diff --check` (limpo, exit 0).

**Conferido nesta rodada 2**, por leitura do diff e das referências citadas: o texto de `ADR-007` §23
permanece consistente com `ops/evidence/ci/f1-gate-relocation-applied-2026-08-08/` (confirmado de novo
nesta rodada: 20→18 required contexts, ator `5906375`/id `51407107`, janela
2026-08-08T18:14–18:15Z) e com nova leitura ao vivo do ruleset nesta rodada (19 required contexts,
incluindo `AssignmentFailClosedHttp`; `updated_at = 2026-09-02T14:09:13.830-03:00`). Nenhuma
divergência encontrada entre a §23 e essas fontes.

### 9.2 Rodada 2 (desta execução)

- `docs/EVIDENCE_INDEX.md:218`: redação refinada para maior precisão — "Verificação estática da
  presença de trechos associados às rotas no código-fonte
  (`agentRoutes.includes('post("/agents/discovery"')` etc., em
  `scripts/generateP2InteropEvidence.ts`). Não comprova registro efetivo das rotas, comportamento
  funcional, execução HTTP ou geração de receipt." A referência ao artefato foi preservada; o gerador e
  seus resultados não foram alterados.
- `docs/ops/open-fronts.md`, frente `RESOLVE-P2-INTEROP-DECLARATIVE-EVIDENCE` (seção 16): atualizada
  para (a) marcar a redação antiga do índice como histórica/superada; (b) registrar a correção
  documental de 2026-09-26 nas três entradas do índice afetadas (`interop-routes-smoke-2026-03-09.json`,
  corrigida nesta data; `interop-e2e-agent-call-2026-03-09.json` e
  `realestate-high-actions-e2e-2026-03-09.json`, já corrigidas antes desta sessão, em data não
  documentada); (c) deixar explícito que a captura HTTP real e a distinção de proveniência entre
  captura e declaração continuam pendentes; (d) substituir a citação por número de linha de
  `docs/EVIDENCE_INDEX.md` (`:191-192,243`, já desatualizada antes desta rodada) por identificação
  estável por seção e nome de entrada. A frente permanece `pendente`; nenhuma outra frente de
  `open-fronts.md` foi tocada, promovida ou encerrada.
- Esta seção (9) da própria `ADR-009`.
- Checks executados nesta rodada: `pnpm check:evidence-index` → pass (8/8 testes unitários, 628 refs
  verificadas, exit 0); `git diff --check -- docs/EVIDENCE_INDEX.md docs/ops/open-fronts.md` → limpo,
  exit 0; buscas direcionadas (`grep -rn`) por `"Prova de implementação das rotas"` e
  `"F-1 ainda não ativa"` em `docs/` — as únicas ocorrências restantes são citações históricas já
  identificadas como tal (`docs/ops/open-fronts.md` seção 16, esta própria `ADR-009` §2.2/§2.3, e
  `docs/adr/ADR-005-...md`, que cita o achado original que motivou a correção); nenhuma reafirmação
  viva da alegação corrigida foi encontrada fora dessas citações históricas.

## 10. Nota de execução — ADR-002/ADR-004 e ajuste de cronologia da frente P2 (2026-09-26, rodada 3)

Uma terceira rodada de execução documental ocorreu nesta mesma data (2026-09-26), ainda **não commitada**. Esta seção registra o que mudou, distinguindo de §9 (rodadas 1 e 2, já registradas).

### 10.1 Ajuste de cronologia — frente `RESOLVE-P2-INTEROP-DECLARATIVE-EVIDENCE`

A frase do "Bloqueio" em `docs/ops/open-fronts.md` (seção 16) atribuía incorretamente as três correções do índice a 2026-09-26, quando na verdade só a entrada "Smoke de rotas interop" foi corrigida nessa data — as outras duas já estavam corrigidas antes desta sessão (§2.3, §9.2). Corrigida para: "As três entradas foram conferidas como rebaixadas em 2026-09-26; a entrada 'Smoke de rotas interop' foi corrigida nesta data, e as outras duas já estavam corrigidas." Acrescentado também, no mesmo bloco: a correção documental não substitui captura HTTP real, não valida os artefatos como prova funcional, e não resolve por si só a confiabilidade dos required checks consumidores (`P2AuditInterop`, `P1CriticalChain`, `W4NonRegression`). Frente mantida `pendente`.

### 10.2 ADR-002 — nova seção 12, "Estado de implementação (verificado em 2026-09-26)"

- Fase A: confirmada implementada e enforced em CI real — não apenas pela ausência de "Neon" nos workflows, mas por evidência funcional direta: `.github/workflows/db-preview-postgres.yml` (container `pgvector/pgvector:pg16`, `migrate:deploy`, `migrate status`, teste de schema governado, check de drift, evidência sanitizada, enforcement fail-closed), job `DbPreviewPostgresValidate` confirmado required context ao vivo, e `check:evidence-index`/`check:docs-link-integrity` passando nesta sessão.
- Pré-condição `tenantGuard`: reproduzido `node --import tsx --test packages/db/src/middleware/tenantGuard.test.ts` → 29/29 local. Verificação aprofundada nesta rodada: mesmo a descoberta indireta via glob (`packages/db/package.json` tem `"test": "node --test --import tsx \"src/**/*.test.ts\""`, que incluiria o arquivo automaticamente) não é invocada por nenhum workflow — cobertura de CI continua zero, direta ou indireta.
- Fase B/produção: confirmada não implementada; issue #456 reconfirmada `OPEN` ao vivo nesta rodada.
- O campo `Status normativo` do cabeçalho da ADR-002 **não foi alterado** (permanece `Proposta`/`shadow`) — apenas a seção 12, nova, documenta o estado por fase. Isso é consistente com a recomendação original desta própria ADR-009 (§3.1, linha da ADR-002): distinguir Fase A/tenantGuard/Fase B em vez de promover o documento inteiro.

### 10.3 ADR-004 — nova seção "Estado de implementação (verificado em 2026-09-26)"

- Etapa 2 (alinhar `generateP3EconomyEvidence.ts` ao contrato): confirmada implementada — o gerador hoje declara `mode: "simulated"` para `stripe`/`crypto`/`bank`, sem ocorrência de `mode: "full"`. Commit `c4d5db5` (2026-08-03T14:52:15-03:00, em `origin/main`).
- Etapa 3 (remover `continue-on-error` de `P3SettlementSupportByEnv`): confirmada implementada — `.github/workflows/ci.yml` hoje só tem `continue-on-error: true` no job `ImobFrontdoorMobileSmokeInformative`, não mais em `P3SettlementSupportByEnv`. Commit `729c791` (2026-08-03T14:56:53-03:00, em `origin/main`).
- Execução real: run `36231136158` (main, `headSha` = `c26593052f2ebbe2938f35eb3384160bf334d897`, 2026-09-26T08:53:31Z) — job `P3SettlementSupportByEnv` (id `108374387746`) concluiu `success` com todos os steps reais executados. A run inteira concluiu `failure`, mas por causa não relacionada: o job `P1ReconciliationRecurring` falhou na mesma run — achado já coberto em §2.1 desta ADR e no `ADR-007`, não uma regressão nova desta verificação.
- **Divergência deliberada da recomendação original desta ADR-009 (§3.1, linha da ADR-004):** aquela linha recomendava "Atualizar de `Proposta` para `Implementada`". A execução desta rodada, por instrução explícita, **não fez essa mudança de Status** — em vez disso, documentou a implementação técnica das etapas 2 e 3 separadamente da aceitação/ratificação formal, e manteve `Status: Proposta` porque nenhum registro de ratificação explícita (comentário de PR, ADR de ratificação, ou decisão datada de Carlos Alberto Merlo) foi localizado. §3.1 desta ADR-009 permanece como registro histórico do que foi originalmente proposto nesta sessão; não foi reescrita, e a divergência está registrada aqui para que as duas não sejam lidas como contraditórias sem explicação.
- Ressalva preservada na ADR-004: o resultado verde de `P3SettlementSupportByEnv` não comprova integração real com Stripe/cripto/banco — o modo continua `simulated` por contrato, em todos os ambientes.

### 10.4 Fontes e verificações desta rodada

`docs/ops/open-fronts.md` (seção 16, lida e editada); `docs/adr/ADR-002-database-self-managed-postgres.md` (lida integralmente, seção 12 acrescentada); `docs/adr/ADR-004-required-check-blocking-semantics.md` (lida integralmente, seção de estado acrescentada); `.github/workflows/db-preview-postgres.yml` (lido integralmente); `grep -rln "neon" .github/workflows/*.yml` (sem resultado); `node --import tsx --test packages/db/src/middleware/tenantGuard.test.ts` (executado nesta sessão, 29/29); `grep -rn "tenantGuard" .github/workflows/*.yml package.json packages/db/package.json` (sem resultado); leitura de `packages/db/package.json` (script `test` com glob); `gh issue view 456` (executado, `OPEN`); `git log -S` para `scripts/generateP3EconomyEvidence.ts` e para `continue-on-error` em `.github/workflows/ci.yml` (commits `c4d5db5`, `729c791`, ambos confirmados em `origin/main`); `gh run view 36231136158` e `gh api .../actions/jobs/108374387746` (executados nesta sessão); `pnpm check:evidence-index` e `pnpm check:docs-link-integrity` (executados, pass); `git diff --check` (executado, limpo).

### 10.5 Pendências que continuam abertas após esta rodada

- Reavaliação obrigatória de 2026-09-18 da `ADR-007`: continua pendente, não realizada por esta rodada (ver item 5 do relatório desta tarefa para uma proposta de prazo, sujeita a decisão de Carlos Alberto Merlo).
- Decisão formal de Carlos Alberto Merlo sobre aceitar/ratificar a `ADR-004` (tecnicamente implementada, não ratificada) e sobre o Status normativo da `ADR-002` (Fase A implementada, Fase B/produção não).
- Execução real (não literal) de `auditGap`/`duplicateSideEffects` para P1, e captura E2E real (não textual) para P2 — nenhuma das duas foi produzida nesta rodada.
- Lacuna de rastreabilidade de `AssignmentFailClosedHttp` (§2.1) — não investigada além do já registrado.
- ADR-001×ADR-002 (compute/banco) e a indexação indevida da ADR-003 em `docs/EVIDENCE_INDEX.md:117` — fora do escopo desta rodada.

## 11. O que as notas de execução (seções 9 e 10) não fazem

- Não realizam a reavaliação obrigatória de 2026-09-18 da `ADR-007`: corrigir o histórico de F-1, ou
  atualizar ADR-002/ADR-004, é diferente de decidir o mérito de P1/P2. Essa reavaliação continua
  pendente e depende de decisão explícita de Carlos Alberto Merlo (§3.2).
- Não decidem o destino dos required contexts P1/P2 (`P1ReconciliationRecurring`,
  `P2HighGlobalCoverage`), nem restauram, removem ou alteram qualquer required check no ruleset remoto.
- Não investigam nem resolvem a lacuna de rastreabilidade de `AssignmentFailClosedHttp` além do que já
  estava registrado em §2.1; nenhuma chamada de escrita foi feita ao ruleset em nenhuma das rodadas.
- Não alteram `ADR-008`, nem o Status desta própria `ADR-009` (`Proposta`); não ratificam, prorrogam ou
  encerram nenhum prazo, waiver ou exceção de circularidade. (A seção 10 altera `ADR-002` e `ADR-004`
  — isso é intencional e registrado em §10.2/§10.3; a seção 9 não os alterou.)
- Não constituem evidência de execução do sistema e não são, nem devem ser, adicionadas a
  `docs/EVIDENCE_INDEX.md` — mesma disciplina já registrada na seção 7.

## 12. Nota de execução — rodada 4 (2026-09-26): visibilidade de ADR-002/006, correções de precisão e proposta de reavaliação P1/P2

Uma quarta rodada de execução documental ocorreu nesta mesma data, ainda **não commitada**. Esta seção corrige imprecisões da rodada 3 (§10) e consolida achados novos. Ela não reescreve §9/§10 — acrescenta correções e contexto, seguindo a mesma disciplina de preservar histórico identificando-o como tal.

### 12.1 ADR-002 e ADR-006 — visibilidade corrigida

- `docs/adr/ADR-002-database-self-managed-postgres.md`: estava `!!` (ignorado por `docs/*` em `.gitignore:40`, nunca staged). Nesta rodada, exposta via `git add -N -f` (intent-to-add) — aparece agora como ` A` no `git status`, com diff completo visível (201 inserções). **Isso não a torna staged integralmente, commitada ou ratificada** — apenas visível para revisão, exatamente como já era o caso da `ADR-009` desde sua criação.
- `docs/adr/ADR-006-structural-circularity-detection.md`: **correção de um erro factual da rodada anterior.** Na rodada 3, eu havia buscado por um nome de arquivo incorreto (`ADR-006-circularity-exception-governance.md`, que nunca existiu) e concluído, erroneamente, que "ADR-006 nunca foi commitada". O nome real do arquivo é `ADR-006-structural-circularity-detection.md`; ele **já está rastreado, limpo (`git status` não mostra alteração) e mesclado em `origin/main`** pelo commit `7d8f0a8` ("docs(adr): decide structural circularity detection between generators and checks"). Nenhuma ação de `git add` foi necessária ou foi executada para este arquivo nesta rodada — ele já estava visível antes desta sessão.

### 12.2 Correção do alcance da investigação histórica (ADR-002)

A afirmação anterior de que a `ADR-002-database-self-managed-postgres.md` "nunca foi commitada, em nenhum momento" (feita em resposta ao usuário, não escrita em nenhum arquivo) é substituída por uma conclusão limitada ao que foi verificado:

**Busca realizada:** (a) `git log --all` para o caminho atual do arquivo; (b) detecção de rename (`--diff-filter=R`) sobre todo o histórico de `docs/adr/*`; (c) busca por conteúdo distintivo do título (`git log --all -S"Postgres self-managed sobre Neon"`) em todos os 322 refs conhecidos deste clone; (d) `git log --walk-reflogs --all` para o caminho; (e) `git ls-remote --heads origin` (66 branches no servidor, não só os já buscados localmente) filtrado por nomes candidatos; (f) `gh pr list --search` por termos do título ("ADR-002 postgres", "self-managed postgres", "Neon self-hosted") em todos os PRs (abertos e fechados). **Nenhum resultado** em nenhuma dessas buscas indica que este documento específico (tópico Postgres/Neon) tenha existido, sob este ou outro nome, em qualquer branch, tag, reflog ou PR alcançável por este clone.

**Limitações explícitas desta busca:** não cobre branches criados e depois deletados no GitHub sem deixar rastro em reflog local; não cobre outros clones/forks fora deste ambiente; não cobre histórico de edição fora do Git (documentos colados, versões locais em outras máquinas); a API de busca do `gh pr list --search` pode não indexar todo o texto de PRs muito antigos. Portanto, a conclusão correta é: **dentro do alcance descrito, não há evidência de commit deste documento sob nenhum nome verificável — isso não é prova de ausência em todo histórico possível.**

**Achado colateral relevante:** existe um documento **diferente e não relacionado**, também numerado "ADR-002", em `docs/adr/ADR-002-governed-collective-intelligence.md` (tema "AUTHZ-RUNS" / inteligência coletiva governada), commitado em `d52134b` (2026-09-05) na branch `docs/adr-002-v2-r3` (local e `origin/`), com PR **#441 aberto em estado DRAFT** ("docs: ADR-002 v2-r3 e registro da decisão AUTHZ-RUNS"), não mesclado em `main`. Há também um worktree separado (`/home/jusall/projects/EIAH_ADR002_DOCS`) nessa branch. **Isto é uma colisão de numeração entre dois documentos ADR-002 distintos, não uma renomeação do mesmo documento** — não teço qualquer conclusão sobre qual deveria prevalecer; isso é uma decisão de Carlos Alberto Merlo, fora do escopo desta reconciliação. Nenhuma ação foi tomada sobre a branch, o worktree ou o PR #441.

### 12.3 Correção de precisão — recência do artefato P1

A rodada anterior citou "61 dias" sem separar explicitamente os três números. Recalculado nesta rodada com precisão:

| Grandeza | Valor |
| --- | --- |
| Data de referência | 2026-09-26 |
| Data do artefato (`ops/evidence/latest/ape-weekly-cycle-run48-2026-07-27.md`) | 2026-07-27 |
| **Idade do artefato** | **61 dias** |
| **Limite `MAX_AGE_DAYS`** (`scripts/checkP1ReconciliationRecurring.ts:7`, default não alterado) | **14 dias** |
| **Dias excedentes** | **47 dias** |

Reafirmado: as métricas desse artefato (`auditGap=0`, `duplicateSideEffects=0`) são literais gravados por `scripts/ci/ape_cycle_weekly.cjs`, não medição real — isso não muda com a recência, e o artefato não pode ser classificado como medição real independentemente de sua idade.

### 12.4 Reconciliação do relato do ciclo APE real — divergência resolvida

Havia dois relatos aparentemente divergentes nesta sessão sobre `apps/api/scripts/run_ape_weekly_cycle_v3_billing.ts`. Investigação nesta rodada (leitura do transcript bruto desta própria sessão e do sistema de arquivos local, sem executar nenhum ciclo novo) resolve a divergência:

- **Houve execução real**, confirmada por um `tool_result` real nesta sessão: comando `node --env-file-if-exists=packages/db/.env --import tsx apps/api/scripts/run_ape_weekly_cycle_v3_billing.ts --tenant-id tenant-interop-mu116ad0-3yk2ve --workspace-id workspace-interop-mu116ad0-3yk2ve`, executado em `2026-09-26T09:39:19Z` (mesma data de hoje, antes da compactação desta conversa), contra `commitSha` = `c26593052f2ebbe2938f35eb3384160bf334d897` (o `HEAD` atual).
- **O resultado foi preservado**: `status: "awaiting_human_ratification"`, com `evidenceRef`/`rawReceiptRef`/`validationResultRef` que **existem de fato em disco** sob `uploads/tenant-interop-mu116ad0-3yk2ve/workspace-interop-mu116ad0-3yk2ve/ape-weekly-cycle/{billing.run_cost_debit,evidence,validation}/*.json` (confirmado com `find`/`cat` nesta rodada). Esses arquivos estão sob `uploads/`, que é `!!` (ignorado pelo git) — preservados localmente, não versionados.
- **A medição é real, não literal**: o JSON de evidência declara `"measurementStatus":"measured"`, `"sampleSize":2`, `"auditGap":0`, `"duplicateSideEffects":0`, `"producerIdentity":"eiah.billing.raw-receipt-collector.v1"`, `"schemaVersion":"ape.weekly-cycle.v3"` — mecanismo diferente do gerador legado que grava literais fixos.
- **Não houve aceitação humana**: nenhum `CycleRatificationV3` foi localizado (busca no transcript e no sistema de arquivos); o próprio script declara explicitamente que nunca persiste essa ratificação — é uma decisão humana separada, ainda não tomada.
- **O checker P1 atual NÃO consome esse resultado.** Confirmado lendo `scripts/checkP1ReconciliationRecurring.ts:43-44`: ele só lê arquivos em `ops/evidence/latest/` que casem com `ape-weekly-cycle-run\d+-\d{4}-\d{2}-\d{2}\.md` (formato markdown legado). O JSON produzido pelo pipeline v3, em `uploads/.../ape-weekly-cycle/evidence/*.json`, está fora desse escopo — não é lido, não conta para `MIN_CYCLES`, não afeta o resultado do gate hoje.

**Conclusão:** a afirmação de uma rodada anterior ("um ciclo real foi executado em 26/09") está **correta e agora comprovada com evidência primária**. A afirmação do relatório mais recente ("`run_ape_weekly_cycle_v3_billing.ts` está untracked e não foi executado com evidência registrada") **conflou duas coisas distintas**: o script estar untracked no git (verdadeiro) não significa que não foi executado (falso — foi) nem que não produziu evidência registrada (falso — produziu, localmente). A formulação correta e completa é: **execução real ocorreu, evidência real foi preservada localmente (não versionada), mas essa evidência (a) é de apenas um ciclo, não três, e (b) não é consumida pelo checker P1 vigente** — portanto não altera, por si só, a situação de retorno de `P1ReconciliationRecurring` descrita em §2.1/§10.5. A observação de tenant/workspace: os identificadores (`tenant-interop-mu116ad0-3yk2ve`) não foram localizados em nenhum script de seed/fixture do repositório; a origem exata desses dados no Postgres de desenvolvimento não foi investigada além disso nesta rodada.

### 12.5 Correção de §10.5 à luz de 12.4

O item de §10.5 ("Execução real (não literal) de `auditGap`/`duplicateSideEffects` para P1 [...] não foi produzida nesta rodada") está **desatualizado à luz de §12.4**: uma execução real e medida foi, sim, produzida — só não nesta rodada 3, e sim antes dela, na mesma sessão. §10.5 permanece como registro histórico do que era sabido até a rodada 3; a classificação atual e completa é a de §12.4 e da rodada 5 (§13.2): **execução real comprovada, com evidência preservada localmente; elegibilidade para o gate P1 ainda pendente** — não por deficiência da medição em si, mas porque a quantidade exigida (`MIN_CYCLES=3`) não foi atingida e o checker vigente não lê esse formato.

### 12.6 O que esta nota (seção 12) não faz

- Não conclui que a "ADR-002" AUTHZ-RUNS (branch `docs/adr-002-v2-r3`, PR #441) deva ser renomeada, mesclada, descartada ou preferida sobre a ADR-002 Postgres/Neon — a colisão de numeração é relatada, não resolvida.
- Não altera `.gitignore`, não adiciona nenhum outro arquivo ignorado além de `ADR-002-database-self-managed-postgres.md` (via intent-to-add), e não executa `git add` sobre `ADR-006` (já rastreada, nenhuma ação necessária).
- Não executa um novo ciclo APE para completar os 3 ciclos exigidos pela ADR-007 §15, nem concluiu que o gate deva retornar.
- Não constitui evidência de execução do sistema para fins de `docs/EVIDENCE_INDEX.md`.
- Não registra aprovação de Carlos Alberto Merlo, prorrogação de prazo ou reavaliação da ADR-007 como concluída — a proposta de reavaliação (ver relatório desta tarefa) permanece proposta, sujeita à decisão dele como único administrador e revisor.

## 13. Nota de execução — rodada 5 (2026-09-26): correção do calendário P1, classificação do ciclo e proveniência

Uma quinta rodada de execução documental ocorreu na mesma data, ainda **não commitada**. Corrige três imprecisões da rodada 4 (§12): o calendário de reavaliação, a classificação do ciclo de 2026-09-26, e a proveniência do script executado.

### 13.1 Correção do calendário de reavaliação P1

O calendário da rodada 4 ("M1 até 2026-10-03, M2 até 2026-10-10, M3 até 2026-10-17, reavaliação até 2026-10-24") **não satisfaz `MAX_AGE_DAYS=14`**: contava o ciclo já executado em 2026-09-26 como um dos três, mas na data de reavaliação proposta (2026-10-24) esse ciclo já teria 28 dias — muito além do limite.

Relido `scripts/checkP1ReconciliationRecurring.ts` com atenção a: `now = Date.now()` é o instante exato da avaliação (não truncado); `evidenceDate` é a data do cabeçalho do arquivo truncada para `T00:00:00Z` (meia-noite UTC), sem componente de hora; a comparação é `ageDays > MAX_AGE_DAYS` — estrita, então exatamente 14,00 dias passa e qualquer fração acima falha; os três ciclos usados são sempre os três de maior número de `run` presentes em `ops/evidence/latest/`, no formato `ape-weekly-cycle-run\d+-\d{4}-\d{2}-\d{2}\.md` (confirmado: o JSON do pipeline v3 não está nesse formato nem nesse diretório — item ainda pendente, ver §12).

Também relido `apps/api/src/services/apeWeeklyCycleV3BillingCycle.ts:45-50`: cada "semana fechada" é um intervalo fixo de segunda a segunda (UTC), e o valor retornado por `getLastClosedBillingCycleWindow()` **não muda durante toda a semana corrente** — só avança na próxima segunda-feira 00:00 UTC. Isso significa que a data efetivamente gravada num ciclo (a data de execução do script, não a data interna da janela) pode ser escolhida em qualquer dia dentro da semana em que aquela janela ainda é "a última fechada", sem deixar de ser uma captura real e distinta.

**Teste do calendário sugerido (10/10, 17/10, 24/10, reavaliação logo após o terceiro):** se os três ciclos forem gerados exatamente nas datas em que suas janelas se tornam disponíveis (cadência ingênua de 7 em 7 dias) e a reavaliação ocorrer em qualquer instante do dia 24/10 (UTC), a idade do ciclo mais antigo (10/10) será de **exatamente 14,00 dias apenas no instante 2026-10-24T00:00:00Z** e **maior que 14 dias em qualquer instante depois disso no mesmo dia** — ou seja, **margem zero, impraticável para um processo supervisionado por humano** (não é possível garantir avaliação no exato instante da virada de meia-noite UTC).

**Alternativa compatível com a cadência permitida (proposta):** gerar o primeiro dos três ciclos o mais tarde possível dentro da semana em que sua janela ainda é "a última fechada", e o terceiro o mais cedo possível na semana em que a sua se torna disponível — sem fabricar ciclos, sem alterar `MIN_CYCLES`/`MAX_AGE_DAYS`, apenas escolhendo o dia real de execução dentro da janela de validade de cada captura. Isso comprime o intervalo calendário entre o primeiro e o terceiro ciclo de 14 dias (cadência ingênua) para cerca de 8 dias, criando margem real.

| Ciclo | Janela capturada (segunda a segunda, UTC) | Data de execução PROPOSTA | Horário/fuso proposto | Justificativa da data |
| --- | --- | --- | --- | --- |
| **Pré-requisito M1** (não é um ciclo; é a integração técnica) | — | **PROPOSTO até 2026-10-03** | — | Sem isso, nenhum ciclo real do pipeline v3 é lido pelo checker, independentemente da idade. Decidir e implementar como `checkP1ReconciliationRecurring.ts` (ou uma ponte que gere um arquivo compatível) passa a consumir o schema `ape.weekly-cycle.v3`. |
| **Ciclo A (PROPOSTO)** | 2026-09-28T00:00Z → 2026-10-05T00:00Z | **PROPOSTO 2026-10-04** (último dia em que essa janela ainda é "a última fechada") | 12:00 UTC (09:00 America/Sao_Paulo) | Executado tarde na validade da janela, para minimizar a distância até o Ciclo C |
| **Ciclo B (PROPOSTO)** | 2026-10-05T00:00Z → 2026-10-12T00:00Z | **PROPOSTO 2026-10-05** | 12:00 UTC (09:00 America/Sao_Paulo) | Executado assim que a janela se torna disponível; posição intermediária não é crítica para a margem |
| **Ciclo C (PROPOSTO)** | 2026-10-12T00:00Z → 2026-10-19T00:00Z | **PROPOSTO 2026-10-12** (primeiro dia em que essa janela se torna disponível) | 12:00 UTC (09:00 America/Sao_Paulo) | Executado o mais cedo possível, para maximizar a margem até a reavaliação |
| **Reavaliação (PROPOSTA)** | — | **PROPOSTA 2026-10-12**, mesmo dia do Ciclo C | 15:00 UTC (12:00 America/Sao_Paulo), poucas horas após o Ciclo C | Momento em que os três ciclos existem e estão comprovadamente dentro do limite (ver idades abaixo) |

**Idade de cada ciclo no instante da reavaliação proposta (2026-10-12T15:00:00Z), com datas truncadas a `T00:00:00Z` conforme o checker:**

| Ciclo | Data gravada (meia-noite UTC) | Idade em 2026-10-12T15:00:00Z | Margem até os 14 dias |
| --- | --- | --- | --- |
| A | 2026-10-04T00:00:00Z | **8,625 dias** | 5,375 dias |
| B | 2026-10-05T00:00:00Z | **7,625 dias** | 6,375 dias |
| C | 2026-10-12T00:00:00Z | **0,625 dias** | 13,375 dias |

Todos os três, **com folga confortável**, não apenas no limite. Esta é uma proposta de calendário operacional (quando efetivamente rodar o script real, dentro da janela em que sua captura já é válida) — não uma fabricação de ciclos, datas de execução ou dados; cada ciclo continua sendo uma medição real de uma janela semanal genuinamente fechada, apenas com o dia de execução escolhido deliberadamente para criar margem.

**Todas as datas acima (M1, Ciclos A/B/C, reavaliação) são PROPOSTAS — nenhuma foi executada.**

### 13.2 Classificação corrigida do ciclo de 2026-09-26

Substituída a classificação anterior ("1 de 3 ciclos exigidos", que sugeria contagem parcial de aceitação) por:

> **"Execução real comprovada, com evidência preservada localmente; elegibilidade para o gate P1 ainda pendente."**

Verificações desta rodada, contra `docs/ops/ape-audit-telemetry-decision.md:153-155` (o contrato que define "Aprovação exige: `measurementStatus = measured` E `coverageStatus = complete` E `sampleSize > 0` E `value` dentro do threshold E receipt válido"):

- `measurementStatus: "measured"` ✓; `coverageStatus: "complete"` ✓; `sampleSize: 2` — **satisfaz `sampleSize > 0`**, o único limiar de amostra que o contrato exige; não existe, em nenhum contrato lido, um mínimo de amostra maior que zero — **não foi criado nenhum mínimo adicional**. `auditGap`/`duplicateSideEffects` = 0 (dentro do threshold definido pela própria ADR-007). Receipt: **validado independentemente** — `.../validation/993feedf...json` mostra `validatorIdentity: "eiah.ape-weekly-cycle-v3.independent-validator.v1"`, `validationStatus: "passed"`, com `recomputed` batendo exatamente com o evidence original. **As cinco condições desse contrato de telemetria estão satisfeitas por esta medição.**
- **Ratificação humana:** ausente (reconfirmado; ver §12.4).
- **Compatibilidade do schema v3 com os requisitos de P1:** no nível de medição (measurementStatus/coverageStatus/sampleSize/receipt), o schema **é compatível e mais rigoroso** que o gerador legado (que grava literais). No nível operacional, **não há compatibilidade com o checker vigente** — `checkP1ReconciliationRecurring.ts` não lê este formato/local (§12.4). São duas camadas distintas; a primeira está resolvida, a segunda não.
- **Escopo da medição:** um único tipo de operação (`billing.run_cost_debit`), uma única janela semanal (2026-09-14→2026-09-21), um único par tenant/workspace (`tenant-interop-mu116ad0-3yk2ve`/`workspace-interop-mu116ad0-3yk2ve`). **Lacuna de contrato registrada:** nenhum documento lido nesta sessão (incluindo `ADR-007` e o gerador legado, que não referencia tenant algum) define qual escopo de tenant/workspace é exigido para uma medição de P1 valer como representativa — o gerador legado é agnóstico a tenant porque é declarativo. Isso não é resolvido aqui; é uma lacuna a decidir junto com o M1 técnico.
- **Como o checker vigente poderia consumir este resultado:** teria que (a) ler o diretório/formato do pipeline v3 em vez de (ou além de) `ops/evidence/latest/*.md`, e (b) agregar `sampleSize`/`auditGap`/`duplicateSideEffects` por ciclo da mesma forma que já faz para o formato legado. Nenhuma dessas mudanças foi feita; ambas fazem parte do marco M1 proposto em §13.1.

### 13.3 Precisão de proveniência

Investigação somente-leitura no transcript bruto desta sessão (arquivo local, sem execução de nada novo):

- **Comando de escrita do script:** `tool_use` tipo `Write`, timestamp `2026-09-26T09:38:54.554Z`, caminho `apps/api/scripts/run_ape_weekly_cycle_v3_billing.ts`.
- **Comando de execução:** `tool_use` tipo `Bash`, timestamp `2026-09-26T09:39:19.586Z` — **25 segundos depois** da escrita.
- **Hash do conteúdo escrito** (extraído do próprio `tool_use` de `Write`, campo `content`, codificado UTF-8): `SHA-256 = af219c500d481fe78b51b937d9e3114162581743d3d33067343390f7c7881457`.
- **Hash do arquivo atual em disco** (`sha256sum apps/api/scripts/run_ape_weekly_cycle_v3_billing.ts`, calculado nesta rodada): **`af219c500d481fe78b51b937d9e3114162581743d3d33067343390f7c7881457` — idêntico**. Isto é o hash do arquivo **atual**; a coincidência com o hash extraído do `Write` de 2026-09-26T09:38:54Z é o que estabelece a ligação com a versão executada — não é, isoladamente, "prova retroativa" independente do transcript.
- **`mtime` do arquivo:** `2026-09-26 09:39:01Z` (convertido de `-03:00`) — consistente com o `Write` (09:38:54Z) e anterior à execução (09:39:19Z); nenhuma modificação posterior ao `mtime` foi feita por mim nesta ou em nenhuma rodada seguinte.
- **Ambiente:** comando usou `--env-file-if-exists=packages/db/.env` (arquivo existe, `mtime` 2026-07-25 — não lido nesta verificação, conteúdo não exposto). `workflowRunId: null` no input do pipeline — **execução manual, local, fora de qualquer run de CI**, no mesmo ambiente de desenvolvimento desta sessão.
- **`commitSha` usado no ciclo:** `c26593052f2ebbe2938f35eb3384160bf334d897` (HEAD no momento) — como o script é untracked, este `commitSha` identifica o estado do restante do repositório, **não** o conteúdo do próprio script; a ligação com o conteúdo do script vem exclusivamente da correspondência de hash acima, não do `commitSha`.

**O que está comprovado:** o conteúdo do arquivo atual em disco é byte-idêntico (por hash) ao conteúdo gravado 25 segundos antes da execução; não houve modificação do script entre a escrita, a execução e agora. **O que permanece incerto:** qualquer coisa fora do que o transcript desta sessão registra — por exemplo, se o ambiente de banco de dados (schema, dados pré-existentes) mudou entre a execução e agora não foi verificado; a proveniência da identidade do tenant/workspace usados não foi investigada além do já registrado em §12.4. **Consequência para a elegibilidade:** a proveniência do código está comprovada com alto grau de confiança; isso não muda a elegibilidade do ciclo para o gate, que continua pendente por quantidade (1 de 3) e por conexão ao checker (§13.2) — a proveniência do código nunca foi o fator limitante.

### 13.4 Recomendação registrada, não executada — colisão de numeração ADR-002

Registro, como recomendação para decisão futura de Carlos Alberto Merlo, **sem executar nesta rodada**: preservar a identidade de `docs/adr/ADR-002-governed-collective-intelligence.md` (branch `docs/adr-002-v2-r3`, PR #441) como a ADR-002 já em curso de revisão (AUTHZ-RUNS), e renumerar futuramente a proposta de banco de dados (`ADR-002-database-self-managed-postgres.md`) para um número livre, a confirmar antes de qualquer renomeação. **Nenhum documento foi renomeado nesta rodada.**

### 13.5 O que esta nota (seção 13) não faz

- Não executa nenhum dos ciclos, marcos ou a reavaliação propostos em §13.1 — todos permanecem PROPOSTOS.
- Não reduz `MIN_CYCLES=3` nem aumenta `MAX_AGE_DAYS=14`; não fabrica ciclos ou datas de execução passadas.
- Não declara o ciclo de 2026-09-26 elegível para o gate; não conta como "aceito" nem como fração de aceitação.
- Não renomeia `ADR-002-database-self-managed-postgres.md` nem `ADR-002-governed-collective-intelligence.md`.
- Não registra aprovação de Carlos Alberto Merlo, renovação de exceção, nem a reavaliação da ADR-007 como concluída.
- Não constitui evidência de execução do sistema para fins de `docs/EVIDENCE_INDEX.md`.

## 14. Contrato M1 — política parcialmente aprovada; escopo e operação pendentes

**Decisão parcial de Carlos Alberto Merlo — 27/09/2026, America/Sao_Paulo.** Origem: declaração explícita do usuário nesta conversa, transmitida no prompt. Registro textual, sem atribuição de assinatura digital ou verificação independente de identidade.

> “Eu, Carlos Alberto Merlo, aprovo parcialmente a política M1 nos termos acima, incluindo a mudança de recência para 14/28 dias. O escopo canônico permanece pendente. Autorizo formalizar essa decisão e implementar os mecanismos locais necessários. Esta aprovação não ratifica integralmente a ADR-009, não prorroga a ADR-007, não autoriza execução operacional ou ativação de CI e não restaura P1/P2 como required checks.”

**Cláusulas aprovadas:** três janelas semanais consecutivas determinadas pelo relógio; prazo de captura de 7 dias sem tolerância adicional; ausência de janela obrigatória bloqueia sem recuo; fechamento exige comprovação da população até cutoff explícito e ausência de pendências; recência desde a primeira geração de 14 dias na janela mais recente exigida e 28 nas históricas, sem renovação por correção; dispensa de `CycleRatificationV3` individual para P1, preservando release; preservação de versões sem descarte automático até decisão própria de retenção.

**Pendentes:** tenant/workspace e universo canônico de operações, demonstração das garantias operacionais e qualquer autorização de operação/ativação. Os parâmetros estão aprovados normativamente para o caminho M1 v3, não validados em produção. A ADR-009 mantém **Status geral: Proposta**; Carlos permanece o único administrador e decisor. Aprovação da política não aprova pacote, execução ou retorno. A reavaliação da ADR-007 não foi concluída nem prorrogada; **P1/P2 permanecem sem autorização de retorno como required checks**.

Representação local versionada: `scripts/policies/p1-m1-partially-approved.v1.json`, com `scenario=operational`, `scope=null` e `expectedOperationIds=null`. A CLI carrega esse arquivo por `--policy`; fixtures só podem declarar `fixtureScope` com `scenario=test`. Nenhuma configuração promove histórico, métricas, proveniência ou completude a verificados. O calendário da §14.9 continua histórico superado.

### 14.1 Base fatual (o que já existe vs. o que é proposto)

| # | Item | Categoria |
| --- | --- | --- |
| 1 | `MIN_CYCLES=3`, `MAX_AGE_DAYS=14`, comparação estrita `>`, `now` não truncado | (a) regra já vigente — `scripts/checkP1ReconciliationRecurring.ts:6-7,69,78` |
| 2 | `validateCycleEvidenceV3()` recomputa freshness via `generatedAt` vs. `now`, `maxAgeDays` default 14; o pipeline chama sem passar `now`/`maxAgeDays` (freshness trivial, síncrona à geração) | (b) comportamento implementado — `apeWeeklyCycleV3Validator.ts:161-201`; `apeWeeklyCycleV3BillingCycle.ts:292-295` |
| 3 | `cycleId = billing:{tenantId}:{workspaceId}:{windowStart}`, determinístico | (a) regra já vigente — `apeWeeklyCycleV3BillingCycle.ts:69-71` |
| 4 | `supersedesEvidenceRef`/`supersedesRatificationRef` existem no schema | Campos presentes no schema; o núcleo local lê `supersedesEvidenceRef` para diagnosticar conflito, mas não resolve substituições nem verifica a cadeia |
| 5 | `CycleRatificationV3` exigida para o gate de **publicação de release** (`ReleasePromotionTelemetry`, `ape-audit-telemetry-decision.md:76`) | (a) regra já vigente, **para um gate diferente** de `P1ReconciliationRecurring` |
| 6 | Checker M1 | Núcleo local e testes sintéticos implementados; ativação operacional não demonstrada (§14.16) |

### 14.2 Cláusula A — Janelas obrigatórias e relógios distintos

Para `T=checkerNow`, usar semanas UTC `[segunda 00:00, segunda seguinte 00:00)`, `MIN_CYCLES=3`, prazo `P=7 dias` e tolerância adicional `G=0`. A janela exigida mais nova é `R=computeLastClosedWeekUtc(T−P)`; as outras são suas duas antecessoras imediatas. O prazo de uma janela vence em `window.to+P` (inclusive). São conceitos distintos:

| Grandeza | Regra aprovada para M1 v3 |
| --- | --- |
| Última janela encerrada | `computeLastClosedWeekUtc(T)`; pode ainda estar dentro do prazo de captura |
| Última janela cujo prazo venceu | `R`; determina o trio obrigatório independentemente dos arquivos disponíveis |
| Janelas disponíveis | Entradas do pacote; ausência, conflito ou falta de fechamento em qualquer membro obrigatório bloqueia, sem escolher outro trio |
| Idade da evidência | `T−primeiraGeneratedAt(cycleId)`; ≤14 dias para R, ≤28 dias para suas duas antecessoras; igualdade aceita, futuro rejeitado |
| Idade do período | `T−window.to`; com P=7, R tem de 7 a menos de 14 dias e a mais antiga de 21 a menos de 28 dias; não é idade da evidência |
| Prazo de captura | `window.to+7 dias`: instante a partir do qual o pacote com fechamento comprovado é exigido; não comprova término das runs |
| Tolerância após o prazo | Zero; nenhuma carência adicional nem extensão de recência. Uma captura tardia pode sanar a ausência enquanto a janela ainda pertence ao trio obrigatório, sem apagar o atraso |
| Retenção | Disponibilidade/preservação de bytes e histórico (§14.14); não prolonga validade da evidência |

Mapeamento local para simulação: `requireConsecutiveWindows=true`, `requireLatestWindowIsLastClosed=false`, `requireLatestWindowIsLastMatured=true`, `finalCaptureMaturationDays=7`, `captureToleranceDays=0`, `requireFinalCaptureForNewestWindow=true`, `maxAgeDays=14`, `historicalCycleMaxAgeDays=28`. O nome “matured” descreve somente elegibilidade temporal. A política versionada acrescenta `requireClosureForAllRequiredWindows=true`: o núcleo avalia rótulo, cutoff e pendências nas três janelas; isso **não implementa prova independente** de fechamento. `finalCaptureMaturationDays` continua sendo apenas plausibilidade mínima.

**Sustentação semanal e bloqueios:** os 7 dias reservam uma cadência para observar conclusões tardias; não derivam de uma distribuição operacional de duração de runs. A decisão aprovou esse parâmetro com registro de atrasos e pendências para futura revisão explícita, sem ajuste automático. A tolerância adicional aprovada é zero porque o prazo já reserva uma cadência e não há dados que justifiquem mais carência; o custo assumido é bloquear até a prova estar disponível. Se a primeira captura ocorrer no fechamento (hipótese conservadora), a mais antiga terá 21 dias ao entrar no trio e menos de 28 até a próxima troca: `2×7 + 7 de prazo + 7 até renovação`. A mais nova terá de 7 a menos de 14 dias. Isso remove o vencimento estrutural entre renovações, **sob essas hipóteses**, mas não elimina bloqueios por atraso ou pendência. Capturas anteriores ao fechamento, se existirem no histórico, mantêm a âncora e podem vencer antes; não serão omitidas para caber nos limites.

A cada vencimento semanal do prazo, a referência avança, mesmo sem pacote novo. Como a plausibilidade final exige pelo menos 7 dias, haverá bloqueio entre essa virada e a disponibilização/validação do pacote final; pendências podem prolongá-lo além de sete dias. Não se promete disponibilidade contínua nem se aceita um trio antigo nesse intervalo. O parâmetro de tolerância local é relativo ao encerramento na política alternativa; não se presume implementada uma carência após o prazo da política recomendada.

**Mudança material em relação à ADR-007 §15.2–3:** manter o número 14 apenas para a mais nova e admitir 28 nas históricas **altera** o critério uniforme de recência de 14 dias. Não é preservação por mera manutenção do default ou uso opt-in. A substituição normativa foi aprovada expressamente para M1 v3 e anotada na ADR-007 §15. O checker legado permanece com limite uniforme de 14 dias e não foi alterado. Adoção operacional continua bloqueada pelas demais dependências. `MIN_CYCLES=3`, medição real, valores zero, fail-closed e decisão administrativa de retorno permanecem exigidos. Exigir consecutividade e prazo determinístico adiciona regras que a ADR-007 não explicitava.

### 14.3 Cláusula B — Identidade, escopo e contagem

- Designação explícita por Carlos: `tenantId=PENDENTE`, `workspaceId=PENDENTE`, `domain=billing`, versão/digest do catálogo de operações e lista completa de `operationIds/expectedUniverse=PENDENTE`. Nenhum identificador será inferido do pacote; o tenant de 26/09 não é presumido representativo.
- Critérios de escolha: vínculo tenant/workspace verificável, autorização de leitura independente, atividade real recorrente e amostra positiva para cada operação aplicável do domínio, cobertura de Run/RunUsageBreakdown/BillingLedger, continuidade por três semanas e capacidade de preservar pacotes. Exclusões de operações exigem justificativa e decisão explícita sobre o alcance; não se estreita o universo para fabricar cobertura completa.
- Três ciclos contam somente como três janelas distintas, consecutivas, no mesmo escopo e universo designados. Duplicatas e versões da mesma janela nunca somam; tenant diferente não vira semana diferente. Mudança de escopo/universo exige nova designação e sequência comparável, sem juntar séries incompatíveis.
- **Alcance:** evidência de um escopo dedicado demonstra apenas esse escopo, não cobertura global da plataforma. A suficiência desse alcance para P1 precisa ser aprovada expressamente; não decorre da ADR-007 nem da execução de 26/09. Falta de candidato comprovado impede ativação.

### 14.4 Cláusula C — Ancoragem de recência e regeneração

**Regra aprovada (elimina a ambiguidade entre `generatedAt` da versão atual e primeira geração):** a recência de um ciclo (por `cycleId`) é ancorada na **primeira `generatedAt` já registrada** para aquele `cycleId` — nunca a da versão mais recente, nunca a de uma regeneração isolada.

**Garantias que o índice por `cycleId` precisa oferecer (dependência técnica, hoje inexistente):**
- **Append-only** — um índice mutável, que permita apagar ou sobrescrever entradas antigas, **não prova primeira geração**; qualquer implementação que permita remoção retroativa invalida a garantia inteira desta cláusula.
- Registro imutável de cada tripla observada: `(cycleId, evidenceDigest, generatedAt)`.
- Hoje **não existe** esse índice — o armazenamento é só por conteúdo (`.../evidence/{digest}.json`), sem listagem por `cycleId`. Sem ele, o checker não pode distinguir primeira geração de regeneração tardia.

**Comportamento local existente; insuficiente para ativação sem histórico verificável:**
1. Repetição do **mesmo `evidenceDigest`** para o mesmo `cycleId` é idempotente — não aumenta a contagem (decorre naturalmente do armazenamento endereçado por conteúdo).
2. Versões **conflitantes** (mesmo `cycleId`, `evidenceDigest` diferente) sem que o índice acima já exista são **rejeitadas** — fail-closed, não aceitas com tratamento ambíguo.
3. Suporte completo a `supersedesEvidenceRef`/`supersedesRatificationRef` continua **não implementado**. O diagnóstico local de conflito não autoriza escolher a versão nova. Se houver versões conflitantes de uma janela obrigatória, ela permanece bloqueada até existir resolução verificável, especificada e testada; apagar a provisória não é uma solução.

**Vínculo conteúdo/digest/ratificação (fato já existente, não proposta):** `CycleRatificationV3.evidenceDigest` amarra a ratificação a um digest exato, não ao `cycleId` — uma regeneração (novo digest) invalida automaticamente qualquer ratificação anterior daquele ciclo. Isso já existe hoje e é uma proteção real, independente de M1.

### 14.5 Cláusula D — Validação no instante do checker

**Correção explícita:** um `validationStatus="passed"` persistido, sozinho, **não é aceito como prova suficiente**. O contrato exige que M1 valide no instante da própria avaliação (`checkerNow` explícito), não apenas leia um booleano gravado no passado.

**Verificável a partir do artefato, sem acesso aos dados originais (mandatório em M1):**
- Schema e campos obrigatórios (`assertValidCycleEvidenceV3Shape`).
- Integridade do digest — recomputar `evidenceDigest` a partir do próprio conteúdo e comparar (função pura, sem I/O).
- Escopo e identidade da janela (`tenantId`/`workspaceId`/`domain`/`windowStart` contra o escopo configurado).
- Idade da versão (`generatedAt` vs. `checkerNow`) e rejeição de `generatedAt` no futuro; a âncora histórica governante da §14.2 requer a prova adicional da §14.4.
- Duplicidade/conflito entre versões incluídas no pacote; isso não substitui o índice verificável de `cycleId` (§14.4).

**Limites atuais e dependências de ativação:** o núcleo recomputa métricas a partir dos receipts incluídos no próprio pacote; isso verifica consistência interna, não a fonte. Não confia apenas em um `ValidationResultV1` persistido, mas também não demonstra que os receipts refletem todas as linhas reais. Faltam extração independente, vínculo autenticado com a execução, histórico verificável e prova de completude no cutoff definido em §14.13. Aprovação de política ou rótulo final não remove essas dependências.

### 14.6 Cláusula E — Ratificação

- **Separação mantida em três conceitos distintos:** validação técnica do ciclo (Cláusula D, máquina-verificável); `CycleRatificationV3` (ato humano, exigido apenas onde as fontes o exigem); decisão administrativa de restaurar `P1ReconciliationRecurring` como required check no ruleset (`ADR-007 §15` item 5).
- **Fontes:** `CycleRatificationV3` é **obrigatória** para o gate de publicação de release (`ape-audit-telemetry-decision.md:76`, job `ReleasePromotionTelemetry`) — não tem relação com `P1ReconciliationRecurring`. Os 5 critérios de `ADR-007 §15` **não mencionam** `CycleRatificationV3` — exigem medição real, três ciclos com valores zero e recência conforme a §15 (anotação 14/28 restrita ao caminho M1 v3; legado inalterado), fail-closed demonstrado, e decisão administrativa sobre o ruleset.
- **Cláusula aprovada:** não exigir `CycleRatificationV3` por ciclo para elegibilidade em P1. A justificativa correta é a **distinção entre controle técnico recorrente e aprovação de release** — um required check é reavaliado a cada PR, mecanicamente, e precisa de um resultado máquina-verificável (`validationStatus`/Cláusula D); uma aprovação de release é um gate deliberado e pouco frequente, adequado a ratificação humana por instância. **Esta recomendação não se apoia em evitar um segundo revisor** — essa não é a razão; a correção substitui qualquer leitura anterior nesse sentido.
- **Carlos Alberto Merlo permanece o único administrador e decisor** tanto sobre exigir ou não `CycleRatificationV3` para P1 quanto sobre restaurar o ruleset — nenhuma das duas decisões introduz um segundo revisor, a dispensa individual para P1 foi aprovada nesta decisão parcial, enquanto a restauração continua pendente.

### 14.7 Cláusula F — Proveniência do código

**Correção de afirmação anterior excessiva:** não é verdade que um script untracked impeça toda proveniência verificável — a afirmação correta é mais restrita:
- Um commit identifica **conteúdo versionado**, mas não comprova, por si só, que aquele conteúdo foi **executado**.
- Um hash identifica **conteúdo**, mas não comprova, sozinho, **horário ou realidade de execução** — só que dois textos são idênticos.
- `commitSha` do repositório (estado do `HEAD` no momento) **não identifica alterações locais nem arquivos untracked** — esta parte permanece verdadeira e é a razão real pela qual a proveniência de um script untracked é mais fraca, não pela qual seria inexistente.
- A correspondência de hash das rodadas 5/6 (conteúdo do `Write` desta sessão = conteúdo atual do arquivo) é uma evidência real, mas **interna ao transcript desta própria sessão** — não é uma cadeia de proveniência independente (sem assinatura de commit, sem atestado de build de CI).

**Recomendação para ciclos futuros (não aplicada nesta rodada):** código versionado (commitado) antes de produzir evidência elegível a um gate; registro explícito de qualquer alteração local relevante feita antes da execução; vínculo declarado entre comando executado, versão de código efetivamente rodada, ambiente, timestamps e artefatos resultantes — por exemplo, incluir no `provenance` um hash do próprio conteúdo do script executado, não só o `commitSha` do repositório.

**Não commitado nesta rodada** (fora do escopo autorizado). **Não invalida retroativamente** a execução real de 2026-09-26 — ela continua classificada como execução real comprovada, com evidência preservada localmente; sua **elegibilidade para P1 continua pendente**, por quantidade e pelas garantias operacionais ainda não demonstradas pelo núcleo local — não porque a proveniência tenha sido invalidada.

### 14.8 Matriz de aceitação M1 v3 (política aprovada; ativação pendente)

| Caso | Tratamento proposto |
| --- | --- |
| Evidência válida | só conta após Cláusula D, janela/recência (§14.2), escopo (§14.3), histórico e fechamento comprovados |
| Evidência vencida | idade desde a primeira geração >14d na mais nova ou >28d nas históricas → não conta no caminho M1 v3 aprovado; checker legado mantém regra uniforme de 14d |
| Evidência futura (`generatedAt` > `checkerNow`) | rejeitada (§14.5) |
| Evidência duplicada (mesmo `cycleId`, mesmo `evidenceDigest`) | idempotente, não conta duas vezes (§14.4.1) |
| Evidência regenerada (mesmo `cycleId`, `evidenceDigest` diferente) | rejeitada em M1 sem índice (§14.4.2); tratamento completo fica para etapa posterior |
| Escopo incompatível | não conta, não soma como semana (§14.3) |
| Receipt inválido / `validationStatus="rejected"` | não conta |
| Ratificação ausente ou incompatível | não bloqueia contagem para P1 (aprovado para P1, §14.6); bloquearia, à parte, publicação de release |

### 14.9 Calendário histórico corrigido — hipótese anterior superada pela §14.2

**Histórico da proposta anterior:** a tabela e sua avaliação abaixo pressupõem última janela encerrada, não a recomendação atual de prazo de captura. Não constituem previsão de atendimento ao contrato agora proposto.

A leitura de `apeWeeklyCycleV3BillingCycle.ts:35-49` já havia confirmado (rodada 6) que as janelas de §13.1 estavam deslocadas em uma semana; **§13.1 permanece como histórico, superado quanto aos rótulos de janela**, corrigidos assim:

| Execução (PROPOSTA) | Janela | `generatedAt` | Recência da evidência em 2026-10-12T15:00:00Z | Atraso de captura |
| --- | --- | --- | --- | --- |
| 2026-10-04T12:00:00Z (Ciclo A) | [2026-09-21, 2026-09-28) | = execução | **8,125 dias** (margem 5,875 d) | 6,5 dias |
| 2026-10-05T12:00:00Z (Ciclo B) | [2026-09-28, 2026-10-05) | = execução | **7,125 dias** (margem 6,875 d) | 0,5 dias |
| 2026-10-12T12:00:00Z (Ciclo C) | [2026-10-05, 2026-10-12) | = execução | **0,125 dias** (margem 13,875 d) | 0,5 dias |

A avaliação histórica em 12/10 às 15:00 UTC tinha recências 8,125/7,125/0,125 dias e última janela encerrada [05/10,12/10). Essa viabilidade pontual pertencia à proposta anterior; a recomendação atual exige [14/09,21/09), [21/09,28/09), [28/09,05/10) nesse instante. Os ciclos da tabela eram hipotéticos, não aceitos operacionalmente. Preservam-se os rótulos corrigidos; o calendário não autoriza retorno nem altera a reavaliação vencida da ADR-007.

### 14.10 Deliberação solicitada e requisitos de ativação

**Deliberação parcial registrada:** fórmula do trio, prazo 7, tolerância zero, recência 14/28 e alteração normativa para M1 v3, condições de fechamento/correção, dispensa de ratificação individual para P1 e preservação sem descarte automático estão aprovadas nos limites declarados acima.

**Carlos ainda precisará preencher/decidir:** tenant/workspace, versão/lista de operações e suficiência do alcance dedicado para P1 (§14.3); política própria de retenção/descarte quando aplicável; autorizações futuras de execução operacional, ativação de CI e eventual retorno de P1/P2. Nenhuma delas decorre automaticamente da aprovação parcial.

**Sequência técnica restante para operação — fora da autorização local desta rodada:**
1. A decisão normativa já está registrada; designar o escopo e especificar contratos versionados de cutoff, pendências, fechamento, histórico e proveniência antes de integrar produtor/checker. Ratificação não transforma os 59 testes sintéticos anteriores em execução operacional.
2. Implementar/verificar índice append-only, vínculo confiável entre comando/código/ambiente/execução/artefatos, extração independente das métricas e população completa no escopo/cutoff. Implementar fechamento de cada membro do trio; manter conflitos bloqueados enquanto a resolução de versões não for demonstrada.
3. Disponibilizar pacotes autenticáveis e todas as versões em transporte legível pelo consumidor, com preservação, recuperação e falhas de leitura testadas. Um hash ou manifesto autodeclarado não basta.
4. Executar, mediante autorização própria, ciclos operacionais para o trio obrigatório; verificar amostra/cobertura, `auditGap=0`, `duplicateSideEffects=0`, recência e fail-closed em ausência, invalidade, vencimento e valores não zero. Demonstrar o comportamento entre viradas, não só uma passagem isolada.
5. Só então submeter critérios de retorno aplicáveis e novo retrato remoto do ruleset à decisão administrativa explícita de Carlos sobre P1. P2 conserva condições próprias da ADR-007 §16. A reavaliação de 18/09 continua pendente: esta proposta não a realiza nem prorroga.

### 14.11 Entrega 2 — correções pontuais sobre a Entrega 1

- **Reason codes:** a conclusão anterior ("ausência na lista de enforcement de `checkReasonCodeCanon.ts` autoriza identificadores locais") foi **corrigida** — ausência de enforcement não é autorização normativa. Busca por regra explícita não encontrou nenhuma; a única exigência normativa localizada é restrita, por texto, aos 5 códigos `APE_TELEMETRY_*` do gate de release (`ape-audit-telemetry-decision.md:80`). Registrado como **lacuna explícita**, não como permissão demonstrada — ver `docs/ops/p1-ape-weekly-cycle-v3-checker.md`.
- **Tolerância de captura:** cálculo (`checkerNow − realLastClosed.to`) confirmado correto. O relato da rodada de correção anterior, que descreveu esse ajuste como um bug "encontrado e corrigido" naquela rodada, **repetiu indevidamente** a descrição de uma correção já feita na rodada de implementação original — conferido que aquela rodada de correção não tocou esse trecho do arquivo. Não houve regressão; foi um erro de relato, agora corrigido.

### 14.12 Matriz da decisão parcial e exemplo temporal

| Decisão | Regra parcialmente aprovada | Fundamento (vigente/lacuna e delta ADR-007) | Efeito | Pendência |
| --- | --- | --- | --- | --- |
| Janela exigida | Trio consecutivo terminado em `computeLastClosedWeekUtc(T−7d)`; tolerância zero | ADR-007 exige três ciclos, mas não define esse calendário; §14.16 demonstra conflito entre última encerrada e maturação semanal | Ausência da janela obrigatória bloqueia; disponibilidade não escolhe referência | Integração operacional e garantias verificáveis |
| Fechamento | Final somente com prova de população, zero pendências e métricas verificadas no cutoff; todas as três janelas | Hoje `finishedAt IS NOT NULL` omite pendentes; reforça medição real da ADR-007 | Prazo/rótulo não aprovam fechamento; correções preservam versões e bloqueiam conflitos | Contratos, coleta/verificação de pendências, fechamento e histórico ainda ausentes |
| Recência | 14 dias na mais nova, 28 nas históricas, desde primeira geração | `2×7+7+7=28` sob captura inicial no fechamento e renovação semanal; **altera** recência uniforme de ADR-007 §15.2–3 | Sustenta o intervalo semanal sob hipóteses explícitas; sem renovar âncora | Validação operacional e índice verificável; mudança normativa já aprovada |
| Escopo | Tenant/workspace fixos e universo billing versionado, identificadores pendentes | Legado não designa escopo; 26/09 não prova representatividade | Resultado restrito ao escopo aprovado; não cobertura global | Carlos designar candidato que cumpra §14.3 e aprovar suficiência para P1 |
| Ratificação | `requireRatification=false` para P1; manter release separado | ADR-007 §15 não exige `CycleRatificationV3`; `ape-audit-telemetry-decision.md` §4 exige para release | Validação técnica recorrente sem aprovação humana por ciclo; retorno continua ato administrativo | Dispensa aprovada; nenhuma exigência de release alterada |
| Retenção/ativação | Preservar todas as versões e âncoras, sem descarte automático até decisão própria; gate continua bloqueado | Retenção não equivale a recência; condições de retorno ADR-007 permanecem salvo mudança expressa acima | Arquivos antigos não se tornam válidos por existirem; política aprovada não restaura P1 | Transporte/preservação verificáveis, execução operacional e decisão de retorno |

**Propostas anteriores superadas como recomendação:** última janela encerrada sem prazo; limite único de 21 dias; e 21 dias históricos como solução universal. O teste anterior de 21 no instante inicial não demonstra a semana inteira com prazo de 7 dias. Não recomendar 90 dias de validade: não há necessidade derivada nem dados que o sustentem; tampouco adotá-lo silenciosamente como retenção. A alteração normativa expressa 14/28 já vale para o caminho M1 v3; o checker legado continua implementando 14 dias uniformes.

**Exemplo curto, apoiado nos cenários sintéticos já executados (§14.16), não nova execução:** W1=[14/09,21/09), W2=[21/09,28/09), W3=[28/09,05/10), W4=[05/10,12/10), UTC. Em 12/10 00:00, W4 é a última encerrada, mas W3 é a última cujo prazo de 7 dias venceu; exige-se W1/W2/W3. Com primeiras gerações nos fechamentos, W1 tem 21 dias nesse instante e 21,5 dias ao meio-dia: limite histórico de 21 atende só à fronteira; 28 comporta a semana até a troca por W2/W3/W4 em 19/10, se todas as demais garantias forem satisfeitas. Não é prova de continuidade operacional.

A run criada em 04/10 às 23:59 e concluída em 14/10 (cenário D anterior) permanece pendente em 13/10. W3 bloqueia desde o vencimento do prazo; não se aceita outro trio. Sua conclusão no dia 9 apenas permite nova captura/verificação: versões em conflito continuam bloqueadas no núcleo atual e `final` autodeclarado não libera o gate. Mesmo a simulação com política atendida mantém `GUARANTEE_NOT_DEMONSTRATED`.

### 14.13 Cláusula aprovada de fechamento, cutoff e correções — prova operacional pendente

**População aprovada:** todas as runs do tenant/workspace designado e das operações do universo versionado com `createdAt ∈ [window.from, window.to)`, inclusive as ainda sem término. A atribuição permanece por criação, nunca por `finishedAt`; conclusão tardia não migra a run para outra semana. O produtor atual filtra `finishedAt IS NOT NULL` e não demonstra essa população completa.

**Provisória:** observação que ainda não demonstra as condições de fechamento, inclusive quando há pendências após o prazo de 7 dias. Registrar população e IDs/contagens de runs pendentes, terminais e não reconciliadas, com cutoff e proveniência, sem converter omissão em amostra completa. Contagem isolada não basta: deve permitir conferir cobertura por identidade, sem duplicatas.

**Condição aprovada de final:** no cutoff explícito `C` de um snapshot consistente da fonte, demonstrar: (i) população completa no escopo/janela e watermark verificável de ingestão/visibilidade até C; (ii) todas as runs dessa população terminais segundo o contrato versionado, nenhuma pendente ou de estado desconhecido; (iii) dados de uso/ledger pertinentes completos até C e métricas reconciliadas independentemente, sem gaps ou duplicidades, cobertura exigida e amostra positiva; (iv) vínculo verificável do snapshot, execução e artefato. Exigir `C ≥ window.to+7 dias` e `C ≤ generatedAt ≤ checkerNow`. Se a fonte não oferecer prova da completude/visibilidade até C, não declarar final. Snapshot incluído pelo próprio produtor, tempo decorrido e `captureStatus="final"` não satisfazem essas provas.

A conclusão é **fechamento verificado até C**, não promessa de ausência de fatos ou correções após C. Chegada posterior de registro com criação na janela, correção de uso/ledger ou descoberta de omissão invalida o uso da versão afetada para elegibilidade até nova verificação; exige sinalização verificável de invalidação/correção, ainda não implementada. Não se oculta alteração conhecida só porque o snapshot anterior era consistente.

Preservar `cycleId`, janela e escopo, todas as versões/digests, cutoff e a primeira geração (inclusive provisória); correção referencia a anterior sem apagar nem reancorar. Ratificação de outro digest não se transfere, nos fluxos que a exigem. O núcleo valida localmente `closure={cutoffAt,pendingCount,expectedPopulationCount,terminalCount}`: timestamp consistente com fechamento/geração/relógio, cutoff final após o prazo, contagens inteiras não negativas e soma coerente. Pendências conhecidas e provisório em qualquer janela obrigatória falham a política; metadados ausentes mantêm `closureProof=not_demonstrated`. Mesmo contagens zero coerentes não provam população. Versões concorrentes, inclusive declarações contraditórias do mesmo digest, são bloqueadas; **não há suporte completo a supersedes, coleta independente de pendências, watermark ou fechamento verificável**. Portanto, converter provisória em final mediante nova versão não libera operacionalmente a janela hoje. Essa dependência deve ser resolvida e testada antes de reivindicar o fluxo completo; até lá, permanece fail-closed.

### 14.14 Pacote operacional e transporte (transporte pendente; preservação aprovada)

Implementado (`scripts/lib/p1OperationalPackage.ts`, com testes): manifesto persistido v1 preservado, com diagnóstico de saída `p1-source-diagnostic.v2`. O antigo `sourceSnapshot` contém somente metadados e é lido como `metadata_only`; o literal anterior `recomputed_against_included_snapshot` foi removido porque declarava cálculo não executado. O material `p1-source-material.v1` distingue metadados de projeções de identidade/tempo de runs e fatos incluídas (`rows_included`), com validação local de estrutura, identidades, referências, contagens, timestamps e digests. Essas projeções não são linhas financeiras completas. `recomputation=not_run` em todos os caminhos desta etapa; claims de execução bem-sucedida ou falha não são aceitos pelo validador do diagnóstico. `independentSourceVerification` e `completenessAndAuthenticityOfInputs` permanecem `not_demonstrated`; `internalConsistency` continua delegando a validação do ciclo ao núcleo existente. Mapeamento run→operação, chave de duplicidade e denominadores permanecem explicitamente `unresolved`. Não há novo executor de métricas, prova de snapshot consistente ou alteração da política/catalogação operacional. A migração é do diagnóstico, sem regravar pacotes antigos e sem promover o Status geral desta ADR.

Correção de proveniência de código (Cláusula F, §14.7): o manifesto exige que um script **não commitado** (`trackedInGit=false`) declare um hash do próprio conteúdo executado (`scriptContentHash`), rejeitando explicitamente a alegação de proveniência baseada só em `repoCommitSha` para esse caso — validado por teste.

**Preservação aprovada:** manter pacotes, receipts, snapshots necessários à auditoria e todas as versões/âncoras sem descarte automático até política própria de retenção aprovada; disponibilidade e recuperação são requisitos de ativação. Não é licença de retenção eterna nem adoção de 90 dias: prazo de descarte requer decisão separada, sem truncar o histórico usado como prova.

**Transporte:** comparação breve, sem escolher provedor nem provisionar nada — `actions/upload-artifact` (já usado no repo, retenção finita, requer API extra para acesso entre runs) versus o storage de objetos já suportado pelo código (`STORAGE_PROVIDER=object`, content-addressed, sem expiração automática, mas exige credencial dedicada e trava de exclusão no provedor para a garantia de não-substituição ser real). **Ausência de `STORAGE_PROVIDER=object` nos workflows não prova ausência de configuração externa possível** — só que nenhum workflow atual a usa. Rascunho de workflow (fora de `.github/workflows`, `if: false` nos steps que importariam, sem segredos, nunca executado): `docs/ops/drafts/p1-ape-weekly-cycle-v3-workflow.draft.yml`.

### 14.15 Limites preservados da implementação local

- Implementa localmente a política parcial 14/28 aprovada acima; não designa escopo, escolhe transporte ou comprova fechamento operacional.
- Não altera a política do produtor (`billingReconciliation.ts`, `apeWeeklyCycleV3BillingCycle.ts`) nem o schema ratificado de `CycleEvidenceV3`/`RawReceiptV3`.
- Não ativa o rascunho de workflow (`if: false`, fora de `.github/workflows`), não provisiona storage, não escolhe provedor.
- Não declara a Entrega 2 operacionalmente concluída — as garantias de completude/autenticidade e histórico verificado continuam `not_demonstrated`, exatamente como na Entrega 1.
- Não ratifica esta ADR, não conclui a reavaliação da `ADR-007`, não restaura `P1`/`P2` como required checks.
- Não constitui evidência de execução do sistema; não é adicionada a `docs/EVIDENCE_INDEX.md`.

### 14.16 Testes integrados locais (2026-09-27) — recorrência, tolerância, fechamento e conclusão tardia

**Registro de execução anterior, não reexecutado nesta consolidação documental.** Na retomada, já existiam as três opções locais (`requireFinalCaptureForNewestWindow`, `finalCaptureMaturationDays`, `requireLatestWindowIsLastMatured`), seis testes integrados e o teste de quatro avaliações semanais em `checkP1ApeWeeklyCycleV3.test.ts`. A execução inicial daquela retomada passou 54/54 testes; esse resultado não cobria todas as fronteiras descritas no texto anterior.

A suíte integrada agora contém **11 testes**, exercitando processos reais da CLI e os validadores reais com fixtures sintéticas. Não implementa um algoritmo alternativo de seleção ou consulta de população:

- **A — renovação:** o teste existente verifica A/B/C → B/C/D → C/D/E → D/E/F. Em cada avaliação, com captura pontual e limite uniforme de 14 dias, a evidência mais antiga atende exatamente na fronteira e vence 12 horas depois. São quatro avaliações, com três trocas de trio.
- **B — conflito temporal:** maturação de 7 dias e exigência estrita da última janela encerrada, **sem tolerância**, não coexistem. No instante exato da maturação de W3, W4 já encerrou. Corrigido o defeito que concedia tolerância mesmo com `captureToleranceDays=0` nesse instante. Tolerância positiva é outra política: pode permitir a janela anterior dentro do prazo explícito; não torna verdadeira a igualdade com a última encerrada. Testadas também a fronteira inclusiva de 3 dias e sua expiração 1 ms depois.
- **C — última elegível por política e relógio:** referência `computeLastClosedWeekUtc(checkerNow − finalCaptureMaturationDays)`. Corrigida a seleção para limitar as candidatas por essa referência **antes** de escolher o trio; uma captura provisória mais nova permanece em `considered`, sem deslocar o trio maduro obrigatório. Janela obrigatória ausente bloqueia em três semanas sucessivas, sem recuar indefinidamente. A referência também aparece quando nenhuma candidata é selecionada. A CLI rejeita maturação ausente nessa política e duração não finita, em vez de assumir zero ou falhar tardiamente.
- **D — pendência além de sete dias:** fixture de run criada em 04/10 às 23:59 UTC, na janela [28/09, 05/10), ainda pendente em 13/10 (dia 8), concluída em 14/10 (dia 9). Captura provisória continua bloqueada. Alegar `final` no dia 8 pode atender à plausibilidade temporal, mas mantém `populationCompleteness=not_demonstrated` e o gate bloqueado. As três versões preservadas são reportadas e excluídas por conflito; `supersedesEvidenceRef` não resolve automaticamente. Ao avaliar a correção com histórico autodeclarado, sua idade governante em 20/10 é 15 dias desde a primeira geração (05/10), embora a correção tenha só 6 dias: recência falha sob o limite de 14 dias aplicado naquele teste à versão mais nova selecionada, e histórico continua não verificado. Isso não simula o trio obrigatório da presente recomendação em 20/10. A fixture representa observações sintéticas; não testa uma query operacional do produtor.
- **E — tolerância:** não promove provisório a final, não cobre duas janelas ausentes e não estende a recência individual. O status de seleção também foi corrigido para reportar falha quando a exigência de final não é satisfeita, coerente com seus próprios motivos de falha.
- **F — validade versus retenção:** um arquivo ainda retido pode conter evidência vencida; retenção expirada não muda a idade da evidência nem apaga arquivos. Exercitado via CLI e `checkRetention`, sem provisionar transporte ou política de descarte.

**Resultados da retomada anterior:** suíte focada final 59/59 (11 integrados); três regressões reproduzidas antes das correções; typecheck focado com `--noEmit --strict --module ESNext --moduleResolution Bundler --target ES2022 --esModuleInterop --skipLibCheck`; `git diff --check`. A tentativa inicial de typecheck em `NodeNext` encontrou imports sem extensão no core e um tipo estreito no helper de teste; o helper foi corrigido e a verificação final usa `Bundler`, conforme a configuração do projeto. Logs e diff incremental da rodada ficam em `/tmp/m1-resume-results`, não constituem evidência operacional nem aprovação desta ADR.

Atendimento à política simulada continua separado de elegibilidade operacional: mesmo nos casos coerentes, o gate retorna `GUARANTEE_NOT_DEMONSTRATED` (exit 3), com `historyProvenance`, `metricsVerifiedAgainstSource` e `populationCompleteness` bloqueantes. Falhas concretas de validação retornam exit 2; políticas inválidas, exit 1. Os testes verificam a correspondência entre categoria e exit code.

**Verificação da política parcial aprovada (rodada posterior):** `scripts/tests/p1ApprovedPolicy.test.ts` acrescenta 13 testes pela CLI real à suíte anterior. Resultado executado nesta implementação: **72/72**, typecheck focado sem emissão e `git diff --check` aprovados. A seleção calcula `requiredWindows` antes das evidências e aplica 14 dias pela posição da janela exigida, inclusive quando ela falta; não usa a ordem de `generatedAt`. Com claims coerentes a política local pode passar, mas `operationalScope`, `historyProvenance`, `executionProvenance`, `metricsVerifiedAgainstSource`, `populationCompleteness` e `closureProof` continuam bloqueando (exit 3). Pendências/contradições conhecidas retornam falha local (exit 2); configuração inválida, exit 1. Não são ciclos operacionais; os 59 testes anteriores, sozinhos, não demonstravam esta combinação.

### 14.17 O que a rodada de testes integrados não faz

- A rodada histórica de testes não decidiu políticas. A aprovação parcial posterior está registrada no início desta seção e não converte fixtures em evidência operacional.
- Não altera o produtor, o checker legado, CI, ruleset ou infraestrutura; não consulta banco operacional; não executa ciclos reais.
- Não declara `captureStatus="final"` como prova de completude em nenhum teste — verificado explicitamente no cenário D.
- Não resolve `supersedesEvidenceRef` automaticamente — o cenário D confirma que a rejeição fail-closed de versões conflitantes, decidida na Entrega 1, continua intacta.
- Não ratifica esta ADR, não conclui a reavaliação da `ADR-007`, não restaura `P1`/`P2` como required checks.
