# WhatsApp Meta — F2.24 Phase Transition Decision Record

## Natureza e proveniencia

Instancia preenchida do instrumento canonico
[F2.24 — Phase Transition Proposal / Board Decision Stub](whatsapp-provider-integration-phase-transition-proposal-board-decision-stub.md).
Nao cria instrumento, estado decisorio ou reasonCode novo.

Formalizacao documental em 2026-11-25, na etapa 8.6.7;
efetivacao da abertura documental na etapa 8.6.10, na mesma data.
Baseline: `3046f7251e3cb3d0d66bb0a47fe5f4e5ee3f7e8e`.
Branch: `docs/whatsapp-meta-candidate-assessment`.
Preflight observado: branch e HEAD esperados; worktree limpa antes da escrita.

A ordem humana "EXECUTAR — Etapa 8.6.7 — Formalizacao F2.24", nesta
conversa, confirma as seis aprovacoes humanas ja concedidas e autoriza
sua materializacao, a decisao sobre Privacy/Compliance, a acumulacao
funcional e a incorporacao dos dois resultados de CI indicados abaixo.
A origem desses approvals e a autoridade humana, nao o assistente.
Nao se atribui data anterior de concessao nem assinatura digital.

A deliberacao humana da etapa 8.6.10 autoriza expressamente a efetivacao
formal da abertura, mediante as condicoes canonicas, e fornece o resultado
positivo do Evidence Index executado pelo responsavel humano no WSL.
Essa deliberacao, somada aos approvals ja formalizados, fundamenta a
decisao atual. Nao se trata de promocao automatica pelo assistente.

As etapas 8.6.3, 8.6.4 e 8.6.5 sao antecedentes conversacionais.
O resultado analitico `CONTROLLED_DEVELOPMENT_CONDITIONALLY_ADMISSIBLE`
nao e estado oficial nem autorizacao de implementacao.

## Phase Transition Proposal

Fase pretendida: fase posterior de preparacao e deliberacao da autorizacao
especifica de desenvolvimento controlado do adaptador nativo Meta.
A abertura efetivada e exclusivamente documental. O inicio tecnico exige decisao
posterior separada, conforme F5.0 e o boundary F2.25.

Objetivo: permitir decidir o escopo isolado, os requisitos anteriores ao
codigo e as evidencias a produzir durante eventual implementacao, mantendo
operacao real integralmente bloqueada. O motivo da transicao e separar a
abertura governada da autorizacao de desenvolver e da autorizacao operacional.

Limites propostos para eventual desenvolvimento futuro, ainda nao autorizado:

- ambiente isolado, fixtures sinteticas e credenciais exclusivamente ficticias;
- nenhuma chamada externa a Meta, mensagem real ou dado pessoal real;
- nenhum webhook publico produtivo nem mutacao de dominio;
- preservacao do contrato read-only e de tenant, workspace, scope e entitlement;
- nenhuma ativacao de agentes, envio de mensagens ou execucao de negocio.

A baseline F2.8-F2.23 permanece referenciada pelo Evidence Index e pelo
Freeze F2.23. A cadeia congelada e referencia historica, nao autorizacao.
F2.22 No-Go Ledger, F2.25 Non-Implementation Boundary, F2.26 Governance
Closure e as baselines F3/F4 preservadas por F5.0 continuam vigentes.

## Board Decision Record — campos canonicos F2.24

| Campo | Valor |
| --- | --- |
| `decisionId` | `wa-meta-phase-transition-20261125-864` — reutiliza o identificador proposto na etapa 8.6.4; nenhum registro equivalente localizado na consulta pontual anterior a escrita. |
| `date` | `2026-11-25` |
| `requestedNextPhase` | Fase posterior de preparacao e deliberacao da autorizacao especifica de desenvolvimento controlado do adaptador nativo Meta; abertura exclusivamente documental. |
| `requester` | Carlos Alberto Merlo — Intake Owner / Product/Platform owner. |
| `approvers` | Carlos Alberto Merlo nas seis funcoes da secao de aprovacoes; approvals humanos de escopo documental formalizados. Privacy/Compliance nao aplicavel exclusivamente a esta abertura, conforme decisao abaixo. |
| `decisionState` | `approve-to-open-next-phase-only` |
| `evidenceRefs` | Referencias existentes e CI pos-merge F5.0 nas secoes abaixo; evidencia da materializacao em `ops/evidence/latest/whatsapp-meta-f2-24-formalization-2026-11-25.md`. |
| `freezeStatus` | `F2.23 freeze remains active` |
| `providerBoundaryStatus` | `provider integration blocked` |
| `executionAuthorization` | `not authorized` |
| `productionAuthorization` | `not authorized` |
| `reasonCodes` | `PHASE_TRANSITION_NOT_EXECUTION_AUTHORIZATION`, `PROVIDER_EXECUTION_STILL_BLOCKED`, `PRODUCTIVE_SECRET_STILL_BLOCKED`, `PRODUCTION_WEBHOOK_STILL_BLOCKED`, `MUTATION_STILL_BLOCKED`, `FREEZE_REMAINS_ACTIVE`. |
| `nextActions` | Conduzir exclusivamente as atividades documentais da fase aberta para delimitar a futura autorizacao especifica de desenvolvimento controlado, respeitando F2.25 e F5.0. Nenhuma implementacao ou execucao de provider esta autorizada; nenhuma outra etapa e iniciada por esta formalizacao. |

## Aprovacoes humanas formalizadas

As manifestacoes abaixo aprovam somente a proposta de abertura documental.
Nao sao aprovacao dos 17 controles F2.19, da implementacao ou da operacao.

| Funcao F2.24 | Responsavel | Manifestacao formalizada |
| --- | --- | --- |
| Board/executive sponsor | Carlos Alberto Merlo — Executive Sponsor | Aprovacao humana concedida para o escopo documental da abertura. |
| Security | Carlos Alberto Merlo | Aprovacao humana concedida para o escopo documental da abertura. |
| Backend/API | Carlos Alberto Merlo | Aprovacao humana concedida para o escopo documental da abertura. |
| Platform governance | Carlos Alberto Merlo | Aprovacao humana concedida para o escopo documental da abertura. |
| Product/Platform | Carlos Alberto Merlo | Aprovacao humana concedida para o escopo documental da abertura. |
| DocOps | Carlos Alberto Merlo | Aprovacao humana concedida para o escopo documental da abertura. |

Decisao sobre Privacy/Compliance: nao aplicavel como approval adicional
exclusivamente nesta abertura documental. Esta decisao nao aprova contratos,
bases legais, transferencias internacionais, retencao operacional nem
tratamento de mensagens ou dados pessoais reais. As revisoes futuras dessas
materias permanecem pendentes. F2.24 exige esse approval "se aplicavel".

Decisao sobre acumulacao funcional: registra-se o exercicio cumulativo das
seis funcoes pelo Founder, conforme designacoes humanas existentes. Nos
instrumentos consultados nao foi identificada exigencia expressa de pessoas
distintas ou terceiro independente para esta abertura. Nao se declara
independencia, segregacao comprovada ou dispensa de requisito futuro aplicavel.
Essa conclusao fica restrita ao escopo documental desta decisao.

As designacoes e seus limites constam do
[Candidate Intake Meta, item 24](whatsapp-provider-meta-candidate-intake-assessment.md)
e do [Design Meta, secao 4](whatsapp-provider-meta-security-privacy-operational-design.md).

## CI pos-merge F5.0 incorporado

SHA de merge: `de1c32e357657af1b8cd84d7f7a98c43d7cc7adc`.

- [CI Monorepo — run 29573140953](https://github.com/5906375/EIAH/actions/runs/29573140953): `success`.
- [IMOB Worker Mutation E2E — run 29573140945](https://github.com/5906375/EIAH/actions/runs/29573140945): `success`.

Proveniencia: resultados e vinculacao ao SHA fornecidos pela autoridade
humana na ordem de execucao da etapa 8.6.7. Nao houve consulta ao GitHub,
download de logs, reexecucao de CI ou validacao independente desses runs
nesta formalizacao. O merge F5.0 ja havia sido confirmado na etapa 8.6.5.

Esta incorporacao supre documentalmente a pendencia especifica de resultado
pos-merge F5.0 com a proveniencia indicada. Os checks documentais da
formalizacao sao tratados separadamente na secao de validacao abaixo.

## Evidence refs existentes reutilizadas

- [Evidence Index](../EVIDENCE_INDEX.md): cadeia F2.8-F2.23, F2.24-F2.26, F3/F4/F5.0 e registros Meta ja indexados.
- [F2.19 — Security Review Gate](whatsapp-provider-integration-security-review-checklist-approval-gate.md).
- [F2.20 — Executive Dossier](whatsapp-provider-integration-evidence-pack-executive-review-dossier.md).
- [F2.21 — Board Packet](whatsapp-provider-integration-board-review-packet-meeting-agenda.md).
- [F2.22 — No-Go Ledger](whatsapp-provider-integration-final-pre-execution-hold-no-go-ledger.md).
- [F2.23 — Freeze e cadeia congelada F2.8-F2.22](whatsapp-provider-integration-stop-line-final-readiness-freeze.md).
- [F2.25 — Non-Implementation Boundary](whatsapp-provider-integration-next-phase-charter-non-implementation-boundary.md).
- [F2.26 — Governance Closure](whatsapp-provider-integration-governance-closure-end-of-track-summary.md).
- [F5.0 — Final-Selection-Only Charter](whatsapp-provider-final-selection-formal-phase-opening-final-selection-only-charter.md).
- [Candidate Assessment Meta](../../ops/evidence/latest/whatsapp-meta-candidate-assessment-2026-11-24.md).
- [Governance Design Assessment Meta](../../ops/evidence/latest/whatsapp-meta-governance-design-assessment-2026-11-24.md).

Os checks e a prova de isolamento historicos permanecem limitados aos deltas
que comprovaram. As mensagens dos commits `4090e466` e `3046f725`, ja
consultadas na etapa 8.6.5, registram validacoes documentais anteriores;
nao sao reclassificadas como checks executados nesta etapa.
Nenhum novo inventario ou mecanismo de preservacao foi criado.

## Validacoes incorporadas e efetivacao da abertura

F2.24, "Conditions to open next phase", itens 9 e 10, e F2.23,
"Politica de mudanca pos-freeze", exigem checks verdes e isolamento.
O estado inicial `defer`, registrado na etapa 8.6.7, foi mantido nas etapas
8.6.8 e 8.6.9 enquanto o Evidence Index nao dispunha de resultado positivo.

Na etapa 8.6.8: Docs Link Integrity aprovado, exit code 0, limitado aos
29 alvos canonicos; whitespace e prova de isolamento aprovados, incluindo
os dois arquivos novos sem stage. Nos dois `git diff --no-index --check`,
exit code 1 sem diagnostico de whitespace representou a diferenca de arquivo
novo contra `/dev/null`. Nenhum arquivo estava em stage; branch e HEAD
permaneceram inalterados.

A etapa 8.6.9 identificou `spawnSync git EPERM` no teste que consulta o
HEAD via `execFileSync`: restricao ambiental, nao defeito atribuido ao delta.
O diagnostico especifico apresentou sete testes aprovados e um bloqueado.

Evidencia complementar fornecida pela autoridade humana na etapa 8.6.10:

```bash
timeout 60s pnpm check:evidence-index
```

Execucao direta pelo responsavel humano no WSL: 8/8 testes aprovados,
zero falhas, Evidence Index `ok: true`, 975 referencias verificadas,
exit code 0. Resultado incorporado por proveniencia humana explicita;
nao reexecutado pelo Codex. A pendencia ambiental da rodada anterior fica
suprida por esse resultado, sem apagar o historico da falha.

As alteracoes da etapa 8.6.10 registram a decisao humana e as validacoes,
sem mudar artefatos referenciados, regras do verificador ou objetos Git.
A unica rodada complementar autorizada limita-se a whitespace, links locais
dos dois registros, comparacao das referencias do indice com a versao ja
validada e prova de isolamento. O resultado integral do Evidence Index no
WSL e reutilizado; o PASS anterior de links nao e ampliado aos novos arquivos.
Os resultados dessa rodada complementar sao apresentados na entrega da etapa,
sem criar outro arquivo de evidencia ou iniciar revalidacao automatica.

## Estado decisorio e bloqueios preservados

`decisionState: approve-to-open-next-phase-only`, por deliberacao humana
expressa da etapa 8.6.10, apoiada nos seis approvals, na decisao restrita
de Privacy/Compliance, no pacote canonico existente, no CI pos-merge F5.0
e na validacao positiva do Evidence Index no WSL, somada aos resultados
reutilizados de links, whitespace e isolamento. A abertura da fase e
exclusivamente documental e nao concede permissao de iniciar trabalho tecnico.

- `implementationAuthorized: false`
- `executionAuthorization: not authorized`
- `productionAuthorization: not authorized`
- `provider integration blocked`
- `security-review-blocked`
- `providerFinalSelection: not authorized`
- `F2.23 freeze remains active`
- No-Go Ledger F2.22 e execution hold ativos.
- F2.25 Non-Implementation Boundary preservado.
- Bloco D nao ratificado.

Risco residual: eficacia do adaptador futuro nao demonstrada. Os 17 controles F2.19,
gaps e mappings nao recebem aceite tecnico por este registro.
Nenhum codigo, infraestrutura, configuracao operacional, provider real,
secret, webhook, mensagem, mutacao de dominio ou acao critica e autorizado.

Status documental: abertura documental formalizada; implementacao e operacao
permanecem nao autorizadas. O resultado analitico da etapa 8.6.3 nao foi
convertido em novo estado oficial.
