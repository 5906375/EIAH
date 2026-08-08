# ADR-007 — Relocação temporária de P1ReconciliationRecurring e P2HighGlobalCoverage

## Status

Proposta para ratificação

## Data

2026-08-08

## Restore front

`RESOLVE-RECENCY-GATE-DECAY`

## Reavaliação obrigatória

2026-09-18

## 1. Contexto

Os jobs `P1ReconciliationRecurring` e `P2HighGlobalCoverage` continuam executando em
`.github/workflows/ci.yml` e constam entre os required status checks do snapshot versionado mais
recente do ruleset `main-protection-hard-gates`, ID `13498700`. Ambos reprovam por recência de
artefatos que envelhecem independentemente do conteúdo de um pull request.

Na baseline desta decisão, o job `P1ReconciliationRecurring` executa
`check:p1-reconciliation-recurring`; o job `P2HighGlobalCoverage` executa, nesta ordem,
`check:p2-high-global-coverage` e `check:p2-evidence-recency`. O job P2 não executa
`generate:p2-high-global-coverage` antes do check de recência.

Esta decisão não presume que o snapshot histórico ainda represente o ruleset remoto no momento da
futura alteração administrativa. Antes de qualquer mutação, será obrigatório obter novo snapshot
remoto e demonstrar a preservação integral dos demais contexts e rules.

## 2. Deadlock observado

P1 e P2 avaliam propriedades recorrentes ou artefatos com prazo, não uma regressão introduzida pelo
delta de cada PR. Quando a janela vence, todo PR dirigido a `main` recebe o mesmo resultado vermelho,
inclusive PRs necessários para corrigir os producers, a proveniência ou o tratamento estrutural da
recência. O gate que deveria cobrar a restauração impede a integração do trabalho que pode
restaurá-lo.

O estado vermelho é honesto: ele não deve ser convertido em saúde, nem apagado. O problema é o local
em que esse sinal recorrente está sendo aplicado como requisito de cada PR.

## 3. Evidência de que continue-on-error não equivale a waiver do required context

Na baseline atual da branch, os dois jobs possuem `continue-on-error: true` e duas entradas nominais
em `ops/contracts/gate-waivers.v1.json`, aprovadas por Carlos Alberto Merlo e com vencimento em
2026-09-18. Esse contrato torna a supressão declarada, datada e verificável pelo checker local; ele
não altera o ruleset da plataforma.

`continue-on-error` governa a continuidade/conclusão do workflow, e o waiver versionado governa a
coerência entre essa configuração e o repositório. Nenhum dos dois remove um context da lista
required do ruleset. Logo, manter o context required e apenas acrescentar waiver ou
`continue-on-error` não executa a relocação administrativa decidida aqui.

O estado correto durante a exceção será `temporarily_non_required`, não `healthy`, `passing` ou
`resolved`.

## 4. Problema semântico P1

`scripts/checkP1ReconciliationRecurring.ts` seleciona por padrão três ciclos APE e exige idade
máxima de 14 dias, `auditGap=0` e `duplicateSideEffects=0`. O checker falha fechado quando a data não
é parseável e reprova evidência vencida ou valores diferentes de zero.

Entretanto, `scripts/ci/ape_cycle_weekly.cjs` executa quinze checks e grava `auditGap=0`,
`duplicateSideEffects=0` e `breakGlass=0` como literais no markdown e no JSON de decisão, sem derivar
esses três valores do resultado medido pelos checks. Assim, renovar o ciclo não basta para transformar
essas métricas em captura real.

A remoção temporária de P1 dos required contexts não declara a reconciliação estável e não autoriza
alterar `P1_RECONCILE_MIN_CYCLES`, `P1_RECONCILE_MAX_AGE_DAYS` ou produzir um timestamp novo para
forçar passagem.

## 5. Problema semântico P2

O job `P2HighGlobalCoverage` verifica o inventário e depois a recência, sem autorrenovar o artefato no
próprio job. Essa separação deve ser preservada.

O producer `scripts/generateP2HighGlobalCoverage.ts`, quando executado em outro contexto, inspeciona
como texto os arquivos de ações e o arquivo de teste E2E. Se encontra os nomes esperados, atribui
`e2eCovered=true` a cada item e renova `generatedAt`; ele não executa o cenário E2E como fonte dessa
afirmação. Executá-lo apenas para renovar a data criaria aparência de frescor sem nova prova de
execução.

A remoção temporária de P2 dos required contexts não declara cobertura E2E real, não autoriza alterar
o limite de 30 dias e não autoriza declarar `e2eCovered` sem execução observada e proveniência.

## 6. Precedente D25

A decisão D25, ratificada em 2026-07-08 e registrada em
`ops/evidence/latest/gate-relocation-decision-2026-07-08.md`, retirou
`check:p3-stability-recurring` e `check:p4-trackp-rollout` do bloqueio de PR e os manteve bloqueantes
em `.github/workflows/ape-weekly.yml`. A motivação foi o mesmo tipo de deadlock: gates recorrentes
bloqueavam todo PR, inclusive o trabalho necessário para restaurar o estado subjacente.

D25 não alterou métricas, limiares ou código dos checkers. Este ADR adota essa separação entre sinal
recorrente e bloqueio por PR, sem afirmar que P1/P2 estejam saudáveis e sem estender automaticamente
o mecanismo a qualquer outro gate.

## 7. Relação com ADR-004

O ADR-004 estabelece que required check não pode ser suprimido implicitamente e que um gate que
reprova deve ser presumido correto. Esta decisão não contesta a reprovação de P1/P2. Ela torna
explícito que, durante a restauração, esses dois sinais não serão required em `main`.

A coerência pretendida é binária e observável: enquanto os contexts forem required, suas falhas têm
semântica bloqueante; durante a exceção aprovada, seu estado será
`temporarily_non_required`, com execução e falhas ainda visíveis. O retorno ao ruleset dependerá de
decisão administrativa explícita e evidência de mérito; nunca ocorrerá automaticamente por data,
por passagem isolada ou por regeneração de artefato.

## 8. Decisão

Após ratificação e preflight remoto próprio:

1. retirar temporariamente de `main-protection-hard-gates` somente
   `P1ReconciliationRecurring` e `P2HighGlobalCoverage`;
2. preservar integralmente todos os demais required contexts e todas as demais rules;
3. manter `enforcement=active`, o target de branch e `bypass_actors` inalterados;
4. manter os checks executando e suas falhas visíveis;
5. classificar os dois gates como `temporarily_non_required`;
6. não alterar thresholds, métricas, reason codes, checkers, producers ou artefatos nesta etapa;
7. restaurar cada context somente por decisão explícita após suas condições de retorno.

Esta decisão não executa a alteração. A alteração administrativa só poderá ocorrer depois de novo
snapshot remoto do ruleset e prova de preservação integral dos demais contexts/rules.

## 9. Etapa administrativa fora de PR

A mutação do ruleset é uma operação administrativa da plataforma e não faz parte do commit que
materializa este ADR. A futura operação deverá partir do JSON remoto vigente, produzir diff lógico
exato, remover apenas os dois contexts nomeados e conservar byte ou logicamente todos os demais
campos.

O snapshot anterior, o payload aplicado, a resposta da API e o snapshot posterior deverão ser
congelados com hashes, timestamp, ator e comandos. O ADR sozinho não autoriza afirmar que o ruleset
foi alterado.

## 10. Relocação posterior para ape-weekly

Em ciclo posterior e separado, P1 e P2 deverão ser avaliados para execução em
`.github/workflows/ape-weekly.yml`, seguindo D25. Até essa mudança de workflow ser implementada e
validada, os jobs atuais de `ci.yml` continuam sendo a superfície de execução e visibilidade.

A relocação de workflow deve manter os mesmos checkers e thresholds, sem invocar
`generate:p2-high-global-coverage` para autorrenovação e sem fabricar métricas APE. Ela não é
executada por este ADR.

## 11. Tratamento condicional dos waivers/continue-on-error

A baseline atual desta branch contém waivers e `continue-on-error` para P1/P2. O tratamento futuro é
condicional à baseline que efetivamente for integrada:

- se a versão a integrar contiver waiver ou `continue-on-error` de P1/P2, essas supressões deverão
  ser removidas junto da relocação, preservando uma única semântica explícita;
- se waiver ou `continue-on-error` não estiverem presentes na baseline final, nenhum delta artificial
  deverá ser criado para removê-los;
- nenhuma entrada de waiver será criada, renovada ou removida por este ADR.

## 12. A-20 explicitamente fora de escopo desta decisão

`A-20` permanece fora do escopo. Este ADR não define, corrige, reclassifica ou resolve A-20 e não usa
essa frente como condição implícita para executar a etapa documental atual. Qualquer relação futura
de A-20 com policy via `process.env`, validação de `MIN_CYCLES` ou outro bypass potencial exige
decisão e ciclo próprios.

## 13. Consumidor P3StabilityRecurring

`P3StabilityRecurring` permanece ativo em `ape-weekly.yml`. Seu checker consome
`hardMetricsGo`, `auditGap`, `duplicateSideEffects` e `breakGlass` dos ciclos APE. Sua presença como
consumer preserva o sinal recorrente de P3, mas não valida a proveniência dos três valores atualmente
gravados como literais pelo producer.

Este ADR não remove, rebaixa nem altera P3. Também não usa o resultado de P3 como prova de que P1
está saudável.

## 14. Risco de cascata/publicação em ape-weekly

O registro N-24 demonstrou que um gate recorrente vermelho, quando executado como step sequencial,
pode pular gates posteriores e impedir a publicação da própria evidência NO_GO. O workflow atual
protege os steps posteriores com a condição
`!cancelled() && steps.run_ape_cycle.outcome == 'success'`, mantendo execução independente e
publicação quando o ciclo foi gerado.

Uma futura inclusão de P1/P2 em `ape-weekly.yml` deverá preservar essa propriedade: a falha de um
gate não pode ocultar o outro nem impedir Evidence Index, upload ou criação da PR de evidência. Ao
mesmo tempo, a falha deve continuar visível no resultado final do job. Este ADR não altera a ordem ou
as condições atuais do workflow.

## 15. Condições de retorno P1

`P1ReconciliationRecurring` somente poderá voltar a ser required quando, cumulativamente:

1. `auditGap` e `duplicateSideEffects` deixarem de ser literais fabricados pelo producer APE e
   passarem a ter fonte executada, rastreável e verificável;
2. o checker continuar exigindo, sem redução, `MIN_CYCLES=3` e `MAX_AGE_DAYS=14` por padrão;
3. existirem três ciclos aceitos dentro da janela, com `auditGap=0` e
   `duplicateSideEffects=0` por medição real;
4. os casos de ausência, valor inválido, evidência vencida e valor diferente de zero permanecerem
   fail-closed e forem demonstrados por validação aplicável;
5. o estado remoto do ruleset for novamente fotografado e uma decisão administrativa explícita
   autorizar o retorno.

Uma passagem isolada, a chegada da data de reavaliação ou a renovação de timestamp não satisfazem
essas condições.

## 16. Condições de retorno P2

`P2HighGlobalCoverage` somente poderá voltar a ser required quando, cumulativamente:

1. a afirmação `e2eCovered` derivar de execução E2E real, não apenas de inspeção textual do arquivo
   de teste;
2. a captura registrar proveniência suficiente — comando, commit, run/ambiente, resultado e
   timestamp — sem autorrenovação dentro do job consumidor;
3. a cobertura das ações HIGH estiver completa e o artefato estiver dentro do limite vigente de 30
   dias, sem ampliar esse limite;
4. `check:p2-high-global-coverage` e `check:p2-evidence-recency` passarem por mérito sobre o artefato
   capturado;
5. o estado remoto do ruleset for novamente fotografado e uma decisão administrativa explícita
   autorizar o retorno.

Existência de teste no repositório, regeneração declarativa ou simples atualização de `generatedAt`
não satisfazem essas condições.

## 17. Prazo e restauração

A decisão deve ser reavaliada obrigatoriamente em 2026-09-18. A frente responsável pela restauração
é `RESOLVE-RECENCY-GATE-DECAY`.

A data é um gatilho de decisão, não um mecanismo automático de retorno ou extensão. Se as condições
de mérito não estiverem satisfeitas, o owner deverá registrar nova decisão explícita; silêncio não
autoriza reintroduzir os contexts, renovar waivers ou declarar saúde.

## 18. Impacto sobre PR #423

O PR #423 contém a linhagem normativa ADR-003–ADR-006 e, na baseline desta decisão, contém também os
waivers e `continue-on-error` de P1/P2. Este ADR não reescreve esses commits, não regenera evidência e
não desbloqueia sozinho o PR: enquanto o ruleset remoto mantiver os contexts required, F-1 ainda não
estará ativa.

Se a versão de #423 que for integrada ainda contiver as supressões, elas deverão ser tratadas segundo
a seção 11 junto da relocação. A futura remoção dos dois required contexts não permite afirmar que
outros checks do PR estejam verdes.

## 19. Impacto sobre PR #424

O PR #424 não deve ser reescrito antes da decisão final ou do merge de #423. Se #423 entrar em
`main`, a ancestry compartilhada pode desaparecer naturalmente do diff de #424. Caso contrário, o
isolamento posterior por rebase ou cherry-pick será necessário em ciclo autorizado próprio.

Este ADR não executa merge, rebase, cherry-pick ou qualquer alteração em #424.

## 20. Evidências obrigatórias da alteração administrativa

A futura etapa administrativa deverá registrar, no mínimo:

1. snapshot remoto anterior completo do ruleset `13498700`;
2. identidade, permissão administrativa e ator da operação, sem expor segredo;
3. lista ordenada de required contexts antes da mudança;
4. diff lógico mostrando a remoção exclusiva de P1/P2;
5. prova de que `enforcement`, conditions/target, `bypass_actors` e demais rules não mudaram;
6. payload exato aplicado e resposta completa da plataforma;
7. snapshot remoto posterior e lista ordenada dos contexts restantes;
8. hashes dos snapshots e timestamp da captura;
9. confirmação de que os dois checks continuam executando e suas failures continuam visíveis;
10. estado efetivo de waiver/`continue-on-error` na baseline integrada e tratamento adotado.

Sem esse pacote, a alteração não pode ser classificada como evidenciada.

## 21. Alternativas rejeitadas

| Alternativa | Motivo da rejeição |
| --- | --- |
| Regenerar P1/P2 apenas para renovar datas | Renovaria frescor sem corrigir os valores APE literais nem provar execução E2E de P2. |
| Aumentar `maxAgeDays` | Ocultaria a deterioração sem resolver proveniência ou vínculo do gate com PR. |
| Reduzir `MIN_CYCLES` | Enfraqueceria o critério recorrente e ampliaria risco de bypass por configuração. |
| Manter required e depender só de `continue-on-error`/waiver | Não remove os contexts do ruleset e preserva semânticas contraditórias entre workflow, contrato e plataforma. |
| Declarar os gates saudáveis | Contradiz as falhas reais de recência e a integridade insuficiente dos producers. |
| Alterar checkers, producers ou reason codes nesta decisão | Amplia o escopo administrativo/documental e mistura decisão com implementação da restauração. |
| Retorno automático em 2026-09-18 | Data não prova mérito nem integridade de evidência. |

## 22. DoD

A decisão F-1 somente estará ativa quando:

- este ADR estiver ratificado;
- um snapshot remoto novo confirmar o ruleset, a presença nominal de P1/P2 e a possibilidade de
  preservar todos os demais campos;
- a permissão administrativa do ator estiver comprovada por consulta read-only;
- o payload lógico exato tiver sido revisado antes da mutação;
- a alteração administrativa tiver removido somente P1/P2;
- o snapshot posterior provar a preservação de `enforcement=active`, target, bypass actors, demais
  contexts e demais rules;
- os checks continuarem executando e suas falhas permanecerem visíveis;
- waiver e `continue-on-error` tiverem recebido o tratamento condicional da seção 11;
- a evidência administrativa da seção 20 estiver congelada e verificável.

A relocação posterior para `ape-weekly.yml` possui DoD próprio e não é pré-declarada como executada
por este documento.

## 23. Estado da decisão

**ADR-007 documentado localmente; proposta para ratificação.**

**F-1 ainda não ativa.**

**Ruleset não alterado.**

P1/P2 permanecem não saudáveis quanto às falhas e limitações descritas. Até a futura alteração
administrativa ser aplicada e comprovada, o estado remoto de required contexts não é antecipado por
este ADR.
