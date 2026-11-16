# Cadastro IMOB guiado — validação local com dublês

Data: 2026-11-14. Status funcional: **PARCIAL**. Executor: Codex, sem subagentes.
Branch: `fix/imob-property-draft-context`. HEAD preservado: `d60655c4fd344dca39fbbdb90d2e46bbd44a3b78`.
Nenhum stage, commit, push, PR, merge, deploy, chamada paga ou gravação real nesta execução. Oferta de avaliação não alterada.

## Resultado e causas

O intake anterior aplicava diretamente os dados interpretados. Agora interpretar propõe alterações; somente a confirmação contextual da proposta vigente aplica exatamente suas alterações ao mesmo rascunho. Salvar o imóvel continua sendo outra ação explícita do formulário.

A falha restante em `published/intake-first.log` era a expectativa incorreta do rótulo `Vagas`, enquanto o catálogo real define `Vagas de garagem`. Corrigiu-se a asserção para exigir o rótulo completo, sem flexibilizar validação. Os outros 11 testes desse log passaram e foram reutilizados. O caso corrigido passou isoladamente em `intake-reproduction.log`.

A última edição corrige uma lacuna local: quando uma correção elimina todas as diferenças propostas, a proposta anterior precisa ser limpa. O intake devolve `proposal:null`, sem patch; o adaptador limpa sua referência. `intake-withdrawal.log` e `adapter-withdrawal.log` confirmam que uma confirmação posterior não reaplica a versão anterior e nenhum campo muda. Ambos terminaram com exit 0 e foram recuperados após a interrupção, sem repetição.

**A causa do retorno inválido em staging continua não comprovada.** Não há nesta tarefa resposta bruta do provider nem logs de staging que permitam identificar a etapa real. A estrutura de exemplo do prompt foi explicitada e foram acrescentados diagnósticos finitos de etapa/outcome, sem registrar prompt, saída bruta, credenciais ou dados do imóvel. Isso permite diagnóstico futuro autorizado; não demonstra resolução do incidente de staging.

## Fluxo e reutilização

- Contrato e prompt pertencem ao IMOB; o engine prioriza o cadastro ativo e consulta o intake também para interpretar retomada livre. Nenhuma regra cognitiva foi acrescentada ao `ChatAgentLauncher`.
- A rota existente `/imob/chat/resolve-turn`, `intake=property_draft`, mantém os gates de sessão, tenant/workspace, membership, permissões e entitlement e o executor central `executeLlmStep`, com perfil/modelo e masking já governados.
- O intake recebe o rascunho atual, histórico limitado, proposta vigente e estado ativo/pausado. O provider recebe campos, opções reais, preenchidos/ausentes e contexto sem credenciais ou identificadores de autorização; para campos fora da captura recebe apenas presença, sem valor de proprietário/documentos.
- A proposta usa o descritor existente de revisão (`ref`, `contextRef`, `draftRef`), adaptado ao formulário não salvo, e o estado já existente das mensagens/formulários. A função compartilhada de hash preserva a ordem e os dados usados pela revisão de propostas CRM. Cinco testes focais existentes validaram essa reutilização.
- Catálogo, schemas e validador real do formulário protegem campos, tipos, opções e patch integral. A referência correlaciona escopo autenticado, origem, revisão, valores e mudanças. **Não é assinatura, autorização, consumo durável nem proteção criptográfica contra cliente hostil**; a autoridade e a gravação continuam nos fluxos existentes.
- Propor, perguntar, recusar e esclarecer não alteram campos. Novos dados criam nova referência e exigem nova confirmação. Edição manual invalida a proposta inteira; respostas tardias são descartadas após mudança de sessão/usuário/tenant/workspace/domínio/conversa/origem/formulário/thread/caso/turno ou revisão, inclusive editar e desfazer.
- Pausa/retomada e confirmação são interpretações do provider contextual. Não há atalhos de igualdade de frase para conversa livre. Dublês controlam o significado nos testes; não comprovam entendimento de um provider real.

## Diff efetivo de código

`changes.diff.gz` contém, após descompressão, o diff bruto dos dez caminhos abaixo, separado dos logs e da documentação. O `changes.diff` original permanece somente local e fica fora da entrega. `source-hashes.json` identifica os arquivos ao encerrar a tarefa; não equivale a novo commit.

| Arquivo | Alteração |
| --- | --- |
| `packages/contracts/src/imobPropertyCapture.ts` | Contrato de proposta, origem, confirmação e apresentação do IMOB. |
| `apps/api/src/services/imob/imobAgentContract.ts` | Interpretação contextual, etapas separadas e schema explícito do retorno. |
| `apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts` | Proposição, validação, confirmação integral, recusa/pausa/retomada e diagnóstico seguro. |
| `apps/api/src/services/imob/crm/imobProposalReviewContinuity.ts` | Extração reutilizável da correlação existente, preservando seu cálculo. |
| `apps/api/src/routes/imob.ts` | Escopo da sessão e observação de etapa/outcome no intake existente. |
| `apps/web/src/components/agents/chatLauncherEngine.ts` | Intake antes do roteamento, incluindo retomada sem frase obrigatória. |
| `apps/web/src/features/imob/structured/useImobFrontDoorForms.ts` | Proposta sem editar, aplicação integral confirmada, invalidação e descarte tardio. |
| `apps/web/src/features/imob/structured/types.ts` | Proposta efêmera na mensagem estruturada existente. |
| `apps/api/src/tests/imob-property-capture-intake.test.ts` | Casos de intake/rota com dependências injetadas. |
| `apps/web/src/features/imob/structured/createImobStructuredForms.test.ts` | Casos do adaptador/engine com estado em memória. |

Os testes permanecem nos dois arquivos já registrados no manifesto e na suíte oficial; nenhum arquivo de teste órfão foi criado. `CLAUDE.md` e `CODEX.md` mantêm exatamente os hashes encontrados antes do trabalho, sem novas edições.

## Resultados reais

Contagens `executados/aprovados/reprovados/ignorados`; não somar tentativas históricas como testes distintos. Comandos completos, códigos e reaproveitamento em `results.json`.

| Verificação | Resultado | Exit | Contagem / limite |
| --- | --- | --- | --- |
| Intake inicial (`published/intake-first.log`) | REPROVADO histórico | 1 | 12/11/1/0; rótulo incorreto na asserção. |
| Reprodução corrigida (`intake-reproduction.log`) | APROVADO | 0 | 1/1/0/0; reutiliza os outros 11 casos aprovados. |
| Remoção de todas as diferenças (`intake-withdrawal.log`) | APROVADO | 0 | 1/1/0/0; proposta limpa e confirmação posterior sem patch. |
| Adaptador inicial (`published/forms-first.log`) | REPROVADO histórico | 1 | 0 testes; variável duplicada na fixture, corrigida. |
| Adaptador afetado (`forms-second.log`) | APROVADO | 0 | 11/11/0/0. |
| Guardas de confirmação (`adapter-confirmation-guards.log`) | APROVADO | 0 | 2/2/0/0; patch parcial/ampliado/ref anterior e edição durante confirmação. |
| Remoção no adaptador (`adapter-withdrawal.log`) | APROVADO | 0 | 1/1/0/0. |
| Correlação CRM existente (`review-correlation-regression.log`) | APROVADO | 0 | 5/5/0/0; referência, draft e escopo. |
| Contratos (`contracts-typecheck.log`) | APROVADO | 0 | `tsc --noEmit`, sem diagnósticos. |
| Typecheck focal final (`typecheck-final.log`) | APROVADO no recorte | 0 | 12 raízes com vite-env; 0 diagnósticos focais, 17 de dependências excluídos. |
| Build web (`published/web-build.log`) | APROVADO | 0 | 897 módulos; avisos de ES2024, Browserslist antigo e chunk grande. |
| Whitespace do diff | APROVADO | 0 | `git diff --check`; stage vazio. |
| Provider real, navegador, HTTP com banco | NÃO EXECUTADO | — | Sem prova semântica real ou operacional. |

Total focal atual: 13 casos de intake, 14 de adaptador e 5 de correlação aprovados **em execuções seletivas**, não em uma nova suíte integral. A última alteração de produção afeta somente o ramo do intake que retira todas as diferenças; sua cobertura foi executada nos dois níveis. O build já aprovado é do cliente, não inclui esse módulo de servidor e não foi repetido. O typecheck focal foi concluído após essa edição. Alterações posteriores foram somente testes/documentação.

## Verificações reaproveitadas

Do pacote `../imob-property-capture-context-2026-11-14/`: `forms-tests.log` (180/180 na árvore anterior; os sete casos afetados foram substituídos/revalidados nesta tarefa, sem alegar nova execução integral dos 173 restantes); `no-db-gate.log` (2/2, autorizado fora do sandbox na execução original); `launcher-gate.log`, `entrypoint-gate.log` e `snapshot-gate.log` (exit 0, `ok:true`). Scripts/regras, arquivo do launcher e schemas do snapshot não mudaram. O gate de snapshot verifica estrutura do contrato e existência dos fontes, não o comportamento novo do adaptador, coberto pelos testes focais.

Não foram repetidos os gates anteriores nem executada nova consulta de CI/P1. A ratificação `weekly_cycle_evidence_too_old` permanece preservada; este pacote não aprova CI remoto. O Evidence Index foi atualizado somente após os artefatos físicos; a integridade dos caminhos novos foi conferida por leitura, sem repetir a suíte do índice.

## Limitações e reteste futuro

Status PARCIAL: provider real, navegador/mobile, jornadas de paridade e HTTP com banco não validados nesta tarefa; tipagem integral não certificada. Diagnósticos de dependências excluídos e avisos do build permanecem fora desta correção. Não se atribui regressão ou causa de staging sem evidência.

Em reteste futuro autorizado no navegador: iniciar cadastro parcial; informar características/perguntar sem mudar campos; corrigir a proposta; confirmar contextual e verificar somente os campos propostos; editar manualmente e tentar confirmar proposta antiga; recusar/hesitar; retirar todas as diferenças e tentar confirmar; pausar/retomar livremente; mudar de conversa durante resposta. Salvar deve continuar exigindo a ação separada do formulário. Este roteiro **não foi executado**.

## Artefatos e estado local

Este diretório foi criado nesta execução para evidência auditável. Logs originais, inclusive falhas e typecheck anterior, foram preservados sem substituição ou alteração. Para a entrega foram preparadas três cópias sanitizadas, identificadas abaixo. Dados dos testes são sintéticos; não foram registradas credenciais ou respostas reais. O build regenerou a saída derivada ignorada `apps/web/dist`; nenhum arquivo preexistente foi apagado. Não foram criados worktree, stash ou backup. Nenhuma limpeza genérica foi realizada. Os processos iniciados foram recuperados e terminaram; nenhum node/pnpm/tsc ativo foi observado no namespace local ao encerrar.

Documentação/evidências permanecem locais, sem stage. HEAD e alterações preexistentes em CLAUDE/CODEX preservados. Os hashes dos arquivos destinados à entrega estão em `source-hashes.json`; o próprio inventário não se inclui para evitar autorreferência. Hashes de CLAUDE/CODEX preservados ficam em `results.json`, como fatos locais fora da entrega.

## Preparação da entrega — sem stage/commit

Preparação conferida em 2026-11-16, preservando as datas e os resultados das execuções de 2026-11-14.

Reutiliza-se o plano existente em `../imob-property-capture-context-2026-11-14/stage-commit-plan.md`: a seção inicial passa a reger somente este incremento; o plano anterior é preservado abaixo como histórico. Seleção exata: **29 caminhos únicos, 16 normais e 13 logs ignorados**, todos explícitos no plano e em `results.json` → `packaging`. Os logs anteriores reaproveitados e o helper de tipagem já estão em HEAD e não são adicionados novamente. Os dois testes continuam registrados no manifesto e no script oficial do CI, sem alteração de workflow/package/manifesto nesta entrega.

O diff bruto tinha 27 linhas vazias de contexto com marcador de espaço. Para preservá-lo byte a byte e evitar whitespace no arquivo novo staged, entrega-se `changes.diff.gz` (gzip nível 9, mtime=0), cuja descompressão coincide exatamente com o diff bruto atual. O original `changes.diff` fica local, excluído da lista; não foi normalizado.

| Fonte original local, excluída da entrega | Cópia destinada à entrega | Tratamento exato |
| --- | --- | --- |
| `intake-first.log` | `published/intake-first.log` | 2 substituições do prefixo absoluto do workspace por `[WORKSPACE]`; remoção de espaços finais em 2 linhas vazias do diagnóstico. |
| `forms-first.log` | `published/forms-first.log` | 6 substituições do mesmo prefixo por `[WORKSPACE]`; nenhuma remoção de espaços finais. |
| `web-build.log` | `published/web-build.log` | 1 substituição do mesmo prefixo por `[WORKSPACE]`; remoção de espaço final em 1 linha vazia do trecho de código mostrado pelo build. |

Nenhuma cópia substitui o original local. A ordem, conteúdo relevante, contagens, falhas históricas e status foram preservados; não houve rerun. `results.json` registra SHA-256 original/publicado e transformações por arquivo. Os outros dez logs entram sem alteração. Busca por chaves privadas, formatos de tokens, bearer, atribuições longas de segredo, URI de banco com credencial e e-mails não encontrou credencial real no escopo revisado; uma ocorrência é a fixture preexistente `synthetic-test-only`. Isso não equivale a auditoria exaustiva de segredos.

O inventário de hashes foi atualizado explicitamente para cobrir os 28 arquivos entregues além do próprio inventário (inclui plano, cópias sanitizadas e diff comprimido; exclui originais locais e instruções fora da entrega). Antes desse empacotamento, os 29 hashes anteriores coincidiam. Nenhum código, teste, CI, build ou resultado executado foi alterado nesta preparação.
