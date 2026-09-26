# F-1 — realocação temporária dos required gates P1/P2 aplicada

- **Data:** 2026-08-08
- **Ruleset:** `13498700` (`main-protection-hard-gates`)
- **Repositório:** `5906375/EIAH`
- **Decisão:** ADR-007 ratificado; transição `20 → 18`
- **Verbo ratificado em R2-bis:** um único `PUT`
- **Estado intermediário:** `temporarily_non_required_with_degraded_visibility`
- **Data-limite:** `2026-08-15T18:14:53Z` — sete dias corridos após o timestamp capturado da mutação
- **R4:** pendente; não executada nesta rodada

## Ratificação e condições obrigatórias

O ADR-007 e os ajustes do commit
`32beceb0bcdc0f47f6ad91572172bbd17e0b6be7` foram ratificados para remover temporariamente
`P1ReconciliationRecurring` e `P2HighGlobalCoverage` dos required contexts. A ratificação R2-bis
substituiu o `PATCH` inexistente no endpoint por um único `PUT` e exigiu o corpo editável completo.

As seis condições foram comprovadas antes do envio:

1. **Snapshot contemporâneo:** GET iniciado e encerrado em `2026-08-08T18:14:06Z`; SHA-256
   `19df7b52da5945e87fe3ea7e05c9540dd7e754bc61d30d16d636c62151cfde3a`.
2. **Payload reconstruído:** derivado desse GET, sem reutilização do payload histórico; SHA-256
   `23276893017eed7aa966763b57d54b50d41f7c164580c56529abe31e8f5b3b88`.
3. **Parâmetros preservados:** o corpo contém exatamente `name`, `target`, `enforcement`,
   `conditions`, `bypass_actors` e `rules`; os dois booleanos permaneceram `false`.
4. **Delta restrito:** o diff de contexts apresentou somente duas remoções,
   `P1ReconciliationRecurring` e `P2HighGlobalCoverage`, sem adições; contagens derivadas `20 → 18`.
5. **Sem colateral:** o diff excluindo apenas a lista de required contexts retornou
   `COLATERAL: nenhum`.
6. **Rollback reconstruído:** corpo editável completo derivado do mesmo GET; SHA-256
   `5198a7f4dea0477543ae60f968ae38b22ca2049a9af2c4d9439d9709b9ed1f54`.

## Operação e identidade

- Ator autenticado: `5906375`, tipo `User`, id público `51407107`.
- Permissão consultada antes do congelamento: `admin=true`, `maintain=true`, `push=true`,
  `pull=true`, `triage=true`.
- Timestamp capturado imediatamente antes do único `PUT`: `2026-08-08T18:14:53Z`.
- A resposta da plataforma registrou `id=13498700`, `enforcement=active`, `target=branch` e
  `updated_at=2026-08-08T15:14:38.411-03:00`.
- O GET independente posterior foi iniciado e encerrado em `2026-08-08T18:15:04Z`.
- Rollback usado: **não**; todas as verificações independentes passaram e nenhuma segunda escrita
  remota foi autorizada.

## Required contexts restantes

Todos os 18 contexts mantiveram `integration_id=15368` e a ordem relativa anterior:

1. `build_validate`
2. `lint`
3. `CiUnitSuite`
4. `EvidenceIndex`
5. `ReceiptCanonCompat`
6. `P0CriticalityAudit`
7. `P1CriticalChain`
8. `RbacGuardrailRegression`
9. `AgentsPolicyFailClosed`
10. `AgentProtocolCompat`
11. `P2AuditInterop`
12. `ProviderBoundary`
13. `P3EconomyHardening`
14. `P3SettlementSupportByEnv`
15. `SettlementContractDrift`
16. `W4NonRegression`
17. `DbPreviewPostgresValidate`
18. `PublicHealthContract`

## Preservação e ausência de colateral

O GET independente posterior corresponde exatamente ao corpo editável esperado. Permaneceram:

- `name=main-protection-hard-gates`;
- `enforcement=active`;
- `target=branch`;
- `conditions.ref_name.include=["~DEFAULT_BRANCH"]` e `exclude=[]`;
- `bypass_actors=[]` e `current_user_can_bypass=never`;
- quatro rules, na ordem `deletion`, `non_fast_forward`, `pull_request`,
  `required_status_checks`;
- `do_not_enforce_on_create=false`;
- `strict_required_status_checks_policy=false`;
- ordem e `integration_id=15368` dos 18 contexts remanescentes.

O diff final removendo apenas `required_status_checks` da comparação retornou
`POS-MUTACAO: nenhum colateral`.

## Efeito prático e visibilidade degradada

Após a mutação, os PRs #423 e #424 estavam `OPEN`, `MERGEABLE` e `UNSTABLE`. Na listagem de checks
do PR #424, `P1ReconciliationRecurring` e `P2HighGlobalCoverage` continuaram executando e ambos
permaneceram visíveis com conclusão `fail`.

Na baseline integrada desta linhagem, os dois jobs ainda declaram `continue-on-error: true` em
`.github/workflows/ci.yml`. O contrato `ops/contracts/gate-waivers.v1.json` ainda contém os dois
waivers, aprovados por Carlos Alberto Merlo, concedidos em `2026-08-04`, com vencimento em
`2026-09-18` e frente de restauração `RESOLVE-RECENCY-GATE-DECAY`.

Esse arranjo caracteriza `temporarily_non_required_with_degraded_visibility`. O tratamento
condicional da §11 do ADR-007 — inclusive qualquer alteração de waiver ou `continue-on-error` —
permanece pendente para R4 e não foi antecipado nesta rodada.

## Artefatos e hashes SHA-256

Pasta: `ops/evidence/ci/f1-gate-relocation-applied-2026-08-08/`

| Artefato | SHA-256 |
| --- | --- |
| `f1-actor.json` | `c692a77ca12b7ff2165b3ff5beb428f9b774f138b4dbc810c516e66ada43829c` |
| `f1-mutation-timestamp.txt` | `2b32ce7d71aa3a1eddac9bafaa4867e7a53b1544737cb4cec2b0f2c401a21443` |
| `f1-payload.json` | `23276893017eed7aa966763b57d54b50d41f7c164580c56529abe31e8f5b3b88` |
| `f1-post-mutation-timestamp.txt` | `0984ddafa8468d581e837b94d65d8db7172c1241ad25924802b0651b5e9d99ae` |
| `f1-pr423-state.json` | `b82a7638e66a403323027675b24540f85ac82f3dfea4c358a8ca61b4b3de0fd2` |
| `f1-pr424-checks.txt` | `fa9dcba25e4639f8db83106973ad40fc35e8c262bab50fd313f30f5415ec2c19` |
| `f1-pr424-state.json` | `80cbd2db63bb22db4dbf2c26468d83fede339efc8a0715c0a9a4bca8218d38ee` |
| `f1-pre-mutation-timestamp.txt` | `8df3f283ad3d71ea3990b32bec30b23864f197a993dba4eab1b3b65bce606a4f` |
| `f1-put-response.json` | `886a06a36930b80af456b29342318acc1b17d64faade8d85338eeac751a70af9` |
| `f1-repository-permissions.json` | `ac84185ac8e5d04a263c263498cbdaa2cc33d2f25fac296d6b52f240f097ce75` |
| `f1-rollback.json` | `5198a7f4dea0477543ae60f968ae38b22ca2049a9af2c4d9439d9709b9ed1f54` |
| `f1-ruleset-post-mutation.json` | `886a06a36930b80af456b29342318acc1b17d64faade8d85338eeac751a70af9` |
| `f1-ruleset-pre-mutation.json` | `19df7b52da5945e87fe3ea7e05c9540dd7e754bc61d30d16d636c62151cfde3a` |

## O que esta evidência prova

- o ruleset `13498700` passou de 20 para 18 required contexts por um único `PUT` ratificado;
- somente P1/P2 foram removidos da lista required;
- o restante do corpo editável e os `integration_id` foram preservados;
- a resposta do `PUT` foi confirmada por GET independente;
- os checks removidos continuam executando e suas falhas permanecem visíveis;
- o estado intermediário, seus controles ainda ativos e o prazo de sete dias estão explícitos.

## O que esta evidência NÃO prova

- que P1 ou P2 estejam saudáveis, frescos ou operacionalmente restaurados;
- que as failures deixaram de existir;
- que waiver ou `continue-on-error` foram removidos;
- que R4 foi executada;
- que #423 ou #424 estejam prontos para merge por todos os critérios;
- que a restauração futura dos contexts possa ocorrer automaticamente ou apenas por data.
