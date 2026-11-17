# Plano vigente — publicação da correção do registry IMOB

Preparação de 2026-11-17 por Codex, sem subagentes. **Seleção final para stage/commit local autorizados.** A preparação original não
executou stage; a seleção posterior de 21 caminhos foi bloqueada por whitespace.
A retomada delimitada abaixo resolve somente esse formato, sem push, PR ou deploy.
Esta seção substitui as seleções antigas de 40/71/29/39 caminhos. O conteúdo anterior
deste mesmo arquivo permanece integralmente após o marcador de histórico, sem
validade executável para esta correção. Não se criou plano, diretório, manifesto ou mecanismo paralelo. A única
preservação adicional é o gzip bruto autorizado, pelo mecanismo existente.

## Base conferida e condição de integração

- Branch: `chore/imob-intake-provider-diagnostics`.
- HEAD: `97c23a9bca690f5cd6b0fdc909c7359ed4ea25d6`; stage vazio na preparação original.
- Referência local `origin/main`: `f6617e1f2ded9ac0d5c8b0c1336b450b3de6d999`.
- `main` local: `249d6a5fec6684d5bc6fcfa4448dd79ee2e5c9c9`, antiga.
- `git merge-base HEAD origin/main` é HEAD; `git rev-list --left-right --count origin/main...HEAD`
  retornou `7 0`. Os sete commits do lado de origin/main são merges #533–#539.
- HEAD e origin/main têm **a mesma árvore**:
  `c7790ac84d01b1869b1c4604c0e5757f90ee39a9`; diff de conteúdo vazio, exit 0.
  Os incrementos de contexto, conversa guiada, propagação e instrumentação anteriores
  já pertencem à main representada por essa referência local.
- `git rev-list --left-right --count main...HEAD` retornou `0 72`;
  `git diff --name-only main HEAD` contém 796 caminhos. **Bloqueio para usar essa
  main local como base da seleção/integração.** Ela não representa o alvo observado.
- Para esta revisão, comparar exclusivamente com origin/main no SHA acima. Não há
  divergência de conteúdo nem dependência de fonte de produção não publicada fora
  da linha de splitting contra esse alvo. A referência remota foi revalidada pelo
  fetch autorizado descrito abaixo e permaneceu no mesmo SHA. Nenhum checkout,
  reset, rebase, merge ou atualização da branch local foi executado. Se o alvo
  mudar antes de futura integração, conferir o alcance afetado antes de agir.

### Revalidação remota autorizada — 2026-11-17

Comando executado uma vez: `git -c maintenance.auto=false -c gc.auto=0 fetch --no-tags --no-recurse-submodules origin`,
exit 0; refspec `+refs/heads/*:refs/remotes/origin/*` e FETCH_HEAD confirmam main em
`f6617e1f2ded9ac0d5c8b0c1336b450b3de6d999`; HEAD, branch e stage não mudaram.
Consulta posterior: `git diff --name-status HEAD origin/main` vazio, exit 0;
árvores idênticas e contagem `7 0` preservada. Não há diferença remota de produção.

Leitura de `origin/main:packages/core/tsup.config.ts`: **splitting:false**.
O hunk de uma linha continua necessário. Os 18 artefatos continuam ausentes no
remoto, com bytes/hashes iguais à tabela; os nove blocos do registry no índice
e o prefixo deste plano também continuam ausentes. **Os 21 caminhos permanecem
necessários**, sem duplicação ou nova dependência de produção identificada.
O hunk do índice segue `@@ -6,0 +7,54 @@`; somente o tamanho do prefixo deste
plano mudou para registrar o fetch e deve ser conferido na seleção futura.

Conferência antes de editar este registro: 28 arquivos locais intactos e hash do
conteúdo do stage inalterado, exit 0. Nenhuma evidência de execução foi invalidada
pelo fetch; não se repetiram builds, smokes, Docker ou chamadas de provider.
Não há conflito de conteúdo observável com o alvo idêntico nem entradas unmerged;
isso não é execução de merge nem aprovação antecipada de hooks/CI. O bloqueio
de usar main local antiga permanece. Nesta retomada, somente este plano recebeu
o registro necessário da nova verificação; Evidence Index e evidências ficam intactos.

Procedimento mínimo posterior, **somente após autorização própria**: selecionar os
mesmos 20 caminhos explícitos e um hunk do índice; conferir bytes staged, exclusões
e hooks normais; criar um commit na branch atual; depois, sob autorização de push/PR,
abrir PR contra main e conferir seu diff/checks reais. Não é necessário atualizar
esta branch para corrigir divergência de conteúdo, pois ela não existe neste alvo.
Nenhuma dessas ações foi executada. Typecheck focal anterior reprovado e fluxo
real de 2 quartos/1 vaga não aprovado continuam preservados.

O diff rastreado inicial contra HEAD/origin/main tinha somente CLAUDE.md, CODEX.md,
Evidence Index e tsup do core. Os dois primeiros são alterações preexistentes
excluídas. `changes.diff` também permanece local/excluído. O pacote abaixo contém
18 arquivos novos, ausentes em origin/main; todos já existiam antes desta preparação.

## Seleção exata final — 22 caminhos

| Grupo | Caminhos / hunk incluído | Quantidade |
| --- | --- | --- |
| Produção | `packages/core/tsup.config.ts`, somente linha 28: `splitting: false` → `splitting: true` | 1 |
| Evidências | Os 19 nomes da tabela abaixo; 18 anteriores e um gzip bruto. Somente o log indicado foi normalizado, com rastreabilidade; README/JSON atualizados | 19 |
| Índice | `docs/EVIDENCE_INDEX.md`, somente hunk `@@ -6,0 +7,60 @@` contra origin/main, incluindo o registro real da normalização | 1 |
| Preparação | Este `stage-commit-plan.md`: somente o novo prefixo até o marcador de histórico | 1 |

**Único delta de produção confirmado:** blob-base
`7b4beb0cba28fa8fae82594fb624320460cb1c2f`; SHA-256 do arquivo corrigido
`2e7a9d9a80222a4b38330afc30f86eebc6e8e2ca01d7ade6410980c58cd0196b`.
Diff sem contexto: `@@ -28 +28 @@`, uma remoção e uma adição. Nenhuma alteração
de API/engine/launcher, contrato, provider, modelo, retry, fallback, filas, finanças,
Dockerfile, manifests, exports, lockfile, CI ou infraestrutura integra esta correção.

Raiz das 19 evidências da seleção final:
`ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/`.

| Nome relativo — incluir integralmente | Bytes | SHA-256 dos bytes revisados |
| --- | --- | --- |
| `README.md` | 62125 | `ee76f389837b1dc2ce6a7c3c08f54766b53b5763788f1d7aae1e3a4661522162` |
| `check.mjs` | 14195 | `36285bb1f8d69e39978f810df33ec9c59e5c87bd4c9ad86fe767a2e54ee28637` |
| `consumer-packaging-check.mjs` | 15017 | `7da4e53bb2ccd5ddec1360e0da0d097ffdbdeeca7f7b7ed654ed15d737e6a01e` |
| `consumer-packaging-results.json` | 97259 | `a9babe523c468d98f08def4f3c136ec6318267d7f88688bedfc4903a765997e6` |
| `corrected-image-build.txt` | 58763 | `69980ea658d36e4170c165b9e3fab4d17610864b967b88854be55846a7b17a7e` |
| `corrected-image-build.txt.gz` | 10154 | `25369a4d6bd1d220350a6c826e8d493e3d90df8f3f0f7f585a77e28ef0ec1741` |
| `corrected-image-validation.json` | 401533 | `73e75ae9e89bc99b878728e35b3905722b3270bd258fe115b6bbfd53cc3b125e` |
| `correction-api-build.txt` | 713 | `6c63df1dbc2ea8c18422be5e12e909d1549b8e2df719c552afa5fea6ca54b0f1` |
| `correction-core-build.txt` | 29458 | `61f26e2cbd3d59f1ffd3d7a1c8c998a84f5ad7773c3a5292708f82d15f196c04` |
| `correction-executions.json` | 6211 | `a9d8c61d45d6ec1166db922341793c8a6e77ae189cef266b32ea24b5366832cd` |
| `correction-results.json` | 16408 | `2a429c470ba90b3487023fdc59a14cd6a4229e40cbd05a31771b871c9c99ea86` |
| `delivery-executions.json` | 8125 | `67efb856eee19748c62afdcc4717db17149c172e43c2d6b90f1e41280b4b7041` |
| `docker-connection-diagnostic.json` | 10884 | `3d5904e23b7f54a508c25ba9b419c396f5a6b8b7a4fb94a426f1cfbd3ce51f91` |
| `docker-image-validation.json` | 20761 | `affa5e2bbb74cded877dcba8d51b7c7664ee6c893db280150c76f1c2daf0332a` |
| `harness-initial.json` | 670 | `31bc481f25238b97e9cc883043cf844bf15d4cc32806ff70c4edab7e9541dcbe` |
| `image-packaging-validation.py` | 18113 | `1a422974eee76c414e43ace70dd0e41578e297af379da4a3effd2b26a11ce055` |
| `results.json` | 6683 | `01ff5bb6d525fd2265f693d659226dac1b3a18465efe628e22de3cdced1e0d73` |
| `staging-delivery-path-review.json` | 15193 | `7668be8308b5b34f1a1e99d84c3bd57a2cfc928306996f17b547402d56109936` |
| `verification.json` | 6059 | `dcf496889ffb9bfac6c8151928bb6ad738e2394fa703c5c3eae34b893b308daa` |

Os 18 caminhos anteriores e o gzip adicional foram conferidos por
`git check-ignore -v`: exit 1, não ignorados. Sem adição forçada. Somente
corrected-image-build.txt recebe a normalização autorizada abaixo; os demais logs
continuam intactos. O gzip conserva integralmente a transcrição original.

## Hunk exato do Evidence Index e hunk deste plano

Base do índice em HEAD e origin/main:
`fc44ad11406b60e00462fc6bbcd4d094f7ba8cae`. Incluir somente a inserção de 60 linhas,
linhas 7–66 do working tree preparado, antes de “Avaliação gratuita IMOB”:

| Linhas atuais | Bloco incluído |
| --- | --- |
| 7–12 | Identidade do registry compilado — reprodução histórica |
| 13–18 | Correção local do registry compilado |
| 19–24 | Consumidores compilados e entrega local |
| 25–30 | Diagnóstico da conexão Docker — histórico |
| 31–36 | Imagem antiga/base runtime — histórico |
| 37–42 | Caminho efetivo de entrega da API staging |
| 43–48 | Build oficial da imagem corrigida — resultado inicial preservado |
| 49–54 | Inspeção e smoke da imagem corrigida — resultado posterior aprovado |
| 55–60 | Conferência histórica da seleção inicial de 21 caminhos, sem stage |
| 61–66 | Preservação bruta e normalização documental efetivamente executadas |

As oito primeiras entradas e a nona conferência inicial são históricas. A décima
registra somente a preservação/normalização efetivamente executada, sem antecipar
commit ou publicação. Nenhum outro hunk do índice pertence a esta seleção.
SHA-256 do patch exato obtido com
`git diff --unified=0 origin/main -- docs/EVIDENCE_INDEX.md`:
`8a6151bf008c8ab3cccc023a10410cd14f9741cb9feed77dd2653012118313c0`.
SHA-256 do índice completo preparado:
`e6e79a2ee44d16530d27343fcf5f567d3b66959aa3a606d35cca90c5a644cada`.

Neste plano, incluir a adição do novo prefixo; nenhum byte do conteúdo anterior
deve ser removido ou reescrito. SHA-256 do conteúdo anterior inteiro, preservado
após o marcador:
`613b939a6029a177ef6ee15bf5e189e0e00b2398f4e198bc5460bc0922812345`.
O plano é sua própria lista canônica; não existe manifesto separado nem hash
autorreferente do arquivo final.

## Exclusões explícitas e material já integrado

- `CLAUDE.md`, SHA-256 `66c82eb6465ab1b5c6d3c5142b591f8b5a6ee82b4840e4b4a74c578fdc2e5f37`;
  `CODEX.md`, SHA-256 `2cad8b66e0cb2d35eb71308cbc8d3b10c3ba031ef7a18ac72622ab0ccf179525`:
  preservar as alterações locais; **zero hunks selecionados**.
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/changes.diff`,
  SHA-256 `4f30ca206258285db9b05914ea2d8943185b2a61ac52267f8359765abb450ac2`:
  original local; não selecionar, comprimir, copiar ou remover.
- Todo código/teste/documentação das seleções antigas deste plano que não esteja
  entre os 21 caminhos acima: já integrado em origin/main ou fora deste incremento.
  Não reaplicar instrumentação, propagação de falhas, conversa guiada ou seus
  contratos. Não executar comandos antigos, mesmo que seus títulos digam “vigente”.
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/package-smoke.mjs`,
  a fixture `packages/providers/tests/fixtures/openai-credit-balance-exhausted.json`
  e todo o pacote pai intake-observability: dependências históricas já em origin/main,
  sem diff; reutilizar, não readicionar. O mesmo vale para Dockerfile, manifests,
  tsup da API, schemas e scripts de build já versionados.
- Demais hunks presentes ou futuros do Evidence Index; diretórios inteiros,
  curingas, `git add .`, `-A`, `-N`, .gitignore novo e adição forçada genérica.
- Dist/node_modules/caches, binários/imagens Docker, ambientes, credenciais,
  temporários, logs locais de outros pacotes e arquivos não enumerados.
  A imagem e seus caches continuam preservados localmente, fora da seleção Git.

## Dependências das evidências e limites de reprodução

| Prova/consumidor | Dependências selecionadas ou já publicadas | Limite |
| --- | --- | --- |
| README e dez blocos do índice | Todos os 19 arquivos selecionados; este plano; referências históricas do pacote pai já em origin/main | Entradas anteriores de daemon/base/recusa não descrevem o resultado final da imagem |
| Diagnóstico original | results.json, harness-initial.json, verification.json e check.mjs | Histórico 1/3 aprovado, exit 1; manter a falha e a adaptação posterior sem simular reexecução antiga |
| Correção no host | correction-results.json, correction-executions.json, dois correction-*-build.txt, check.mjs | Provas locais existentes, saídas compiladas ignoradas e hashes históricos; não executar aqui |
| Consumidores no host | consumer-packaging-check.mjs, consumer-packaging-results.json, delivery-executions.json, correção anterior | Reutiliza package-smoke e fixture já em origin/main |
| Preflight e receita efetiva | docker-connection-diagnostic.json, docker-image-validation.json, staging-delivery-path-review.json | Metadados permitidos e histórico, não equivalência com Render atual |
| Build e smoke na imagem | corrected-image-build.txt normalizado, seu bruto em corrected-image-build.txt.gz, corrected-image-validation.json, image-packaging-validation.py e os harnesses/JSON selecionados | Controlador adapta os helpers somente na camada do container e registra a limpeza |

Os smokes originais do host **não são gates portáveis de checkout limpo**:
check.mjs lê CLAUDE.md, CODEX.md e changes.diff locais e os compara ao snapshot
histórico; consumer-packaging-check.mjs confere os hashes dos dist daquele momento.
Esses arquivos/outputs excluídos são pré-condições da execução histórica, não novas
dependências de produção nem justificativa para incluí-los no commit.

O controlador de imagem lê os harnesses como texto, remove as verificações de
arquivos protegidos do host e omite manifests CLI/workers ausentes da entrega.
Usa só os módulos compilados da imagem, sem dist/node_modules do host.
Sua execução aprovada comprova esse alcance sem depender de publicar as alterações
locais das instruções ou changes.diff. Fixtures de fonte do executor/receita servem
apenas à comparação; o trecho do executor é extraído do bundle sem alteração.

`image-packaging-validation.py` é um helper de evidência vinculado ao ID da imagem
local registrada, não um gate genérico de CI para qualquer novo build. Uma imagem
reconstruída pode ter outro ID; retarget/revisão de qualquer ensaio futuro exige
verificar sua procedência, sem alegar que o ID histórico certifica outro artefato.
A imagem em si não integra a publicação Git. Caminhos de dist, hashes documentais
anteriores, arquivos locais excluídos e IDs de containers removidos nos JSONs são
proveniência histórica; não exigir sua inclusão para fechar a seleção.

## Privacidade — revisão focal anterior, sem expor conteúdo

Leitura dos 18 artefatos (781.511 bytes), exit 0: padrões de chaves de provider,
tokens GitHub, chaves AWS, private keys, JWTs, Bearer e URLs com credenciais
não tiveram ocorrência de alta confiança. Uma atribuição literal em check.mjs:167
foi classificada como fixture sintética; seu valor não é transcrito neste plano.
Não há campos estruturados de prompt/mensagens/rascunho/resposta bruta nos JSONs
revisados. Fontes dos harnesses usam somente entradas/saídas sintéticas.

Logs selecionados, stdout/stderr serializados e narrativa foram conferidos no
alcance dos registros existentes. Há caminhos locais, hashes, correlações e IDs
de serviço/imagem/container como metadados de procedência já permitidos, sem
credenciais ou valores de ambiente reais. Esses bytes são preservados por seus
hashes; não se criaram cópias “sanitizadas” ou outro diretório. Não é auditoria
exaustiva de segredos. Nenhuma conversa, ambiente ou credencial foi consultada
para executar esta revisão. Conferir novamente os **bytes staged**, se e quando
houver autorização, porque o working tree não substitui essa conferência.

## Validações reaproveitadas — não reexecutadas nesta preparação

| Validação | Resultado | Exit histórico | Exec./aprov./reprov./ignor. | Alcance |
| --- | --- | --- | --- | --- |
| Registry compilado no host | APROVADO | 0 | 5/5/0/0 | Mesmo objeto registrado, resolvido e invocado por dublê |
| Consumidores compilados no host | APROVADO | 0 | 7/7/0/0 | Grafo amplo estático e folhas seguras |
| Builds oficiais core/API no host | APROVADO | 0 | — | Build formal, sem homologação geral |
| Build Docker oficial | APROVADO | 0 | — | apps/api/Dockerfile.prod, contexto raiz, árvore com splitting=true |
| Inspeção da imagem parada | APROVADO | 0 | — | Artefatos/exports/links/chunks presentes, sem executar a aplicação |
| Registry na imagem | APROVADO | 0 | 5/5/0/0 | Trecho emitido do executor em VM e imports reais do core |
| Consumidores na imagem | APROVADO | 0 | 7/7/0/0 | 25 entradas, 104 módulos, 78 chunks, 250 arestas e 169 bindings |
| Limpeza do container próprio | APROVADO | 0 | — | Finally, imagem/cache preservados |
| Typecheck focal anterior | REPROVADO | 1 | — | Dois diagnósticos focais antigos +16 de dependências; build API não substitui esse resultado |
| Provider real, API completa, browser/HTTP/DB, staging e fluxo funcional | NÃO EXECUTADO/aprovado | — | — | Nenhum teste real de provider está aprovado |

Imagem registrada:
`sha256:f1828dc119705930e8b9ef16edf7592948a4e394a64aad1edec0f0624c47f720`,
linux/amd64, tag local exclusiva. As provas do host e da imagem são execuções
distintas já concluídas, reutilizadas sem repetir builds, smokes ou comandos Docker.
API/barrels/workers/bancos/filas não foram iniciados; transportes sintéticos,
zero chamadas reais. O fluxo real de 2 quartos/1 vaga permanece **NÃO APROVADO**.
Não há equivalência integral com Render, homologação geral do core ou aprovação
de CI remoto/staging. Não reabrir P1ReconciliationRecurring nem contornar gates.

## Lista canônica de stage — referência para a seleção final

Stage/commit local estão autorizados nesta retomada. A lista completa abaixo tem
**21 caminhos explícitos**, mais **um hunk** do índice: 22 caminhos. Ela é referência
canônica, não instrução para repetir o stage dos caminhos já corretos. A seleção
inicial de 20 mais o hunk já foi executada; só os seis ajustes delimitados abaixo
precisam de atualização seletiva, sem reaplicar seleções históricas:

```bash
git add -- \
  'packages/core/tsup.config.ts' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/stage-commit-plan.md' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/README.md' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/check.mjs' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/consumer-packaging-check.mjs' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/consumer-packaging-results.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/corrected-image-build.txt' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/corrected-image-build.txt.gz' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/corrected-image-validation.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/correction-api-build.txt' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/correction-core-build.txt' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/correction-executions.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/correction-results.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/delivery-executions.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/docker-connection-diagnostic.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/docker-image-validation.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/harness-initial.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/image-packaging-validation.py' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/results.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/staging-delivery-path-review.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/verification.json'
git add -p -- docs/EVIDENCE_INDEX.md
```

Na seleção interativa do índice, aceitar somente o hunk descrito (`+7,60` sem
contexto ou seu equivalente com contexto); se o Git apresentar outras alterações
misturadas, parar e revisar uma seleção exata antes de prosseguir. Não incluir
CLAUDE.md/CODEX.md/changes.diff para facilitar execução de helper local.

Após atualizar o stage autorizado: comparar a lista staged com estes 22 caminhos,
conferir SHA-256 dos 19 arquivos e do tsup corrigido nos bytes de `git show :<path>`,
e comparar o patch staged do índice com o hunk revisado. Neste plano, comparar o
novo prefixo revisado e preservar o histórico byte a byte. Verificar referências
pelos bytes staged + base versionada, respeitando a distinção entre dependências
da entrega e campos históricos. Exigir `git diff --cached --check` aprovado e
zero caminhos extras, sem usar o working tree como substituto dos bytes staged.
Stage vazio nesta preparação não é aprovação antecipada dessas verificações.

## Proposta de título e descrição do commit/PR contra main

Título:

```text
fix(core): share LLM registry across compiled ESM entries
```

Descrição proposta:

```text
Enable splitting in the core ESM build so executor registration, router
resolution and runCompletion share the same registry and provider object.

The production change is one configuration line. The existing API Docker
recipe already copies the complete packages tree, including shared chunks.

Local synthetic checks passed on host and in the officially built image:
registry 5/5 and consumers 7/7 in each environment. The image inspection
and isolated smoke cover 25 public entries, 104 modules, 78 chunks,
250 relative edges and shared error identities. Evidence and the exact
publication selection preserve historical failures and coverage limits.

The emitted API executor excerpt runs in a VM with explicit doubles;
only reviewed compiled leaf modules execute in the image. The full API,
workers, databases and queues are not started. No real provider call or
paid request is part of this validation.

The previous focal typecheck remains failed with pre-existing diagnostics.
This does not approve staging, the full core/API, or the real property
capture proposal/confirmation/guidance/explicit-save flow.
```

## Sequência posterior e verificação — ainda não executadas

1. Revisar estes 21 caminhos/hunks e os limites de privacidade/reprodução. Revalidar
   o alvo main efetivo em etapa autorizada; se houver mudança relevante ou dependência
   nova não publicada, informar o bloqueio antes de propor integração. Não usar a
   main local antiga, não reaplicar as seleções históricas e não atualizar a branch
   automaticamente. No alvo origin/main observado não falta fonte de produção.
2. Stage/commit local já autorizados: conferir os bytes staged e executar
   o fluxo normal com hooks/gates aplicáveis, sem `--no-verify`, supressões ou mudança
   de critérios para obter verde. Falha de hook/check bloqueia a sequência e deve
   ser registrada, preservando a ressalva do typecheck focal.
3. Após o commit local e somente com autorização de publicação, publicar a branch/PR
   com destino main e descrição acima. Conferir o diff efetivo da PR para estes
   caminhos/hunks; resultados locais não aprovam automaticamente checks remotos.
   Nenhum push, PR ou merge está autorizado nesta preparação.
4. Conferir resultados reais do CI e o SHA candidato, sem repetir manualmente
   builds/smokes válidos só para produzir evidência. Mudança de fonte/artefato ou
   falha concreta exige reavaliar apenas o alcance afetado.
5. Publicação de imagem/deploy é outra autorização. Antes de eventual entrega,
   conferir a receita efetiva, revisão e procedência do artefato; depois, sua
   cadeia de chunks e isolamento sintético no alcance autorizado. Não executar
   pre-deploy Prisma, migrações, seeds, serviços ou providers como efeito desta
   preparação. Um deploy nunca é inferido da aprovação do empacotamento local.
6. Teste real de provider e fluxo funcional exigem autorização separada e evidência
   própria. Proposta de quartos/vaga, confirmação antes de aplicar, orientação e
   salvamento apenas explícito permanecem pendentes, sem promessas de aprovação.

## Conferências desta preparação e preservação

Na preparação original, executados somente Git local, leituras/JSON, hashes,
classificação focal de conteúdo e atualização deste plano/entrada real do índice.
A retomada de fetch acrescentou somente sua revalidação descrita acima. Leituras
de Git e comparação de árvores/diffs: exit 0. O rg pela referência deste plano
no índice inicial retornou exit 1 por ausência, não por falha do produto; a entrada
adicionada agora corresponde à conferência real, não à publicação futura.
Cada check-ignore dos 18 novos arquivos retornou exit 1 (não ignorado); cat-file
de cada um em origin/main retornou 128 (novo). Nenhum destes é teste do produto.

A tabela atual ancora as 19 evidências finais; os hashes anteriores alterados
pelo ajuste documental estão distinguidos na seção de normalização abaixo.
Preservar as instruções preexistentes, changes.diff, fonte já validada e toda
a seleção antiga abaixo como histórico. Nenhum temporário foi criado; não há
limpeza própria pendente. Na preparação original, stage vazio; zero builds, smokes, providers,
comandos Docker ou atualizações da branch local. O único fetch é o autorizado acima.
Na preparação original, este prefixo e a nona entrada real do índice foram editados;
na retomada de fetch, somente o plano. O ajuste posterior de whitespace está
registrado abaixo e não invalida builds/smokes anteriores.

Conferências efetivamente executadas na preparação original:

| Conferência | Resultado | Exit | Exec./aprov./reprov./ignor. |
| --- | --- | --- | --- |
| Igualdade da lista proposta | APROVADO | 0 | 20 caminhos normais +1 índice, 21 únicos |
| Integridade e preservação | APROVADO | 0 | 22 arquivos anteriores intactos; histórico do plano e índice anterior preservados |
| Privacidade focal das adições documentais | APROVADO | 0 | Sem ocorrência de alta confiança; 18 artefatos conferidos separadamente |
| Checker direto Evidence Index | APROVADO | 0 | 985 referências; sem repetir suíte unitária |
| git diff --check e consulta do stage | APROVADO | 0 | Stage vazio; isso não aprova bytes staged futuros |
| Builds, smokes, Docker, provider e CI remoto | NÃO EXECUTADO | — | Resultados anteriores reutilizados sem reexecução |

Hunk desta preparação no plano: `@@ -0,0 +1,466 @@`, apenas adição
antes do conteúdo já integrado. Status da seleção: **autorizada para commit local, condicionado aos checks staged**;
status do fluxo real: **parcial e não aprovado**.

## Ajuste autorizado de whitespace e seleção final — 2026-11-17

Este registro supera apenas as contagens/hashes da seleção inicial e a pendência
material do log; os estados de stage vazio e de 21 caminhos acima são históricos.
Antes de alterar: branch/HEAD conferiram, os 21 caminhos staged e todos os hashes
coincidiram com a seleção revisada, e as três exclusões permaneceram intactas.
`git diff --cached --check`: exit 2, 15 ocorrências exclusivamente no log do build,
linhas 150, 158, 165, 169, 184 e 221–230. Nenhum commit havia sido criado.

Reutilizado `packaging.losslessLogs` do pacote pai: gzip mtime=0, nome vazio no
header e compresslevel=9. O bruto foi comprimido e descomprimido byte a byte antes
de sobrescrever o texto. Único caminho adicional: corrected-image-build.txt.gz,
no diretório existente, necessário para publicar uma representação textual sem
perder a captura original. Sem diretório, script, manifesto ou backup paralelo.
Seleção final: **22 caminhos = produção 1 + evidências 19 + índice 1 + plano 1**.

| Representação | Bytes | SHA-256 |
| --- | --- | --- |
| Bruto recuperável pelo gzip | 58799 | `ff0b59ca1935647f4adc23b3ee1a5a09f46dd24cf71837ae54b626a50e2c0d73` |
| Gzip sem perda | 10154 | `25369a4d6bd1d220350a6c826e8d493e3d90df8f3f0f7f585a77e28ef0ec1741` |
| Texto normalizado | 58763 | `69980ea658d36e4170c165b9e3fab4d17610864b967b88854be55846a7b17a7e` |

Transformação exata: remover todos os bytes CR; dividir somente por LF; remover
apenas espaços/tabs finais de cada segmento; reunir pelos mesmos LF. Resultado:
31 CR e cinco espaços removidos, zero tabs; 686 LF preservados, nenhuma linha ou
mensagem apagada/reordenada, nenhum exit code alterado. A fórmula em bytes consta
do README/JSON. O .txt é representação normalizada; a transcrição bruta é o gzip.
Todos os outros logs/harnesses e os resultados de runtime permanecem intactos.

Dependências atualizadas: `build.logSha256` do JSON identifica o texto normalizado;
a seção nova `packaging` guarda bruto/gzip/normalizado e a falha anterior. Demais
campos históricos do JSON foram comparados semanticamente e não mudaram. README
recebe só um apêndice; esta tabela de seleção atualiza seus hashes e os do JSON/log,
sem reescrever hashes históricos dos builds/smokes ou referências de outros pacotes.
O índice recebe somente seis linhas adicionais dentro da inserção já selecionada,
para registrar a normalização real e seu gzip; as 54 linhas anteriores e o
conteúdo integrado do índice continuam intactos. O histórico integrado deste plano
permanece byte a byte, SHA-256 613b939a6029a177ef6ee15bf5e189e0e00b2398f4e198bc5460bc0922812345.

Atualizar somente os seis caminhos explícitos abaixo; os outros 16 já staged
permanecem sem mudança. O índice é permitido como arquivo apenas porque o diff
inteiro foi delimitado ao único hunk +7,60; parar se aparecer qualquer outro hunk:

```bash
git add -- \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/stage-commit-plan.md' \
  'docs/EVIDENCE_INDEX.md' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/README.md' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/corrected-image-build.txt' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/corrected-image-build.txt.gz' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/registry-identity-2026-11-17/corrected-image-validation.json'
```

Depois: conferir os 22 caminhos/bytes staged, a descompressão e transformação,
privacidade inclusive bruto descomprimido, referências pelo checker existente,
`git diff --cached --check` e hooks normais. Somente após aprovação, criar o commit
local com o título já autorizado. Nenhum push, PR, merge ou deploy autorizado.
Registry 5/5 e consumidores 7/7 em host/imagem e build/inspeção/smoke existentes
são reutilizados sem reexecução. Typecheck focal anterior continua REPROVADO;
API completa, provider real, staging e fluxo de quartos/vaga não aprovados.
CLAUDE.md, CODEX.md e changes.diff continuam preservados/excluídos. Só Codex,
sem subagentes; gzip permanente, nenhum temporário próprio ou limpeza pendente.

Conferências documentais anteriores à atualização do stage: preservação sem perda
e execução da fórmula registrada passaram exit 0; checker existente Evidence Index
no sandbox exit 1 (sete referências históricas), mesmo comando fora do sandbox
exit 0, 986 referências. Nenhuma referência histórica/checker foi alterada para
obter aprovação. A leitura auxiliar inicial de cat-file em formato caminho@revisão
retornou 128 e não foi considerada prova; o checker usa revisão:caminho. Nenhuma
suíte/build/smoke foi repetida. Conferências finais staged continuam obrigatórias.

---

# Histórico — instrumentação correlacionada e planos anteriores, já integrados; não executar

# Plano vigente — instrumentação correlacionada do intake IMOB

Preparado em 2026-11-16 por Codex, sem subagentes. **Somente preparação; nenhum stage/commit/push/deploy executado.** Esta é a seleção vigente. Todo o plano anterior permanece integralmente após o marcador de histórico, sem validade executável para esta entrega.

## Estado conferido e prontidão

- Branch `fix/llm-provider-failure-propagation`; HEAD `a047a1b20a6dd0558fbe3a374b49e7aa4480a475`; upstream `origin/fix/llm-provider-failure-propagation`. Stage vazio; sem fetch nem alteração de histórico nesta preparação.
- **40 caminhos únicos: 26 normais e 14 logs publicáveis ignorados.** Seis fontes de instrumentação, três testes já registrados, duas documentações, este plano e pacote de evidências. Nenhuma nova fonte/teste mudou após as aprovações reutilizadas.
- Seleção coerente para um único commit revisável, condicionada aos bytes staged e hooks normais. **Bloqueio local de empacotamento removido:** contracts build e novo build API autorizados passaram com exit 0; fontes/configurações intactas. A falha API anterior fica histórica. Não presumir aprovação integral ou CI.
- CLAUDE.md, CODEX.md, changes.diff e todos os logs originais locais ficam excluídos. Sem .gitignore alterado, diretórios implícitos ou temporários na seleção.

## Escopo e dependências

A API usa o engine/intake existente, executeLlmStep, runCompletion, registry/router e adaptador compartilhados com runs; não há novo runtime nem conversão de perguntas em runs. A instrumentação reutiliza x-trace-id do middleware, classifica falha pré-provider por etapa e separa despacho de transporte/resposta/validação. Mantém mensagem pública, domínio, autorização, seleção, retries, fallback e billing.

A leitura do Render já concluída encontrou API live em 64fe82d, consumidor de runs desabilitado e nenhum worker separado visível no workspace acessível. Intake usa EIAH; runs usam agente da execução e executeCapability. Presença das variáveis de provider e perfil/modelo efetivo daquele turno não foram verificados. Nenhuma configuração foi alterada e esses fatos não provam a causa histórica.

Os três arquivos de teste já são registrados por test:llm-provider-failure e test:ci-unit-suite; scripts/workflow/manifesto não mudaram. Os wrappers de evidência reutilizam ../typecheck-deltas.mjs e ../package-smoke.mjs do HEAD (não adicionar novamente), e a fixture atual já está versionada em packages/providers/tests/fixtures/. Sem alteração de contrato público, engine/launcher, modelos ou finanças.

## Resultados reais, reaproveitamento e limites

| Verificação | Resultado | Exit | Alcance |
| --- | --- | --- | --- |
| Providers, runtime, intake/rota | APROVADO, reutilizado | 0 | 5/5, 8/8 e 16/16; dublês/transporte sintético, sem novas execuções nesta preparação |
| ProviderBoundary | APROVADO, reutilizado | 0 | 1/1, gate oficial; EPERM inicial preservado |
| Core/providers builds | APROVADO | 0 | Processos concluídos e recuperados, sem repetição |
| Smoke de dist | APROVADO | 0 | Novos exports/declarations e etapas do transporte sintético; falha inicial do verificador preservada |
| Typecheck focal | REPROVADO | 1 | 17 raízes; 2 diagnósticos focais antigos +16 de dependências, zero introduzido contra HEAD virtual; EPERM anterior à compilação preservado |
| Build API anterior (histórico) | REPROVADO | 2 | 24 diagnósticos, primeiro TS2305 por exports IMOB ausentes em contracts dist local; fonte exporta; tsup não executou. Sem baseline do build completo |
| Build contracts e novo build API | APROVADO | 0 | Sequência posterior autorizada; exports confirmados no dist ignorado; API passou tipagem oficial e tsup; zero diagnósticos restantes nesse build |
| Provider real, navegador, HTTP/banco, CI remoto, deploy | NÃO EXECUTADO | — | Não autorizados/validados nesta etapa |

A ausência de diagnósticos introduzidos vale somente para a comparação focal; não classifica todos os diagnósticos do build API. Não corrigir erros antigos nem gates para obter aprovação. Causa específica de staging e vínculo da chave à organização abastecida continuam não comprovados. Status técnico PARCIAL; demais políticas transversais PROPOSTA. P1 e oferta de avaliação preservados.

## Evidências, proveniência e hashes

O pacote intake-observability/README.md descreve cada execução; results.json distingue a fase inicial da preparação. preparation-typecheck.json preserva todos os diagnósticos atuais/baseline. operational-comparison.json é projeção somente dos campos permitidos das consultas já realizadas, sem nova consulta após retomada ou leitura de segredos.

Todos os 14 originais .log ficam locais. A entrega usa published/*.log: substitui somente o caminho literal do repositório por <REPO> e omite payloads inline data-URL do código do checker. results.json → publication.logs registra contagem de cada transformação e hashes antes/depois. Demais bytes, ANSI, erros, quebras de linha e falhas históricas permanecem; não são cópias apresentadas como originais. Nenhum prompt/rascunho/resposta bruta real integra o pacote.

Campos log e evidenceSha256 históricos nos registros descrevem originais locais; resolver a evidência entregável pelo mapeamento publication.logs, sem exigir stage dos originais. source-hashes.json é fotografia inicial: nove fontes/testes não mudaram; hash documental anterior é histórico. preparation-manifest.json lista os 40 caminhos/flags e SHA-256 dos outros 39; ele próprio é conferido por igualdade com a cópia revisada. Não há gzip nesta seleção.

## Adição normal — 26 caminhos (somente proposta)

```bash
git add -- \
  'apps/api/src/orchestrator/llmExecutor.ts' \
  'apps/api/src/routes/imob.ts' \
  'apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts' \
  'apps/api/src/tests/imob-property-capture-intake.test.ts' \
  'apps/api/src/tests/llm-provider-failure.test.ts' \
  'docs/EVIDENCE_INDEX.md' \
  'docs/architecture/agent-chat-runtime.md' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/stage-commit-plan.md' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/README.md' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/dependency-preparation.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/executions.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/operational-comparison.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/packaging-executions.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/packaging-preparation.mjs' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/preparation-executions.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/preparation-manifest.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/preparation-typecheck.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/provider-boundary-sandbox.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/results.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/source-hashes.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/typecheck-preparation.mjs' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/verification-first.json' \
  'packages/core/src/llm/LLMProviderError.ts' \
  'packages/core/src/llm/completionEngine.ts' \
  'packages/providers/src/OpenAIProvider.ts' \
  'packages/providers/tests/openai-provider-failure.test.ts'
```

## Adição forçada — 14 caminhos ignorados (somente proposta)

```bash
git add -f -- \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/affected-tests-first.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/api-build-after-contracts.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/api-build.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/contracts-build.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/core-build.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/intake-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/packaging-smoke-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/packaging-smoke.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/preparation-typecheck-outside.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/preparation-typecheck.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/provider-boundary.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/providers-build.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/providers-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/published/runtime-final.log'
```

## Exclusões explícitas

- `CLAUDE.md`
- `CODEX.md`
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/changes.diff`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/affected-tests-first.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/api-build-after-contracts.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/api-build.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/contracts-build.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/core-build.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/intake-final.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/packaging-smoke-final.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/packaging-smoke.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/preparation-typecheck-outside.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/preparation-typecheck.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/provider-boundary.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/providers-build.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/providers-final.log`
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-observability/runtime-final.log`

Também excluídos: originais históricos de outros pacotes, .env/segredos, caches, dist, node_modules e temporários, sem inventário de seus valores. Nenhum original é removido. A seleção não readiciona arquivos já versionados sem diff, incluindo fixtures/scripts antigos de apoio.

## Verificações dos bytes staged — somente após autorização

1. Conferir branch/HEAD e preservação dos hashes de CLAUDE.md, CODEX.md e changes.diff conforme results.json. Exigir conjunto staged igual aos 40 caminhos do manifesto, sem extras/ausências, e os três protegidos fora do índice. Usar apenas os dois comandos explícitos acima, nunca git add . / -A / -N.
2. Ler preparation-manifest.json do índice. Calcular SHA-256 dos bytes de git show :<caminho> para as 39 entradas files; conferir o manifesto também contra a cópia revisada do working tree. Não usar arquivos locais como substitutos dos bytes staged.
3. Resolver README, results, Evidence Index e dependências pelos bytes staged/HEAD. Campos de proveniência dos originais excluídos são resolvidos pelo mapeamento publication.logs. Conferir os hashes das cópias publicáveis e das fontes; não exigir hash documental histórico igual à documentação atual.
4. Conferir padrões de credenciais/dados sensíveis no conjunto staged sem ler ambientes ou secrets. Não normalizar originais ou omitir falhas. Confirmar gate/registro CI intactos.
5. Exigir git diff --cached --check exit 0. Stage vazio agora não comprova a aprovação futura. Se uma verificação/hook falhar, registrar causa/exit e parar antes de prosseguir; nunca contornar hooks.
6. Não repetir testes/builds válidos. Contracts dist e novo build API já foram autorizados e concluídos com exit 0; não repeti-los sem mudança concreta. Isso não é aprovação de CI remoto/deploy.

## Título e corpo sugeridos

```text
chore(imob): correlate property intake provider diagnostics

Carry HTTP correlation through the existing IMOB engine/intake and central
executor; distinguish profile/policy/provider resolution, adapter dispatch,
transport attempt, response receipt and parsing/validation. Sanitize generic
failures by controlled stage without raw errors, prompts, drafts or secrets.

Preserve public responses, authorization, provider selection, retries,
fallback and billing. Do not create another runtime or operational run.

Reuse passing doubles/synthetic tests: providers 5/5, runtime 8/8,
intake/route 16/16 and ProviderBoundary 1/1. Core/providers builds and
formal-dist smoke passed locally. Evidence includes historical failures,
original-log hashes and explicitly sanitized public copies.

Technical status PARCIAL. Focal typecheck FAILED: 17 roots, 2 old focal
and 16 dependency diagnostics, no introduced diagnostics versus virtual HEAD.
The initial API build failed with exit 2 and 24 type diagnostics against stale
local compiled contracts. After the authorized documented contracts build,
required exports were confirmed and the official API typecheck plus tsup build
passed with exit 0 and no remaining diagnostics. Preserve the original failure;
the separate focal typecheck remains failed and is not replaced by this build.

No real provider, browser, HTTP/database, remote CI or deployment validation.
Historical staging cause remains unproven. API live at 64fe82d has its run
consumer disabled; no separate worker is visible in the accessible workspace;
provider-variable presence is unverified. No infrastructure/financial changes.
Other transversal policies remain PROPOSTA; real retest requires separate
explicit authorization and must not save a property.
```

## Menor sequência posterior (não executada)

1. Preparação da dependência e build API já passaram, sem mudar fontes/configuração. Aguardar autorização específica para stage/commit/publicação e executar as conferências dos bytes staged e hooks normais.
2. Após autorização específica de stage/commit/publicação e gates, versionar a seleção e entregar API + core/providers à eiah-api-staging. Web não mudou; nenhum worker de runs separado foi identificado. Não habilitar consumidor nem criar serviço/runtime.
3. Conferir SHA implantado e API do bundle. Antes de qualquer chamada real, informar finalidade, ambiente, provider/modelo efetivo permitido, solicitação lógica prevista, tentativas/retries/fallback e custo/teto disponível, e obter autorização. Só então usar fixture sintética, recolher x-trace-id e confrontar cada etapa até intake, sem salvar imóvel. Timeout não comprova cancelamento físico.

---

# Histórico — plano Δ1–Δ3 e anteriores preservado integralmente; não executar

# Plano vigente — propagação de falhas IMOB Δ1–Δ3

Preparação revisável em 2026-11-16 por Codex, sem subagentes. **Nenhum stage ou commit executado.** Esta seção rege a próxima seleção; as seções anteriores estão preservadas integralmente após o marcador de histórico, inclusive seus títulos, comandos e contagens já superados.

## Estado e escopo conferidos

- Branch: `feat/imob-guided-property-draft`.
- HEAD: `70e66db4e7eea727f0f3567d8291595b1f86243b`.
- Upstream: `origin/feat/imob-guided-property-draft`, conforme configuração local; sem fetch nem afirmação de sincronismo remoto atualizado.
- Stage vazio. O diff da entrega contém 11 arquivos de implementação, 7 de testes/fixture/registro CI e 3 de documentação/preparação; os dois pacotes acrescentam 50 caminhos de evidência. Total abaixo: **71 caminhos únicos**.
- `CLAUDE.md` e `CODEX.md` já estavam modificados, foram preservados byte a byte e permanecem fora da entrega. O diff original da conversa guiada e os logs originais excluídos permanecem locais.
- Nenhuma fonte de implementação ou teste mudou nesta preparação. Não se reaplicaram patches nem se repetiram suites, builds ou chamadas de provider.

## Classificação de cada arquivo e dependências

Os caminhos dos comandos abaixo são a lista canônica desta seleção; cada grupo é classificado aqui, sem diretórios implícitos:

| Arquivo | Classe e função |
| --- | --- |
| `apps/api/src/orchestrator/llmExecutor.ts` | Δ1–Δ2: propagação e IDs do runtime |
| `apps/api/src/routes/imob.ts` | Δ2: correlação interna do intake |
| `apps/api/src/services/capabilityExecution.ts` | Δ2: normalização, referência legada e guarda sem replay/fallback |
| `apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts` | Δ1: unavailable antes do parsing e diagnóstico sanitizado |
| `apps/web/src/features/imob/structured/useImobFrontDoorForms.ts` | Δ3: tipagem de presentationSnapshot já produzido |
| `packages/contracts/src/imobPropertyCapture.ts` | Δ1: mensagem contextual do contrato, consumida pelo engine |
| `packages/core/src/llm/LLMProviderError.ts` | Δ1: exceção interna compartilhada, arquivo novo |
| `packages/core/src/llm/completionEngine.ts` | Δ1–Δ2: elegibilidade de retry, erro e IDs no log |
| `packages/core/src/llm/types.ts` | Δ2: campos aditivos e semântica dos identificadores |
| `packages/core/src/utils/retry.ts` | Δ1: predicado opcional preservando limites existentes |
| `packages/providers/src/OpenAIProvider.ts` | Δ1–Δ2: status/erro antes da extração e metadados reais |
| `.github/workflows/ci.yml` | CI: registro oficial dos testes afetados |
| `apps/api/src/tests/capability-execution.test.ts` | Teste: resultado determinístico não comprova provider/modelo |
| `apps/api/src/tests/fixtures/openai-credit-balance-exhausted.json` | Fixture nova: type/code derivados do erro real sanitizado |
| `apps/api/src/tests/imob-property-capture-intake.test.ts` | Teste: contrato unavailable e harness da rota |
| `apps/api/src/tests/llm-provider-failure.test.ts` | Teste novo: transporte sintético, falhas, IDs e consumidores |
| `apps/web/src/features/imob/structured/createImobStructuredForms.test.ts` | Teste: preservação do formulário/proposta e término da espera |
| `package.json` | CI/testes: comando formal da nova suíte sintética |
| `docs/EVIDENCE_INDEX.md` | Documentação: somente duas entradas de execuções existentes |
| `docs/architecture/agent-chat-runtime.md` | Documentação: proposta transversal preservada + adoção autorizada Δ1–Δ3 |
| `ops/evidence/latest/imob-property-capture-context-2026-11-14/stage-commit-plan.md` | Documentação: este plano reutilizado, histórico preservado |

Todos os 7 caminhos sob `imob-property-provider-diagnostic-2026-11-16/`, explicitados nos comandos, são **evidências do diagnóstico real anterior**: README, resumo, resultado, snapshot de staging, runner executado, log e manifesto histórico. Não são execução pós-patch. O runner não é chamado pelo CI e não será executado para preparar ou criar o commit.

Todos os 43 caminhos selecionados sob `imob-property-provider-failure-2026-11-16/` são **evidências da correção com transporte sintético e dublês**, incluindo runners focais, diagnóstico comparativo de tipos, consolidação, hashes, resultados finais e falhas intermediárias. Os dois logs gzip são cópias sem perda dos originais locais; os outros logs são os originais textuais. Arquivos novos e ignorados estão explicitados abaixo.

As 11 fontes dependem conjuntamente dos tipos/erro compartilhados, contrato IMOB, adapter, runtime e intake. Os testes novos precisam da fixture e da fonte de erro; package.json e workflow registram sua execução oficial. Engine e launcher já versionados consomem o contrato e o resultado unavailable; não há alteração cognitiva nova no launcher. generateText e recordCapabilityUsage não foram alterados; seus consumidores pertinentes foram exercitados, com writer substituído por dublê. Billing/reservas/cobrança, manifests antigos de testes e exports sem diff já estão no HEAD e não recebem adição redundante.

O conjunto é coerente para **um único commit**: a cadeia de propagação, compatibilidade dos consumidores e suas provas precisam permanecer juntas. Não há dependência de alteração financeira para versionar a guarda segura atual. Metering durável sem identidade real continua bloqueio separado, não entregue nem implicitamente autorizado. A proposta arquitetural é contexto da adoção delimitada; sua inclusão não ratifica o restante.

## Evidências, hashes e proveniência

- Pacotes reutilizados: README/results da correção e README/diagnostic-summary do diagnóstico anterior. As duas linhas novas do Evidence Index apontam para arquivos desta seleção. Referências a fontes estáveis e provas anteriores versionadas são satisfeitas pelo HEAD; referências aos dois logs locais excluídos são somente proveniência e têm cópias gzip entregáveis.
- Antes desta preparação, **62/62 hashes** do manifesto da correção coincidiam com os bytes locais. Nenhuma fonte/teste mudou depois. O manifesto atual contém **70 hashes dos outros 70 caminhos**, excluindo somente a si próprio; a fotografia anterior está em previousSnapshot, histórica, não usada como lista de stage.
- O manifesto do diagnóstico real permanece intacto: os 6 artefatos que enumera conservam os hashes; 8 fontes agora corrigidas correspondem ao HEAD anterior, e o hash histórico do Evidence Index coincide com o índice sem a nova linha de correção. São diferenças históricas esperadas, não drift a corrigir reescrevendo o original.
- `provider-tests-direct.log.gz` e `provider-tests-final.log.gz`: gzip mtime=0, sem alteração dos bytes descomprimidos. Originais contêm respectivamente 4 e 2 linhas com espaços finais, permanecem locais e não entram no stage. Original/cópia, SHA-256 e tratamento exato constam de results.json → packaging.losslessLogs. Nenhum log foi normalizado ou truncado.
- Fixture de teste: somente error.type/error.code do resultado real sanitizado, cujo SHA-256 é `f77384445eebd224b210fb2d9101e79e7a0b46d7b4a9462172df0b454333bbd7`. Message/param omitidos. Status/IDs dos testes são sintéticos. O runner histórico já sanitizava chave/Bearer/caminhos dos retornos; seu original e resultado foram preservados.
- Leitura e busca de padrões no escopo selecionado não identificaram valores reais de credenciais ou dados de usuários. Configurações de teste são sintéticas; paths locais e IDs públicos de deploy/correlação permanecem. Não é auditoria exaustiva. Nenhum .env, segredo, cache, dist, node_modules ou temporário integra a seleção.

## Resultados reaproveitados e ressalvas obrigatórias

| Verificação registrada | Resultado | Exit | Alcance |
| --- | --- | --- | --- |
| Falhas/consumidores | APROVADO | 0 | 9 executados, 9 aprovados, 0 falhas/ignorados; sintético/dublês |
| Seleção final afetada de retry/IDs | APROVADO | 0 | 3 executados, 3 aprovados, 0 falhas/ignorados; subconjunto dos nove |
| Capacidade determinística | APROVADO | 0 | 1 executado/aprovado, 0 falhas/ignorados |
| Intake/adaptador reaproveitados | APROVADO | 0 | 13/13 e 15/15; execução seletiva, não todos os intakes |
| Contratos; builds core/providers; smoke dist | APROVADO | 0 | Pacotes/empacotamento focais; não aplicação completa |
| Registro oficial CI e Evidence Index | APROVADO local | 0 | Não CI remoto; Index fora do sandbox após EPERM preservado |
| Typecheck focal final | REPROVADO | 1 | 16 raízes; 2 diagnósticos antigos focais, 16 de dependências, 0 introduzidos conforme baseline virtual |
| Diagnóstico real anterior | REPROVADO funcionalmente | 2 | Quota local, sem proposta; não reteste da correção |
| Provider real pós-patch, navegador, HTTP com banco | NÃO EXECUTADO | — | Não validados |

Falhas intermediárias permanecem preservadas, inclusive sandbox, tipagem e asserções antigas. Um log vazio sem exit não é promovido a aprovação; os resultados finais com saída/exit próprios estão discriminados em results.json/delta-executions.json. O check textual registrado anteriormente não certifica stage futuro nem logs antes não rastreados.

**Status técnico PARCIAL.** Quota local não comprova quota em staging. A causa da tentativa específica de staging continua não comprovada; não se declara o incidente resolvido nem o fluxo real de quartos/vaga aprovado. Alinhamento web/API e reteste são etapa separada. Nenhuma alteração financeira, novo fallback, orçamento global ou cancelamento físico transversal. Demais políticas continuam PROPOSTA. Oferta de avaliação desligada e ratificação P1 weekly_cycle_evidence_too_old preservadas.

## Lista exata — 39 adições normais

Comando **somente proposto**, a partir da raiz e após autorização:

```bash
git add -- \
  '.github/workflows/ci.yml' \
  'apps/api/src/orchestrator/llmExecutor.ts' \
  'apps/api/src/routes/imob.ts' \
  'apps/api/src/services/capabilityExecution.ts' \
  'apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts' \
  'apps/api/src/tests/capability-execution.test.ts' \
  'apps/api/src/tests/fixtures/openai-credit-balance-exhausted.json' \
  'apps/api/src/tests/imob-property-capture-intake.test.ts' \
  'apps/api/src/tests/llm-provider-failure.test.ts' \
  'apps/web/src/features/imob/structured/createImobStructuredForms.test.ts' \
  'apps/web/src/features/imob/structured/useImobFrontDoorForms.ts' \
  'docs/EVIDENCE_INDEX.md' \
  'docs/architecture/agent-chat-runtime.md' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/stage-commit-plan.md' \
  'ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/README.md' \
  'ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/diagnostic-summary.json' \
  'ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/openai-integrated.json' \
  'ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/run-integrated.mjs' \
  'ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/source-hashes.json' \
  'ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/staging-snapshot.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/README.md' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-executions.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-typecheck-final.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-typecheck.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/package-smoke.mjs' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/provider-tests-direct.log.gz' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/provider-tests-final.log.gz' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/results.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/source-hashes.json' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/typecheck-deltas.mjs' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/typecheck-focused.mjs' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/validate-deltas.mjs' \
  'package.json' \
  'packages/contracts/src/imobPropertyCapture.ts' \
  'packages/core/src/llm/LLMProviderError.ts' \
  'packages/core/src/llm/completionEngine.ts' \
  'packages/core/src/llm/types.ts' \
  'packages/core/src/utils/retry.ts' \
  'packages/providers/src/OpenAIProvider.ts'
```

## Lista exata — 32 adições forçadas

Todos são arquivos individualmente ignorados por `.gitignore:17:*.log`. Não usar -f em outros caminhos, diretórios ou curingas. As duas cópias .log.gz não são ignoradas e estão na lista normal.

```bash
git add -f -- \
  'ops/evidence/latest/imob-property-provider-diagnostic-2026-11-16/openai-runtime.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/adapter-tests-direct.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/adapter-tests-first.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/ci-registration.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/contracts-typecheck.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-capability.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-ci-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-contracts.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-core-build.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-core-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-evidence-index-outside.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-evidence-index.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-final-types.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-first-types.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-first.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-ids-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-outside-types.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-package-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-package-smoke.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-providers-build.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-whitespace-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/delta-whitespace.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-tests-direct.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/intake-tests-first.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/presentation-contract.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/provider-quota-final.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/provider-tests-first.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/provider-tests-second.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/provider-tests-validated.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/render-only.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/runtime-entrypoint.log' \
  'ops/evidence/latest/imob-property-provider-failure-2026-11-16/typecheck-first.log'
```

**Total: 71 caminhos únicos = 39 normais + 32 ignorados.** Listas disjuntas; nenhum git add foi executado, inclusive -N.

## Excluídos e preservados

- `CLAUDE.md` e `CODEX.md`: alterações preexistentes. SHA-256 preservados respectivamente `66c82eb6465ab1b5c6d3c5142b591f8b5a6ee82b4840e4b4a74c578fdc2e5f37` e `2cad8b66e0cb2d35eb71308cbc8d3b10c3ba031ef7a18ac72622ab0ccf179525`.
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/changes.diff`: original de entrega anterior, sem reaplicação.
- `ops/evidence/latest/imob-property-provider-failure-2026-11-16/provider-tests-direct.log` e `ops/evidence/latest/imob-property-provider-failure-2026-11-16/provider-tests-final.log`: originais locais, entregues por gzip sem perda.
- Originais locais anteriores de `imob-property-guided-draft-2026-11-14/intake-first.log`, `forms-first.log` e `web-build.log`: já tratados na entrega anterior; não adicionar de novo.
- `apps/web/dist/`, `packages/core/dist/`, `packages/providers/dist/`, quaisquer dist/caches/node_modules/ambientes, .env, .agents/.codex, temporários, scratchpad e demais caminhos fora das duas listas. Nenhum arquivo foi removido; nenhuma alteração de .gitignore.

## Verificações futuras — somente após autorização

```bash
git diff --cached --name-only
git diff --cached --name-status
git diff --cached --stat
git diff --cached --name-only -- CLAUDE.md CODEX.md
git diff --cached --check
git diff --cached
```

1. Exigir igualdade exata entre as duas listas e os 71 caminhos staged, sem extras, omissões ou duplicações. Exigir nenhuma saída para CLAUDE.md/CODEX.md. Reconfirmar branch/HEAD antes de stage.
2. Ler o manifesto do próprio índice com `git show :ops/evidence/latest/imob-property-provider-failure-2026-11-16/source-hashes.json`. Para cada uma das 70 entradas de files, calcular SHA-256 dos bytes de `git show :<caminho>`; todas devem estar staged. Comparar os bytes do próprio manifesto com a cópia revisada do working tree. previousSnapshot é histórico; não exigir que seus originais locais estejam staged.
3. Descomprimir os dois gzip **lidos do índice**, conferir SHA-256 e igualdade com os hashes originais declarados em results.json também lido do índice; não normalizar o conteúdo descomprimido. Não há changes.diff novo nesta entrega; o diff consolidado de código é o próprio git diff --cached.
4. Ler README, results, manifesto e novas referências do Evidence Index pelos bytes staged, resolvendo dependências contra a seleção ou HEAD para arquivos reutilizados. Conferir todos os logs referidos em delta-executions.json, a fixture e sua proveniência. Confirmar os hashes dos seis artefatos do diagnóstico com o manifesto histórico staged; preservar suas diferenças de fontes explicadas acima.
5. Repetir a inspeção de sensíveis sobre os bytes staged, incluindo gzip descomprimido; conferir que só os 32 logs explicitados receberam -f. Hashes não provam ausência de segredos.
6. Exigir git diff --cached --check exit 0, inclusive nos novos logs textuais. Nenhum check do stage vazio nesta etapa vale como prova dessa aprovação futura. Se houver divergência, parar antes do commit e explicar a causa.
7. Se autorizado, criar somente o commit acordado pelo fluxo normal, **sem contornar hooks**. Não repetir suítes aprovadas sem mudança concreta; não enfraquecer gates. Eventual hook reprovado deve ser relatado com saída/exit reais, sem --no-verify.

## Título e corpo sugeridos

```text
fix(llm): propagate provider failures without replaying completed generations

Conclui somente a adoção autorizada de Δ1–Δ3: propaga erro estruturado sanitizado do adaptador OpenAI pelo runtime central ao intake, sem conteúdo vazio ou sucesso indevido. Quota financeira não recebe retry; erros elegíveis preservam os limites existentes. O intake mantém unavailable e o contrato/engine preserva formulário, rascunho e proposta, encerrando a espera sem escrita.

Distingue correlação interna, completion ID e request ID do provider. Preserva a referência legada de idempotência; identificadores/modelo efetivo/uso ausentes não são inventados. Geração concluída sem identidade de contabilização encerra explicitamente sem retry ou fallback da capacidade. Não altera billing, reservas ou cobrança; metering durável sem identidade continua bloqueio financeiro separado.

Validação com transporte sintético, fixture sanitizada e dublês: 9/9 casos, revalidação final dos 3 afetados e 1/1 capacidade determinística; resultados 13/13 de intake e 15/15 do adaptador reaproveitados. Contratos, builds oficiais core/providers e smoke de módulos empacotados aprovados. Evidências do diagnóstico real anterior e falhas intermediárias preservadas; dois logs publicados em gzip sem perda, com proveniência e hashes.

Status técnico PARCIAL. Typecheck focal de 16 raízes reprovado: dois diagnósticos antigos focais e 16 de dependências, sem diagnósticos introduzidos conforme comparação virtual com HEAD. Provider real pós-patch, navegador e HTTP com banco não validados. A causa da tentativa específica de staging permanece não comprovada; alinhamento web/API e reteste são etapa separada. Demais políticas transversais continuam PROPOSTA. Oferta de avaliação e ratificação P1 preservadas.
```

## Prontidão

Preparação pronta para revisão/autorização de um único commit, condicionada aos bytes staged e hooks normais. Não há mudança posterior em fonte/teste que invalide as verificações recuperadas; somente plano, documentação de empacotamento, consolidação, manifesto e cópias gzip foram preparados. Limitações operacionais e reprovação focal de tipos permanecem explícitas, sem promessa de CI ou staging corrigido. Sem stage, commit, push, PR, merge, deploy, chamadas reais ou alterações financeiras nesta etapa.

---

# Histórico — plano da conversa guiada e anteriores, preservado integralmente; não executar

# Plano vigente — conversa guiada do cadastro IMOB

Preparado em 2026-11-16 por Codex, sem subagentes. **Somente preparação: nenhum comando de stage ou commit executado.**
Esta seção rege o próximo commit. Abaixo do marcador de histórico conserva-se integralmente o plano anterior, já superado; seus 39 caminhos e título antigo não compõem a seleção atual.

## Estado conferido

- Branch: `fix/imob-property-draft-context`.
- HEAD: `d60655c4fd344dca39fbbdb90d2e46bbd44a3b78`.
- Upstream: `origin/fix/imob-property-draft-context` (consulta local, sem fetch/push).
- Stage vazio. Dez arquivos de código/testes, Evidence Index, este plano e pacote de evidências integram o incremento.
- `CLAUDE.md` e `CODEX.md`: alterações preexistentes preservadas byte a byte e excluídas. Nenhuma outra alteração local alheia foi identificada no status normal.
- Testes já registrados em `scripts/unit-tests-manifest.txt:233` e `:280`, script `test:ci-unit-suite`, chamado por `.github/workflows/ci.yml:820`. Esses três arquivos já estão em HEAD, não mudaram e não devem ser adicionados neste incremento. Nenhum teste novo órfão.
- Os resultados anteriores continuam válidos segundo o relatório reaproveitado. Nenhum teste, build, provider ou gate amplo foi repetido para preparar o plano.

## Evidências e limites

Pacote: `ops/evidence/latest/imob-property-guided-draft-2026-11-14/README.md` e `results.json`.

- Validação com dublês, em execuções seletivas: 13 casos de intake, 14 do adaptador e 5 de correlação; falhas iniciais preservadas. Não equivale a nova suíte integral.
- Build web 897 módulos e contratos exit 0 reaproveitados. Typecheck focal final exit 0: somente 12 raízes, inclui vite-env, exclui 17 diagnósticos de dependências.
- Reaproveitamento explícito dos logs de formulários, no-DB e três gates do pacote anterior, todos já versionados em HEAD. Não duplicar esses arquivos no stage.
- Provider real, navegador e HTTP com banco não validados. **Status técnico PARCIAL. A causa do retorno inválido em staging continua não comprovada.**
- Oferta de avaliação intocada. P1 `weekly_cycle_evidence_too_old` preservado, sem reinvestigação ou alteração de gate.
- Hashes anteriores: 29/29 coincidentes antes do empacotamento. Inventário de entrega: `source-hashes.json`, 28 hashes para os 29 caminhos abaixo, excluindo o próprio inventário.
- Busca por padrões sensíveis não identificou credencial real no escopo revisado; ocorrência de atribuição classificada como fixture preexistente `synthetic-test-only`. Não é auditoria exaustiva.
- Três cópias de logs em `published/`: somente remoção explícita do prefixo absoluto do workspace (2/6/1 ocorrências) e espaços finais em 2/0/1 linhas. Originais locais intactos/excluídos. Proveniência e hashes em `results.json` → `packaging.sanitizedLogs`.
- `changes.diff.gz` entrega o diff original comprimido sem normalização (27 linhas de contexto contêm espaço no original). Descompressão idêntica ao Git e ao `changes.diff` local, que fica excluído.

## Lista exata — 16 adições normais

Comando **proposto**, somente após autorização, a partir da raiz:

```bash
git add -- \
  'apps/api/src/routes/imob.ts' \
  'apps/api/src/services/imob/crm/imobProposalReviewContinuity.ts' \
  'apps/api/src/services/imob/imobAgentContract.ts' \
  'apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts' \
  'apps/api/src/tests/imob-property-capture-intake.test.ts' \
  'apps/web/src/components/agents/chatLauncherEngine.ts' \
  'apps/web/src/features/imob/structured/createImobStructuredForms.test.ts' \
  'apps/web/src/features/imob/structured/types.ts' \
  'apps/web/src/features/imob/structured/useImobFrontDoorForms.ts' \
  'docs/EVIDENCE_INDEX.md' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/stage-commit-plan.md' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/README.md' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/changes.diff.gz' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/results.json' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/source-hashes.json' \
  'packages/contracts/src/imobPropertyCapture.ts'
```

## Lista exata — 13 adições forçadas

Cada caminho é ignorado pela regra `.gitignore:17:*.log`; não usar `-f` nos demais caminhos, diretórios, curingas ou no scratchpad inteiro.

```bash
git add -f -- \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/adapter-confirmation-guards.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/adapter-withdrawal.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/contracts-typecheck.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/diff-check.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/forms-second.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/intake-reproduction.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/intake-withdrawal.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/published/forms-first.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/published/intake-first.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/published/web-build.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/review-correlation-regression.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/typecheck-final.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/typecheck-first.log'
```

**Total: 29 caminhos únicos = 16 normais + 13 ignorados.** As duas listas não se sobrepõem.

## Arquivos excluídos

- `CLAUDE.md` e `CODEX.md` — trabalho preexistente; hashes preservados em `results.json`.
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/changes.diff` — original local, entregue como gzip sem perda.
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/intake-first.log` — original local; entregar somente a cópia `published/intake-first.log`.
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/forms-first.log` — original local; entregar somente a cópia `published/forms-first.log`.
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/web-build.log` — original local; entregar somente a cópia `published/web-build.log`.
- `apps/web/dist/`, caches, `node_modules/`, temporários, ambientes e scratchpad fora da seleção explícita.
- Package/workflow/manifesto, exports browser e demais arquivos anteriores sem diff: já presentes em HEAD; não adicionar novamente. A única alteração no pacote de evidências anterior é este plano reutilizado.

## Verificações após autorização do stage

Não executadas nesta etapa:

```bash
git diff --cached --name-only
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
git diff --cached --name-only -- CLAUDE.md CODEX.md
git diff --cached
```

1. Comparar o conjunto staged com as duas listas acima: igualdade exata de 29 caminhos, sem duplicações/extras. Consulta específica às instruções sem saída.
2. Ler `:ops/evidence/latest/imob-property-guided-draft-2026-11-14/source-hashes.json` do índice. Para cada entrada, conferir SHA-256 dos bytes retornados por `git show :<caminho>`; todos os 28 alvos devem estar staged. Conferir o próprio inventário contra a cópia revisada do working tree.
3. Validar JSON e referências usando o conteúdo staged e arquivos reaproveitados de HEAD: README, results, nova linha do Evidence Index, plano, helper de tipagem e logs versionados. Originais explicitamente locais são só proveniência, não dependências da entrega.
4. Descomprimir o diff staged e comparar com `git diff --cached -- <dez caminhos de código/testes>`; preservar os bytes do artefato original. Se o Git variar apenas ordem de apresentação, comparar também os dez blocos por arquivo antes de concluir divergência.
5. Conferir novamente dados sensíveis nos bytes staged e o tratamento declarado dos três logs. Não normalizar logs originais nem adicionar uma fonte local excluída por engano.
6. `git diff --cached --check` deve sair com 0. Stage vazio agora não demonstra esse check futuro; se algo divergir após autorização, parar antes do commit.
7. Criar somente o commit autorizado, por fluxo normal com hooks. Não usar `--no-verify`, não desativar hooks nem alterar gates para aprovação. Não repetir suítes já válidas sem nova alteração que justifique.

## Mensagem proposta do commit

Título:

```text
feat(imob): confirm guided property draft updates in chat
```

Corpo:

```text
Apresenta uma proposta de alterações pelo intake contextual central do IMOB com o rascunho atual. Somente a confirmação contextual da proposta vigente aplica suas mudanças integralmente ao mesmo rascunho; salvar o imóvel permanece uma ação explícita separada do formulário.

Preserva perguntas, recusa, ambiguidade, pausa e retomada pelo provider contextual. Edição manual, proposta substituída ou resposta tardia não sobrescrevem campos; retirar todas as diferenças limpa a proposta anterior.

Validação local com dublês: cobertura seletiva de 13 casos de intake, 14 do adaptador e 5 de correlação, reutilizando resultados válidos e preservando falhas históricas. Build web (897 módulos) e contratos aprovados localmente. Typecheck limitado a 12 raízes, com 17 diagnósticos de dependências excluídos.

Status técnico PARCIAL. Provider real, navegador e HTTP com banco não validados. A causa do retorno inválido em staging continua não comprovada; esta entrega não é apresentada como correção comprovada desse incidente. Evidências e transformações de publicação documentadas; ratificação P1 weekly_cycle_evidence_too_old preservada.
```

## Prontidão

Seleção preparada para futura autorização de stage/commit, condicionada à conferência dos bytes staged e aos hooks normais. Não há alegação de CI remoto aprovado ou de validação operacional completa. A implementação continua PARCIAL.
Nenhum código/teste, build, ambiente externo ou .gitignore alterado nesta preparação. Originais preservados; novos artefatos de publicação têm destino explícito na seleção. Sem exclusões genéricas, stage, commit, push, PR, merge ou deploy.

---

# Histórico — plano anterior preservado, não executar

# Preparação exata de stage e commit — continuidade IMOB

Preparado em 2026-11-14 por Codex, sem subagentes. **Os comandos abaixo não foram executados.**
Branch: `feat/front-door-intake-run-lifecycle-imob-evaluation`.
HEAD: `453a3b0bf5e666e227a129b4930399e5ffac6efb`.

## Conferência realizada

- Stage vazio, HEAD e branch preservados.
- Antes do stage, `changes.diff` coincidiu byte a byte com o diff da tarefa (SHA-256 original: `a5633388e3974883b093f281445d81dbe2d2c886b39fecb26d82da038f3b42cf`). No stage autorizado, 20 linhas vazias de contexto tiveram o marcador de espaço removido para satisfazer `git diff --cached --check`, sem alterar conteúdo de código. SHA-256 do artefato normalizado: `2f6bc3f83318d225310d2530fd10bbd798f66cfd095ddb5367fd0570852e0651`.
- `git diff --check` aprovado, saída 0.
- Manifesto de testes e `test:ci-unit-suite` sincronizados; 12 nomes de logs referenciados no JSON existem. Os quatro logs históricos complementares também entram na seleção.
- Evidências anteriores reaproveitadas. Nenhuma suíte foi repetida nesta preparação.
- Uma busca por padrões de credenciais encontrou apenas a fixture local existente `user:pass@127.0.0.1:1/test` no contexto de package.json dentro do diff. Nenhum padrão de chave privada foi encontrado nessa busca; isso não equivale a uma auditoria completa de segredos.
- `CLAUDE.md` e `CODEX.md` permanecem com suas alterações preexistentes e ficam fora dos comandos.
- O conjunto tem **39 arquivos**: 18 de implementação/contrato/testes/CI/índice e 21 de evidências/preparação. Entre eles, 16 logs são ignorados por `.gitignore:17` e exigem adição explícita com `-f`.
- Nenhuma exceção global de gitignore é necessária. Nenhum caminho de diretório, curinga, `git add .` ou `git add -A` é usado.

## Stage proposto: 23 arquivos não ignorados

Executar a partir da raiz do repositório, somente quando for autorizado fazer stage:

```bash
git add -- \
  'apps/api/src/routes/imob.ts' \
  'apps/api/src/services/imob/crm/imobCrmTurnEngine.ts' \
  'apps/api/src/services/imob/imobAgentContract.ts' \
  'apps/api/src/services/imob/imobTurnResolver.ts' \
  'apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts' \
  'apps/api/src/tests/imob-property-capture-intake.test.ts' \
  'apps/web/src/components/agents/ChatAgentLauncher.tsx' \
  'apps/web/src/components/agents/chatLauncherEngine.ts' \
  'apps/web/src/features/imob/structured/createImobStructuredForms.test.ts' \
  'apps/web/src/features/imob/structured/types.ts' \
  'apps/web/src/features/imob/structured/useImobFormState.ts' \
  'apps/web/src/features/imob/structured/useImobFrontDoorForms.ts' \
  'apps/web/src/lib/api.ts' \
  'docs/EVIDENCE_INDEX.md' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/README.md' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/changes.diff' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/results.json' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/stage-commit-plan.md' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/typecheck-focused.mjs' \
  'package.json' \
  'packages/contracts/src/imobPropertyCapture.ts' \
  'packages/contracts/src/index.ts' \
  'scripts/unit-tests-manifest.txt'
```

## Stage proposto: 16 logs ignorados

O `-f` é limitado aos logs locais reais desta tarefa; preserva aprovações, falhas iniciais e as revalidações autorizadas fora do sandbox.

```bash
git add -f -- \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/contracts-typecheck.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/entrypoint-gate.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/evidence-gate-authorized.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/evidence-gate.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/forms-final-focused.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/forms-tests.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/intake-final.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/intake-tests.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/launcher-gate.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/no-db-diagnostic.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/no-db-gate.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/regression-tests.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/snapshot-gate.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/tests-initial.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/typecheck-final.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/typecheck-initial.log'
```

## Conferência depois do stage

Com o stage originalmente vazio e sem outras alterações simultâneas, `--name-only` deve listar exatamente os 39 caminhos dos dois comandos acima. A consulta específica a CLAUDE.md/CODEX.md deve continuar sem saída.

```bash
git diff --cached --check
git diff --cached --name-only
git diff --cached --name-only -- CLAUDE.md CODEX.md
git diff --cached --stat
```

## Commit proposto

Título:

```text
fix(imob): preserve property draft context in chat
```

Descrição sugerida:

> Prioriza o formulário de imóvel pendente antes do roteamento isolado e interpreta a continuação pelo runtime central com o rascunho atual. Aplica somente patches validados ao mesmo formulário, preserva perguntas/edições e descarta retornos de outro contexto, sem persistência automática.
>
> Inclui testes e evidências locais: intake 9/9, formulários 180/180 com revalidação final dos 7 afetados, isolamento sem DB 2/2, gates arquiteturais, tipagem focal/contratos e Evidence Index. Provider real, navegador e HTTP com banco permanecem não validados; 17 diagnósticos de dependências ficaram fora do typecheck focal.

A criação de commit permanece pendente de autorização. Preparar a seleção não executa stage nem commit.

## Estado e limites

A preparação está evidenciada pelas verificações de leitura e consistência acima; a implementação continua **parcial** quanto à validação externa. Não altera o status dos testes anteriores nem afirma aprovação global de tipagem ou CI remoto. Os comandos de stage, conferência pós-stage e commit são apenas propostos.

Arquivos de código/testes não foram alterados nesta etapa. Foi criado somente este plano de preparação, incluído explicitamente na própria seleção. Os artefatos anteriores foram preservados. Sem chamadas pagas, gravações de domínio, stage, commit, push, PR ou deploy.
