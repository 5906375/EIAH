# PRE-DUIMP-AUTHORITY-05A — RFC do binding humano v1

| Campo | Valor |
| --- | --- |
| Data | 2026-09-11 |
| Status | **PROPOSTA DOCUMENTAL — implementação não autorizada** |
| Baseline consultado | `6c3a6e9a8879a1bcd6d7ea626ed23158220e264e` |
| Unidade anterior | PRE-DUIMP-CASE-04B — repository e lifecycle |
| Decisão técnica proposta | extensão aditiva de `ApprovalRecord`, sem tabela paralela |
| Ratificação de ownership | Carlos Alberto Merlo — Founder; ratificação documental limitada aos testes sintéticos, §14 |
| Binding operacional | pendente; nenhum userId/tenantId/workspaceId autorizado por inferência |
| Ambiente | elaboração inicial sem consulta ao banco; identificação posterior somente READ ONLY, §14 |

## 1. Escopo e precedência

Este RFC especifica uma decisão humana **de revisão interna**, vinculada a dados
imutáveis de um caso PRE_DUIMP. Não é autorização de execução ou transmissão.
O SQL e o diff Prisma abaixo são texto para aprovação posterior, não migration
criada ou aplicada. Nenhum gate executável de autoridade foi implementado aqui.

Precedência: `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` (§15), `AGENTS.md`,
`docs/architecture/agent-chat-runtime.md`, `docs/EVIDENCE_INDEX.md`, `IA_EIAH.md`.
O índice é fonte de evidências históricas, não autorização de trabalho futuro.
Não se altera o Evidence Index nesta unidade documental.

Invariantes:

- `suggestion != authority`, `readiness != authorization`, `prepare != submit`;
- regra regulatória e política corporativa continuam separadas;
- `readinessOnly=true`, `authorizationState=NOT_REQUESTED` e transmissão externa
  desabilitada, inclusive quando a revisão humana resultar em `APPROVED`;
- sem API, frontend, Run, provider, credencial real, Siscomex ou integração externa;
- nenhum registro legado é promovido implicitamente a autoridade governada;
- nenhuma decisão do assistente de coding equivale a aprovação humana do produto.

### 1.1 Evidências de código e decisões de reaproveitamento

Referências abaixo são arquivo:linha do baseline, não resultados de execução.

| Fonte canônica | Observação confirmada por leitura | Decisão |
| --- | --- | --- |
| `packages/db/prisma/schema.prisma:1200` | ApprovalRecord tem scope, decision, runId e ator opcional; falta binding | estender aditivamente, condicionado à ratificação |
| `packages/db/prisma/schema.prisma:251` | revisão tem snapshot, hash, scope e unicidade case/revision | reutilizar; acrescentar chave composta referenciável |
| `packages/contracts/src/governance.ts:410` | HumanAuthorityDecisionV1 é strict e cobre sujeito, hash, ator, validade, política e evidências | preservar v1; envolver em binding persistido |
| `packages/contracts/src/preDuimp.ts:345` | validação de scope/caso das decisões no snapshot | reutilizar como validação estrutural, nunca prova de autoridade |
| `apps/api/src/services/logistica/preDuimpGovernedCaseCanonicalization.ts:1` | JSON canônico e hash de snapshot com prefixo sha256 | reutilizar serialização; criar projeção de inputs separada |
| `apps/api/src/services/logistica/preDuimpGovernedCaseLifecycle.ts:15` | AWAITING_REVIEW admite ASSESSING/BLOCKED/READY/CLOSED | restringir comando humano a ASSESSING ou BLOCKED |
| `apps/api/src/services/logistica/preDuimpGovernedCaseRepository.ts:217` | repository reescreve scope/case de decisões recebidas no snapshot | não confiar nesse payload; fechar fronteira antes de ativar autoridade |
| `apps/api/src/services/logistica/preDuimpGovernedCaseRepository.ts:490` | CAS da projeção e insert da revisão na mesma transação | estender unidade transacional interna, sem chamada pública aninhada |
| `packages/db/src/middleware/tenantGuard.ts:12` | GovernedCase/Revision protegidos; ApprovalRecord ausente no mapa | incluir ApprovalRecord em tenant+workspace em task futura |
| `apps/api/src/services/logistica/control/preDuimpServerAuthorityAdapter.ts:91` | adapter produz hitlApproval null | preservar até integração dedicada; não preencher DTO antigo parcialmente |
| `docs/architecture/pre-duimp-governed-contracts-ownership-rfc-v1.md`, §9 | modelo genérico não basta como autoridade e não haverá tabela paralela sem decisão | este RFC escolhe extensão, ainda como proposta |
| `docs/architecture/db-contract-lifecycle-decisions-v1.md`, AR-001 e wiring-vs-legado | ApprovalRecord/ApprovalDecision permanecem needs-human-decision | nenhuma promoção de lifecycle ou owner inventado |

Classificação: estruturas citadas **CONFIRMADAS por leitura**; binding executável
de autoridade **PARCIAL/não implementado nesta unidade**; compatibilidade e
garantias PostgreSQL propostas **NÃO VALIDADAS por execução**.

## 2. Ownership e fronteira de confiança

Proposta de ownership técnico, a ratificar:

- domínio Logística/Oráculo SC: semântica da revisão, input projection e lifecycle;
- governança/segurança: competência humana, segregação de funções, validade e
  política de revisão versionada;
- custodiante DB: extensão de ApprovalRecord, compatibilidade, retenção e migration;
- serviço server-side de autoridade: único escritor de decisões governadas;
- CASE-04B: persistência do caso e revisão; não decide competência humana;
- UI, chat, agente, token técnico e sugestão: nunca emissores de autoridade humana.

Na elaboração inicial não havia nome humano, competência ou TTL ratificados.
A ratificação posterior no §14 define o owner do contrato, único revisor humano,
autoaprovação exclusivamente sintética e validade máxima de 24 horas. Não nomeia
automaticamente custodiante DB transversal nem ratifica os reason codes globais.
O vínculo ao usuário autenticado e ao scope exato permanece precondição da futura
ativação; não há defaults de permissão a inventar.
Sem política versionada que resolva quem pode revisar, segregação exigida e TTL,
o resolver responde BLOCK. Um apiToken sem usuário humano não pode aprovar.

`ApprovalRecord` registra uma decisão terminal; não armazena um workflow mutável
de pending/approved. O pedido de revisão é identificado pelo caso em
AWAITING_REVIEW e sua revisão imutável. Nova rodada exige uma nova revisão de
review; não se sobrescreve uma decisão anterior. Este corte não implementa
revogação manual ou consenso de múltiplos revisores; se exigidos pela política,
bloquear até contratos próprios. Revogação de competência torna uso futuro inválido.

## 3. Contrato persistido e compatibilidade

### 3.1 Discriminador e campos

Manter os sete campos atuais de ApprovalRecord e o enum ApprovalDecision intactos.
Adicionar campos SQL nullable, sem backfill e sem defaults de autoridade.
Uma CHECK exige uma das duas formas completas:

1. **legado**: todos os novos campos NULL; interpretação existente preservada,
   mas nunca elegível no resolver PRE_DUIMP;
2. **governado**: todos os novos campos NOT NULL, valores válidos e
   `bindingVersion=pre-duimp-human-binding.v1`; `runId=NULL` e
   `decidedByUserId` não vazio. Não se permite forma híbrida.

| Campo novo | Tipo Prisma / SQL | Semântica governada |
| --- | --- | --- |
| bindingVersion | String? / TEXT | pre-duimp-human-binding.v1 |
| purpose | String? / TEXT | PRE_DUIMP_REVIEW, nunca EXECUTION |
| caseId | String? / TEXT | ID canônico do caso |
| reviewedRevision | Int? / INTEGER | revisão n apresentada ao humano |
| resultingRevision | Int? / INTEGER | revisão n+1 produzida atomicamente |
| action | String? / TEXT | log.duimp_context.review; não cria nova Action |
| resourceType | String? / TEXT | log.pre_duimp, binding ao caso governado |
| resourceId | String? / TEXT | igual a caseId; não reinterpretar antigo recordId shadow |
| inputHash | String? / TEXT | sha256: + 64 hex minúsculos, projeção §4 |
| inputHashVersion | String? / TEXT | pre-duimp-review-input.v1 |
| policyVersion | String? / TEXT | versão imutável da política humana, resolvida server-side |
| decidedAt | DateTime? / TIMESTAMP(3) | instante UTC do servidor |
| validUntil | DateTime? / TIMESTAMP(3) | expiração UTC finita e posterior a decidedAt |
| decisionSnapshot | Json? / JSONB | HumanAuthorityDecisionV1 integral, validado e congelado |
| decisionHash | String? / TEXT | hash do DTO integral e do envelope de binding, §4 |
| idempotencyKey | String? / TEXT | chave opaca da intenção; não concede permissão |
| requestHash | String? / TEXT | hash do comando autenticado normalizado, §5 |

O `id` existente é `authorityDecisionId`; `decision` continua somente
APPROVED/REJECTED. Reason codes e evidenceRefs vivem no decisionSnapshot, evitando
duas colunas extras e duas fontes de verdade. O resolver exige igualdade dos
campos do DTO com as colunas espelhadas e recalcula os hashes.

O DTO v1 admite validUntil null; este perfil governado exige valor finito sem
alterar o DTO legado. createdAt é persistência; decidedAt é a decisão autenticada,
ambos server-side. Não aceitar timestamp, scope, autor ou policyVersion do cliente.
Evidence refs só podem apontar para artefatos existentes e acessíveis no scope;
array vazio só se a política permitir. Não fabricar receipt, Run ou evidence.

### 3.2 Legado

Nenhuma linha existente precisa receber novos valores. Nenhuma nova FK será
imposta sobre runId ou sobre decidedByUserId legado. A existência, vínculo e
competência do usuário governado são verificadas pelo serviço na transação e
revalidadas pelo resolver; a FK de revisão não substitui esses checks.

Não fazer UPDATE para converter legado em governado. Uma nova decisão humana,
com nova intenção/revisão válida, deve produzir INSERT independente. Os triggers
propostos proíbem promoção/downgrade por UPDATE. Leituras históricas legadas
continuam possíveis no escopo autorizado; campos novos ausentes não são aprovação.

Adicionar ApprovalRecord ao tenantGuard afeta consumidores genéricos: antes da
implementação, inventariar novamente operações TS, SQL, jobs e suporte legado.
Não inferir ausência de consumo por grep negativo. Não alterar prismaGlobal ou
dar bypass de scope para manter compatibilidade. Qualquer incompatibilidade exige
decisão própria, não correção oportunista.

## 4. Binding com revisões e hashes

Duas relações compostas ligam ApprovalRecord à revisão examinada n e à revisão
resultante n+1, ambas com `(caseId, tenantId, workspaceId, revision)` e RESTRICT.
Acrescentar chave única correspondente em GovernedCaseRevision, preservando a
unicidade existente `(caseId, revision)` e o histórico append-only.

### 4.1 Projeção exata de inputs v1

Validar primeiro PreDuimpCaseV1 e os hashes dos snapshots persistidos. Construir
este objeto exclusivamente a partir da revisão n e política canônica:

```ts
const reviewInput = {
  schemaVersion: "pre-duimp-review-input.v1",
  tenantId: snapshot.tenantId,
  workspaceId: snapshot.workspaceId,
  caseId: snapshot.caseId,
  caseType: snapshot.caseType,
  subject: snapshot.subject,
  action: "log.duimp_context.review",
  resourceType: "log.pre_duimp",
  resourceId: snapshot.caseId,
  policyVersion: serverPolicy.version,
  facts: snapshot.facts,
  inconsistencies: snapshot.inconsistencies,
  regulatoryEvaluations: snapshot.regulatoryEvaluations,
  corporatePolicyEvaluations: snapshot.corporatePolicyEvaluations,
  riskAssessment: snapshot.riskAssessment,
  domainState: snapshot.domainState,
};
```

Todos os campos internos desses objetos são incluídos, inclusive provenance,
hashes de fonte, versões e timestamps de avaliação. Ordenação de arrays permanece
significativa; não ordenar fatos implicitamente. Serializar com
canonicalizeGovernedJsonV1, UTF-8, SHA-256, prefixo `sha256:`. Não afirmar RFC 8785:
trata-se do algoritmo local existente, cuja versão deve permanecer congelada.

Excluir somente campos superiores não listados: revision, lifecycle,
createdAt/updatedAt, gateDecision, humanAuthorityDecisions, runRefs, receiptRefs,
evidenceRefs e eventRefs. Eles não podem substituir inputs/policy/provenance.
Não aceitar conteúdo decisório que só exista nos campos excluídos. Caso uma
política futura dependa desses campos, versionar a projeção antes de usá-la.

Separações:

- snapshotHash cobre o snapshot inteiro da revisão, incluindo decisões;
- inputHash cobre reviewInput e não inclui a própria decisão: evita ciclo de hash;
- decisionHash cobre JSON canônico `{ bindingVersion, purpose, caseId,
  reviewedRevision, resultingRevision, inputHashVersion, decisionSnapshot }`;
- requestHash cobre o comando descrito no §5, antes de gerar ID e timestamps.

HumanAuthorityDecisionV1 já contém tenant/workspace, action/resource/hash e
policyVersion; exigir correspondência exata com as colunas, sem normalizar
identidades divergentes. SHA-256 detecta divergência, não é assinatura humana:
autenticidade depende do escritor autenticado, controle de acesso e trilha.

### 4.2 Não tornar a aprovação stale pela própria gravação

No instante de decidir, a revisão corrente deve ser exatamente n. A decisão
gera n+1, portanto o resolver não compara ingenuamente reviewedRevision com a
revisão corrente. Ele verifica n e n+1, a presença do mesmo DTO/hash na revisão
resultante e a cadeia até a revisão atual.

Uso permanece válido apenas se **todas** as revisões dessa cadeia preservarem o
mesmo inputHash, a decisão não for substituída, a política/competência continuar
válida e não houver nova rodada de review, CLOSED ou descontinuidade. Se inputs
mudaram e depois voltaram, permanece STALE; não reativar aprovação antiga. Revisão
de gate derivado pode manter binding se não modificar nenhum input. Recalcular
avaliações/timestamps invalida conservadoramente o vínculo e exige nova revisão.
Limite de leitura da cadeia excedido ou histórico inconsistente: BLOCK, não skip.

Atestação de fatos HUMAN_ATTESTED não é concedida por este perfil de revisão.
Dependências humanas anteriores na provenance precisam de validação independente,
sem autorreferência/ciclos. Política que exigir atestação não suportada bloqueia.

## 5. Idempotência, imutabilidade e concorrência

Comando futuro aceito: caseId, expectedRevision, decision, reasonCodes,
evidenceRefIds e idempotencyKey. Scope e ator vêm da sessão humana autenticada;
policy, inputs, timestamps, DTO e IDs persistidos vêm do servidor. Sem snapshot
arbitrário nem approvalId como prova suficiente. Unknown fields: rejeitar.

requestHash = hash canônico de `{ commandVersion: "pre-duimp-review-command.v1",
tenantId, workspaceId, actorUserId, caseId, expectedRevision, action,
decision, reasonCodes, evidenceRefIds }`, com arrays na ordem normalizada
explicitamente pelo contrato futuro (v1: preservar ordem e rejeitar duplicatas).
Não incluir horário corrente, novo ID ou nova versão de policy no hash do retry;
esses pertencem ao resultado persistido. Evidence refs são resolvidas imutáveis.

- unique `(tenantId, workspaceId, purpose, idempotencyKey)`;
- unique `(tenantId, workspaceId, caseId, reviewedRevision, action)`;
- mesma chave + mesmo requestHash + mesmo humano: retornar resultado histórico
  sem nova escrita, e **separadamente** a validade atual calculada pelo resolver;
- mesma chave com intenção/ator diferente: IDEMPOTENCY_CONFLICT, nenhuma escrita;
- outra chave para a mesma rodada: DECISION_ALREADY_RECORDED, sem override;
- não autorizar por replay: sucesso de gravação anterior pode estar EXPIRED/STALE;
- conflito de CAS ou unique aborta a transação inteira; após rollback, uma leitura
  scoped pode reconhecer retry idêntico. Não repetir automaticamente outra intenção;
- timeout de commit é resultado desconhecido: consultar pela mesma chave, nunca
  reenviar com chave nova ou alegar falha com zero escrita sem reconciliação.

Decisões governadas não admitem UPDATE/DELETE/TRUNCATE; expires/stale são estados
derivados, não UPDATE do enum. Triggers e privilégios de role protegem o histórico;
superuser/owner capaz de desabilitar trigger está fora dessa garantia e não deve
ser a credencial de aplicação. Não apagar evidências nem neutralizar triggers.

## 6. Resolver exclusivamente server-side

Interface lógica proposta: `resolvePreDuimpHumanReview(scope, humanSession,
caseId, action, now)` retorna resultado de leitura, nunca token de execução.
Usar exclusivamente getPrismaForTenant no caminho de aplicação, inclusive dentro
da unidade transacional; sem Prisma global, SQL raw ou nested writes como bypass.

Ordem fail-closed:

1. Autenticar humano; resolver scope, membership, acesso à vertical e permissão
   exata em fontes canônicas. Não vazar existência de caso fora do scope.
2. Resolver política humana imutável com owner, papéis/segregação e TTL ratificados.
   Fonte ausente, erro ou contrato incompleto não vira allow.
3. Ler caso/revisões/ApprovalRecord scoped; exigir versão/purpose governados e
   vínculo exato ao sujeito. Não usar Run.approvalStatus, texto de chat ou UI.
4. Validar DTO e correspondência das colunas, ambos os snapshots, hashes e cadeia.
5. Revalidar competência do decisor, política, expiração e stale; escolher decisão
   da rodada corrente, nunca a última APPROVED global ou de outra rodada.
6. Retornar `{ recordedDecision, effectiveStatus, reasonCodes,
   reviewSatisfied, executionAuthorized: false, externalTransmissionAllowed: false }`.

O adapter shadow atual permanece hitlApproval=null. A futura integração precisa
contrato com case/revision/resource/inputHash/validade; copiar apenas id e status
para o DTO antigo perderia binding e não é suficiente. Nenhuma rota nova nesta RFC.

### 6.1 Reason codes propostos

Todos abaixo são **propostas**, não catálogo implementado; prefixo completo
`PRE_DUIMP_AUTHORITY_`. A task futura deve reconciliar catálogo canônico e testes.
Conforme `docs/ops/reason-codes-catalog.md`, a fonte é
`packages/core/src/reasons/reasonCatalog.ts`; inclusão proposed não autoriza
enforcement active. Ativação exige owner, approver humano, evidenceRef e
ratificação pelo responsável identificado naquele catálogo, em unidade própria.
O SQL abaixo contém mensagens propostas; não contorna essa ratificação.

| Sufixo | Condição | Resultado |
| --- | --- | --- |
| HUMAN_REQUIRED | sessão sem humano verificável | BLOCK |
| SCOPE_DENIED | scope/membership/permissão divergente | BLOCK sem enumerar outro tenant |
| POLICY_UNAVAILABLE | política/owner/TTL/segregação não resolvidos | BLOCK |
| NOT_FOUND | nenhuma decisão da rodada acessível | REVIEW apenas se resto do gate íntegro |
| LEGACY_UNBOUND | registro legado oferecido como autoridade | BLOCK |
| INVALID_BINDING | DTO/colunas/versão/action/recurso divergentes | BLOCK |
| INTEGRITY_VIOLATION | hash/cadeia/revisão inconsistente | BLOCK |
| REVISION_CONFLICT | expectedRevision não corrente no comando | nenhuma escrita; BLOCK |
| INPUT_CHANGED | projeção mudou em qualquer revisão da cadeia | STALE / BLOCK |
| POLICY_CHANGED | versão/semântica de política mudou | STALE / BLOCK |
| ACTOR_INELIGIBLE | decisor perdeu competência/segregação válida | STALE / BLOCK |
| REVIEW_SUPERSEDED | outra rodada ou caso fechado | STALE / BLOCK |
| EXPIRED | now >= validUntil | EXPIRED / BLOCK |
| REJECTED | decisão negativa válida | REJECTED / BLOCK |
| IDEMPOTENCY_CONFLICT | mesma chave para outra intenção | nenhuma escrita; BLOCK |
| DECISION_ALREADY_RECORDED | outra chave para rodada decidida | nenhuma escrita; BLOCK |
| STORAGE_UNAVAILABLE | falha/timeout/limite impede prova | BLOCK; commit pode exigir reconciliação |
| REASSESSMENT_REQUIRED | decisão registrada, gate ainda não reavaliado | BLOCK transitório de readiness |

Precedência: falha de autenticação/integridade/indisponibilidade bloqueia antes
de status efetivo; depois STALE > EXPIRED > decisão registrada. Nunca expor
APPROVED como efetivo quando uma dessas precondições falha. Ausência normal de
decisão pode motivar REVIEW; uma decisão inválida não é tratada como ausência.

## 7. Transação decisão + nova revisão

Proposta: uma unidade de trabalho interna, não um segundo repository de casos.
Refatoração futura deve permitir compartilhar o client tenantizado transacional
com a operação CAS/revisão existente. Não chamar transition() e depois inserir
ApprovalRecord em transações separadas. Factory de testes não vira API produtiva.

Sequência dentro de uma única transação com isolamento SERIALIZABLE:

1. Revalidar sessão humana/competência e versões de autorização em fontes
   consistentes com a transação. Se uma fonte externa não oferece versão verificável,
   bloquear; não assumir atomicidade entre DB e serviço remoto.
2. Procurar chave idempotente no scope; tratar retry conforme §5.
3. Ler projeção e revisão n; validar igualdade/hash, expectedRevision=n,
   lifecycle=AWAITING_REVIEW, gate=REVIEW, política e inputHash.
4. Construir DTO HumanAuthorityDecisionV1 e envelope de binding, com hora servidor
   e validUntil conforme TTL ratificado. Recusar inputs/decisões forjados.
5. Derivar nova revisão n+1 do snapshot persistido: adicionar somente a decisão
   autêntica; APPROVED leva a ASSESSING, REJECTED leva a BLOCKED. Nos dois casos,
   gate=BLOCK e reason code apropriado, sem mudar fatos/evaluações/domainState.
   Atualizar IDs de decisões do gate para corresponder ao snapshot. Não alterar
   prontidão para READY; não resolver inconsistências automaticamente.
6. Executar CAS scoped `(id, tenantId, workspaceId, revision=n)`; exigir count=1.
   Atualizar projeção e snapshotHash; inserir revisão n+1 append-only, actorType
   humano e actorRef autenticado. Valores do ator devem ser formalizados no
   contrato futuro, nunca aceitos do cliente.
7. Inserir ApprovalRecord referenciando n e n+1 e o mesmo DTO; conferir invariantes
   entre resultado e binding; commit. Se qualquer etapa falhar: rollback integral.

Serialização abortada não é aprovação. Autorizações em tabelas lidas devem ter
versão/locking testados para evitar mudança de competência entre check e commit;
SERIALIZABLE sozinho não prova a ordem de revogação desejada. Antes de qualquer
uso posterior, o resolver revalida novamente. Caso e aprovação não criam Run,
ledger externo, receipt fictício ou evento fora da transação. EVIDENCE-06 decidirá
publicação posterior/outbox; nenhum efeito externo é emitido neste corte.

Bloqueio explícito: o repository atual aceita snapshots com decisões e reescreve
seus scopes. Na implementação futura, create deve rejeitar decisões governadas
forjadas; transition genérico não poderá adicionar/remover/alterar autoridade.
Somente a unidade de autoridade poderá inserir DTO reconstruído de fonte
autenticada. Esses ajustes exigem autorização de repository/testes, não feitos aqui.

## 8. Matriz de estados e efeito no caso

| Estado efetivo | Registro persistido | Efeito permitido | Não significa |
| --- | --- | --- | --- |
| APPROVED | decision=APPROVED, íntegra, vigente e não stale | satisfaz revisão interna específica; nova revisão ASSESSING/BLOCK aguarda reavaliação | READY, execução, atestação genérica ou transmissão |
| REJECTED | decision=REJECTED, íntegra e aplicável | nova revisão BLOCKED/BLOCK; motivo obrigatório | apagar caso ou impedir nova rodada legítima |
| EXPIRED | decisão original preservada; validade temporal vencida | resolver bloqueia; nova rodada necessária | alterar enum ou renovar validade por retry |
| STALE | decisão original preservada; inputs/policy/competência/rodada mudaram | resolver bloqueia; nova revisão de review e decisão necessárias | reutilizar aprovação após inputs voltarem ao valor anterior |

EXPIRED/STALE são estados calculados e não novos valores de ApprovalDecision.
Resolver de leitura não muda lifecycle de caso. Uma projeção previamente READY
pode ficar desatualizada pelo relógio; não consumi-la sem revalidação. Gate completo
continua BLOCK > REVIEW > READY. Aprovação não supera regra regulatória negativa,
policy DENY, fato ausente, inconsistência aberta ou risco bloqueante.

## 9. Testes planejados e gates de autorização

Nenhum teste desta seção foi executado nesta unidade.

| Grupo | Casos obrigatórios | Critério |
| --- | --- | --- |
| Contratos puros | legado vs governado; DTO strict; hashes; null/unknown fields; expiry boundary | rejeição determinística, sem DB |
| Canonicalização | ordem de chaves; arrays; UTF-8; números inválidos; inputHash != snapshotHash | fixtures congeladas e hashes reproduzíveis |
| Binding | outro caso/revisão/tenant/workspace/action/resource/policy/autor | BLOCK em todos os negativos |
| Cadeia | n->n+1 não stale; input muda e reverte; outra review; CLOSED; lacuna/ciclo | sem ressurreição nem bypass por limite |
| Autoridade | sem humano; token de serviço; role revogada; segregação; fonte indisponível | não aceitar UI, Run ou DTO fornecido pelo cliente |
| Prisma/SQL | format, validate, generate, build DB; migration em DB dedicado autorizado | equivalência schema/SQL, ressalvados CHECK/triggers manuais |
| Compatibilidade | linhas legadas nulas, consultas e writers suportados; DTO v1 preservado | nenhuma promoção/backfill; impactos explícitos |
| Tenant guard | find*, OrThrow, count/aggregate/groupBy, create/update/delete/upsert/createMany e transação | scope obrigatório; nested/raw não são escape |
| Atomicidade | erro após CAS, revisão e insert approval; FK/unique failure | zero escrita parcial; n preservado |
| Concorrência real | duas conexões sincronizadas, mesma chave e chaves diferentes para n | uma decisão/revisão; perdedor sem efeito parcial |
| Idempotência | retry idêntico; intenção/ator diferente; timeout pós-commit | sem duplicata; status histórico separado do efetivo |
| Imutabilidade DB | UPDATE, DELETE, downgrade, promoção legado, TRUNCATE | proteção real para role de aplicação |
| Integridade | DTO vs colunas; n/n+1 hashes; projeção vs última revisão | fail-closed; não confiar apenas em hash autodeclarado |
| Regressão | CASE-04B, tenantGuard, contracts, build API, orphan gate | executar comandos canônicos revisados antes de usar |
| Rollback | banco de ensaio vazio de bindings; tentativa com binding retido | down só no primeiro; segundo recusa sem perda |

Pré-condições antes de implementar/aplicar: ownership humano; contrato de policy
e TTL ratificados; inventário legado; banco dedicado identificado sem expor senha;
baseline limpo/revisado; backup e estratégia de retenção; aprovação do diff e SQL;
escopo exato de testes com fixtures sintéticas. Role de aplicação sem privilégios
de DDL/TRUNCATE/desativação de trigger deve ser verificada, não presumida.

Falha em gate: interromper antes de correção adicional ou etapa dependente e
apresentar erro/diff/estado sanitizados. Nenhuma migration oportunista, rollback
destrutivo, staging, commit, push, PR ou deploy está autorizado por este RFC.

## 10. Pacote Prisma, SQL e rollback — proposta não aplicada

Os blocos seguintes são especificação revisável. Não executar por copy/paste.
Não foi criado diretório de migration, e nenhum identificador temporal de
migration foi reservado. Prisma validate/generate e execução do SQL permanecem
gates da próxima autorização; não afirmar que o patch já é validado em Prisma.

### 10.1 Diff Prisma exato proposto

Arquivo-alvo futuro: `packages/db/prisma/schema.prisma`. As relações inversas
abaixo são virtuais; somente a chave única acrescenta estrutura na tabela de
revisões. Nenhum campo atual ou enum é removido/renomeado.

```diff
 model GovernedCaseRevision {
@@
   governedCase GovernedCase @relation(fields: [caseId, tenantId, workspaceId], references: [id, tenantId, workspaceId], onDelete: Restrict)
+  reviewedApprovals ApprovalRecord[] @relation("PreDuimpReviewedRevision")
+  resultingApprovals ApprovalRecord[] @relation("PreDuimpResultingRevision")

   @@unique([caseId, revision], map: "governed_case_revisions_case_revision_key")
+  @@unique([caseId, tenantId, workspaceId, revision], map: "gcr_authority_scope_revision_key")
@@
 model ApprovalRecord {
   id              String           @id
   runId           String?          @map("run_id")
   tenantId        String           @map("tenant_id")
   workspaceId     String           @map("workspace_id")
   decidedByUserId String?          @map("decided_by_user_id")
   createdAt       DateTime         @default(now()) @map("created_at")
   decision        ApprovalDecision
+  bindingVersion    String?   @map("binding_version")
+  purpose           String?
+  caseId            String?   @map("case_id")
+  reviewedRevision  Int?      @map("reviewed_revision")
+  resultingRevision Int?      @map("resulting_revision")
+  action            String?
+  resourceType      String?   @map("resource_type")
+  resourceId        String?   @map("resource_id")
+  inputHash         String?   @map("input_hash")
+  inputHashVersion  String?   @map("input_hash_version")
+  policyVersion     String?   @map("policy_version")
+  decidedAt         DateTime? @map("decided_at") @db.Timestamp(3)
+  validUntil        DateTime? @map("valid_until") @db.Timestamp(3)
+  decisionSnapshot  Json?     @map("decision_snapshot")
+  decisionHash      String?   @map("decision_hash")
+  idempotencyKey    String?   @map("idempotency_key")
+  requestHash       String?   @map("request_hash")
+  reviewedCaseRevision GovernedCaseRevision? @relation("PreDuimpReviewedRevision", fields: [caseId, tenantId, workspaceId, reviewedRevision], references: [caseId, tenantId, workspaceId, revision], onDelete: Restrict, onUpdate: Restrict, map: "ar_pre_duimp_reviewed_revision_fk")
+  resultingCaseRevision GovernedCaseRevision? @relation("PreDuimpResultingRevision", fields: [caseId, tenantId, workspaceId, resultingRevision], references: [caseId, tenantId, workspaceId, revision], onDelete: Restrict, onUpdate: Restrict, map: "ar_pre_duimp_resulting_revision_fk")

+  @@unique([tenantId, workspaceId, purpose, idempotencyKey], map: "ar_pre_duimp_idempotency_key")
+  @@unique([tenantId, workspaceId, caseId, reviewedRevision, action], map: "ar_pre_duimp_review_subject_key")
   @@map("approval_records")
 }
```

Unique indexes ordinários mantêm a semântica PostgreSQL de NULLs distintos:
linhas legadas sem campos novos não colidem. Não usar NULLS NOT DISTINCT.
CHECK/triggers não são expressos pelo schema Prisma; devem permanecer na
migration SQL manual e em testes físicos. `db push` não substitui essa migration.

### 10.2 SQL integral de subida proposto

Premissas a verificar depois: provider PostgreSQL, schema físico `public`, nomes
do baseline preservados, nenhum objeto homônimo, migration CASE-04 aplicada,
nenhuma sessão escritora concorrente durante rollout, role/backup aprovados.
Este script transacional **não é idempotente**: reaplicação é função do controle
de migrations, não de IF NOT EXISTS que mascararia drift. Não cria extensão DB.

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.approval_records
  ADD COLUMN binding_version TEXT,
  ADD COLUMN purpose TEXT,
  ADD COLUMN case_id TEXT,
  ADD COLUMN reviewed_revision INTEGER,
  ADD COLUMN resulting_revision INTEGER,
  ADD COLUMN action TEXT,
  ADD COLUMN resource_type TEXT,
  ADD COLUMN resource_id TEXT,
  ADD COLUMN input_hash TEXT,
  ADD COLUMN input_hash_version TEXT,
  ADD COLUMN policy_version TEXT,
  ADD COLUMN decided_at TIMESTAMP(3),
  ADD COLUMN valid_until TIMESTAMP(3),
  ADD COLUMN decision_snapshot JSONB,
  ADD COLUMN decision_hash TEXT,
  ADD COLUMN idempotency_key TEXT,
  ADD COLUMN request_hash TEXT;

CREATE UNIQUE INDEX gcr_authority_scope_revision_key
  ON public.governed_case_revisions
  (case_id, tenant_id, workspace_id, revision);

CREATE UNIQUE INDEX ar_pre_duimp_idempotency_key
  ON public.approval_records
  (tenant_id, workspace_id, purpose, idempotency_key);

CREATE UNIQUE INDEX ar_pre_duimp_review_subject_key
  ON public.approval_records
  (tenant_id, workspace_id, case_id, reviewed_revision, action);

ALTER TABLE public.approval_records
  ADD CONSTRAINT ar_pre_duimp_reviewed_revision_fk
    FOREIGN KEY (case_id, tenant_id, workspace_id, reviewed_revision)
    REFERENCES public.governed_case_revisions
      (case_id, tenant_id, workspace_id, revision)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT ar_pre_duimp_resulting_revision_fk
    FOREIGN KEY (case_id, tenant_id, workspace_id, resulting_revision)
    REFERENCES public.governed_case_revisions
      (case_id, tenant_id, workspace_id, revision)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT ar_pre_duimp_binding_shape_ck CHECK (
    num_nonnulls(binding_version, purpose, case_id, reviewed_revision,
      resulting_revision, action, resource_type, resource_id, input_hash,
      input_hash_version, policy_version, decided_at, valid_until,
      decision_snapshot, decision_hash, idempotency_key, request_hash) = 0
    OR (
      num_nonnulls(binding_version, purpose, case_id, reviewed_revision,
        resulting_revision, action, resource_type, resource_id, input_hash,
        input_hash_version, policy_version, decided_at, valid_until,
        decision_snapshot, decision_hash, idempotency_key, request_hash) = 17
      AND binding_version = 'pre-duimp-human-binding.v1'
      AND purpose = 'PRE_DUIMP_REVIEW'
      AND run_id IS NULL
      AND decided_by_user_id IS NOT NULL
      AND length(btrim(decided_by_user_id)) > 0
      AND length(btrim(id)) > 0
      AND length(btrim(tenant_id)) > 0
      AND length(btrim(workspace_id)) > 0
      AND length(btrim(case_id)) > 0
      AND reviewed_revision > 0
      AND resulting_revision::BIGINT = reviewed_revision::BIGINT + 1
      AND action = 'log.duimp_context.review'
      AND resource_type = 'log.pre_duimp'
      AND resource_id = case_id
      AND input_hash_version = 'pre-duimp-review-input.v1'
      AND input_hash ~ '^sha256:[0-9a-f]{64}$'
      AND decision_hash ~ '^sha256:[0-9a-f]{64}$'
      AND request_hash ~ '^sha256:[0-9a-f]{64}$'
      AND length(btrim(policy_version)) > 0
      AND length(btrim(idempotency_key)) BETWEEN 1 AND 200
      AND isfinite(decided_at)
      AND isfinite(valid_until)
      AND valid_until > decided_at
      AND jsonb_typeof(decision_snapshot) = 'object'
      AND decision_snapshot->>'schemaVersion' = 'human-authority-decision.v1'
      AND decision_snapshot->>'authorityDecisionId' = id
      AND decision_snapshot->>'tenantId' = tenant_id
      AND decision_snapshot->>'workspaceId' = workspace_id
      AND decision_snapshot->>'decidedByUserId' = decided_by_user_id
      AND decision_snapshot->>'decision' = decision::TEXT
      AND decision_snapshot->>'policyVersion' = policy_version
      AND decision_snapshot#>>'{subject,caseId}' = case_id
      AND decision_snapshot#>>'{subject,action}' = action
      AND decision_snapshot#>>'{subject,resourceType}' = resource_type
      AND decision_snapshot#>>'{subject,resourceId}' = resource_id
      AND decision_snapshot#>>'{subject,inputHash}' = input_hash
      AND jsonb_typeof(decision_snapshot->'decidedAt') = 'string'
      AND jsonb_typeof(decision_snapshot->'validUntil') = 'string'
      AND jsonb_typeof(decision_snapshot->'reasonCodes') = 'array'
      AND jsonb_typeof(decision_snapshot->'evidenceRefs') = 'array'
      AND (decision::TEXT <> 'REJECTED'
        OR jsonb_array_length(decision_snapshot->'reasonCodes') > 0)
    ) IS TRUE
  );

CREATE FUNCTION public.pre_duimp_approval_immutable_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.binding_version IS NOT NULL THEN
      RAISE EXCEPTION 'PRE_DUIMP_AUTHORITY_IMMUTABLE_RECORD'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.binding_version IS NOT NULL OR NEW.binding_version IS NOT NULL THEN
    RAISE EXCEPTION 'PRE_DUIMP_AUTHORITY_IMMUTABLE_RECORD'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER ar_pre_duimp_immutable_v1
BEFORE UPDATE OR DELETE ON public.approval_records
FOR EACH ROW EXECUTE FUNCTION public.pre_duimp_approval_immutable_v1();

CREATE FUNCTION public.pre_duimp_approval_no_truncate_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.approval_records
             WHERE binding_version IS NOT NULL) THEN
    RAISE EXCEPTION 'PRE_DUIMP_AUTHORITY_IMMUTABLE_RECORD'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END;
$fn$;

CREATE TRIGGER ar_pre_duimp_no_truncate_v1
BEFORE TRUNCATE ON public.approval_records
FOR EACH STATEMENT EXECUTE FUNCTION public.pre_duimp_approval_no_truncate_v1();

COMMIT;
```

O `IS TRUE` é deliberado: campo JSON ausente não pode passar uma CHECK por
resultado NULL. Colunas novas NULL em legados passam somente pela primeira forma.
Revisão n+1 deve ser inserida antes do ApprovalRecord; nenhuma FK diferida é
necessária. A FK prova existência/scope, não prova que o DTO foi inserido naquela
revisão: essa igualdade é obrigação transacional e de validação do resolver.

Garantias divididas explicitamente:

- DB: forma completa/legado, valores fixos, hash sintático, scope composto,
  unicidade, n+1, restrição de mutação;
- aplicação: DTO strict completo, correspondência temporal DTO/colunas em UTC,
  hash criptográfico real, identidade humana, competência, TTL, evidence refs,
  autenticidade de inputs, conteúdo da revisão resultante e cadeia;
- operação: privilégios mínimos, retenção/backup e ausência de bypass por owner.

Não adicionar FK global de User/Run nem garantir autenticidade só por CHECK.
Falha de constraint/trigger deve virar erro interno fail-closed sanitizado;
`PRE_DUIMP_AUTHORITY_IMMUTABLE_RECORD` é reason code proposto adicional do pacote.
SQLSTATE não deve ser exposto como prova de identidade ou detalhe de outro tenant.

### 10.3 Rollback e retenção

**Rollback padrão após qualquer decisão governada:** parar o writer/resolver novo,
manter schema, índices, constraints e registros, restaurar comportamento fail-closed
do código após autorização própria. Não usar down, apagar decisões, eliminar
colunas povoadas, reescrever revisões ou alterar migration history manualmente.

Se não houver nenhum valor novo persistido, o down estrutural abaixo pode ser
avaliado em task separada. Mesmo nesse caso é DDL destrutivo e exige autorização
explícita, backup, interrupção de writers e reconciliação posterior do schema e
histórico Prisma. Não executar `migrate resolve` como forma automática de rollback.

SQL integral proposto para esse cenário restrito:

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.approval_records IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.governed_case_revisions IN ACCESS EXCLUSIVE MODE;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.approval_records
    WHERE num_nonnulls(binding_version, purpose, case_id, reviewed_revision,
      resulting_revision, action, resource_type, resource_id, input_hash,
      input_hash_version, policy_version, decided_at, valid_until,
      decision_snapshot, decision_hash, idempotency_key, request_hash) <> 0
  ) THEN
    RAISE EXCEPTION 'PRE_DUIMP_ROLLBACK_REFUSED_BINDINGS_EXIST';
  END IF;
END;
$guard$;

DROP TRIGGER ar_pre_duimp_no_truncate_v1 ON public.approval_records;
DROP TRIGGER ar_pre_duimp_immutable_v1 ON public.approval_records;
DROP FUNCTION public.pre_duimp_approval_no_truncate_v1();
DROP FUNCTION public.pre_duimp_approval_immutable_v1();

ALTER TABLE public.approval_records
  DROP CONSTRAINT ar_pre_duimp_binding_shape_ck,
  DROP CONSTRAINT ar_pre_duimp_resulting_revision_fk,
  DROP CONSTRAINT ar_pre_duimp_reviewed_revision_fk;

DROP INDEX public.ar_pre_duimp_review_subject_key;
DROP INDEX public.ar_pre_duimp_idempotency_key;
DROP INDEX public.gcr_authority_scope_revision_key;

ALTER TABLE public.approval_records
  DROP COLUMN binding_version,
  DROP COLUMN purpose,
  DROP COLUMN case_id,
  DROP COLUMN reviewed_revision,
  DROP COLUMN resulting_revision,
  DROP COLUMN action,
  DROP COLUMN resource_type,
  DROP COLUMN resource_id,
  DROP COLUMN input_hash,
  DROP COLUMN input_hash_version,
  DROP COLUMN policy_version,
  DROP COLUMN decided_at,
  DROP COLUMN valid_until,
  DROP COLUMN decision_snapshot,
  DROP COLUMN decision_hash,
  DROP COLUMN idempotency_key,
  DROP COLUMN request_hash;

COMMIT;
```

Sem DELETE, DROP TABLE ou CASCADE. Os locks fecham a janela entre verificar
ausência e retirar colunas; dependência não prevista aborta. Não tocar triggers
append-only de GovernedCaseRevision. A existência de valor em qualquer campo novo
recusa o down, inclusive se uma linha estiver malformada. Teste de rollback com
registros reais não se faz: usar somente banco de ensaio sintético autorizado.

## 11. Fronteira da próxima autorização

Para converter esta proposta em implementação, apresentar os arquivos concretos
e obter nova autorização para:

1. schema Prisma, migration local e o SQL revisado;
2. tenantGuard e testes de compatibilidade legada;
3. wrapper de binding, hash de inputs e resolver humano server-side;
4. unidade de trabalho compartilhada com CASE-04B e fechamento da entrada de
   decisões arbitrárias no snapshot;
5. testes puros, build e PostgreSQL local dedicado, com fixtures sintéticas;
6. registro do owner humano e política ratificados antes da ativação positiva.

API/rotas, UI, adapter shadow, Run, evidence/receipt/eventos e transmissão externa
continuam fora desse pacote. Nenhum gate existente de scope ou instalação é
substituído por uma decisão humana. Uma extensão de schema não autoriza runtime.

## 12. Protocolo de consulta reproduzível

Prompt de consulta para revisão independente, conforme a skill de consulta
governada utilizada nesta unidade:

```text
Atue como revisor de contratos PRE-DUIMP-AUTHORITY-05A, somente em leitura.
Passo 0: leia CODEX.md, CLAUDE.md, IA_EIAH.md e regras locais aplicáveis.
Respeite a precedência Roadmap vigente > AGENTS > agent-chat-runtime >
Evidence Index > IA_EIAH. Não trate índices históricos como autorização.
Fixe HEAD/tree/status; não exponha secrets, dados pessoais ou fixtures reais.
Consulte schema.prisma, tenantGuard.ts, contracts/governance.ts e preDuimp.ts,
repository/canonicalização/lifecycle CASE-04B, adapter de autoridade shadow,
RFC de ownership e db-contract-lifecycle-decisions-v1.md.
Procure estruturas canônicas para preservar/reutilizar antes de propor novas.
Verifique: legacy nullable, scope composto, reviewed/resulting revision,
hash sem ciclo, cadeia sem ressurreição, idempotência, writer autenticado,
transação indivisível, expiração, segregação e READY sem autorização.
Revise o diff Prisma e SQL como TEXTO; não execute SQL, testes com banco,
migrations, código, containers, staging, commit, push ou alteração de índice.
Entregue matriz CONFIRMADO/PARCIAL/AUSENTE/DIVERGENTE, arquivo:linha,
contradições, impactos legados, testes planejados e bloqueios de ratificação.
Não declare HITL implementado nem atribua owner humano por inferência.
```

## 13. Declaração de entrega documental

Artefato desta unidade: somente este RFC. Código, banco, schema, migrations,
tenantGuard, frontend, Compose e Evidence Index permanecem fora da edição.
Consultas de código fundamentam a proposta; não comprovam estado operacional do
PostgreSQL, da API ou da UI. As suítes anteriores não validam o SQL deste RFC.

PRE-DUIMP-AUTHORITY-05A: **PROPOSTA**. PRE_DUIMP permanece **PARCIAL** no escopo
global, sem autorização de execução externa. A ratificação documental limitada
está no §14; binding operacional, compatibilidade legada, validação Prisma/SQL e
testes positivos/negativos permanecem pendentes. Agentes envolvidos: somente
Codex, sem subagentes.

Nota de versionamento: no baseline, `.gitignore:52` ignora novos arquivos em
`docs/architecture/*`. Na criação documental, este RFC ficou fisicamente salvo,
ignorado e sem staging. Em seguida, o usuário autorizou sua revisão e versionamento
local isolado. Essa autorização permite inclusão seletiva deste arquivo no Git,
sem alterar a regra global de ignore e sem autorizar implementação, migration ou
ação remota. A validação do documento deve incluir o diff staged, não somente
o diff dos arquivos já rastreados antes dessa inclusão.

## 14. Ratificação humana limitada e identificação read-only — 2026-09-11

### 14.1 Origem e alcance

Fonte da decisão: mensagens explícitas do usuário nesta conversa, posteriores ao
commit documental `92f248997de2581a05788d97422bdc7d44789978`. O usuário identificou
o owner como Carlos Alberto Merlo, Founder, restringiu a competência a si mesmo,
permitiu autoaprovação exclusivamente nos testes sintéticos e confirmou 24 horas
para cada aprovação individual. Em seguida autorizou identificação somente em
leitura e registro documental, ainda sem implementar.

Esse registro é ratificação documental declarada pelo usuário, não autenticação
de identidade na aplicação, ApprovalRecord persistido, assinatura digital,
ratificação do catálogo global de reason codes ou autorização de migration.

| Dimensão | Decisão ratificada |
| --- | --- |
| Owner humano do contrato neste escopo | Carlos Alberto Merlo — Founder |
| Competência para aprovar/rejeitar revisão interna | somente Carlos Alberto Merlo; vínculo ao usuário autenticado ainda pendente |
| Autoaprovação | SIM, exclusivamente para casos e ambiente sintéticos; não estendida à produção |
| Vigência da política | somente enquanto o uso permanecer em testes sintéticos; sem extensão automática à produção ou a clientes reais |
| Validade individual | no máximo 24 horas após decidedAt; no limite now >= validUntil, EXPIRED |
| Invalidação antecipada | mudança dos inputs ou da política, perda de competência ou saída do escopo sintético |
| Produção/clientes reais | exigem nova política, cadastro e permissões próprios; cadastro isolado não concede autoridade |
| Efeito da aprovação | somente revisão interna; não significa READY nem autorização de execução/transmissão |
| Integridade | decisões/revisões imutáveis; ausência de autoridade/política válida bloqueia |

Na implementação futura, validUntil deve ser calculado pelo servidor como
decidedAt + 24 horas, sem renovação por retry. Cessação da política de testes
impede uso futuro mesmo se essa janela ainda não tiver terminado. O gatilho de
saída de testes deverá ser verificável server-side; campo de ambiente do payload,
nome contendo "teste" ou calendário informal não provam elegibilidade.

Não foi concedida permissão geral sobre qualquer tenant de desenvolvimento.
O scope deve ser escolhido por IDs exatos e vinculado explicitamente antes da
ativação. Não transformar esta decisão em wildcard tenant/workspace, role global,
policy real ou acesso produtivo.

### 14.2 Identificação observada — sem provisionamento

Baseline Git da consulta: `92f248997de2581a05788d97422bdc7d44789978`; estado
inicial sem alterações staged/unstaged/untracked reportadas. Consultas realizadas
por docker exec/psql -X, ON_ERROR_STOP, no container local eiah-postgres, banco
eiah_builder, role postgres, em duas transações BEGIN TRANSACTION READ ONLY,
statement_timeout de 5 segundos e ROLLBACK final. A primeira confirmou
transaction_read_only=on. Nenhuma credencial foi criada ou lida; colunas de token
e senha não foram selecionadas. A role postgres usada para inspeção não é proposta
de credencial da aplicação nem prova de privilégios mínimos.

| Item observado | Resultado | Limite da conclusão |
| --- | --- | --- |
| Tenants cujo ID ou nome corresponde ao padrão PRE/DUIMP | 7, dos quais 5 possuem workspace | descoberta por nome não certifica conteúdo sintético |
| Usuários ligados diretamente a esses tenants | 0 | nenhum vínculo humano local disponível nesses registros |
| TenantMembership desses tenants | 0 | nenhum membership localizado; não criar automaticamente |
| Candidato pelo nome declarado | 1 cadastro fora dos scopes PRE-DUIMP encontrados | coincidência nominal não comprova identidade autenticada |
| Workspace do tenant desse candidato | 1; sem TenantMembership do candidato nesse tenant | User.tenantId existe, mas não equivale a membership nem permissão de revisão |
| Sessão autenticada de aplicação | não verificada | não houve chamada HTTP, login ou extração/reuso de token |

Um par exato localizado, correspondente à fixture histórica de smoke citada na
conversa, é:

```text
tenantId: tenant-preduimp-positive-smoke-20260827
workspaceId: workspace-preduimp-positive-smoke-20260827
```

Nesse par foram observados zero GovernedCase e uma instalação LOGISTICA active,
mas nenhum usuário ou membership no tenant. É **candidato histórico, não scope
selecionado/ratificado para AUTHORITY-05**. Instalação active não prova entitlement,
permissão, pureza dos dados ou prontidão de autoridade. As demais tabelas desse
scope não foram auditadas integralmente; não afirmar ausência de dados reais.

O cadastro nominal encontrado foi cotejado também com uma referência de e-mail
de captura anterior da conversa, sem retornar o endereço: não houve correspondência
com essa referência. Isso reforça a necessidade de confirmação por sessão, sem
concluir que o cadastro esteja incorreto. IDs pessoais, e-mails e o tenant do
candidato não são reproduzidos neste documento versionável; os resultados mínimos
da inspeção ficaram na saída local da ferramenta, não em artefato público.

O teste canônico
`apps/api/src/services/logistica/preDuimpGovernedCaseRepository.integration.test.ts`
constrói scopes sintéticos de repository com sufixos por execução. Esses helpers
não constituem provisionamento persistente de um humano autorizado e não foram
executados nesta consulta. Também não se reutilizaram fixtures remanescentes por
inferência.

### 14.3 Disposição fail-closed e próxima decisão

- Política humana: **ratificada documentalmente, somente no escopo acima**.
- Identificação de scopes/cadastro candidato: **parcial por consultas read-only**.
- Binding operacional humano + tenant + workspace: **não confirmado**.
- Implementação/ativação: **não autorizada por esta ratificação**.

Antes de uma aprovação positiva, confirmar o usuário por mecanismo autenticado
canônico e escolher expressamente um par de IDs sintéticos. Se for necessário
criar ambiente dedicado ou vínculo de usuário/membership, solicitar autorização
separada de provisionamento com efeitos e retenção descritos; não deslocar usuário
existente, reativar token antigo ou promover fixture histórica automaticamente.
Sem isso, permanecer bloqueado. API/web não foram iniciadas para identificar sessão.

Nenhum INSERT, UPDATE, DELETE, migration, build/teste de aplicação, restart,
staging, commit ou operação remota foi realizado nesta identificação. O único
alvo de edição é este RFC; Prisma, SQL proposto, repository, tenantGuard, frontend,
Compose e Evidence Index não são alterados por este adendo. As observações não
constituem novo pacote de evidência operacional indexado nem prova de HITL ativo.

### 14.4 Escolha nominal MerloImóveis / MiniTower e pacote proposto

O usuário escolheu explicitamente tenant **MerloImóveis** e workspace **MiniTower**
para uso sintético. Isso substitui a indefinição dos nomes, mas não seleciona
automaticamente IDs de fixtures históricas nem cria cadastros ou permissões.

Consulta posterior no mesmo banco local, em transação READ ONLY com ROLLBACK,
não encontrou tenant com esse nome nem workspace MiniTower. A busca normalizou
maiúsculas, espaços/pontuação e o acento de Imóveis: matching_tenants=0,
matching_workspaces=0. Não é conclusão sobre bancos remotos ou outros ambientes.
O inventário Docker mostrou API e web parados; não foram iniciados. Portanto,
o usuário autenticado continua **não confirmado**, sem login HTTP, coleta de
cookies ou reaproveitamento de credencial do banco.

Pacote mínimo **PROPOSTO, AINDA NÃO AUTORIZADO**, limitado à criação do scope:

| Registro | ID proposto | Campos de negócio |
| --- | --- | --- |
| Tenant | tenant-preduimp-authority-merloimoveis-synthetic-v1 | name=MerloImóveis |
| Workspace | workspace-preduimp-authority-minitower-synthetic-v1 | name=MiniTower; tenantId igual ao ID acima |

Preflight read-only dos dois IDs retornou zero conflitos. Isso não reserva os
IDs: repetir o preflight antes da execução futura. Se nomes/IDs já existirem,
parar sem upsert, merge, reaproveitamento ou renomeação automática.

Efeitos exatos do pacote de scope, caso autorizado separadamente:

1. Uma transação Prisma local para dois inserts: Tenant e Workspace.
2. createdAt/updatedAt conforme contrato canônico; nenhuma migration.
3. Nenhum User, TenantMembership, ApiToken, instalação LOGISTICA, entitlement,
   policy de ação, ApprovalRecord, GovernedCase ou revisão criado/alterado.
4. Nenhum token emitido/reativado, login automatizado ou permissão concedida.
5. Falha em qualquer insert: rollback integral; não corrigir fora do escopo.
6. Sucesso: reter os dois registros sintéticos; nenhuma limpeza destrutiva implícita.
7. Inspecionar antes o mecanismo canônico de provisionamento e seus efeitos;
   parar se ele exigir grants, credenciais ou outros efeitos além desses dois inserts.

Os IDs propostos identificam a finalidade sintética documentalmente; o schema
atual de Tenant/Workspace não possui marcador formal de ambiente sintético.
Não usar somente esses nomes/IDs como controle de autorização. A futura política
de autoridade precisará validar scope exato e condição sintética server-side.

Esse pacote cria apenas o espaço vazio: **não completa o binding humano**. Antes
de propor membership/permissões, confirmar Carlos Alberto Merlo por sessão
autenticada canônica e conferir o modelo de vínculo entre User, tenant e workspace.
Não transferir o cadastro nominal encontrado, copiar identidade ou inventar papel
de aprovação. Se iniciar API/web for necessário para a confirmação, apresentar
separadamente os serviços e efeitos para autorização; não reiniciá-los nesta consulta.

O pacote de binding humano será outra decisão, com IDs de usuário confirmados,
registros exatos, competência limitada, retenção e testes especificados. A
ratificação de 24 horas e autoaprovação sintética permanece válida documentalmente,
mas nenhum serviço de autoridade foi implementado ou habilitado.
