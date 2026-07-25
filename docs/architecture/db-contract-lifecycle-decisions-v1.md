# DB Contract Lifecycle Decisions v1

| Campo normativo | Valor |
| --- | --- |
| Versão | `1.0` |
| Data | `2026-07-25` |
| Status | `Proposta` |
| Política aplicável | `docs/architecture/db-contract-lifecycle-v1.md` |
| Inventário base | `docs/ops/evidence/db-contract-lifecycle-inventory-2026-07-25.md` |
| Baseline | `main@f7738ce6ad24ceead6b29bb7e93a4fd8ade83583` |
| Escopo | resolução fail-closed das 12 pendências da entrega 1, sem mudança de contrato ou runtime |

## Autoridade e regra de decisão

Este registro não substitui atribuição humana de owner, aprovação de remoção ou
política formal de retenção. Uma análise executada por assistente de coding não
satisfaz esses requisitos humanos.

Aplicam-se integralmente os gates da política v1:

- promoção para `active` exige uso runtime positivo e owner registrado;
- promoção para `legacy-supported` exige uso legado positivo, owner e suporte
  explicitados;
- sinal negativo ou colisão de nome nunca prova desuso;
- contrato sensível nunca vai para `candidate-removal` por grep negativo.

## Placar da entrega 2

| Grupo | Pendências de entrada | Gates satisfeitos | Promoções | Permanecem `needs-human-decision` |
| --- | ---: | ---: | ---: | ---: |
| `AR-002` — dump raw SQL | 1 | 0 | 0 | 1 |
| `AR-001` — owner dos contratos sensíveis | 6 | 0 | 0 | 6 |
| Wiring-vs-legado | 5 | 0 | 0 | 5 |
| **Total** | **12** | **0** | **0** | **12** |

As 12 linhas estão contabilizadas. O resultado é uma disposição fail-closed,
não uma promoção artificial de lifecycle.

## Decisões registradas

### AR-002 — dump raw SQL

Estado registrado: `defer-with-blocker`.

Não existe aprovação humana explícita para a rota de congelar hash e remover.
Também não existe política formal específica que registre cumulativamente
classificação do dado, base legal, owner, prazo e destino do hash para reter o
dump. O arquivo permanece intocado.

Decisão humana requerida: DB governance/security, com revisão legal/privacy,
deve escolher `rota-1` ou `rota-2`. Se escolher `rota-1`, aprovação e remoção
devem ficar em entrega e commit separados. A avaliação/rotação de eventual
segredo vivo permanece uma frente independente.

### AR-001 — owner dos seis contratos sensíveis

Nenhum dos seis contratos possui atribuição humana versionada de custódia e
nenhum apresentou uso positivo em fonte TypeScript canônica, escrita SQL,
seed, job ou telemetria fora de schema/migrations.

O placeholder `DB governance (inferido)` da entrega 1 não é promovido a fato.
Cada contrato permanece `needs-human-decision`. A decisão humana deve nomear o
custodiante e dizer se o contrato é wiring futuro, suporte legado ou entrada
para um fluxo futuro de sunset.

### Wiring-vs-legado

| Objeto | Disposição desta entrega | Fundamento | Ratificação humana necessária |
| --- | --- | --- | --- |
| `ApprovalDecision` | `defer`; não tratar hits de nome como uso DB | Os hits canônicos são conceitos IMOB/receipt; não há operação canônica de `ApprovalRecord`. | Escolher wiring do contrato DB ou suporte legado e registrar owner. |
| `ApprovalRecord` / `approval_records` | `defer`; wiring recomendado apenas se a unificação canônica de approval adotar este modelo | Não há uso TypeScript canônico nomeado do modelo/tabela/client. | Escolher wiring ou suporte legado, mapear consumidor e registrar owner. |
| `PoUFailureReason` | `defer`; decidir em conjunto com o contrato PoU | O enum existe no schema/migration, sem uso TypeScript canônico nomeado. | Owner PoU deve ratificar wiring ou suporte legado. |
| `PoUStatus` | `defer`; decidir em conjunto com o contrato PoU | O enum existe no schema/migration, sem uso TypeScript canônico nomeado. | Owner PoU deve ratificar wiring ou suporte legado. |
| `ProofOfUsage` / `proof_of_usage` | `defer`; **wiring é a rota técnica recomendada**, sem implementação nesta entrega | O schema declara o modelo, enquanto `pouService.ts` retorna estrutura vazia e `evidenceBundle.ts` declara PoU indisponível. Isso prova conflito, não uso DB. | Owner PoU deve escolher wiring canônico, suporte legado ou sunset futuro e registrar a decisão. |

## Próximo gate

Uma entrega futura só poderá mudar lifecycle quando anexar:

1. atribuição humana de owner com autor e data;
2. evidência positiva reproduzível do uso do contrato DB;
3. suporte legado explícito, quando esse for o destino;
4. para o dump, aprovação de remoção ou política formal de retenção suficiente.

Até lá, a política e a frente permanecem `Proposta`.
