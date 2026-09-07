# R0-A — Reconciliação da fundação de autoridade de Run

Data: 2026-09-07. Executor: Codex. Fase: F5.2 / fundação de autorização de Run. Status: **parcial — implementação reconciliada e evidenciada localmente; limitações e CI separados abaixo**.

## Autorização e escopo

Nesta tarefa Codex `01a07130-0da0-74c1-a844-404a96644538`, o usuário manifestou: “Autorizo implementar a unidade R0-A, com esses dois commits, validação e preparação de PR próprio”. O objeto autorizado é a reconciliação dos deltas `26bef43` e `37c162a` sobre main, em worktree isolado. Essa manifestação não é liberação de piloto, merge ou implantação.

Base remota reconfirmada: `11805d1934573281e2787c2442b546c172b76947`. Worktree: `/home/jusall/projects/EIAH_R0A`. Branch: `feat/r0a-run-authority-reconciliation`. Os commits foram integrados com `cherry-pick -x`, produzindo `8622756` e `4d24198`, sem conflitos. A união inicial correspondeu aos 37 arquivos previstos; os scripts preexistentes de main foram preservados.

O PR #433 contém a origem desses deltas e outros commits PRE_DUIMP. Foi mantido intacto; eventual integração dos dois PRs exige tratar a sobreposição. O PR #441 contém a publicação documental e a manifestação de ratificação da ADR v2-r3. Seu conteúdo/hash não foi alterado nesta unidade.

## Comportamento reconciliado

- Referência histórica da fronteira estrutural aponta para o merge SHA que a introduziu.
- Worker exige que Run, tenant e workspace resolvam um registro antes de prosseguir; compara a ação transportada com a persistida e valida a transição running.
- Metadata de governança enviada pelo cliente/fila é sanitizada; projeções de leitura e relatórios distinguem avaliação real de dados legados não verificados.
- Action Policy e reason codes preservam a semântica observacional de `37c162a`; `enforcementApplied` permanece false. Uma decisão de política negada nesse estágio não é bloqueio geral de execução.

Os oito scopes HTTP AUTHZ-RUNS, a revalidação integral de atribuição/ator/versão no worker e os contratos/testes coletivos continuam pendentes. Nenhum grant de negócio, vertical ou participante foi habilitado.

## Ajustes necessários para reproduzir a validação

Commit `ef9cb1c12faf661d9799bae53e4f34ed051fc064`, restrito a três testes e ao script de integração:

1. Removidas referências de teardown a `runEventPublisher.js` e `criticalMetrics.js`, módulos sem fonte versionada correspondente no checkout limpo. Mantidas as rotinas canônicas de fechamento já presentes; nenhum módulo vazio foi criado para mascarar a falha.
2. O teste de interoperabilidade demonstra 403 antes do grant `ledger.view` e 200 depois do grant explícito para sua fixture sintética. O middleware de autorização não foi alterado.
3. Os testes de interoperabilidade e shadow foram ligados ao script `test:run-governance-policy:integration`, já executado no job AssignmentFailClosedHttp, com concorrência de arquivos igual a 1. O job já dispõe de Postgres e Redis efêmeros.

## Resultados reais

| Verificação | Resultado |
|---|---|
| Builds de contratos, DB, core e providers | PASS |
| Build da API | PASS após regeneração dos tipos derivados |
| Build web | PASS; aviso de tamanho de chunks |
| Typecheck web | FAIL preexistente: 63 diagnósticos idênticos no main limpo e R0-A; zero diagnósticos novos |
| Governança de metadata e política/RBAC | PASS: 31/31 + 17/17 |
| Fronteira de erro do worker | PASS: 3/3 |
| Testes do catálogo de reason codes | PASS: 10/10 |
| Relatórios, worker e regressão billing/catálogo | PASS: 59/59 |
| Integração no commit ef9cb1c | PASS: 2/2 de política + 12/12 de rotas (5 IMOB, 5 interop, 2 shadow) |
| Migrations no Postgres exclusivo | PASS: 25 migrations aplicadas e status atualizado |
| Reason-code canon, orphan-tests e links | PASS; orphan-tests informa 93 órfãos históricos, zero bloqueantes |
| Evidence Index antes da publicação desta evidência | PASS: 638 referências; a nova indexação recebe validação própria na publicação |
| Comando lint da raiz | Exit 0, porém só imprime mensagem. Não comprova lint efetivo do código |
| HEAD e seis arquivos pendentes do checkout original | Preservados, com conferência SHA-256 |

Os builds e testes não afetados pelo ajuste de fixtures foram executados sobre `4d24198`. O commit `ef9cb1c` modifica somente testes e seu script; a integração completa foi executada novamente nesse SHA. Os logs/SHAs específicos constam do [manifest](r0a-run-authority-2026-09-07/manifest.json).

## Intercorrências e limites

A execução inicial foi interrompida durante o build da API. Na retomada, um arquivo de tipos derivado continha bytes nulos; os artefatos foram regenerados pelo build canônico e a API passou. Não se alterou fonte de runtime para contornar esse problema. Logs de tentativas anteriores permanecem no workspace local de preparação.

O primeiro ambiente Postgres efêmero deixou de estar disponível entre etapas; foi recriado para a suíte final. As falhas iniciais de conexão não foram contadas como testes aprovados. As referências inválidas de teardown e a fixture sem ledger.view foram corrigidas e os casos foram reexecutados com sucesso.

A comparação de main encontrou falta de espaço no volume Windows. A comparação foi concluída com logs no WSL; seu worktree temporário limpo foi removido após preservar o resultado. Nenhum arquivo do checkout original foi apagado.

O typecheck web foi comparado por mensagens completas com um checkout limpo do SHA oficial, dependências do lockfile e artefatos próprios; são 63 erros em ambos. Essa dívida não foi corrigida por estar fora do recorte. Não declarar typecheck global verde.

Esta evidência é de validação local com fixtures sintéticas, não de operação real, staging, produção ou conformidade completa de autorização. CI remoto pertence ao commit que o executa e será informado no PR. Os gates operacionais P1/P2 não foram alterados nem receberam datas artificiais.

## Próxima unidade

Reconciliar a semântica de autorização por ator e por tenant/workspace, aplicar AUTHZ-RUNS às oito rotas e revalidar a autoridade da Run no worker. Os contratos e testes coletivos shadow vêm depois. Liberação do piloto exige decisão humana própria.
