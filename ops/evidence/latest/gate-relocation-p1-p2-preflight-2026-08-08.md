# Preflight F-1 — relocação temporária de P1/P2

- Data: 2026-08-08
- Status: `Proposta`
- ADR de referência: `ADR-007`, commit `04c8c5989c71cf00380d36e48e449ac5d1e60723`
- restoreFront: `RESOLVE-RECENCY-GATE-DECAY`
- Mutação executada: nenhuma

## Estado local

- Branch: `fix/settlement-matrix-honesty`
- HEAD inicial: `04c8c5989c71cf00380d36e48e449ac5d1e60723`
- Upstream: `origin/fix/settlement-matrix-honesty` em
  `35749f1e975a712bc894f1bbd4775aabb1e1bc29`
- Relação inicial: `ahead 1`
- Alterações tracked iniciais: nenhuma
- Untracked preservados: `RBAC.`, `destrutivo`, `discovery`, `para` e
  `docs/ops/audit/legal-vertical-readiness-diagnostic-2026-08-06.md`

## Identidade e permissão do ator

- Conta autenticada: `5906375` (`id=51407107`)
- Repositório: `5906375/EIAH`
- Permissões observadas: `admin:true`, `maintain:true`, `push:true`, `pull:true`, `triage:true`
- Escopos observados: `gist`, `read:org`, `repo`, `workflow`
- `current_user_can_bypass`: `never`

A conta autenticada possui admin: true no repositório, condição que o GitHub documenta
como suficiente para editar rulesets de repositório. A credencial apresenta os escopos
observados; a capacidade efetiva da chamada REST permanece sujeita ao modelo de
autenticação/token utilizado.

Não se infere capacidade administrativa do escopo `repo`. A conclusão factual desta seção vem da
permissão `admin:true` retornada para a conta autenticada. `current_user_can_bypass: never` descreve
a capacidade de ignorar a política, não a capacidade de administrá-la; `bypass_actors` está vazio.

## Snapshot congelado

- Arquivo: `ops/evidence/ci/f1-gate-relocation-2026-08-08/f1-ruleset-before.json`
- SHA-256: `19df7b52da5945e87fe3ea7e05c9540dd7e754bc61d30d16d636c62151cfde3a`
- Timestamp contemporâneo do GET: não gravado na captura original
- Mtime local observado e congelado neste registro: `2026-08-08T17:09:58Z`
- ID: `13498700`
- Name: `main-protection-hard-gates`
- Target: `branch`
- Source type: `Repository`
- Enforcement: `active`
- `current_user_can_bypass`: `never`
- `conditions.ref_name.include`: `["~DEFAULT_BRANCH"]`
- `conditions.ref_name.exclude`: `[]`
- `bypass_actors`: `[]`

O mtime é metadado local do arquivo preservado, não substitui um timestamp emitido pela API nem é
retroativamente declarado como instante comprovado do GET.

## Rules

O snapshot contém exatamente quatro rules, nesta ordem:

1. `deletion`
2. `non_fast_forward`
3. `pull_request`
4. `required_status_checks`

## Parâmetros de required status checks

O JSON bruto com o hash acima registra:

- `do_not_enforce_on_create = false`
- `strict_required_status_checks_policy = false`

O payload proposto congelado também contém ambos como `false`. Uma extração anterior que use
`valor // null` em jq pode apresentar `false` como `null`, pois o operador `//` trata `false` como
alternativa vazia. Portanto, afirmar que esses campos são nulos ou que o payload atual não os
reenvia contradiz os artefatos congelados. Esta divergência deve ser corrigida no desenho do payload
antes de qualquer mutação; nenhum PATCH foi emitido nesta rodada.

## Required contexts antes

Todos os 20 contexts possuem `integration_id=15368`:

| Posição | Context | Integration ID | Tratamento F-1 |
| ---: | --- | ---: | --- |
| 1 | `build_validate` | 15368 | preservar |
| 2 | `lint` | 15368 | preservar |
| 3 | `CiUnitSuite` | 15368 | preservar |
| 4 | `EvidenceIndex` | 15368 | preservar |
| 5 | `ReceiptCanonCompat` | 15368 | preservar |
| 6 | `P0CriticalityAudit` | 15368 | preservar |
| 7 | `P1CriticalChain` | 15368 | preservar |
| 8 | `P1ReconciliationRecurring` | 15368 | remover temporariamente |
| 9 | `RbacGuardrailRegression` | 15368 | preservar |
| 10 | `AgentsPolicyFailClosed` | 15368 | preservar |
| 11 | `AgentProtocolCompat` | 15368 | preservar |
| 12 | `P2AuditInterop` | 15368 | preservar |
| 13 | `P2HighGlobalCoverage` | 15368 | remover temporariamente |
| 14 | `ProviderBoundary` | 15368 | preservar |
| 15 | `P3EconomyHardening` | 15368 | preservar |
| 16 | `P3SettlementSupportByEnv` | 15368 | preservar |
| 17 | `SettlementContractDrift` | 15368 | preservar |
| 18 | `W4NonRegression` | 15368 | preservar |
| 19 | `DbPreviewPostgresValidate` | 15368 | preservar |
| 20 | `PublicHealthContract` | 15368 | preservar |

`P3StabilityRecurring` e `P4TrackPRollout` não aparecem na lista. Essa ausência é consistente com a
realocação D25 já materializada.

## Diff lógico proposto

- Contexts antes: 20
- Removidos: `P1ReconciliationRecurring`, `P2HighGlobalCoverage`
- Adicionados: nenhum
- Contexts depois: 18, contagem derivada pela remoção dos dois elementos da lista de 20
- Collateral fora da lista de required checks: nenhum no comparativo lógico congelado
- Ordem relativa dos 18 contexts preservados: inalterada

Artefatos derivados congelados:

| Arquivo | SHA-256 |
| --- | --- |
| `f1-ruleset-after-proposed.json` | `23276893017eed7aa966763b57d54b50d41f7c164580c56529abe31e8f5b3b88` |
| `f1-ruleset-patch-payload.json` | `532d639769f24c532ae16bb1253affd8e12464d2d5d0c408430d10152f5d2c47` |
| `f1-ruleset-rollback-payload.json` | `61b8bc1123975467d63b22277b1fd1287cb04f61050d91fb5d07101a39a648b2` |

## Estado do pacote exigido pelo ADR-007 §20

| Item | Estado nesta rodada | Observação |
| ---: | --- | --- |
| 1 | completo | Snapshot remoto anterior integral congelado e hasheado. |
| 2 | completo | Identidade e permissões reconfirmadas por GET read-only, sem expor token. |
| 3 | completo | Lista ordenada dos 20 contexts registrada. |
| 4 | completo | Diff lógico remove somente P1/P2 e não adiciona context. |
| 5 | completo | Comparativo lógico preserva enforcement, target, conditions, bypass e demais rules. |
| 6 | não iniciado | Nenhum payload foi aplicado e não existe resposta de PATCH. |
| 7 | não iniciado | Não existe snapshot posterior porque não houve mutação. |
| 8 | parcial | Hashes completos; timestamp contemporâneo do GET não foi gravado. O mtime local foi registrado com limitação explícita. |
| 9 | não iniciado | Continuidade e visibilidade pós-mutação ainda não podem ser verificadas. |
| 10 | não iniciado | Tratamento pós-mutação de waiver/`continue-on-error` pertence a rodada posterior. |

## O que esta evidência prova

- o estado exato contido no snapshot de hash conhecido;
- a identidade autenticada e `admin:true` no repositório na consulta read-only desta rodada;
- a lista e a ordem dos 20 required contexts do snapshot;
- a presença nominal de P1 na posição 8 e P2 na posição 13;
- a ausência de P3 Stability e P4 Track P na lista required;
- um diff lógico 20→18 que remove apenas P1/P2 e preserva os demais elementos;
- que os artefatos foram persistidos fora de `/tmp` sem alteração de bytes.

## O que esta evidência NÃO prova

- que o ADR-007 foi ratificado;
- que o ruleset remoto permaneceu igual depois da captura congelada;
- que a chamada PATCH será aceita pelo modelo de autenticação/token disponível;
- que o payload congelado está pronto para envio, devido à divergência factual dos dois parâmetros
  booleanos registrada acima;
- que P1/P2 foram removidos do ruleset;
- que os checks continuarão executando ou que suas failures permanecerão visíveis após uma mutação;
- que waivers ou `continue-on-error` foram removidos;
- que P1/P2 estão saudáveis ou que F-1 está ativa.

## Comandos executados

```text
git branch --show-current
git rev-parse HEAD
git status --short --branch
git log -3 --oneline --decorate
ls -la /tmp/f1-ruleset-*.json
sha256sum /tmp/f1-ruleset-before.json /tmp/f1-ruleset-after-proposed.json /tmp/f1-ruleset-patch-payload.json /tmp/f1-ruleset-rollback-payload.json
gh auth status
gh api user --jq '{login,id}'
gh api repos/5906375/EIAH --jq '{full_name,permissions,role_name}'
mkdir -p ops/evidence/ci/f1-gate-relocation-2026-08-08
cp /tmp/f1-ruleset-before.json /tmp/f1-ruleset-after-proposed.json /tmp/f1-ruleset-patch-payload.json /tmp/f1-ruleset-rollback-payload.json ops/evidence/ci/f1-gate-relocation-2026-08-08/
sha256sum ops/evidence/ci/f1-gate-relocation-2026-08-08/*.json
git check-ignore -v ops/evidence/ci/f1-gate-relocation-2026-08-08/f1-ruleset-before.json
jq ... /tmp/f1-ruleset-before.json /tmp/f1-ruleset-after-proposed.json
diff <(jq -S ... /tmp/f1-ruleset-before.json) <(jq -S ... /tmp/f1-ruleset-after-proposed.json)
date -u -r /tmp/f1-ruleset-before.json +%Y-%m-%dT%H:%M:%SZ
```

A primeira execução de `gh auth status`/`gh api` dentro do sandbox não obteve conectividade e
reportou a credencial como inválida nesse contexto. A repetição autorizada fora do sandbox confirmou
login, escopos, identidade e permissões. Nenhuma chamada remota de escrita foi executada.

## Status final

**PRE-FLIGHT F-1 EVIDENCIADO / GO TÉCNICO / GO OPERACIONAL pendente de ratificação.**

O GO técnico está limitado ao delta nominal 20→18. Antes de R3, o payload deve ser reconstruído a
partir de novo snapshot e a divergência dos parâmetros booleanos deve estar resolvida. F-1 não está
ativa e o ruleset não foi alterado.
