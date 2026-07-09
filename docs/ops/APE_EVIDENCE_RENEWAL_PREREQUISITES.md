# APE Evidence Renewal Prerequisites

## 1. Objetivo

Provisionar credenciais reais de staging e executar drill real de backup/restore para renovar as evidencias base que bloqueiam o APE Weekly Cycle.

## 2. Contexto do NO_GO Atual

O APE Weekly Cycle esta em `NO_GO` real por evidencias vencidas. O bloqueio atual nao e causado por bug de workflow, permissao GitHub Actions, resolucao D23/N-24, YAML ou auto-merge.

Falhas raiz observadas:

- `check:e2e-recency` falha porque `ops/evidence/latest/high-e2e-manifest.json` esta vencido.
- `check:backup-restore` falha porque `ops/evidence/2026-W09/base/backup-restore-evidence.md` esta vencido.

Diagnostico operacional ja observado:

- `pnpm generate:e2e-high-manifest` falha quando as env vars obrigatorias de staging nao estao provisionadas.
- `pnpm check:e2e-recency` falha por idade do manifest HIGH.
- `pnpm check:manifest-integrity` pode passar, mas isso valida apenas a integridade do manifest existente, nao sua recencia.
- `pnpm check:backup-restore` falha por drill antigo.
- `pnpm ape:cycle:weekly` nao deve ser executado antes de `check:e2e-recency` e `check:backup-restore` passarem, pois isso registraria outro ciclo `NO_GO`.

## 3. Bloqueadores Raiz

| Check | Evidencia | Falha atual | Correcao esperada |
| --- | --- | --- | --- |
| `check:e2e-recency` | `ops/evidence/latest/high-e2e-manifest.json` | Manifest HIGH vencido | Gerar manifest novo contra staging real |
| `check:backup-restore` | `ops/evidence/2026-W09/base/backup-restore-evidence.md` | Drill de restore vencido | Executar drill real e registrar RPO, RTO e smoke query |
| `check:ape-hard-metrics` | Ciclo APE semanal | Falha por checks obrigatorios acima | Rodar somente depois dos checks raiz passarem |
| `check:p4-trackp-rollout` | Historico de ciclos APE | `ape_cycles_not_green` | Requer ciclos verdes recorrentes apos corrigir hard metrics |
| `check:p3-stability-recurring` | Historico de estabilidade | `economy_stability_not_recurring` | Requer recorrencia verde apos corrigir hard metrics |

## 4. Pre-requisitos de Staging

- Ambiente de staging acessivel a partir do executor que rodara os comandos.
- API de staging compativel com os cenarios HIGH usados por `pnpm generate:e2e-high-manifest`.
- Tenant dedicado a testes E2E, sem dados de producao.
- Workspace dedicado ao tenant de teste.
- Token com permissoes suficientes para executar os fluxos HIGH e consultar os artefatos esperados.
- Politica de limpeza ou rotacao dos dados criados pelos cenarios HIGH.
- Responsavel operacional identificado para validar que staging esta saudavel antes da execucao.

## 5. Secrets/env Vars Necessarias

Provisionar de forma segura, via GitHub Secrets ou vault operacional:

| Variavel | Obrigatoria | Observacao |
| --- | --- | --- |
| `STAGING_API_BASE_URL` | Sim | URL base da API de staging. |
| `STAGING_API_TOKEN` | Sim | Token real com permissao para executar cenarios HIGH em staging. |
| `E2E_TENANT_ID` | Sim | Tenant dedicado a testes. |
| `E2E_WORKSPACE_ID` | Sim | Workspace dedicado a testes. |
| `E2E_AGENT_ID` | Opcional | Usar `imob` se o executor exigir agente explicito. |

## 6. Regras de Seguranca Para Segredos

- Nenhum segredo deve ser commitado.
- Nenhum segredo deve ser impresso em log.
- Nenhum segredo deve ser registrado em evidencia.
- Evidencias devem registrar apenas nomes das variaveis, status de presenca e resultados mascarados.
- Tokens devem ser armazenados em GitHub Secrets ou vault operacional, nunca em arquivos `.env` versionados.
- Se um segredo aparecer em log, evidencia, shell history ou PR, ele deve ser rotacionado antes de nova execucao.
- `STAGING_API_TOKEN` deve ter escopo minimo necessario para os cenarios HIGH e para consultas de verificacao.

## 7. Procedimento Para E2E HIGH Real

1. Confirmar que as env vars obrigatorias estao presentes no ambiente de execucao, sem imprimir seus valores.
2. Confirmar que o tenant/workspace sao dedicados a teste.
3. Executar o gerador de manifest HIGH contra staging real.
4. Validar recencia e integridade do manifest gerado.
5. Nao editar manualmente datas, hashes ou campos do manifest para contornar gate.

Comando esperado:

```bash
STAGING_API_BASE_URL=<url> \
STAGING_API_TOKEN=<token> \
E2E_TENANT_ID=<tenant> \
E2E_WORKSPACE_ID=<workspace> \
E2E_AGENT_ID=imob \
pnpm generate:e2e-high-manifest
```

Validacoes imediatas:

```bash
pnpm check:e2e-recency
pnpm check:manifest-integrity
```

Artefato esperado:

- `ops/evidence/latest/high-e2e-manifest.json`

## 8. Procedimento Para Backup/Restore Drill Real

O drill de backup/restore deve ser operacional e real. Nao substituir por fixture, mock ou edicao sintetica da evidencia.

Procedimento minimo:

1. Executar backup real do ambiente definido para o drill.
2. Restaurar o backup em ambiente controlado.
3. Medir RPO real.
4. Medir RTO real.
5. Executar smoke query real no ambiente restaurado.
6. Registrar data/hora da execucao, operador, escopo, RPO, RTO e resultado da smoke query.
7. Atualizar somente a evidencia canonica existente:
   `ops/evidence/2026-W09/base/backup-restore-evidence.md`.
8. Rodar o check de backup/restore apos o registro.

Validacao:

```bash
pnpm check:backup-restore
```

Campos minimos esperados na evidencia:

- timestamp do backup;
- timestamp do restore;
- RPO;
- RTO;
- smoke query executada;
- resultado da smoke query;
- ambiente alvo;
- responsavel operacional;
- ausencia explicita de segredos.

## 9. Comandos de Validacao

Executar nesta ordem. Nao rodar `pnpm ape:cycle:weekly` antes dos checks raiz passarem.

```bash
pnpm generate:e2e-high-manifest
pnpm check:e2e-recency
pnpm check:manifest-integrity
pnpm check:backup-restore
pnpm ape:cycle:weekly
pnpm check:ape-hard-metrics
```

Medicao opcional de recorrencia apos um ciclo verde:

```bash
pnpm check:p4-trackp-rollout
pnpm check:p3-stability-recurring
```

Se novas evidencias reais forem criadas ou atualizadas e indexadas:

```bash
pnpm check:evidence-index
```

## 10. Artefatos Esperados

- `ops/evidence/latest/high-e2e-manifest.json` renovado por execucao real de `pnpm generate:e2e-high-manifest`.
- `ops/evidence/2026-W09/base/backup-restore-evidence.md` atualizado com drill real.
- Evidencia do novo ciclo APE semanal gerada por `pnpm ape:cycle:weekly`, se os checks raiz passarem.
- `docs/EVIDENCE_INDEX.md` atualizado somente depois de evidencias reais existirem.

## 11. Evidencias a Indexar

Indexar apenas evidencias reais, nunca este ticket como substituto operacional.

Candidatos esperados apos execucao real:

- novo artefato de ciclo APE semanal gerado por `pnpm ape:cycle:weekly`;
- evidencia de backup/restore atualizada, se a politica do indice exigir referencia direta;
- manifest HIGH renovado, se a politica do indice exigir referencia direta.

Nao atualizar `docs/EVIDENCE_INDEX.md` antes de criar ou atualizar evidencia real.

## 12. DoD

- `STAGING_API_BASE_URL`, `STAGING_API_TOKEN`, `E2E_TENANT_ID` e `E2E_WORKSPACE_ID` provisionados de forma segura.
- Tenant/workspace de staging dedicados a teste.
- Nenhum segredo commitado, impresso ou registrado em evidencia.
- `pnpm generate:e2e-high-manifest` executado contra staging real.
- `pnpm check:e2e-recency` passa.
- `pnpm check:manifest-integrity` passa.
- Drill real de backup/restore executado e registrado.
- `pnpm check:backup-restore` passa.
- `pnpm ape:cycle:weekly` executado somente apos checks raiz verdes.
- `pnpm check:ape-hard-metrics` passa para o novo ciclo.
- Evidencias reais relevantes indexadas e `pnpm check:evidence-index` passa, se o indice for alterado.

## 13. Riscos P0/P1

P0:

- Rodar `pnpm ape:cycle:weekly` antes de renovar E2E HIGH e backup/restore, registrando novo `NO_GO`.
- Fabricar evidencia ou editar datas manualmente para contornar recencia.
- Expor `STAGING_API_TOKEN` em commit, log, evidencia ou shell history.
- Usar tenant/workspace com dados sensiveis ou nao dedicados a teste.
- Registrar sucesso de backup/restore sem restore real e smoke query real.

P1:

- Token de staging com escopo insuficiente para os cenarios HIGH.
- Staging instavel gerar falso negativo operacional.
- P3/P4 permanecerem vermelhos por janela de recorrencia mesmo apos `check:ape-hard-metrics` voltar a passar.
- Evidencia real criada, mas nao indexada quando a politica exigir.
- Warning de Node.js 20 permanecer como backlog nao bloqueante ate migracao da action/runtime correspondente.

## 14. Proximos Passos

1. Provisionar os secrets no GitHub Secrets ou vault operacional.
2. Validar presenca das variaveis sem imprimir valores.
3. Executar `pnpm generate:e2e-high-manifest` contra staging real.
4. Rodar `pnpm check:e2e-recency` e `pnpm check:manifest-integrity`.
5. Executar ou coordenar o drill real de backup/restore.
6. Atualizar `ops/evidence/2026-W09/base/backup-restore-evidence.md` com RPO, RTO e smoke query real.
7. Rodar `pnpm check:backup-restore`.
8. Rodar `pnpm ape:cycle:weekly` apenas quando os checks raiz estiverem verdes.
9. Rodar `pnpm check:ape-hard-metrics`.
10. Indexar evidencias reais geradas, se aplicavel, e validar com `pnpm check:evidence-index`.
11. Medir `pnpm check:p4-trackp-rollout` e `pnpm check:p3-stability-recurring` para acompanhar recorrencia.
