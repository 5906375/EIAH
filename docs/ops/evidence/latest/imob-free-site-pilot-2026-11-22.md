# Piloto IMOB de vitrines gratuitas

Base consultada `db6c2d174654ae05de3eca5799c33ee17126401d`.

| Verificação executada localmente | Resultado |
| --- | --- |
| Fluxo de cadastro com DOM e IndexedDB simulados | E-mail de interesse dirigido à EIAH, prévia local sem pagamento e exportação de rascunho sem o perfil privado de cadastro. |
| Publicação estática em diretório temporário | Dez endereços criados. A décima primeira publicação foi recusada. A atualização de um endereço publicado preservou a vaga existente. |
| Verificador de deploy | Recusou um conjunto com onze vitrines. Endereço reservado e tentativa de caminho fora do IMOB foram recusados pelo gerador. |
| Geração HTML | Conteúdo de texto foi escapado, um endereço de foto com esquema impróprio foi ignorado e os dados privados do cadastro ficaram fora da página. Link de WhatsApp e foto em assets do IMOB foram renderizados. |
| Áudios do guia | `ffprobe` confirmou o hash da narração atual para `perfil`, `publicar` e `site-cliente`. |
| Wrangler 4.165.0 em dry-run | Executado a partir da raiz e de `apps/site`. O verificador leu 0 de 10 vitrines, e o Wrangler leu 133 arquivos e reconheceu os bindings SALAS e ASSETS. |
| `git diff --check` | Passou. |

Escopo da evidência local. Implantação em produção e envio de e-mail dependem da ativação do piloto.


## Retomada TWDG — restauração de rascunhos (2026-11-27)

- Executor: Codex, mediante autorização humana específica para uma rodada dos testes existentes, sem infraestrutura externa.
- Worktree: `EIAH_SITE_IMOB_PUBLICACAO`; branch: `feat/imob-abrir-rascunho`.
- HEAD: `2b9225da68e4dd83fecec9cc5ff322b932a9e0ee`, com o incremento local ainda não commitado.
- Preflight focal concluído dentro de cinco minutos: stage vazio; 11 arquivos de trabalho modificados e quatro novos, correspondentes aos 15 conteúdos preservados. O cache Wrangler preexistente ficou fora da intervenção.
- Objetivo recuperado: reabrir `vitrine-imob.json`, compartilhar validação entre navegador e publicador, confirmar a substituição e restaurar marca e imóveis, com recusa de arquivos inválidos e tratamento de armazenamento.
- Última etapa: implementação local e preservação verificadas anteriormente; esta rodada não altera código nem assertions.
- Runtime observado: Node v22.17.1. Testes existentes com módulos nativos e dados sintéticos; escrita pelo teste do publicador restrita a diretórios temporários com limpeza no próprio teste. Sem servidor, instalação, Docker ou deployment.
- Evidências históricas de 20/11 e 22/11 permanecem no seu escopo original. Não certificam a nova interação de reabertura em navegador. Não foram repetidas as verificações de geração de HTML, dez vagas, Wrangler ou navegador.
- Seleção proporcional: suíte nova `draft-restore.test.mjs` (nove casos definidos); três casos do publicador selecionados pelo nome, relativos ao validador agora compartilhado. As demais suítes e o teste de botões não foram executados por não serem necessários a esta rodada focal da restauração.

### Execução 1 — restauração

Comando nativo, na raiz da worktree:

```sh
timeout 60s node --test apps/site/tests/draft-restore.test.mjs
```

Exit code: 0. Saída integral retornada pela execução:

```text
TAP version 13
# Subtest: apps/site/tests/draft-restore.test.mjs
ok 1 - apps/site/tests/draft-restore.test.mjs
  ---
  duration_ms: 87.907782
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 94.958824
```

### Execução 2 — validação compartilhada no publicador

```sh
timeout 60s node --test --test-name-pattern='rascunho inválido|limites de tamanho' apps/site/tests/publish-imob-pilot.test.mjs
```

Exit code: 0. Saída integral retornada pela execução:

```text
TAP version 13
# Subtest: apps/site/tests/publish-imob-pilot.test.mjs
ok 1 - apps/site/tests/publish-imob-pilot.test.mjs
  ---
  duration_ms: 214.550659
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 220.891038
```

### Resultado e limitações

Status: **parcial**. Os dois comandos retornaram exit 0, sem falhas informadas, mas cada TAP registrou somente um resultado agregado por arquivo. A saída não enumera nem comprova individualmente os nove casos definidos na restauração ou os três casos selecionados no publicador; não declarar 12/12 PASS. Não houve reexecução nem adaptação de ambiente para obter outra saída.

A suíte existente cobre no código parsing, validação, campos permitidos da marca, conversão dos imóveis, resumo, substituição em localStorage simulado, ida e volta e chaves perigosas. Essa descrição de cobertura estática é distinta dos resultados individualizados que não apareceram no TAP.

Permanecem sem comprovação nesta rodada: fluxo real do seletor de arquivo e confirmação/cancelamento no navegador; restauração conjunta da marca e imóveis sob falha intermediária de armazenamento; leitura de arquivo com falha. Nenhum defeito funcional foi demonstrado por esses comandos.

Próxima intervenção mínima: autorizar uma verificação focal da ausência de resultados internos no runner nativo, sem repetir automaticamente testes, seguida somente da validação ainda não comprovada; a aceitação do fluxo em navegador exige autorização própria. Nenhuma correção de produto, sincronização, stage, commit, publicação ou deployment autorizada por este registro. Preservações anteriores permanecem válidas no seu escopo, com a limitação de redundância física no mesmo disco D:. Asset Destination e as demais frentes não foram modificados.


## Comprovação focal TWDG — casos internos e continuidade (2026-11-27)

Executor: Codex. Autorização humana: esclarecimento limitado a cinco minutos, uma única rodada focal dos casos não comprovados, revisão de cobertura e reconciliação do incremento, sem alterar produto/assertions/configuração ou integrar trabalho.

### Esclarecimento encerrado

Runtime: Node v22.17.1, `/usr/local/bin/node`. Na consulta efetuada, `NODE_OPTIONS`, `NODE_TEST_CONTEXT` e `NODE_TEST_REPORTER` não estavam definidos. Os arquivos importam `node:test`; não foi encontrado reporter customizado aplicável nos comandos consultados.

O código nativo `internal/test_runner/runner` foi lido na própria versão efetiva: `runTestFile` cria um processo filho com `NODE_TEST_CONTEXT=child-v8`; `FileTest.#skipReporting` omite o resultado do invólucro quando existem eventos internos; `report` emite o resultado do arquivo quando não existem esses eventos; o processo precisa terminar com exit 0 para esse resultado ser aprovado. Isso explica a forma dos dois TAP anteriores, mas não permite comprovar retrospectivamente a execução das assertions internas. A causa ambiental da ausência dos eventos internos não foi demonstrada; não foi presumido defeito no produto nem ausência de execução.

Para encerrar a lacuna, executaram-se diretamente os arquivos existentes, com o reporter TAP nativo e sem `--test`, evitando a camada de processos filhos do launcher. O próprio `node:test` executa os casos registrados no arquivo. Nenhum harness, preload ou assertion foi criado ou alterado. Verificação e rodada encerradas dentro de cinco minutos, sem reexecuções adicionais.

### Rodada autorizada — saídas integrais

```sh
timeout 60s node --test-reporter=tap apps/site/tests/draft-restore.test.mjs
```

Exit code 0. Nove casos executados, nove aprovados, zero falhas, cancelamentos ou skips:

```text
TAP version 13
# Subtest: parseDraftText aceita um rascunho válido e explica em português o que não serve
ok 1 - parseDraftText aceita um rascunho válido e explica em português o que não serve
  ---
  duration_ms: 1.503662
  type: 'test'
  ...
# Subtest: parseDraftText recusa arquivo grande demais antes de ler o JSON
ok 2 - parseDraftText recusa arquivo grande demais antes de ler o JSON
  ---
  duration_ms: 0.186079
  type: 'test'
  ...
# Subtest: brandFromDraft guarda só os campos conhecidos, no formato do editor
ok 3 - brandFromDraft guarda só os campos conhecidos, no formato do editor
  ---
  duration_ms: 1.120754
  type: 'test'
  ...
# Subtest: editsFromDraft converte os imóveis no registro do editor
ok 4 - editsFromDraft converte os imóveis no registro do editor
  ---
  duration_ms: 2.543641
  type: 'test'
  ...
# Subtest: editsFromDraft descarta fotos grandes demais
ok 5 - editsFromDraft descarta fotos grandes demais
  ---
  duration_ms: 0.534805
  type: 'test'
  ...
# Subtest: summarizeDraft fala em singular e plural
ok 6 - summarizeDraft fala em singular e plural
  ---
  duration_ms: 0.356433
  type: 'test'
  ...
# Subtest: replaceClientProperties substitui tudo, valida cada registro e avisa quando o navegador não guarda
ok 7 - replaceClientProperties substitui tudo, valida cada registro e avisa quando o navegador não guarda
  ---
  duration_ms: 0.792021
  type: 'test'
  ...
# Subtest: ida e volta: editar, exportar, limpar o navegador e reabrir devolve a mesma vitrine
ok 8 - ida e volta: editar, exportar, limpar o navegador e reabrir devolve a mesma vitrine
  ---
  duration_ms: 1.02164
  type: 'test'
  ...
# Subtest: um arquivo com chaves perigosas não contamina nada nem leva campos desconhecidos
ok 9 - um arquivo com chaves perigosas não contamina nada nem leva campos desconhecidos
  ---
  duration_ms: 0.318849
  type: 'test'
  ...
1..9
# tests 9
# suites 0
# pass 9
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 45.431358
```

```sh
timeout 60s node --test-reporter=tap --test-name-pattern='rascunho inválido|limites de tamanho' apps/site/tests/publish-imob-pilot.test.mjs
```

Exit code 0. Três casos executados, três aprovados, zero falhas, cancelamentos ou skips:

```text
TAP version 13
# Subtest: rascunho inválido não cria nem altera pasta
ok 1 - rascunho inválido não cria nem altera pasta
  ---
  duration_ms: 5.586664
  type: 'test'
  ...
# Subtest: o rascunho inválido lista todos os problemas de uma vez, em português
ok 2 - o rascunho inválido lista todos os problemas de uma vez, em português
  ---
  duration_ms: 0.445879
  type: 'test'
  ...
# Subtest: limites de tamanho do rascunho são aplicados
ok 3 - limites de tamanho do rascunho são aplicados
  ---
  duration_ms: 0.43639
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 29.756796
```

A restrição anterior de não declarar 12/12 continua descrevendo apenas a rodada agregada histórica. Nesta nova rodada, os 12 resultados estão individualmente identificados. As demais suítes não foram repetidas.

### Cobertura e pendência de produto

| Propriedade | Evidência e limite |
| --- | --- |
| Recusa de JSON/dados inválidos e limites | Comprovada nos casos executados de parsing e validação compartilhada. |
| Conversão da marca | Caso `brandFromDraft` aprovado: whitelist/formato; não grava a marca no fluxo completo. |
| Restauração dos imóveis | Ida e volta de três imóveis, campos, fotos e temporada em localStorage simulado, aprovada. |
| Confirmação antes da substituição | Leitura estática em `site-setup.mjs:295`; não exercitada em navegador por esta suíte. |
| Cancelamento preservando conteúdo | Retorno anterior às gravações no código; não há caso existente que exercite a interação. |
| Falha ao gravar imóveis | Caso existente injeta erro de cota e comprova retorno negativo; não verifica recuperação de um estado anterior preenchido nessa falha. |
| Restauração conjunta marca/imóveis | Não comprovada pelo roundtrip: ele não chama `saveBrand` nem executa o handler completo. |
| Falha intermediária/recuperação | Lacuna concreta na implementação: `site-setup.mjs:296` grava imóveis antes de `saveBrand` na linha 297. Se a segunda gravação falha, só exibe erro/retorna, sem restaurar imóveis anteriores. `client-brand.mjs:26` captura a falha e retorna false. A atualização posterior do rascunho em IndexedDB também está fora de uma transação conjunta com essas gravações. Não foi executada injeção dessa falha; conclusão fundamentada em leitura estática. |

As evidências históricas de 20/11 e 22/11 seguem aproveitadas no escopo original. Não comprovam o novo cancelamento ou recuperação de escrita parcial.

### Atualização analítica da linha Site IMOB da reconciliação TWDG

Main de referência local consultada, sem fetch: `88b17c432af5a20806fd38bcef5a741c2f31802f`. Não foi consultada recência remota nesta rodada.

`git diff --name-status origin/main HEAD -- apps/site` não apresentou diferenças: o conteúdo Site versionado no HEAD antigo já corresponde à main de referência. A reconciliação abaixo complementa o ponto de continuidade existente; não cria nova matriz/inventário nem modifica a matriz física.

- Incorporado: baseline de vitrines, cadastro/editor, exportação e publicador, demonstrações/guia e demais arquivos Site versionados no HEAD, iguais à referência local.
- Residual local: 11 arquivos rastreados modificados (70 inserções/64 remoções sobre a referência, somente nesse conjunto rastreado) e quatro novos dos 15 conteúdos preservados. Os quatro caminhos novos não existem na árvore da main consultada.
- Funcionalidade residual: abertura de arquivo, validação compartilhada extraída para `draft-rules.mjs`, conversores em `draft-restore.mjs`, substituição de imóveis, handler/mensagens e ações do editor. Inclui alterações adjacentes de apresentação de links como botões e rótulo explícito de prévia local; o teste de botões permanece fora da comprovação desta rodada.
- Documentação/evidências: adendos neste registro e entrada já existente no Evidence Index, preservando histórico. Não transportar versões antigas integrais desses documentos para a main.
- Dependências efetivas: módulos estáticos, DOM, File, localStorage e IndexedDB; publicador e navegador precisam receber juntos o módulo compartilhado. Não depende de Core, API, agentes, PostgreSQL ou Redis para essa validação.
- Cache Wrangler permanece excluído da seleção. Preservação anterior dos 15 arquivos reutilizada, sem novas cópias ou hashes; mantém a limitação física conhecida do disco D:.

### Próxima intervenção mínima proposta, sem execução

Autorizar a correção focal da restauração composta, com comportamento recuperável definido para falha na gravação da marca, dos imóveis ou do rascunho IndexedDB, preservando o estado anterior; acrescentar a cobertura de confirmação/cancelamento e falhas parciais no mecanismo de testes da frente. Os 12 casos aprovados permanecem aplicáveis enquanto seus insumos não mudarem. A cobertura adjacente de botões precisa ser tratada proporcionalmente se incluída na futura integração.

Não foi identificado comando dedicado de aceitação de navegador do Site nos scripts consultados. Existe histórico de prévia estática local. Como utilização mínima proposta, sem execução: servir `apps/site/public` com `python3 -m http.server 8765 --bind 127.0.0.1 --directory apps/site/public` e abrir `http://127.0.0.1:8765/imob/ia-cliente/criar-site/` em perfil de teste, com dados sintéticos e acesso externo bloqueado. Essa é alternativa com biblioteca padrão, não um teste automatizado nativo já existente; exige autorização específica. Não usar Wrangler, enviar formulários ou publicar arquivos.

Status consolidado: **parcial** para aceitação funcional e preparação de integração; testes focais 12/12 comprovados. Integração depende da resolução da escrita parcial e cobertura residual, além de preflight próprio. Sem alterações de código, assertions, infraestrutura ou operações Git de escrita. Asset Destination e demais frentes preservados.


## Restauração composta — correção e proteção contra perda de dados (2026-11-27)

Executor: Codex. Autorização humana específica para correção mínima, novos testes e regressões diretamente afetadas, sem integração ou publicação.

### Preflight e escopo

Worktree `EIAH_SITE_IMOB_PUBLICACAO`, branch `feat/imob-abrir-rascunho`, HEAD `2b9225da68e4dd83fecec9cc5ff322b932a9e0ee` e stage vazio confirmados. Preflight concluído em menos de cinco minutos. Reutilizados os 15 arquivos preservados e os adendos documentais existentes; sem auditoria, nova preservação ou investigação de reporting.

Causa anterior: handler gravava imóveis, depois marca e depois o rascunho IndexedDB; falhas posteriores não recuperavam as gravações locais anteriores. A causa foi identificada por inspeção, sem reexecutar a versão defeituosa.

### Delta focal desta intervenção

- `apps/site/public/imob/client-brand.mjs`: exporta a identidade da chave já existente; inicialização visual condicionada à presença de DOM, permitindo reutilizar os mesmos writers no teste nativo, sem outra implementação de persistência.
- `apps/site/public/imob/draft-restore.mjs`: acrescenta `restoreDraftText`. Valida/converte o arquivo, exige confirmação, captura em memória o texto anterior das duas chaves e só então grava pelos helpers existentes. Aguarda o callback de persistência do rascunho. Em falha, tenta recuperar todas as chaves, preservando inclusive a ausência original; confere a recuperação e diferencia recuperação bem-sucedida de falha de recuperação. Nunca retorna `ok: true` nessas falhas.
- `apps/site/public/imob/site-setup.mjs`: usa esse fluxo, aguarda `updateSetup` existente, serializa a operação pelo indicador `busy` e apresenta sucesso somente após o commit. Reutiliza a construção do rascunho entre importação e restauração. Falha de leitura do arquivo também é comunicada. Não altera o botão/fluxo de publicação nem publica automaticamente.
- `apps/site/tests/draft-restore.test.mjs`: acrescenta 13 testes no arquivo existente, sem modificar assertions anteriores.
- Este registro e a entrada existente no Evidence Index recebem somente os resultados efetivamente produzidos.

Não foi acrescentada chave de armazenamento, tabela, camada de persistência, dependência, configuração operacional ou harness temporário.

### Uma rodada focal — TAP integral

```sh
timeout 60s node --test-reporter=tap --test-name-pattern='restauração composta|^replaceClientProperties|^ida e volta' apps/site/tests/draft-restore.test.mjs
```

Exit code: 0. Resultado: 15/15 aprovados (13 novos + duas regressões), zero falhas, cancelamentos ou skips. As duas regressões de substituição e roundtrip foram selecionadas por dependerem diretamente dos mesmos registros/writers usados pela restauração composta. Os sete outros casos antigos e os três do validador compartilhado não foram repetidos; seus resultados permanecem históricos e aplicáveis às funções não alteradas.

```text
TAP version 13
# Subtest: replaceClientProperties substitui tudo, valida cada registro e avisa quando o navegador não guarda
ok 1 - replaceClientProperties substitui tudo, valida cada registro e avisa quando o navegador não guarda
  ---
  duration_ms: 3.972736
  type: 'test'
  ...
# Subtest: ida e volta: editar, exportar, limpar o navegador e reabrir devolve a mesma vitrine
ok 2 - ida e volta: editar, exportar, limpar o navegador e reabrir devolve a mesma vitrine
  ---
  duration_ms: 3.898001
  type: 'test'
  ...
# Subtest: restauração composta: valida antes da confirmação e de qualquer gravação
ok 3 - restauração composta: valida antes da confirmação e de qualquer gravação
  ---
  duration_ms: 0.58635
  type: 'test'
  ...
# Subtest: restauração composta: cancelamento explícito mantém marca e imóveis intactos
ok 4 - restauração composta: cancelamento explícito mantém marca e imóveis intactos
  ---
  duration_ms: 0.398866
  type: 'test'
  ...
# Subtest: restauração composta: ausência de confirmação válida impede a substituição
ok 5 - restauração composta: ausência de confirmação válida impede a substituição
  ---
  duration_ms: 0.518873
  type: 'test'
  ...
# Subtest: restauração composta: sucesso restaura marca e imóveis e mantém a publicação anterior
ok 6 - restauração composta: sucesso restaura marca e imóveis e mantém a publicação anterior
  ---
  duration_ms: 0.728966
  type: 'test'
  ...
# Subtest: restauração composta: falha ao preservar o estado anterior impede qualquer gravação
ok 7 - restauração composta: falha ao preservar o estado anterior impede qualquer gravação
  ---
  duration_ms: 0.872241
  type: 'test'
  ...
# Subtest: restauração composta: falha na primeira gravação conserva os dados anteriores e não confirma sucesso
ok 8 - restauração composta: falha na primeira gravação conserva os dados anteriores e não confirma sucesso
  ---
  duration_ms: 0.459757
  type: 'test'
  ...
# Subtest: restauração composta: falha na segunda gravação recupera exatamente a marca e os imóveis anteriores
ok 9 - restauração composta: falha na segunda gravação recupera exatamente a marca e os imóveis anteriores
  ---
  duration_ms: 0.494641
  type: 'test'
  ...
# Subtest: restauração composta: recuperação remove chaves que não existiam antes
ok 10 - restauração composta: recuperação remove chaves que não existiam antes
  ---
  duration_ms: 0.75771
  type: 'test'
  ...
# Subtest: restauração composta: falha na própria recuperação é explícita e nunca retorna sucesso
ok 11 - restauração composta: falha na própria recuperação é explícita e nunca retorna sucesso
  ---
  duration_ms: 0.32646
  type: 'test'
  ...
# Subtest: restauração composta: falha da transação do rascunho recupera as duas gravações locais
ok 12 - restauração composta: falha da transação do rascunho recupera as duas gravações locais
  ---
  duration_ms: 0.319463
  type: 'test'
  ...
# Subtest: restauração composta: recuperação continua nos imóveis mesmo quando a recuperação da marca falha
ok 13 - restauração composta: recuperação continua nos imóveis mesmo quando a recuperação da marca falha
  ---
  duration_ms: 0.248398
  type: 'test'
  ...
# Subtest: restauração composta: falha ao remover chave durante recuperação também é comunicada
ok 14 - restauração composta: falha ao remover chave durante recuperação também é comunicada
  ---
  duration_ms: 0.196373
  type: 'test'
  ...
# Subtest: restauração composta: sucesso só é retornado depois da confirmação do commit
ok 15 - restauração composta: sucesso só é retornado depois da confirmação do commit
  ---
  duration_ms: 0.180618
  type: 'test'
  ...
1..15
# tests 15
# suites 0
# pass 15
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 52.950735
```

### Verificações sintáticas

- `timeout 60s node --check apps/site/public/imob/client-brand.mjs`: exit 0, sem diagnóstico.
- `timeout 60s node --check apps/site/public/imob/draft-restore.mjs`: exit 0, sem diagnóstico.
- `timeout 60s node --check apps/site/public/imob/site-setup.mjs`: exit 0, sem diagnóstico.
- `timeout 60s node --check apps/site/tests/draft-restore.test.mjs`: exit 0, sem diagnóstico.

### O que a injeção de falha comprova

Os testes usam o localStorage em memória já existente e os writers reais da marca/imóveis. A falha da segunda gravação é injetada após uma assertion que confirma a alteração da primeira chave. A recuperação restaura exatamente os valores anteriores. Foram também comprovados cancelamento sem alteração, validação antes de confirmar/gravar, sucesso conjunto sem publicação, impedimento de gravações quando o snapshot não pode ser lido, falha na primeira gravação, remoção das chaves originalmente ausentes, falha no callback de commit, continuidade da recuperação quando uma chave falha e mensagem explícita sem falso sucesso quando a recuperação é impossível. Uma Promise pendente comprova que o resultado positivo aguarda a conclusão do callback.

### Limites e próxima intervenção

Esta é recuperação compensatória em memória, não atomicidade absoluta. localStorage oferece operações por chave; não há transação única com IndexedDB. Fechamento/crash, falha física, concorrência entre abas e recuperação após reiniciar a página não são cobertos. O teste usa callback controlado para o commit do rascunho: não executou IndexedDB real, seletor de arquivo nem diálogo nativo do navegador. Uma recusa persistente do armazenamento pode impedir a recuperação; nesse caso a interface comunica a falha e orienta conferir os dados e utilizar a cópia do rascunho salvo.

Status da correção no escopo unitário: evidenciado. Status da aceitação funcional completa e preparação de integração: parcial, aguardando aceitação local em navegador. As evidências históricas dos 12/12 anteriores e os registros das limitações anteriores foram preservados; a lacuna de ausência de compensação neles descrita é histórica, tratada por este delta e pela nova rodada.

Próxima intervenção mínima proposta: autorização específica para aceitação em perfil sintético, servidor estático em loopback e acesso externo bloqueado, sem Wrangler/publicação. Usar os caminhos e procedimento propostos no adendo anterior para confirmar restauração, cancelar, rejeitar arquivo inválido e observar falhas de armazenamento/IndexedDB. Não executar stage, commit ou integração antes dessa decisão.

As demais worktrees e todos os freezes, holds, No-Go Ledgers e bloqueios operacionais permanecem preservados.


## Aceitação funcional em navegador — interrompida em C (2026-11-27)

Executor: Codex. Autorização humana: aceitação local, perfil descartável, loopback e evidências; sem alteração de produto, assertions, integração ou publicação.

### Ambiente e isolamento

- Worktree `EIAH_SITE_IMOB_PUBLICACAO`, branch `feat/imob-abrir-rascunho`, HEAD `2b9225da68e4dd83fecec9cc5ff322b932a9e0ee`; stage vazio no preflight.
- Playwright 1.61.1 já instalado no ambiente central EIAH_BUILDER, reutilizado por leitura; Chromium real 149.0.7827.55 já disponível em cache. Nenhuma instalação e nenhum harness ou script auxiliar criado.
- Chromium headless com contexto novo descartável, sem perfil pessoal, service workers bloqueados, downloads não aceitos e flags para desabilitar serviços de background e resolução externa.
- Servidor Python estático com bind explícito em `127.0.0.1:8765`. A consulta efetiva de sockets confirmou somente esse endereço para o processo criado (PID 35037).
- Roteamento do contexto permite somente a origem `http://127.0.0.1:8765`. Uma tentativa sintética a `https://isolation-probe.invalid/` foi interceptada e abortada pelo roteamento, sem acesso ao serviço externo; a Promise fetch rejeitou como esperado.
- Preparação ambiental e confirmação de isolamento encerradas em menos de cinco minutos. O sandbox bloqueou a criação/consulta de sockets; os mesmos comandos foram executados fora dele mediante aprovação de runtime. A leitura de `/proc/net/tcp` no sandbox não enxergou o socket do processo externo e não foi usada como prova de isolamento.
- Dados de marca, perfil, imóveis e arquivo exclusivamente sintéticos. O endereço de e-mail usado foi `qa@example.invalid`.

### Comandos e interações efetivamente utilizados

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory apps/site/public
node -i
ss -ltnp '( sport = :8765 )'
```

O Node interativo foi iniciado no ambiente que já contém Playwright. As interações usaram diretamente as APIs existentes: `chromium.launch`, `browser.newContext`, `context.route`, `page.goto`, `locator.fill/click`, `waitForEvent('filechooser')`, `FileChooser.setFiles`, diálogo nativo `dismiss/accept`, leituras de DOM/armazenamento e `page.screenshot`. Não se criou outro arquivo de teste ou harness. O seletor real do input foi acionado pelo botão; a escolha foi automatizada via Playwright, sem exercitar um diálogo gráfico de arquivos do sistema operacional.

O estado anterior foi preparado por formulário real com perfil sintético, helpers reais de marca/imóveis no navegador, importação pela interface e geração da **prévia local** pelo botão existente. Isso cria o campo `published` sintético do IndexedDB; não publica externamente. As operações observadas de rede foram GETs da origem local.

### Resultados observados

| Cenário | Resultado | Evidência |
| --- | --- | --- |
| A — abrir arquivo pelo seletor | PASS | Botão abriu o FileChooser do input; `vitrine-imob.json` disparou o diálogo nativo com a marca sintética e aviso de substituição. |
| B — cancelar confirmação | PASS | Diálogo dispensado; comparação integral dos registros de localStorage e do objeto retornado por readSetup/IndexedDB permaneceu igual ao estado anterior. |
| C — confirmar e observar marca/imóveis | FAIL | Diálogo aceito; rascunho IndexedDB contém marca e imóvel restaurados; tela de origem mostra sucesso. Ao abrir o editor, o campo `#brandName` está vazio e a prévia exibe “Sua imobiliária”. O seletor de imóveis contém “Casa Sintética Restaurada”. |
| D — recarregar e comprovar persistência | NOT_RUN | Interrompido após falha funcional em C. |
| E — arquivo inválido pela interface | NOT_RUN | Fixture criada, mas não submetida após a interrupção. Evidência unitária anterior preservada, sem convertê-la em aceitação de navegador. |
| F — publicação anterior e ausência de publicação automática | NOT_RUN | Sem certificação integral do cenário. Observação parcial já obtida: campo published permaneceu igual até C; nenhum request não-GET observado. |
| G — ordem entre commit real e resolução de updateSetup | NOT_RUN | Não foi executada instrumentação específica da ordenação de eventos. O readSetup real posterior não substitui essa comprovação. |
| H — falhas de armazenamento/IndexedDB | NOT_RUN | Nenhuma injeção de falha executada; interrompido após C. |

Contagem: dois cenários aprovados, um reprovado e cinco não executados. Não houve correção ou reexecução. O processo interativo encerrou com exit 0; esse exit code **não** representa aprovação da aceitação funcional.

### Falha e limites da conclusão

A tela de origem informou “Rascunho aberto: a marca e 1 imóvel voltaram ao editor.” e seu status continha “Marca Sintética Restaurada · 1 imóvel editado”. O objeto efetivamente lido do IndexedDB continha `draft.brand.name = Marca Sintética Restaurada` e `draft.properties[0].titulo = Casa Sintética Restaurada`. Entretanto, o formulário do editor não exibiu essa marca. A consulta dos erros JavaScript retidos pelo editor não retornou erros.

Esses resultados demonstram falha no critério funcional C da interface, não perda comprovada dos dados persistidos. A causa da ausência de preenchimento do editor e sua relação com o delta não foram investigadas nesta etapa; não classificar como regressão introduzida nem como condição preexistente sem evidência. A inspeção terminou na coleta dos resultados já disponíveis.

Os resultados unitários anteriores (12/12 históricos e 15/15 da correção, com dois casos de regressão incluídos) continuam preservados no escopo próprio, sem repetição. Não comprovam os cenários D–H do navegador. Permanecem as limitações conhecidas da compensação em memória: sem atomicidade absoluta, proteção contra crash, disputa entre abas ou falha física; nenhuma investigação adicional dessas condições foi iniciada.

### Evidências reais e encerramento

- `docs/ops/evidence/latest/imob-draft-restore-browser-2026-11-27/resultado.json`: resultados, dados sintéticos anteriores/restaurados, observações de interface e requisições locais.
- `docs/ops/evidence/latest/imob-draft-restore-browser-2026-11-27/cancelamento.png`: estado após cancelamento.
- `docs/ops/evidence/latest/imob-draft-restore-browser-2026-11-27/restauracao-status-sucesso.png`: mensagem de sucesso na origem.
- `docs/ops/evidence/latest/imob-draft-restore-browser-2026-11-27/editor-marca-nao-restaurada.png`: editor com nome vazio/prévia sem a marca restaurada.

Contexto e Chromium fechados pelo Playwright, conexão do browser confirmada encerrada; diretório temporário das fixtures removido e ausência confirmada. Servidor encerrado por Ctrl-C, exit 0; sessão Node encerrada por `.exit`, exit 0. Nenhum recurso operacional foi iniciado ou alterado.

Parecer: **parcial**, com aceitação funcional reprovada no cenário C; não preparar integração como funcionalmente aceita. Próxima intervenção mínima proposta: autorizar diagnóstico focal do preenchimento inicial da marca em `brand-editor.mjs` e, conforme a causa comprovada, a menor correção necessária. Só depois retomar os cenários afetados e pendentes, sem repetir automaticamente A/B ou testes unitários não afetados. Esta proposta não foi executada.

Nenhum código, assertion ou configuração de produto foi alterado. Demais worktrees, preservações, freezes, holds, No-Go Ledgers e bloqueios operacionais mantidos.


## Correção da apresentação da marca e aceitação C–H (2026-11-27)

Executor: Codex. Autorização humana específica para diagnóstico focal, correção mínima, regressão e continuidade da aceitação, sem integração ou publicação. Diagnóstico localizado em menos de dez minutos; preservação e reconciliação anteriores não foram repetidas.

### Causa concreta e correção

A estrutura persistida e a chave `eiah-imob-visual:client-brand:v1` eram compatíveis com o editor. `brand-editor.mjs` lia `readSavedBrand()` na abertura, mas copiava somente `contactFields` para o formulário. Nome, apresentação e cor pertencem a `profileFields`, e o logo permanecia na variável inicial vazia. Esses dados só eram carregados integralmente pelo botão `loadSavedBrand`. Ao final da inicialização, o `refresh()` existente construía a prévia com os campos vazios, produzindo “Sua imobiliária”. A divergência está na inicialização dos campos, sem evidência de falha de armazenamento ou disputa entre módulos.

Único arquivo de produto modificado nesta intervenção: `apps/site/public/imob/brand-editor.mjs`. Diff funcional completo, duas inserções e uma remoção:

```diff
 const savedAtOpen = readSavedBrand();
-for (const field of contactFields) {
+logo = savedAtOpen.logo ?? '';
+for (const field of profileFields) {
   form.elements.namedItem(field).value = savedAtOpen[field] ?? '';
 }
```

O `refresh()` e o botão de carregamento existentes são preservados. Nenhuma mudança na chave, formato do rascunho, contratos de persistência, restauração compensatória ou armazenamento foi necessária. Não foi criado editor, camada de persistência ou harness auxiliar.

### Ambiente, regressão e resultados reaproveitados

Reutilizados Playwright 1.61.1 e Chromium 149.0.7827.55 já instalados, mediante leitura do ambiente central; nenhum arquivo de outra worktree foi alterado. Contexto novo descartável, dados sintéticos, service workers bloqueados e roteamento restrito a `http://127.0.0.1:8765`; sonda externa interceptada e abortada antes da rede. `ss` confirmou bind exclusivo em `127.0.0.1:8765` (processo criado PID 40233).

Comandos: `python3 -u -m http.server 8765 --bind 127.0.0.1 --directory apps/site/public`, `node -i`, `ss -ltnp '( sport = :8765 )'`, além das interações Playwright diretas. Sem script/harness de navegador adicional ou instalação.

Teste específico de regressão **R1: PASS**, executado no próprio Chromium: abriu o editor com uma marca sintética já salva e conferiu nome, apresentação, cor, logo, contatos e texto da prévia, sem acionar “Carregar dados salvos”. As assertions e observações são registradas em `resultado-correcao-marca.json`; não se usou simulação de DOM para certificar essa inicialização.

`timeout 60s node --check apps/site/public/imob/brand-editor.mjs`: exit 0, sem diagnóstico.

Reaproveitados: A/B da rodada anterior e os testes unitários históricos de 12/12 e 15/15, sem repetição. A correção não altera validação, confirmação, cancelamento, gravação ou compensação; somente a apresentação inicial. Formulário de perfil, gravação das fixtures, importação e criação de uma prévia local anterior foram preparações desta rodada, não reexecução integral de A/B nem publicação externa.

### Aceitação consolidada A–H

| Cenário | Resultado | Evidência efetiva |
| --- | --- | --- |
| A — seletor real | PASS reaproveitado | `resultado.json` original, preservado. |
| B — cancelamento sem perda | PASS reaproveitado | Comparação integral original de localStorage e IndexedDB, preservada. |
| C — apresentação após restaurar | PASS novo | Confirmação nativa aceita; editor exibe nome, apresentação, cor, logo, prévia e título do imóvel restaurados, sem carregamento manual adicional. |
| D — persistência após recarregar | PASS novo | Página de criação e editor recarregados; localStorage e IndexedDB iguais ao estado restaurado; marca, logo e imóvel continuam na interface. |
| E — arquivo inválido | PASS novo | Arquivo recusado antes de qualquer confirmação; zero diálogos e registros anteriores integralmente preservados. |
| F — prévia/publicação anterior | PASS novo | Campo published idêntico ao anterior ao longo de C–H; botão de atualização continua disponível; somente GETs locais observados, nenhuma publicação automática. |
| G — conclusão da transação | PASS novo | Instrumentação reversível na criação da transação real observou `transaction-complete` antes de `updateSetup-resolved`; leitura por nova conexão confirmou o mesmo registro. |
| H — falhas controladas e recuperação | PASS novo, dois probes | H1 falhou na gravação da marca após alterar realmente os imóveis; H2 abortou uma transação IndexedDB real após alterar ambas as chaves locais. Em ambos os casos, valores anteriores de localStorage/IndexedDB foram exatamente recuperados e a interface exibiu erro/recuperação, sem sucesso falso. |

Consolidado: oito cenários cobertos, sendo dois reaproveitados e seis executados nesta rodada, mais a regressão R1. H possui dois probes individualizados. Nenhum erro JavaScript foi retido na página principal ou editor.

### Injeções e limites

H1 substituiu temporariamente `Storage.prototype.setItem` para lançar `QuotaExceededError` na segunda gravação. A instrumentação confirmou que a primeira gravação havia alterado os imóveis. Não foi alegado esgotamento físico de cota.

H2 envolveu temporariamente `IDBObjectStore.prototype.put`, efetuou o put nativo e chamou `transaction.abort()` na transação real do rascunho. Confirmou alterações de ambas as chaves locais e observou o evento nativo `abort`. Não foi usado dublê de IndexedDB. As alterações de protótipos foram revertidas em `finally`, sem editar produto.

A recuperação continua compensatória, sem atomicidade absoluta entre localStorage e IndexedDB. Crash, perda de energia, disputa entre abas e falha física não foram exercitados nem investigados. A falha da própria recuperação tem evidência unitária anterior; não foi reinjetada no navegador nesta rodada. Aceitação restrita ao Chromium headless desktop, com seletor de input automatizado por Playwright; não certifica outros navegadores, dispositivo móvel, diálogo gráfico manual do SO ou ambiente publicado.

### Evidências antes/depois e encerramento

A falha original, seu JSON e suas três capturas permanecem fisicamente preservados, sem sobrescrita. Novas evidências no mesmo acervo:

- `docs/ops/evidence/latest/imob-draft-restore-browser-2026-11-27/resultado-correcao-marca.json`
- `docs/ops/evidence/latest/imob-draft-restore-browser-2026-11-27/marca-corrigida.png`
- `docs/ops/evidence/latest/imob-draft-restore-browser-2026-11-27/imovel-restaurado-corrigido.png`
- `docs/ops/evidence/latest/imob-draft-restore-browser-2026-11-27/arquivo-invalido-corrigido.png`
- `docs/ops/evidence/latest/imob-draft-restore-browser-2026-11-27/falha-marca-recuperada.png`
- `docs/ops/evidence/latest/imob-draft-restore-browser-2026-11-27/falha-indexeddb-recuperada.png`

Contexto e browser fechados, conexão Chromium confirmada encerrada; fixtures temporárias removidas e ausência confirmada. Servidor encerrado por Ctrl-C com exit 0; Node encerrado por `.exit` com exit 0. Esses exits descrevem encerramento dos recursos; os resultados de aceitação vêm das assertions/observações registradas.

Status: **evidenciado no escopo funcional local executado**, sem autorização de integração ou operação. A reprovação histórica de C foi resolvida pela correção focal e pela nova evidência, sem apagar o histórico.

Parecer de preparação: o fluxo de restauração está apto à revisão e preparação de preservação/integração governada no escopo validado. Antes de consolidar todo o delta local, conferir também o escopo adjacente de links/botões já registrado (inclui `acoes-como-botoes.test.mjs`, não executado nesta etapa por não ser afetado pela correção) e realizar preflight TWDG específico para a operação autorizada. Não transportar documentos antigos completos para sobrescrever atualizações da main. Nenhum commit, fetch, sincronização, PR, merge ou deployment foi realizado.

Todas as demais frentes, freezes, holds, No-Go Ledgers e bloqueios operacionais permanecem preservados.


## Preparação final do delta Site IMOB para commit local (2026-11-27)

Executor: Codex. Escopo humano autorizado: inspeção do delta, dependências, hooks, material publicável e uma rodada da validação residual adjacente; proposta de commit, sem stage ou operações Git de escrita.

### Preflight e dependências

Confirmados worktree `EIAH_SITE_IMOB_PUBLICACAO`, branch `feat/imob-abrir-rascunho`, HEAD `2b9225da68e4dd83fecec9cc5ff322b932a9e0ee` e stage vazio. Os incrementos anteriores foram preservados.

Conjunto proposto: 29 arquivos existentes no delta, sendo 15 fontes do Site (módulos, HTML, CSS e publicador), dois testes nativos, dois documentos e dez artefatos reais de navegador (oito PNGs e dois JSONs). Essa composição utiliza a seleção existente e não cria outro inventário ou matriz. O cache preexistente `.wrangler/cache/wrangler-account.json` permanece fora do commit, sem leitura de seu conteúdo nem exclusão física.

As dependências devem viajar juntas: `site-setup.mjs` importa `draft-restore.mjs`; este usa `draft-rules.mjs` e os helpers de marca/imóveis. O publicador importa/reexporta `validateDraft` do mesmo `draft-rules.mjs`. O HTML de criação fornece os IDs usados pelo handler; CSS, correção de inicialização da marca e testes acompanham o conjunto. Nenhum arquivo de configuração operacional, dependência, schema ou migration integra o delta.

### Única validação residual desta etapa

```sh
timeout 60s node --test-reporter=tap apps/site/tests/acoes-como-botoes.test.mjs
```

Exit code 0. Três casos aprovados; zero falhas, cancelamentos ou skips. Saída integral:

```text
TAP version 13
# Subtest: nenhuma ação no conteúdo das páginas é link solto: só o cabeçalho usa quiet-link
ok 1 - nenhuma ação no conteúdo das páginas é link solto: só o cabeçalho usa quiet-link
  ---
  duration_ms: 14.307368
  type: 'test'
  ...
# Subtest: os links de navegação do cabeçalho continuam links, para o layout do celular
ok 2 - os links de navegação do cabeçalho continuam links, para o layout do celular
  ---
  duration_ms: 0.644294
  type: 'test'
  ...
# Subtest: os botões de ação mantêm destino, texto e identificadores que o código usa
ok 3 - os botões de ação mantêm destino, texto e identificadores que o código usa
  ---
  duration_ms: 0.451073
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 23.255848
```

O teste confere ausência de `quiet-link` no conteúdo, preservação dos links de cabeçalho e das classes/destinos/textos/IDs das ações. A inspeção do diff confirmou mudanças de classes sem alteração dos destinos das âncoras. Trata-se de cobertura estrutural proporcional às alterações adjacentes, não de homologação visual/mobile ou execução de todas as jornadas alcançáveis por esses links.

Reaproveitados, sem repetição: 12/12 da validação inicial, 15/15 da correção compensatória, regressão R1 da marca, aceitação A–H (A/B históricos, C–H posteriores) e dois probes reais de falha no navegador. Nenhuma lacuna funcional adicional foi demonstrada nesta rodada.

### Referências e hooks da operação futura

`origin/main` local: `88b17c432af5a20806fd38bcef5a741c2f31802f`. Última atualização registrada no reflog: `2026-11-25T18:01:15-03:00`, por fetch fast-forward. Essa data é a recência da referência local, não prova da main remota atual. Não houve fetch nem consulta remota.

Divergência HEAD...origin/main: zero commits exclusivos da branch e 13 exclusivos da referência main. A comparação dos arquivos versionados em `apps/site` entre esses dois commits não apresentou diferenças. O incremento do Site permanece local, não commitado.

A main local contém cinco inserções adicionais no Evidence Index, em regiões diferentes da entrada Site acrescentada no topo. O registro existente do piloto não apresenta diferença entre as baselines comparadas. A integração futura deve aplicar o delta seletivamente, preservando essas entradas e quaisquer atualizações posteriores, sem copiar a versão antiga inteira dos documentos. Não foi executada simulação nem aplicação de merge.

Upstream configurado da branch: remoto `origin`, destino `refs/heads/main`. Não há referência local `origin/feat/imob-abrir-rascunho`; isso não comprova inexistência atual da branch no servidor. A futura publicação deve ter destino explícito e preflight próprio. Nenhuma sincronização ou publicação é necessária para criar o commit local isolado.

`core.hooksPath` não configurado. No diretório padrão compartilhado `EIAH_BUILDER/.git/hooks`, não foram encontrados hooks ativos além dos exemplos desconsiderados pelo Git. Não foi desabilitado ou contornado nenhum hook. A futura operação deve reconfirmar ausência de mudança desse estado.

### Revisão do conjunto publicável

A inspeção dos 29 caminhos não identificou arquivos ambientais indevidos no conjunto proposto. Uma busca por padrões de chaves privadas, tokens de provedores, Bearer longo e URLs de banco com credenciais não encontrou correspondências. Os e-mails encontrados nos JSONs de evidência são exclusivamente `qa@example.invalid`, `anterior@example.invalid` e `restaurado@example.invalid`. As capturas derivam dos contextos sintéticos já comprovados; os oito PNGs contêm somente os chunks IHDR, IDAT e IEND, sem metadados textuais/EXIF identificados. Isso é revisão delimitada do delta, sem declaração de auditoria universal de segredos.

Não foi necessária adição forçada: os arquivos novos propostos aparecem como não rastreados normais e os demais já são rastreados. O cache Wrangler fica excluído da seleção por caminho explícito.

### Parecer e próxima operação proposta

Status: evidenciado no escopo local; delta apto à autorização de um commit local isolado, incluindo apresentação adjacente e evidências históricas/positivas. Não equivale a autorização de integração na main ou produção.

Mensagem proposta:

```text
feat(site): restore IMOB drafts with compensating recovery and browser acceptance
```

Próxima operação sujeita à autorização humana: stage explícito dos 29 caminhos selecionados, conferência do staged e um único commit local na branch existente. Não usar `git add .`, `git add -A` ou adição de diretórios inteiros. Após o commit, o resíduo esperado é somente o cache Wrangler excluído, sem removê-lo. A proposta e os comandos completos são apresentados na resposta, sem criar arquivo paralelo.

Permanecem documentadas as limitações: Chromium desktop/headless, compensação sem atomicidade absoluta entre localStorage e IndexedDB; sem cobertura de crash, concorrência entre abas, falha física ou outros navegadores. Nenhuma aceitação local é certificação de produção. Todos os freezes, holds, No-Go Ledgers, demais worktrees e bloqueios operacionais permanecem preservados.
