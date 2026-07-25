# DB Contract Lifecycle v1

| Campo normativo | Valor |
| --- | --- |
| Versão | `1.0` |
| Data | `2026-07-25` |
| Status | `Proposta` |
| Impacto no DoD | `P0 — integridade documental / fonte da verdade` |
| Nível | `L1→L2 — habilitador de legado sanitizado e governado` |

## Objetivo

Esta política governa o lifecycle documental dos contratos históricos e raw SQL
representados em `packages/db/prisma/schema.prisma`. A entrega 1 materializa
inventário e política; não autoriza remoção, migration destrutiva ou mudança de
runtime.

Os estados são documentais. Uma futura automação de CI deve usar reason codes do
catálogo canônico `docs/ops/reason-codes-catalog.md`; esta política não cria
reason codes paralelos.

## Unidade de inventário

Cada modelo, enum, valor reconciliado de enum ou artefato raw SQL de fronteira é
uma linha independente. Toda linha deve conter:

- domínio e sensibilidade;
- lifecycle;
- classificação do achado;
- `evidenceRef` canônico;
- owner comprovado, owner explicitamente não atribuído ou owner estimado;
- `assumptionRef` quando houver estimativa;
- decisão pendente para estados que exigem ação humana.

## Eixo A — lifecycle

| Estado | Uso |
| --- | --- |
| `active` | Há uso runtime positivo e o contrato deve ser sustentado. |
| `legacy-supported` | Há uso positivo em caminho explicitamente legado que ainda deve ser suportado. |
| `deprecated` | A depreciação foi decidida e tem política de compatibilidade/sunset. |
| `candidate-removal` | Há evidência positiva de desuso, o objeto não é sensível e ainda exige fluxo humano separado. |
| `needs-human-decision` | A evidência é insuficiente, conflitante ou exige decisão de owner/retenção. |

## Eixo B — classificação do achado

| Classe | Regra |
| --- | --- |
| `confirmado` | Uso ou estado sustentado por fonte canônica versionada e evidência reproduzível. |
| `suspeita` | Sinal incompleto. Grep negativo isolado sempre permanece nesta classe, no máximo. |
| `estimativa` | Owner ou conclusão inferida. Exige entrada correspondente no `assumptionRegister`. |

Os eixos são ortogonais. Lifecycle descreve o destino; classificação descreve a
força da evidência. Ausência de literal não equivale a uso zero.

## Owner

Owner confirmado deve ser uma atribuição humana registrada ou um componente
canônico com uso nomeado do contrato. Um owner inferido é sempre `estimativa`.
Quando não houver base para inferência, o campo deve dizer `não atribuído` e o
lifecycle permanece `needs-human-decision`.

## Sensibilidade e fail-closed

São sensíveis por padrão contratos ligados a billing, payment, wallet, tenant,
workspace, approval, PoU, dispute, reputation ou RBAC. Objetos que carregam
`tenantId` ou `workspaceId` também são sensíveis.

Contrato sensível:

- nunca recebe `candidate-removal` por grep negativo;
- com uso runtime positivo fica `active` ou `legacy-supported`;
- sem evidência suficiente fica `needs-human-decision`;
- não pode ser removido sem aprovação humana registrada.

## Evidência e masking

O formato é `{ artifactId, location, hash }`. O inventário deve registrar o
comando executado, resultado sanitizado e hash da captura. Buscas devem preferir
lista de arquivos, não conteúdo, para reduzir exposição.

É proibido registrar amostras de dados, PII, secrets, connection strings,
headers de autorização ou conteúdo não sanitizado de dumps. Marcadores
encontrados em backup devem ser descritos de forma mascarada.

## Transições

| Origem | Destino | Gate mínimo |
| --- | --- | --- |
| `needs-human-decision` | `active` | Uso positivo confirmado e owner registrado. |
| `needs-human-decision` | `legacy-supported` | Uso legado positivo, owner e suporte explicitados. |
| `active`/`legacy-supported` | `deprecated` | Decisão humana, consumidores mapeados e sunset versionado. |
| `deprecated` | `candidate-removal` | Evidência positiva de desuso e objeto não sensível. |
| qualquer estado | remoção | Entrega separada e critérios destrutivos completos. |

## Remoção futura

Remoção de objeto sensível exige cumulativamente:

1. evidência positiva de uso zero, além de grep;
2. migration destrutiva separada;
3. rollback documentado e testado;
4. aprovação humana registrada;
5. CI verde;
6. evidência atualizada sem declarar staging/produção além do observado.

Nada nesta entrega satisfaz ou executa esse fluxo.

## Artefato raw SQL de fronteira

O dump `apps/api/backup-20251031-103132.sql` não é contrato Prisma nem
implementação runtime. Ele entra no inventário como `needs-human-decision`.
A decisão permitida nesta fase é apenas registrar a pendência entre:

- congelar o hash como evidência e remover em entrega explicitamente aprovada; ou
- reter sob política formal de retenção.

Nenhuma das opções é escolhida nesta entrega.

## Evidência desta versão

- `docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md`
- `docs/ops/evidence/schema-migrations-drift-before-2026-07-25.md`
