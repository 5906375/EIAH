# ADR-008 — Modelo de revisão: administrador único, sem exigência de segundo revisor humano

## Status

Ratificada

## Data

2026-09-26

## Restore front

Nenhuma. Esta decisão é definitiva, não uma contenção transitória.

## Contexto

A issue [`#426`](https://github.com/5906375/EIAH/issues/426) (`INC-P0-CHANGE-CONTROL-P1-P2-2026-08-14`, aberta em 2026-08-14) registrou que a branch `main` exige pull request e checks obrigatórios, mas não exige aprovação humana, porque o repositório tem apenas um colaborador humano elegível com `write`/`admin` — o mesmo autor habitual dos PRs. A issue listou, entre a "Sequência de remediação" (item 1) e os "Critérios de encerramento" (primeiro item), a possibilidade de cadastrar um segundo revisor humano independente como caminho de remediação, e registrou como "Decisões humanas pendentes" a identidade desse revisor e se seriam um ou dois.

Nenhum outro documento versionado do repositório exige revisor independente para merge de PR. Confirmado por busca direcionada (2026-09-26) em `IA_EIAH.md`, `AGENTS.md`, `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`, `docs/ops/open-fronts.md` e em todas as sete ADRs existentes (`ADR-001` a `ADR-007`): zero ocorrência de "revisor independente", "segundo revisor" ou equivalente fora da própria issue #426. A exigência nunca foi ratificada nem implementada em nenhum lugar além da issue.

Estado do ruleset `main-protection-hard-gates` (ID `13498700`), capturado ao vivo em 2026-09-26 por leitura somente-leitura da API do GitHub:

| Campo | Valor observado |
| --- | --- |
| `enforcement` | `active` |
| `bypass_actors` | `[]` (vazio) |
| `required_approving_review_count` | `0` |
| Contexts obrigatórios | 19 |
| `target` / `conditions.ref_name.include` | `branch` / `~DEFAULT_BRANCH` |

Este snapshot confirma que os fatos descritos na issue #426 continuam verdadeiros hoje: nenhuma aprovação humana é exigida pela plataforma, e essa configuração não foi alterada por esta decisão nem por nenhuma outra ação registrada entre 2026-08-14 e 2026-09-26.

Esta ADR não redefine nem contradiz o [`ADR-007`](./ADR-007-temporary-required-gate-relocation-p1-p2.md) (relocação temporária de `P1ReconciliationRecurring`/`P2HighGlobalCoverage`) — são dimensões distintas do mesmo incidente (#426): ADR-007 trata da confiabilidade dos gates de recorrência; esta ADR trata exclusivamente do modelo de revisão humana. Também não altera a decisão, separada e de mecanismo diferente, registrada em `docs/ops/ape-audit-telemetry-decision.md` §4.1 sobre um segundo reviewer nos GitHub Environments de release (`release-api`, `release-cli`, `release-workers`) — aquele reviewer aprova publicação de artefato via Environment protection rule, não revisão de PR via branch ruleset; são superfícies de governança diferentes e esta ADR não as unifica nem as substitui.

## Decisão

Carlos Alberto Merlo é o único proprietário, administrador e revisor elegível do repositório `5906375/EIAH`. Este modelo é **definitivo**, não uma contenção temporária até que um segundo revisor seja recrutado. A exigência de um segundo revisor humano independente, tal como aventada na issue #426, é **descartada como condição de merge** — não será proposta nem exigida novamente como pré-requisito de fechamento daquela issue ou de qualquer PR futuro.

Esta decisão **não altera** a configuração remota do ruleset. `required_approving_review_count` permanece `0` na plataforma. Nenhuma chamada de escrita à API do GitHub foi feita para produzir ou registrar esta ADR. Se algum dia a configuração do ruleset precisar refletir explicitamente este modelo (por exemplo, formalizando que o próprio administrador aprova conforme o procedimento abaixo), essa é uma operação administrativa distinta, fora do escopo desta tarefa, que exigirá seu próprio snapshot remoto anterior/posterior — no mesmo padrão de rigor já exigido pelo `ADR-007` §9 para mutações de ruleset.

## Procedimento de aprovação pelo administrador único

Como o próprio Carlos Alberto Merlo autora a esmagadora maioria dos PRs, e o GitHub não permite autoaprovação pelo mecanismo padrão de review (`gh pr review --approve` falha com `Can not approve your own pull request` — comportamento já observado e documentado nesta mesma cadeia de trabalho, por exemplo nas tentativas de aprovação dos PRs #450, #451, #453), a decisão de merge do administrador único se exerce por um destes dois caminhos, nunca por aprovação formal de terceiro:

1. **Merge normal**, quando todos os required checks estão verdes — a decisão do administrador é o próprio ato de mesclar, sem necessidade de registro adicional além do histórico de commits do PR.
2. **Merge via `--admin`**, quando um required check está vermelho por um motivo já conhecido, documentado e confirmado como não relacionado ao conteúdo do PR sendo mesclado — sujeito ao registro rastreável descrito a seguir.

Nenhum dos dois caminhos jamais significa que um check vermelho passou a ser tratado como aprovado, correto, ou saudável.

## Registro rastreável do uso de `--admin`

Todo merge que use `gh pr merge --admin` (ou operação equivalente que ignore um required check reprovado) deve ser acompanhado, no próprio PR, de um comentário — publicado antes ou imediatamente depois do merge — que registre, no mínimo:

1. **qual(is) check(s)** estavam vermelhos no momento do merge;
2. a **causa raiz conhecida** desse check, com referência ao PR/issue/investigação que a estabeleceu (nunca uma alegação sem fonte);
3. a **confirmação explícita** de que a falha é alheia ao conteúdo do PR sendo mesclado;
4. o **decisor** (Carlos Alberto Merlo) e a **data**.

Este formato já tem precedente real, produzido nesta mesma sessão de trabalho, antes desta ADR existir: o comentário no PR #453 ([`#issuecomment-5844787334`](https://github.com/5906375/EIAH/pull/453#issuecomment-5844787334), 2026-09-25) documenta exatamente essas quatro informações para o bypass de `P1ReconciliationRecurring` naquele merge. Esta ADR **formaliza esse padrão já exercido como o mínimo exigido daqui para frente** — não introduz um mecanismo novo, hipotético ou ainda não testado.

**Uso de `--admin` registrado desta forma nunca constitui:**
- aprovação automática ou retroativa de um check reprovado;
- prova de que o código do PR está correto quanto à propriedade que aquele check mede;
- substituto da semântica de required check estabelecida no [`ADR-004`](./ADR-004-required-check-blocking-semantics.md) — um required check vermelho continua sendo, por padrão, presumido correto (ADR-004 §"Manter `continue-on-error`..."); o bypass documentado é uma exceção pontual e rastreável a essa presunção, feita pelo único responsável accountable pelo repositório, nunca um apagamento silencioso do sinal.

## Ajuste aos critérios da issue #426

Dos "Critérios de encerramento" originais da issue #426, os dois que dependiam de um segundo revisor ("Existe revisor humano independente elegível" e "Ruleset exige ao menos uma aprovação") são **substituídos** por esta ADR: passam a se considerar satisfeitos pelo modelo de administrador único aqui ratificado, não pela existência de um segundo revisor. Os demais critérios — todos referentes à proveniência e medição real de P1/P2 (três ciclos válidos, `auditGap`/`duplicateSideEffects` medidos e não literais, distinção entre tentativa falha e último sucesso, restauração governada dos gates) — **não são afetados por esta ADR** e permanecem tal como estavam, não atendidos, na issue.

## O que esta decisão não faz

- Não altera o ruleset do GitHub (`required_approving_review_count` permanece `0` na plataforma; nenhuma chamada de escrita foi feita nesta tarefa).
- Não fecha a issue #426 — os critérios de proveniência/medição de P1 e P2 continuam abertos.
- Não autoriza usar `--admin` para contornar falha relacionada ao próprio conteúdo do PR sendo mesclado.
- Não altera o `ADR-007` nem a decisão de segundo reviewer para GitHub Environments de release em `docs/ops/ape-audit-telemetry-decision.md` §4.1 — mecanismos distintos, fora do escopo desta ADR.
- Não executa merge, deploy, alteração de branch protection ou uso de `--admin`.

## Ratificação

> Ratifico o modelo de administrador único como definitivo para revisão de pull requests neste repositório — não uma contenção transitória até um segundo revisor ser recrutado — e o procedimento de registro rastreável do uso de `--admin` descrito acima como o mínimo exigido para todo bypass futuro de required check.
>
> — Carlos Alberto Merlo, data: `2026-09-26`
