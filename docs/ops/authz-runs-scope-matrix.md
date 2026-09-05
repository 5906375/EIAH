# AUTHZ-RUNS — Decisão de scopes e reconciliação técnica

- **Decisão de vocabulário e scopes:** registrada como RATIFICADA no documento apresentado por Carlos Alberto Merlo, autoridade humana designada.
- **Implementação:** PENDENTE; este registro não altera middleware, grants, contratos ou runtime.
- **Natureza desta cópia:** consolidação documental que preserva as escolhas informadas e distingue as divergências técnicas a reconciliar; não fabrica nova assinatura.
- **Origem:** anexo AUTHZ-RUNS apresentado pelo usuário na tarefa Codex `01a07130-0da0-74c1-a844-404a96644538`.
- **SHA-256 do anexo original:** `4bbb209bd9c155c1a325f690c2662d5dc62d15f52c25148195f8ab322f62ecb7`.
- **Baseline da conferência:** `11805d1934573281e2787c2442b546c172b76947`; revalidar no SHA reconciliado da implementação.
- **ADR relacionada:** [ADR-002 v2-r3](../adr/ADR-002-governed-collective-intelligence.md).

O anexo registra uma decisão humana sobre nomes e permissões. A data/hora e a identidade autenticada do ato original não foram verificadas independentemente nesta consolidação. Autoria ou assinatura do commit de publicação não será tratada como substituto desse ato, nem como autorização de operação no runtime.

## 1. Vocabulário registrado

Opção A: scopes com ponto, com as escolhas `runs.write`, `runs.execute` e `runs.approve` da matriz abaixo. `runs.read` aparece no vocabulário recebido, mas as rotas de leitura estão fora do escopo desta decisão.

O documento de origem usa uma ordenação entre tiers. Essa notação não implementa nem comprova herança de permissões. A reconciliação técnica deve explicitar a relação entre scopes antes de codificá-la; não conceder permissões adicionais por inferência.

O catálogo existente lista `runs:write`. A decisão recebida prevê migração para `runs.write`; é necessário inventariar consumidores, grants e semânticas antes da troca. A política de risco do baseline usa os nomes de ação `runs.execute`/`runs.approve` com scopes `execute`/`admin`, respectivamente. A compatibilidade com o novo vocabulário exige mapeamento explícito, sem reescrever silenciosamente a semântica da política.

## 2. Matriz de oito rotas mutáveis

Os caminhos abaixo são relativos ao prefixo `/api`. A coluna de caminho observado registra o baseline, preservando separadamente a diferença do texto ratificado.

| Operação | Caminho POST observado no baseline | Scope registrado | Humano autenticado? | Observação |
|---|---|---|---|---|
| Criar Run | `/runs` | `runs.execute` | Não exigido por este tier | Exige também atribuição válida e demais gates aplicáveis |
| Aprovar | `/runs/:id/approve` | `runs.approve` | Sim | Validar permissão e identidade antes de gravar aprovação |
| Cancelar | `/runs/:id/cancel` | `runs.execute` | Não exigido por este tier | Controle do ciclo de vida |
| Adotar recomendação | `/runs/:id/recommendations/adopt` | `runs.approve` | Sim | O anexo usou `/runs/:id/recommendations/:recommendationId/adopt`; reconciliar endereço sem alterar a escolha de scope |
| Rejeitar recomendação | `/runs/:id/recommendations/reject` | `runs.approve` | Sim | O anexo usou `/runs/:id/recommendations/:recommendationId/reject`; reconciliar endereço sem alterar a escolha de scope |
| Feedback | `/runs/:id/feedback` | `runs.write` | Não exigido por este tier | Confirmar que a escrita não muda execução nem autorização |
| Finalizar conversa | `/runs/:id/conversation/finalize` | `runs.execute` | Não exigido por este tier | Decisão recebida é condicional: se houver efeito de negócio embutido, aplicar `runs.approve` e exigência humana |
| Replay | `/runs/:id/replay` | `runs.approve` | Sim | Escolha conservadora registrada por reacionar efeitos |

As quatro operações expressamente sujeitas à identidade humana são aprovar, adotar, rejeitar e replay. A condição prevista para finalizar conversa pode ampliar esse conjunto após inspeção do efeito real.

“Humano autenticado” exige verificação na operação; não é demonstrado apenas pela presença de userId em um token de serviço. O significado operacional de permissão administrativa deve ser reconciliado com o RBAC existente, sem tratar `admin` global e `runs.approve` como equivalentes automáticos.

## 3. Pendências técnicas preservadas

1. Recolher âncoras arquivo:linha no SHA de implementação e confirmar todos os caminhos mutáveis.
2. Inventariar usos e grants de `runs:write`; definir migração sem alargar autoridade.
3. Explicitar independência ou implicação entre scopes e compatibilidade com a política de risco.
4. Definir constantes tipadas conforme o padrão existente, incluindo a organização em ADMIN_SCOPES indicada na decisão recebida, sem duplicar catálogo.
5. Aplicar requireScope antes de lógica de negócio e a validação humana nas operações aplicáveis.
6. Confirmar o efeito de finalizar conversa e aplicar a condição ratificada.
7. Implementar revalidação do vínculo Run/job/atribuição no worker como controle separado.
8. Executar testes negativos por rota e testes de atribuição, identidade e isolamento no mesmo SHA.

Essas pendências não reabrem as escolhas de scopes registradas; delimitam sua tradução para o código. Esta matriz resolve a decisão de rotas e integra a autorização de implementação, mas não encerra todas as escolhas do coletivo nem libera o piloto.

## 4. Relação com a ADR

- **§3 — Quatro etapas de decisão e execução.** *Nota explicativa: separa ratificação da arquitetura, autorização de implementação, implementação validada e decisão de início do piloto; AUTHZ-RUNS é uma decisão integrante da segunda etapa.*
- **§9 — Condições de saída para liberar o piloto.** *Nota explicativa: exige controles aplicados, testes, evidências e decisão humana; a matriz ratificada sozinha não satisfaz esses requisitos.*
- **§10, item 1 — Estado da AUTHZ-RUNS.** *Nota explicativa: registra a decisão de scopes como recebida e ratificada, mantendo aplicação, testes e reconciliação técnica pendentes.*

## 5. Limites da publicação

Rotas de leitura já protegidas permanecem fora desta unidade. Este PR publica documentação; não concede scopes a usuários, tokens ou participantes, não modifica a política de risco e não autoriza piloto. A ratificação arquitetural da ADR é acompanhada em [registro próprio](adr-002-v2-r3-ratification-record.md).
