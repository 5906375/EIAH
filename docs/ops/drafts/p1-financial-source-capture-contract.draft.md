# Captura da fonte financeira P1 — contrato proposto v1

Status: **proposta**. ADR-009 permanece Proposta. Este documento não autoriza
consulta operacional, CI, publicação de evidência, nem retorno P1/P2.

Esta proposta cobre a reconciliação financeira **interna da EIAH**. A
experiência e as permissões financeiras oferecidas a clientes constituem
outro contrato. O tenant é a unidade de cobrança; uma pessoa proprietária ou
autorizada dentro dele é o ator que pode autorizar ações conforme sua
permissão. A presença de tenantId numa run não comprova essa autorização.

## 1. Limite de confiança

O reconciliador legado, a projeção financeira e o produtor de captura não são
testemunhas independentes entre si. Digest, contagem, referência de snapshot e
watermark incluídos no mesmo pacote comprovam no máximo consistência interna.
O verificador deve comparar a captura com evidência obtida da fonte por um
caminho separado e registrar a identidade desse caminho. Sem essa evidência,
`independentSourceVerification=not_demonstrated` e
`operationalEligibility=blocked`, mesmo quando os conjuntos coincidem.

## 2. Entrada normativa ainda pendente

- Escopo: tenantId e workspaceId designados; sem curingas ou fallback.
- Universo de operações: critério aprovado, versionado, com referência à
  decisão e regra reproduzível de seleção de runs. `Run` não possui
  `operationId` persistido; o valor declarado em `PopulationCapture` não
  estabelece essa correspondência. Não inferir por `agent`, custo ou nome.
  Hipótese de trabalho P1, ainda não ratificada: capturar como candidatas
  todas as runs do tenant criadas na janela, em todos os seus workspaces,
  inclusive sem uso, com custo zero, bloqueadas e pendentes. Classificar
  aplicabilidade e efeito financeiro somente depois da captura. Não
  selecionar apenas runs com débito, custo positivo ou `finishedAt`.
- Pertinência de fatos sem vínculo com run: regra aprovada de inclusão e
  tratamento explícito de órfãos, sem descartá-los silenciosamente.
- Origem verificável do watermark de ingestão/visibilidade até o cutoff C.
  Um timestamp emitido pelo produtor não comprova essa garantia.

Enquanto qualquer entrada normativa faltar, a captura pode ser testada com
fixtures, mas a decisão operacional permanece bloqueada.

## 3. Envelope da captura de origem

Versão proposta: `p1-financial-source-capture.v1`. O artefato deve preservar:

| Campo | Exigência |
| --- | --- |
| `schemaVersion` | Valor exato; rejeitar versões desconhecidas. |
| `scope` | tenantId, workspaceId e domínio `billing`, não vazios. |
| `selection` | ID da decisão aprovada, versão do critério, digest do critério e resultado da seleção por run; sem decisão, `unresolved`. |
| `window` | `from` inclusivo e `to` exclusivo em UTC; `from < to`. |
| `cutoffAt` | C em UTC, `C >= to`; final exige `C >= to + 7 dias`. |
| `snapshot` | Identificador da fonte, identificador da transação/snapshot, modo de isolamento, instante da leitura e vínculo verificável com a execução e o artefato. |
| `watermark` | Origem independente, referência verificável, cobertura de visibilidade até C, momento da observação e vínculo ao mesmo snapshot. Ausência permanece `not_demonstrated`. |
| `runs` | Todas as identidades selecionadas com tenant/workspace, `createdAt`, estado observado no snapshot, `finishedAt` ou null; incluir pendentes. |
| `facts` | Identidades de uso, ledger e autoridade pertinentes visíveis até C, tipo, data, vínculo com run ou razão explícita de vínculo não resolvido. |
| `counts` | Totais derivados das listas por tipo e estado; rejeitar total declarado divergente, ID duplicado ou estado desconhecido. |
| `digest` | Hash canônico do envelope para detectar alterações; não atesta origem ou completude. |

As listas de identidades são necessárias: totais iguais não demonstram a
mesma população. Preservar versões anteriores e correções com referência ao
artefato substituído, sem sobrescrever o histórico.

## 4. Fronteira da leitura

Uma implementação futura deve ler todos os conjuntos num único snapshot
consistente da fonte. A consulta de runs usa tenant/workspace e
`createdAt >= from AND createdAt < to`, **sem** filtrar `finishedAt`.
Os fatos pertinentes são lidos até C, inclusive os criados depois de `to`;
o predicado exato depende da decisão sobre universo e órfãos. Paginação deve
ter ordenação total estável por data e ID e comprovar fim da enumeração;
`take` de apresentação não pode limitar a população.

O reconciliador legado atual não serve como produtor: filtra runs terminais,
limita fatos por `createdAt` da semana e faz quatro consultas separadas.
`GuardrailLedger` não armazena workspaceId; seu escopo precisa de vínculo
verificável com run e política para registros sem run. Uma transação
`REPEATABLE READ` pode fixar a visão do banco durante a leitura, mas não
prova, sozinha, que toda ingestão pertinente até C já está visível.

### Estado da run no cutoff histórico

Uma transação `REPEATABLE READ` iniciada **depois** de C mostra uma visão
consistente do estado atual do banco, não o estado que cada run tinha em C.
`Run.status` e `Run.finishedAt` são campos atualizados no próprio registro.
`Run.updatedAt` indica uma alteração, mas não preserva o valor anterior.
`RunEvent` contém `type` e `payload` genéricos; seu schema não exige uma
transição de estado para toda escrita de `Run`. `RunArchive.snapshot` é
produzido no arquivamento, sem garantia de representar o cutoff C. Não
reconstruir terminalidade histórica por `finishedAt <= C` quando outra
atualização posterior puder ter alterado o estado.

**Direção escolhida para esta proposta:** comprovar um histórico completo de
transições por run. O contrato executável ainda precisa de implementação e
validação antes de qualquer promoção de status. Cada criação e mudança dos
campos que determinam estado e terminalidade deve persistir, na **mesma
transação** da escrita de `Run`, um evento versionado com tenantId,
workspaceId, runId, ID de transição, sequência monotônica por run, estado
anterior e novo, `finishedAt` anterior e novo, instante observado na fonte,
identidade do produtor e referência à operação. Uma política de correção
deve acrescentar eventos, nunca reescrever ou apagar o histórico usado como
prova. Rejeitar lacunas de sequência, estados contraditórios, transições
sem run e divergência entre o último evento e o registro atual.

Antes de afirmar `stateAtCutoffVerification=verified`, inventariar **todos**
os caminhos de criação e atualização de `Run`, inclusive worker, rotas,
serviços, escrita direta, retries e manutenção; instrumentar cada caminho
ou bloqueá-lo. Provar que o evento inicial existe para cada run incluída,
que nenhuma mudança escapou da gravação atômica e que a ordenação resolve
empates e transações concorrentes. Definir se o cutoff é por commit/visibilidade
na fonte, não apenas por relógio da aplicação; testar reconstrução no limite
de C, atualizações posteriores e correções tardias com versões preservadas.
Uma transação de leitura consistente deve enumerar runs e eventos sem páginas
omitidas, confrontar contagens/identidades e obter prova independente da
origem e do watermark. `RunEvent` genérico não satisfaz estes requisitos sem
um contrato obrigatório, cobertura dos escritores e evidência de execução.

Para runs anteriores à cobertura integral do histórico, manter
`stateAtCutoffVerification=not_demonstrated` e bloquear a elegibilidade;
não inferir eventos ausentes a partir do estado atual. O adaptador Prisma
existente é somente uma observação local e mantém essa verificação como
`not_demonstrated`. Sua contagem na mesma transação detecta certas páginas
omitidas, mas não atesta a população histórica, nem a origem independente
do snapshot ou do watermark.

## 5. Verificador separado

Entradas: captura de origem, projeção financeira, evidência do snapshot e
watermark obtidos por canal verificável separado, e critério aprovado de
seleção. O verificador:

1. valida versões, escopo, janela, cutoff e vínculos entre artefatos;
2. deriva contagens das listas, rejeitando duplicatas e valores inválidos;
3. compara bidirecionalmente IDs, estados e tempos das runs;
4. compara bidirecionalmente IDs, tipos, tempos e vínculos dos fatos, incluindo
   fatos tardios e vínculos não resolvidos;
5. verifica origem, completude da enumeração e watermark por fonte distinta
   do próprio pacote, ou mantém `not_demonstrated`;
6. bloqueia run pendente, estado desconhecido, fato pertinente ausente,
   divergência, snapshot misto, prova ausente ou correção conhecida não
   incorporada. Nunca infere `final` pela passagem do tempo.

O resultado distingue `internalConsistency`,
`sourcePopulationVerification`, `watermarkVerification`,
`operationMappingVerification` e `operationalEligibility`. A primeira
pode ser `consistent` com fixtures; as demais não podem virar `verified`
por uma declaração do produtor.

## 6. Testes de contrato antes de qualquer acesso à fonte

- Conjunto igual com fixtures: consistência interna, elegibilidade bloqueada.
- Uma run ausente, duplicada, pendente ou de estado desconhecido: bloqueio.
- Fato tardio pertinente ausente ou duplicado: bloqueio.
- Mesmo total com IDs diferentes: bloqueio.
- Fato órfão sem regra aprovada: bloqueio.
- Escopo, cutoff, snapshot ou watermark divergentes: bloqueio.
- Snapshot autodeclarado ou watermark sem origem independente: bloqueio.
- Páginas incompletas, empate na ordenação ou correção conhecida: bloqueio.

Nenhum teste com fixtures transforma o status de ADR-009 ou valida população
operacional. A execução sobre dados reais exige decisão de escopo/universo,
implementação do produtor, mecanismo de prova e revisão separada.
