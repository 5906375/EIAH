# F2.16 — Pre-Provider Gap Register / Provider Integration Entry Criteria — 2026-07-15

## Resumo executivo

Foi criado o Pre-Provider Gap Register e os Provider Integration Entry Criteria para o WhatsApp Adapter read-only.

F2.16 mantem provider integration em `blocked`, nao autoriza provider real e nao declara WhatsApp operacional.

## Pré-condição F2.15

Pre-condicao comprovada antes das alteracoes:

- F2.15 mergeada em `main` no commit `f916922ccedaee76a55bfe0cbec6450c88bfce29`.
- `CI Monorepo`: `completed success`, run `29497135984`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29497135974`.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-read-only-adapter-operational-runbook.md`
- `docs/ops/whatsapp-read-only-adapter-observability.md`
- `docs/ops/whatsapp-read-only-adapter-synthetic-healthcheck.md`
- `docs/ops/whatsapp-read-only-adapter-promotion-readiness-matrix.md`
- `docs/ops/whatsapp-read-only-adapter-promotion-decision-record-template.md`
- `docs/ops/whatsapp-read-only-adapter-evidence-closure-pre-provider-boundary.md`
- `ops/evidence/latest/f2-15-read-only-adapter-evidence-closure-pre-provider-boundary-2026-07-15.md`

## Problema resolvido

A closure F2.15 declarou o limite pre-provider e o status `provider blocked`, mas ainda faltava um registro governado dos gaps que impedem qualquer integracao de provider e dos criterios minimos para uma avaliacao futura separada.

F2.16 resolve isso de forma documental, sem cruzar a fronteira pre-provider.

## Gap register

O gap register foi criado em `docs/ops/whatsapp-read-only-adapter-pre-provider-gap-register.md`.

Ele lista gaps de provider por ID, classificacao, evidencia minima, owner minimo e reasonCode.

Gaps principais:

- provider real nao autorizado nem selecionado;
- boundary de secret produtivo nao definido;
- webhook produtivo nao autorizado;
- rollback/disable de provider real nao provado;
- observability/SLO produtiva de provider nao definida;
- privacy/PII review ausente;
- security review ausente;
- Promotion Decision Record de provider ausente;
- owners de janela futura nao designados;
- contract compatibility para payload real nao provada;
- synthetic provider dry-run futuro nao definido;
- fail-closed de erros reais do provider nao mapeado.

## Classificação dos gaps

- `blocking`: impede qualquer avaliacao de provider enquanto aberto e mantem provider integration em `blocked`.
- `required`: precisa estar resolvido antes de revisao formal ou ter plano aprovado com risco residual explicito.
- `advisory`: recomendado para qualidade operacional e deve ser registrado como risco residual se permanecer aberto.

## Entry criteria

Provider Integration Entry Criteria definidos:

1. Todos os gaps `blocking` fechados com evidencia fisica e indexavel.
2. Gaps `required` fechados ou com plano aprovado por owners.
3. Owners minimos designados para Product/Platform, Backend/API, Security, Platform governance e DocOps.
4. Rollback/disable de provider real documentado e validado sem executar provider neste escopo.
5. Observability/SLO de provider definido com metricas sanitizadas, thresholds e incident mapping.
6. Privacy/PII review completo.
7. Security/secret boundary completo.
8. Promotion Decision Record futuro completo, com aprovacao humana.
9. F2.8-F2.15 referenciadas e sem drift.
10. `sideEffects=0`, `mutationExternalSideEffect=0` e `criticalActionExecution=0` preservados ate etapa produtiva separada.

## Evidência mínima por gap

Cada gap fechado deve registrar:

- identificador do gap;
- classificacao;
- owner responsavel;
- evidencia fisica em `ops/evidence/latest` ou documento operacional versionado;
- data UTC;
- decisao humana quando aplicavel;
- reasonCode removido ou mantido;
- risco residual;
- confirmacao de que provider real, secret produtivo, webhook produtivo, mutacoes e side effects nao foram ativados por esta etapa.

## Owners/escalation requirements

Owners minimos definidos:

- Product/Platform owner, com escalation para Founder/Executive owner;
- Backend/API owner, com escalation para Tech lead;
- Security owner, com escalation para Founder/Executive owner;
- Platform governance owner, com escalation para Tech lead;
- DocOps owner, com escalation para Platform governance owner.

Sem owner minimo, provider integration permanece `blocked` com `reasonCode=PROVIDER_OWNER_MISSING`.

## Rollback/disable requirements

Uma proposta futura deve definir disable imediato de provider, webhook e roteamento externo, rollback de secret, rotacao/revogacao, rollback de contrato, plano de stop para PII/side effects/mutacao/fail-open/replay aceito e evidencia pos-mitigacao.

Ausencia desses itens mantem `reasonCode=PROVIDER_ROLLBACK_MISSING`.

## Observability/SLO requirements

Uma proposta futura deve preservar os SLOs read-only e definir metricas sanitizadas de provider, assinatura, replay, duplicidade, timeout, rate limit, fail-closed por reasonCode, thresholds e incident classes.

SLOs zero preservados:

- `sideEffects violation = 0`;
- `PII leakage = 0`;
- `critical action execution = 0`;
- `mutation external side effect = 0`.

Ausencia desses itens mantem `reasonCode=PROVIDER_OBSERVABILITY_MISSING`.

## Privacy/PII requirements

Uma proposta futura deve provar data map do provider, campos proibidos, masking antes de serializacao, ausencia de telefone bruto, texto bruto, payload bruto, assinatura, token, cookie ou Authorization em evidencia, alem de retention/descarte e owner de privacy review.

Ausencia desses itens mantem `reasonCode=PROVIDER_PRIVACY_REVIEW_MISSING`.

## Security/secret boundary requirements

Uma proposta futura deve provar secrets produtivos fora do repositorio/evidencias, provisionamento, rotacao, revogacao, segregacao por ambiente, assinatura de webhook, replay protection, idempotencia, rate limit/abuse controls e ownership de incident response.

Ausencia desses itens mantem `reasonCode=PROVIDER_SECURITY_REVIEW_MISSING` ou `PROVIDER_SECRET_BOUNDARY_MISSING`.

## Decision record requirements

Qualquer tentativa futura de provider deve ter Promotion Decision Record especifico com referencias F2.8-F2.16, gaps fechados ou riscos aceitos, owners, human approval, rollback/disable, observability/SLO, privacy/PII review, security/secret boundary, provider boundary status e decisao final limitada ao escopo aprovado.

Ausencia desse registro mantem `reasonCode=PROVIDER_DECISION_RECORD_MISSING`.

## ReasonCodes

- `PROVIDER_ENTRY_CRITERIA_NOT_MET`
- `PRE_PROVIDER_GAP_OPEN`
- `PROVIDER_OWNER_MISSING`
- `PROVIDER_ROLLBACK_MISSING`
- `PROVIDER_SECRET_BOUNDARY_MISSING`
- `PROVIDER_OBSERVABILITY_MISSING`
- `PROVIDER_PRIVACY_REVIEW_MISSING`
- `PROVIDER_SECURITY_REVIEW_MISSING`
- `PROVIDER_DECISION_RECORD_MISSING`

## Provider integration boundary

Provider integration permanece `blocked`. F2.16 nao cria provider real, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes, nao cria `lead.create`, nao cria `lead.discard` e nao executa acao critica.

## Não-autorização de provider

F2.16 nao autoriza provider real, nao autoriza operacao WhatsApp, nao autoriza secret produtivo, nao autoriza webhook produtivo, nao autoriza mutacoes e nao autoriza side effects.

## Checks executados

- `pnpm check:evidence-index`: passou.
  - `ok: true`
  - `refsChecked: 545`
- `pnpm check:docs-link-integrity`: passou.
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Escopo documental restrito aos arquivos esperados:

- `docs/ops/whatsapp-read-only-adapter-pre-provider-gap-register.md`
- `ops/evidence/latest/f2-16-pre-provider-gap-register-provider-integration-entry-criteria-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

Nao foram planejadas alteracoes em `.github/workflows`, `release.yml`, `apps`, `packages` ou `scripts`.

O diff de isolamento confirmou ausencia de alteracoes nessas superficies.

## Riscos residuais

- Os gaps seguem abertos ate evidencia futura separada provar fechamento.
- Entry criteria nao substitui Promotion Decision Record futuro.
- Qualquer iniciativa de provider real permanece bloqueada ate nova proposta, owners, evidencias e aprovacao explicita.

## Próximos passos

- Executar checks obrigatorios.
- Manter provider integration em `blocked`.
- Usar F2.16 apenas como registro documental de gaps e criterios de entrada.

## Status final

Status: proposta/parcial evidenciada documentalmente.
