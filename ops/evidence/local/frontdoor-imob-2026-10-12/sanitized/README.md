# Front Door + IMOB — evidências sanitizadas de 12/10/2026

Status: **parcial** para a jornada completa; empacotamento local de entregas já existentes.
Agentes abrangidos: EIAH, I_BC, Diarias, J_360, fin-nexus e guardian. Execução por Codex, sem subagentes.

## Resultados e limites

| Resultado | Evidência | Natureza |
| --- | --- | --- |
| PASS | 221/221 testes sintéticos do gate e testes associados; waivers sem violações | Execução anterior em cópia isolada com os patches 01/02/03. Log reaproveitado, sem repetir a bateria. |
| PASS | 246/246 testes em dez arquivos dirigidos; probe de handoff pack | Unitários/fixtures de API, resolvedores, formulários e componentes. Não comprova execução real de especialista. |
| PASS | 15 cards (cinco especialistas × três estados) e continuidade visual | Chromium automatizado com fixtures, sem aceite manual humano. |
| FAIL histórico | Token inicial recusado (401); login por senha falhou (500/P2010/25006) no banco local somente leitura | Falhas reais preservadas no relato. O bootstrap de credenciais tentava CREATE TABLE; não evidenciam regressão do incremento. |
| PASS posterior | Cadastro legítimo, login de formulário e sessão autenticada em banco descartável novo | HTTP/Chromium automatizado; sem injeção de tokens no navegador. Senha incorreta e acesso sem token recusados. |
| PASS posterior | Login administrativo e fila 200; solicitante sem autoridade; identidade comum recebe 404 | Conta exclusiva de teste e configuração temporária autorizadas. Pedido visível aguardando_humano no instante da observação; nenhuma decisão ou ativação enviada pelo teste. |
| NOT_DEMONSTRATED | Jornada IMOB completa aceita manualmente, trabalho especializado executado e retorno de evidências | Login, catálogo e fila não substituem essas comprovações. |
| NOT_DEMONSTRATED | Execução em GitHub, contenção no runner, deploy do incremento e suíte real de 213 arquivos | Nenhuma dessas operações foi realizada neste empacotamento. |

Os resultados são históricos e não afirmam o estado atual mutável do banco de teste. Uma eventual aprovação ou ativação posterior pelo usuário não é inferida destes artifacts.

## Existente versus incremento

Autenticação, cadastro, Marketplace, aprovação administrativa, contratos de agentes, formulários e handoff já existiam. O ambiente descartável apenas permitiu exercitar esses fluxos com identidade sintética.

O incremento do commit A adiciona sete módulos e sete testes de gate, workflow manual informativo, reconciliação do manifesto e registro dos sete testes. O script da suíte real permanece igual ao HEAD inicial no commit A; os dois testes CRM continuam fora do commit.

O incremento do commit B aplica disponibilidade canônica por tenant/workspace aos especialistas contextuais IMOB: available, unavailable e unverified, removendo ações dos estados fechados e preservando a necessidade contextual. São os cinco apoios internos existentes; descoberta transversal de Marketing não foi implementada. Os incrementos estão em commits locais, ainda não publicados.

## Proveniência e sanitização

`results.json` contém somente resultados agregados e hashes dos originais. `selected-tests.tap` e `gate-synthetic-tests.tap` são cópias dos logs anteriores; caminhos locais absolutos foram substituídos por marcadores. Não se alteraram vereditos, contagens ou falhas. `packaging-verification.json` relaciona os arquivos dos commits A/B, hashes e exclusões.

Todos os 15 arquivos originais da pasta superior foram preservados localmente e omitidos do commit C. Capturas de tela foram excluídas para evitar expor nomes e contexto de sessão; JSONs com registros do PostgreSQL, relatórios com dados de infraestrutura, fontes temporárias e caminhos pessoais também foram omitidos. Seus resultados úteis aparecem apenas nas cópias sanitizadas. Nenhum arquivo privado, senha, token, credencial AWS/banco, link autenticado, dump ou dado de PostgreSQL/Redis foi incluído.

O Evidence Index aponta somente para estas cinco cópias selecionadas. As referências anteriores a artifacts locais não selecionados foram substituídas; os originais não foram apagados nem reescritos.

## Validação deste empacotamento

Aplicação exclusivamente ao índice dos patches aprovados. Checksums do pacote A verificados; quinze arquivos novos idênticos ao patch; manifesto e comando staged contêm os mesmos 211 caminhos na mesma ordem, sem executá-los. Diff B idêntico ao patch aprovado em seus 16 arquivos. Patches 90/91 excluídos. Whitespace staged validado. Os testes anteriores não foram repetidos; somente o índice documental é revalidado para as novas referências.

Não houve acesso remoto, publicação, execução de campanha, alteração dos serviços locais, código de Marketing, gate obrigatório adicional ou manipulação de stashes. CRM/C4 permanecem no working tree.
