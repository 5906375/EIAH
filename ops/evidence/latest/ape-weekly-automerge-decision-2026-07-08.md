# Auto-merge da PR de evidência APE — decisão D23 ratificada pelo CEO (2026-07-08)

## Decisão

D23, ratificada pelo CEO em 2026-07-08: a PR automática de renovação de evidência APE
(`.github/workflows/ape-weekly.yml`, step `Create PR with renewed APE evidence`,
`peter-evans/create-pull-request@v7`) ganha auto-merge nativo do GitHub, condicionado, para que o
padrão "PR do bot apodrece sem merge" (causa raiz N-20) não se repita.

## Motivo — N-20, falhou 2x

Evidenciado em sessão anterior (`ops/evidence/latest/ape-weekly-cycle-run41-2026-07-08.md` e
diagnóstico correlato): o workflow rodou com sucesso em 2026-06-29 (branch
`bot/ape-weekly-evidence-28380235280`, confirmada via `git log -1 --format=%ci`), mas a PR nunca
foi mergeada por um humano. Por usar `branch: bot/ape-weekly-evidence-${{ github.run_id }}` (sufixo
único por execução), cada run gera uma branch/PR **nova**, nunca atualiza uma existente — a de
29/06 ficou parada, e por volta de 10 dias depois (quando alguém eventualmente olharia) já estava
tão desatualizada em relação a `main` que mergeá-la teria apagado ~17 mil linhas de trabalho
legítimo. run38/39/40 (evidência anterior a essa) também não vieram do bot — foram commitadas
manualmente dentro de uma PR não relacionada (#151). Ou seja: o mecanismo automático já falhou em
produzir uma evidência mergeada duas vezes seguidas, por dois motivos diferentes (PR nunca
revisada; branch por run_id acumulando).

## O que muda

1. **Branch fixa** (`bot/ape-weekly-evidence`, sem sufixo `run_id`): `peter-evans/create-pull-request@v7`,
   ao receber um nome de branch fixo, atualiza a mesma branch/PR a cada execução em vez de criar
   uma nova — se já existe uma PR aberta para essa branch, a action adiciona um novo commit a ela
   em vez de abrir uma segunda PR. Isso elimina o acúmulo de PRs stale como a `-28380235280`.
   `delete-branch: true` (já existente) garante que a branch é removida assim que a PR é
   mergeada/fechada, deixando o nome livre para a próxima semana.
2. **Novo step `Guard evidence-only diff and enable auto-merge`**, condicionado a
   `steps.create-evidence-pr.outputs.pull-request-number != ''` (só roda se a action de fato criou/
   atualizou uma PR — ela não cria PR quando não há diff, então uma semana sem nada novo não aciona
   nada).
3. Dentro do step: (a) lista os arquivos alterados via `gh pr diff "$PR_NUMBER" --name-only`; (b)
   se **qualquer** arquivo fora de `ops/evidence/latest/**` ou `docs/EVIDENCE_INDEX.md` aparecer, o
   step falha explicitamente (`exit 1`) com a lista dos paths ofensivos, e o auto-merge **não** é
   habilitado; (c) revalida `pnpm check:evidence-index` explicitamente dentro do próprio step,
   como segunda camada de segurança além do step "Evidence index" já existente mais acima no job
   (que já bloquearia o job inteiro se falhasse — a revalidação aqui é redundância deliberada, não
   dependência única); (d) só então `gh pr merge "$PR_NUMBER" --auto --squash`.

## O que NÃO muda

- Nenhum limiar, script de check ou lógica de decisão GO/NO_GO do ciclo APE foi alterado.
- O conteúdo do corpo/título da PR não mudou.
- `check:evidence-index` continua sendo a mesma checagem, sem alteração de código.

## Permissões necessárias

O workflow já declara `permissions: { contents: write, pull-requests: write }` no nível do job
(`.github/workflows/ape-weekly.yml:26-28`, pré-existente, não alterado). Isso é suficiente para:
- `peter-evans/create-pull-request@v7` criar/atualizar branch e PR (`contents: write`,
  `pull-requests: write`);
- `gh pr merge --auto` habilitar auto-merge via API do GitHub (`pull-requests: write`).

Não foi necessário adicionar nenhum escopo de permissão novo.

**Ressalva de honestidade**: não tenho acesso a uma execução real do GitHub Actions nesta sessão
(sandbox local, sem API do GitHub) para confirmar empiricamente que o token com essas permissões
consegue de fato chamar `gh pr merge --auto` neste repositório específico. A suficiência dessas
permissões é **documentada** (comportamento padrão da API do GitHub para esse escopo), não
**testada em runtime real** — recomenda-se observar a primeira execução real do workflow após o
merge desta PR para confirmar.

## Comportamento com branch protection

Auto-merge nativo do GitHub (`gh pr merge --auto`, equivalente ao toggle "Enable auto-merge" na
UI) é, por design da própria plataforma, um agendamento condicional: a PR só é efetivamente
mergeada depois que **todos os required status checks** configurados na branch protection de
`main` passarem — não é um bypass. Isso é comportamento documentado do GitHub, não uma escolha
deste workflow.

**Ressalva**: a configuração atual de branch protection de `main` (quais checks são
"required") não é visível a partir do repositório local — é uma configuração do GitHub, fora do
alcance desta sessão (mesma limitação já registrada em sessões anteriores sobre
`ops/evidence/latest/branch-protection-smoke-2026-03-04.md`, desatualizado). Se a branch protection
não tiver required checks configurados, `gh pr merge --auto` mergeria assim que a Combinação de
checks do PR terminar de rodar, sem esperar por nada adicional — a guarda de path/evidence-index
dentro do próprio step continua valendo independentemente disso, mas a camada extra de proteção do
GitHub (esperar required checks) depende de uma configuração que não pude confirmar aqui.

## Validação

`.github/workflows/ape-weekly.yml` parseado com sucesso via `yaml.safe_load` (Python/PyYAML,
`actionlint` indisponível neste ambiente): 17 steps, `id: create-evidence-pr` presente no step de
criação da PR, `if: steps.create-evidence-pr.outputs.pull-request-number != ''` presente no novo
step, `permissions` inalterado e já suficiente. `pnpm check:evidence-index` → `ok:true` após
indexação deste artefato.

## Status

Implementação do workflow: **evidenciado** (YAML válido, lógica de guarda revisada linha a linha).
Comportamento real em produção (branch fixa reaproveitando PR, auto-merge respeitando required
checks, suficiência de permissões): **proposta/inferência documentada** — não executável nem
verificável dentro desta sessão local; precisa de observação na primeira execução real após merge.
