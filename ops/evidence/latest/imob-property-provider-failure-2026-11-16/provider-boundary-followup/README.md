# ProviderBoundary — correção delimitada da PR #538

Data: 2026-11-16. Codex, sem subagentes. Branch `fix/llm-provider-failure-propagation`; HEAD `aee16965f6de0829a105ce4a17a856851e2ad860`. Status técnico **PARCIAL**. Este relatório registra a validação local anterior à publicação corretiva: na coleta, stage/commit/push não haviam sido executados e não havia nova comprovação remota.

## Causa e alteração

O teste `apps/api/src/tests/llm-provider-failure.test.ts` importava diretamente o adaptador OpenAI, violando a fronteira cujo único consumidor autorizado na API é o executor central. A causa já confirmada no CI foi corrigida por responsabilidade, sem alterar o gate, suas exceções, raízes ou padrões de varredura.

- `packages/providers/tests/openai-provider-failure.test.ts`: quatro casos de propriedade do pacote — transporte, erro estruturado, sanitização/classificação, conteúdo inválido e generateText/identificadores. Usa o adaptador real com transporte sintético e o código real do wrapper. A verificação de IDs inclui completion preservado com novo header, header sem completion, ausência de metadados e recusa.
- `apps/api/src/tests/llm-provider-failure.test.ts`: cinco casos de executor, retry, intake e normalização/capacidade. Injeta o contrato público LLMProvider pelo registry existente. Não importa adaptador concreto, transporte ou helper disfarçado do pacote de providers; não reimplementa parsing HTTP na API.
- A fixture mínima foi movida para `packages/providers/tests/fixtures/openai-credit-balance-exhausted.json` byte a byte, SHA-256 `2ed341ba4cb248568f62fad53d1feffaf0a5efd9e3c70c5503cc5394cee8955b`. Mantém somente error.type/code da origem sanitizada. A referência arquitetural atual foi ajustada.
- O script oficial `test:llm-provider-failure` agora enumera ambos os arquivos com node --import tsx --test. O step bloqueante já existente no build_validate chama esse script; workflow e manifesto unitário não precisam mudar. O verificador oficial reconhece ambos como execução bloqueante, sem novo órfão.

Quota com uma tentativa, ausência de sucesso/uso para recusa, retries transitórios com os limites existentes, IDs presentes/ausentes, referência legada e guarda sem replay/fallback pós-geração permanecem nas asserções pertinentes. O intake real continua sendo exercitado até unavailable, preservando proposta/draft e sem parsing ou execução de domínio. A composição agora é demonstrada por testes por camada; esta execução não é um novo caminho único do adaptador concreto até intake.

## Resultados recuperados e pendências concluídas

| Verificação | Resultado | Exit | Contagem/limite |
| --- | --- | --- | --- |
| pnpm test:llm-provider-failure | APROVADO, recuperado sem repetição | 0 | 2 entradas de arquivo aprovadas, 0 falhas/ignorados. Há 4+5 casos declarados; o runner não individualiza sua contagem. Não declarar 9/9 nesta execução. |
| pnpm check:provider-boundary no sandbox | BLOQUEADO | 1 | listen EPERM no IPC do tsx, antes da execução do teste; saída original preservada em boundary.log |
| Mesmo comando oficial fora do sandbox autorizado | APROVADO | 0 | 1 executado, 1 aprovado, 0 falhas/ignorados; gate intacto |
| checkOrphanTests contra HEAD | APROVADO | 0 | 92 órfãos anteriores e atuais, nenhum novo; ambos os arquivos reconhecidos como bloqueantes |
| packaging-check.mjs | APROVADO | 0 | Configuração: 5 entradas src de produção, testes fora delas, dependência de transporte resolvida pelo proprietário, fixture e caminhos do script/CI existentes |

Os comandos anteriores já tinham terminado; a sessão foi recuperada, sem reaplicação de patches. A consulta de processos não identificou teste pendente, apenas os comandos de inspeção. Nenhum processo foi encerrado.

Os builds oficiais core/providers e o smoke dos módulos empacotados são reaproveitados: não houve mudança nas fontes ou configuração de produção, e os novos testes ficam fora de src. A conferência de configuração **não é novo build nem typecheck**. O typecheck focal anterior reprovado (2 diagnósticos antigos focais + 16 de dependências, nenhum introduzido naquela comparação) permanece histórico. Não houve novo typecheck dos testes reorganizados nem certificação integral.

## Artefatos e proveniência

- `executions.json`: comandos, horários e exit codes reais; `results.json`: resultados e limites.
- `boundary.log`, `boundary-outside.log`, `tests.log`, `registration.log`, `packaging.log`: saídas originais, sem reescrita, incluindo o bloqueio inicial.
- `packaging-check.mjs`: conferência somente de configuração/registro; não executa build, provider ou efeitos.
- `source-hashes.json`: bytes atuais das fontes/documentação pertinentes e deste follow-up, exceto o próprio manifesto; remoção da fixture antiga com hash de origem registrada separadamente.

Os relatórios e manifestos anteriores no diretório pai e no diagnóstico real permanecem intactos. Seus caminhos e hashes, inclusive a fixture antiga, descrevem a execução histórica em `aee16965`; não devem ser reinterpretados como manifesto da árvore posterior. O novo caminho está neste follow-up e na referência arquitetural. Nenhum original foi normalizado, apagado ou substituído para esconder falha; a fixture foi movida com bytes idênticos e sua origem permanece no Git.

Não há credenciais reais nas fixtures ou logs inspecionados; o transporte é sintético e a API usa dublê do contrato. Logs originais locais são preservados como evidência; nenhuma cópia sanitizada nova foi necessária. Não há caches/dist/node_modules/ambientes no pacote.

## Limites preservados

Nenhuma fonte de produção, regra financeira, configuração de providers, fallback, gate ou política transversal foi alterada. Não houve chamada real, gravação de domínio, stage, commit, push, merge, deploy ou retirada do Draft. A ratificação P1 não foi reinvestigada; oferta de avaliação permanece desligada.

Provider real pós-patch, navegador e HTTP com banco continuam não validados. A causa da tentativa específica de staging permanece não comprovada; alinhamento web/API é etapa separada. As demais políticas transversais continuam PROPOSTA. Aprovação local de ProviderBoundary não equivale a nova aprovação remota da PR #538.

## Conferência para publicação corretiva

Na preparação do commit autorizado, a inspeção dos novos arquivos identificou somente uma linha vazia extra ao fim de openai-provider-failure.test.ts (git diff --no-index --check: exit 3). Removeu-se exatamente um LF final; asserções e execução do teste não mudaram. O hash atual foi atualizado neste manifesto; os resultados anteriores foram reaproveitados. Logs originais não foram alterados. O stage, o commit, o push e a consulta posterior do CI pertencem à publicação autorizada subsequente, não à execução local registrada em results.json.
