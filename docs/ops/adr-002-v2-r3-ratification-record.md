# ADR-002 v2-r3 — Registro da versão e decisão arquitetural

## 1. Objeto exato submetido

| Campo | Valor |
|---|---|
| Documento | [ADR-002 — Inteligência Coletiva Governada](../adr/ADR-002-governed-collective-intelligence.md) |
| Versão | v2-r3 |
| SHA-256 dos bytes UTF-8/LF do ADR | `13f6c01d3fb5fc739d0cc1b2a844a302a2bd7cbcdc1810f746109c20885e4431` |
| Base documental verificada | `11805d1934573281e2787c2442b546c172b76947` |
| Branch de publicação | `docs/adr-002-v2-r3` |
| Destino proposto | `main` |
| Autoridade humana designada | Carlos Alberto Merlo |
| Ratificação arquitetural desta versão | **PENDENTE** |
| Liberação de piloto | **NÃO CONCEDIDA** |

O hash identifica o conteúdo; não é assinatura. A v2-r2 permanece histórica no workspace de preparação, identificada pelo SHA-256 `ae24ce8a651d60d721b7d8bc1a86056998ceadd2a7c1c9a8ad7c7692c505f161`.

## 2. O que foi autorizado nesta tarefa

O usuário pediu para seguir com a preparação da v2-r3, o registro vinculado à versão e a publicação por branch e PR apenas documentais. Isso autoriza preparar e apresentar o pacote. A mensagem não foi convertida em ratificação de uma versão que ainda estava sendo produzida.

Origem do pedido: tarefa Codex `01a07130-0da0-74c1-a844-404a96644538`, em 2026-09-05. Não há assinatura humana gerada pelo agente. O autor técnico do commit não representa a autoridade ratificadora.

## 3. Decisão AUTHZ-RUNS já recebida

A [matriz AUTHZ-RUNS](authz-runs-scope-matrix.md) registra as escolhas de vocabulário e scopes que o documento apresentado pelo usuário declara ratificadas. A ADR passa a referenciar essa decisão, preservando implementação e reconciliação técnica pendentes.

O estado dessa matriz não é transferido automaticamente à ratificação arquitetural da ADR nem à liberação do piloto.

## 4. Registro humano a completar

| Campo | Estado |
|---|---|
| Decisão sobre o ADR identificado acima | Pendente |
| Manifestação real de Carlos Alberto Merlo | Ainda não registrada para este conteúdo exato |
| Referência verificável da manifestação | A registrar |
| Data/hora da decisão | A registrar no ato real |
| Função, finalidade e justificativa | A registrar pelo ratificador |
| Política/registro de autoridade aplicável | A referenciar |

Quando houver manifestação humana explícita, registrar seu conteúdo e referência neste arquivo, vinculados ao digest acima. Não deduzir aprovação da autoria do commit, abertura do PR, CI verde ou merge. Qualquer alteração posterior no conteúdo do ADR exige nova identificação da versão e avaliação do vínculo da decisão.

## 5. Escopo e verificação da publicação

Mudança documental ligada a F5.2 (políticas e aprovação humana) e à proposta coletiva. Nenhum commit estrutural é integrado, nenhum grant é criado e nenhuma alteração de runtime faz parte deste PR.

As verificações reais do pacote são registradas em [validação documental](../../ops/evidence/latest/adr-002-v2-r3-docs-validation-2026-09-05.md). Esse resultado prova somente verificações documentais realizadas; não prova testes de autorização, worker ou piloto.
