# Consulta corrigida — Contrato da Origem e Autorização Radar → MKT

**Rodada 3**: fecha o rastreamento até a chamada ao LLM, verifica autorização na
cadeia efetiva (não por ausência de nomes em `runWorker.ts`), fecha a investigação de
procedência de `Run.response`/`Run.agent`, corrige premissas de versionamento/persistência,
corrige a generalização de `ConflictError`, e separa decisões de produto em seção própria.
Substitui integralmente as rodadas 1 (chat) e 2 (`v2`, primeira versão em disco).

**Rodada 4 (2026-09-08)**: registra como decisões ratificadas D4, D5 e D6
(seção própria, logo abaixo); propõe — sem implementar — o contrato `RadarSignalResultV1` e o
contrato de confirmação humana; define e separa a estratégia de publicação confiável
(outbox transacional + claim atômico) da garantia real que ela oferece; separa explicitamente
a máquina de estados de `SignalForwardRequest` da de `Run`; documenta os limites reais do
schema atual para revalidação de identidade; e lista, sem escolher, as decisões contratuais
ainda pendentes. **Documentação apenas** — nenhum código, schema, migration, teste, fila,
worker, endpoint, frontend ou infraestrutura foi implementado nesta rodada. `publishRun`
continua não autorizado. Nenhuma chamada ao LLM foi nem pode ser feita a partir do conteúdo
desta rodada. Nenhum ambiente ou verificador específico de Neon foi usado ou é referenciado
por esta frente.

**Rodada 5 (esta revisão, 2026-09-11)**: incorpora a "Aprovação de contrato técnico"
concedida sobre o `RadarSignalResultV1` (seção 9, reescrita integralmente) — ratifica limites
individuais/agregado, regras de data/`sourceUrl`, a exigência condicional de `evidence`, a
ausência de `provenance` no payload, e a matriz de elegibilidade/precedência como regra do
produtor. Corrige a aritmética do teto agregado e da fixture de tamanho da rodada anterior;
acrescenta a ordem de validação determinística (tipo verificado antes de leitura de
propriedade); separa explicitamente as três camadas de verificação do sujeito; corrige a
descrição de `sourceRunId` (referência do chamador, validada pelo servidor — não puramente
server-derivada) e a de `Run.agent` (disciplina de código confirmada por ausência de
reescrita, não constraint de banco). TTL de confirmação humana permanece separado e pendente
(seção 20). **Documentação apenas** — nenhum código, schema, migration, teste, fila, worker,
endpoint ou infraestrutura foi implementado ou alterado nesta rodada. `stableStringify`/
`computeRequestFingerprint`/`FINGERPRINT_CONTRACT_VERSION` não foram alterados. `publishRun`
continua não autorizado. Nenhuma chamada ao LLM foi nem pode ser feita a partir do conteúdo
desta rodada. Nenhum dado foi importado. Nenhum ambiente ou verificador específico de Neon foi
usado ou é referenciado por esta frente.

**Rodada 6 (2026-09-11)**: primeira rodada com implementação de código autorizada e executada
sobre este contrato. Implementa D5-A (filtro exato de produtor `"radar"`, sem trim/lowercase/
heurística/alias) e D5-B (validador completo e puro de `RadarSignalResultV1`, seção 9),
integrados em `readAndValidateOrigin` (`originContract.ts`), único ponto de entrada usado tanto
por `forwardSignalToMkt` quanto por `recoverExistingSignalForwardRequest` — logo, D5 se aplica
igualmente à criação e ao reenvio/idempotência, sem plumbing adicional. `stableStringify`/
`computeRequestFingerprint`/`FINGERPRINT_CONTRACT_VERSION` confirmados inalterados por leitura
direta pós-edição. Testes reais (90/90) executados contra PostgreSQL descartável dedicado
(container Docker criado e removido nesta rodada; `eiah-postgres` compartilhado não foi tocado).
`tsc --noEmit` sem novos erros atribuíveis a `originContract.ts`/`radarSignalResultValidator.ts`.
Nenhum schema/migration alterado, nenhum cadastro/provisionamento de agente, nenhuma publicação
na fila, nenhuma chamada real ao LLM, nenhuma importação de dados, nenhum commit/push/PR/merge/
deploy. Detalhe do que foi e não foi implementado: seção 19. Correções pontuais de escopo de
afirmação (registro/assignment do produtor, hash de agente, "sete camadas", preservação de
versão histórica do documento): seção 0.

**Rodada 9 (2026-09-12)**: consolida a proposta de D6 (confirmação humana), discutida e
corrigida em várias rodadas de chat não gravadas, na seção 10 e nas seções 13/14/19/20 —
**documentação apenas**, nenhuma linha de código foi escrita ou alterada. Fecha: rascunho
persistido com revisão monotônica e edição condicionada a ela; confirmação restrita à revisão
já persistida, sem novos campos editáveis no corpo; `confirmedPayloadSnapshot` como única fonte
autoritativa, com `Run.request` explicitamente uma cópia derivada; recuperação idempotente
sujeita à autorização vigente no momento do reenvio, nunca à posse de uma chave; autorização
estendida a conteúdo derivado/metadados/evidências, não só ao `subject`; resolução autorizada
do `subject` mantida como dependência pendente (seção 9.6, camada 2 — nenhum mecanismo novo é
inventado); a confirmação passa a ter sua **própria** máquina de estados, num registro
associado, separada de `SignalForwardRequest` e de `Run` (correção à modelagem de rodada
anterior, seção 14); o estado "confirmação concluída, Run criado, publicação pendente" é
precisado como `dispatch_pending`, distinto do comportamento síncrono real do código hoje
(seção 13); e a garantia contra duplicação de Run é descrita como um protocolo de disciplina de
aplicação (ordem de travas + escrita condicionada + rollback integral), não uma constraint
declarativa de banco (seção 13). `stableStringify`/`computeRequestFingerprint`/
`FINGERPRINT_CONTRACT_VERSION` não foram tocados. Recomendações de produto (TTL, confirmador do
V1, condições de visualização/edição) são registradas separadamente como **propostas não
aprovadas** (seção 20) — nenhuma vira decisão ratificada por estarem aqui. `publishRun`, fila,
LLM, schema, migration e provisionamento de agente continuam não autorizados e não tocados.

**Rodada 10 (2026-09-12)**: ratifica as políticas de produto de D6 V1 ("Decisões ratificadas") —
TTL de 7 dias corridos sem renovação por edição/recarga; confirmador restrito a
`requestedByUserId`; visualização/edição exigindo acesso vigente ao encaminhamento e ao
sujeito; confirmação por terceiros fora do V1 — e apresenta o desenho técnico completo da
primeira implementação (seção 22): modelo `HumanConfirmation` e alterações em
`SignalForwardRequest`; protocolo de concorrência com matriz banco/aplicação/limites; precisão
temporal (`clock_timestamp()`, não `now()` de início de transação); identidade da operação
idempotente sem constraint adicional (comparação via `confirmedPayloadSnapshot.operationKey`);
transação de conclusão; arquivos e ordem da primeira implementação; critérios de aceite.
**Documentação apenas** — nenhum código, schema, migration, teste ou configuração foi criado ou
alterado. Identifica uma **dependência técnica não resolvida**, não uma decisão de produto: o
código real de D5 hoje cria o Run de destino de forma síncrona no encaminhamento, mas D6 exige
que o Run só seja criado após a confirmação — reconciliar isso exige alterar
`forwardSignalToMkt` e revisar testes D5 existentes, ainda não feito (seção 22.7).
`stableStringify`/`computeRequestFingerprint`/`FINGERPRINT_CONTRACT_VERSION` não foram tocados.
Nenhum banco, fila, LLM, provisionamento, commit ou publicação ocorreu nesta rodada.

**Rodada 11 (2026-09-12)**: integra a criação tardia do Run ao desenho de D6 — a "dependência
técnica não resolvida" da Rodada 10 está corrigida: adiar a criação do Run é parte necessária e
já integrada da implementação futura, não uma pendência solta (seção 22.7, reescrita). Corrige
também: o ciclo de `activeHumanConfirmationId` (liberado/substituído ao terminar uma janela sem
confirmação, não "preenchido uma única vez" como uma redação anterior dizia — só
`concludedHumanConfirmationId` é write-once, seção 22.2); a guarda de conclusão passa a exigir
também `destinationRunId IS NULL`, cobrindo encaminhamentos anteriores a D6 (seção 22.9, nova);
"preservado para sempre" corrigido para "imutável enquanto armazenado, sujeito a retenção"
(seção 22.1). Apresenta o contrato de retorno de `forwardSignalToMkt`/
`recoverExistingSignalForwardRequest` (destinationRunId nulo até a confirmação, já suportado
pelo tipo existente, sem inventar Run temporário), os cinco arquivos de teste reais afetados
(`A-real-creation.test.ts`, `K-producer-ratification.test.ts`, `B-concurrency.test.ts`,
`G-classification.test.ts`, `I-fingerprint-integrity.test.ts`), o fluxo completo consolidado
(seção 22.8) e a política de compatibilidade para encaminhamentos legados com Run e sem
confirmação (seção 22.9) — sem inferir confirmação, sem fabricar snapshot, sem alterar dados
existentes. **Documentação apenas** — nenhum código, schema, migration, teste ou configuração
foi criado ou alterado. Nenhuma política de produto já ratificada foi reaberta.
`stableStringify`/`computeRequestFingerprint`/`FINGERPRINT_CONTRACT_VERSION` não foram tocados.
Nenhum banco, fila, LLM, provisionamento, commit ou publicação ocorreu nesta rodada.

**Rodada 12 (2026-09-12)**: fecha a interface obrigatória de autorização do sujeito (seção
22.5) — diferencia quatro camadas independentes (autenticação/identidade; autorização sobre o
encaminhamento; permissões de tenant/workspace já reais; resolução/autorização do sujeito,
ainda inexistente) e corrige o risco de tratar fixtures reais de `TenantActionPolicy` como
prova de que toda a autorização de D6 está resolvida — não está; a quarta camada segue ausente
e bloqueia, por padrão, toda operação protegida. Define a interface
`SubjectAuthorizationResolver` (entradas, origem dos valores, resultados possíveis, tratamento
fail-closed de cada um, ponto de revalidação antes da confirmação, distinção de D4) e a
estratégia de teste com substituto controlado, confinado a `__tests__/`, sem
`authorized=true`/flag de ambiente/fallback permissivo, com ponto de composição explícito
(injeção de dependência em `humanConfirmationService.ts`). Corrige a ordem de travas de 22.2
(estava invertida em relação ao que 22.4 já descrevia — `HumanConfirmation` antes de
`SignalForwardRequest`, não o contrário) e acrescenta a lista completa das operações que
escrevem nos dois registros. Incorpora os ajustes já identificados na rodada anterior: retorno
explícito para janela `expired`/`cancelled_by_human` (seção 22.8); distinção entre ausência de
`confirmedPayloadSnapshot` e preservação de `originSnapshot`; critérios de aceite para
reabertura de janela e para `suggestedPromptGenerator` (seção 22.10). **Documentação apenas** —
nenhum código, schema, migration, teste ou configuração foi criado, alterado ou implementado.
Nenhuma política de produto já ratificada foi reaberta. `stableStringify`/
`computeRequestFingerprint`/`FINGERPRINT_CONTRACT_VERSION` não foram tocados. Nenhum banco,
fila, LLM, provisionamento, commit ou publicação ocorreu nesta rodada. Implementação de D6
continua não autorizada.

**Rodada 13 (2026-09-12)**: corrige de novo a ordem de travas de 22.2 — a Rodada 12 havia
mudado para `HumanConfirmation` primeiro só para bater com a redação então existente em 22.4,
sem fundamentar pela execução concorrente; isso não cobria a criação da primeira janela, quando
`HumanConfirmation` ainda não existe. Corrigido para `SignalForwardRequest` sempre primeiro (via
`SELECT ... FOR UPDATE`, que localiza e trava no mesmo instante — nunca uma leitura solta
revalidada depois), `HumanConfirmation` depois, quando já existente; ajusta a sequência de 22.4
para essa ordem. Acrescenta a tabela obrigatória por operação (22.2, com registros existentes
no início/primeira e segunda trava/condições revalidadas/escrita condicionada/resultado em
conflito), a demonstração dos três cenários concorrentes pedidos — duas criações, reabertura
concorrente, operação atrasada (seção 22.2.1) — e a lista de testes concorrentes previstos, com
coordenação via barreiras/hooks de teste (mesmo padrão real de `ForwardSignalTestHooks`,
`signalForwardingService.ts`), nunca `sleep` (seção 22.2.2). Corrige a classificação temporal de
`resolver_unavailable`: é o comportamento bloqueante previsto para a implementação futura, não
uma funcionalidade operacional já existente hoje — D6 não foi implementada (seção 22.5); o
contrato da interface e sua política fail-closed não foram alterados. **Documentação apenas** —
nenhum código, schema, migration, teste ou configuração foi criado, alterado ou implementado.
Nenhuma política de produto, TTL, contrato Radar ou fingerprint foi reaberto. Nenhum banco,
fila, LLM, provisionamento, commit ou publicação ocorreu nesta rodada. Implementação de D6
continua não autorizada.

---

## Decisões ratificadas — 2026-09-08

As três decisões abaixo estão **fechadas**. Não devem ser reabertas silenciosamente por uma
rodada futura — qualquer mudança exige uma nova decisão explícita, datada, nesta mesma seção.
Ratificar uma decisão não implica que ela já foi implementada; ver "Fatos técnicos confirmados"
(seções 0–6) para o que existe hoje no código, e "Implementação futura" (seções 15–19) para o
que ainda falta construir.

### D5 — origem canônica

O único `agentKey` aceito como produtor de origem é:

```
"radar"
```

Regras:
- comparação exata;
- nenhuma heurística de nome;
- nenhum alias;
- nenhum agente dinâmico;
- nenhum fallback para agente semelhante;
- nenhum outro `agentKey` implicitamente autorizado;
- `Run.agent` deve corresponder exatamente a `"radar"`;
- uma origem com agente diferente deve ser rejeitada fail-closed.

### D6 — confirmação humana

A confirmação humana é obrigatória no V1 antes da criação do Run MKT e antes de qualquer
publicação ou chamada ao LLM.

O humano deve:
- visualizar o sinal;
- revisar o conteúdo;
- revisar ou editar o prompt sugerido;
- preencher ou confirmar os campos de negócio aplicáveis;
- executar uma ação explícita de confirmação.

Nenhuma chamada ao LLM pode ocorrer antes dessa confirmação.

### D4 — autoridade assíncrona

A execução assíncrona deve **preservar `requestedByUserId`** — a identidade de quem iniciou o
encaminhamento. Imediatamente antes da chamada ao LLM, o sistema deve revalidar a autoridade
desse mesmo principal.

Devem ser verificados:
- existência e situação ativa verificável de `requestedByUserId`;
- membership ativo no workspace;
- scope de execução ainda concedido;
- agente de destino ainda autorizado no workspace;
- confirmação humana válida;
- contrato e origem ainda reconhecidos.

Qualquer falha deve bloquear a chamada ao LLM de forma fechada. **Não existe mitigação por
janela temporal aprovada.**

**Correção desta auditoria**: uma redação anterior desta seção generalizava a obrigação para
"identidade individual"/"principal da execução" sem nomear `requestedByUserId` explicitamente.
Essa generalização abriu espaço para, mais adiante no documento (seção 11), uma recomendação
de substituir `requestedByUserId` por `confirmedByUserId` sem nova decisão explícita — o que
esta ratificação **não autoriza**. `requestedByUserId` permanece o principal cuja autoridade
D4 exige revalidar, até que uma nova decisão, datada e explícita, diga o contrário.

**Estas três decisões, por si só, não autorizam `publishRun`, fila, worker, deploy ou
produção.**

### Aprovação de escopo — `RadarSignalResultV1` V1 (2026-09-08)

Decisão registrada textualmente, conforme fornecida:

> "Aprovo o escopo de produto do RadarSignalResultV1 restrito a contas e leads conhecidos, com
> os quatro tipos de sinal propostos. Antes da implementação, devem ser corrigidas as
> inconsistências técnicas identificadas, sem ampliar esse escopo. A evolução futura deverá
> ocorrer por versionamento explícito, preservando contratos e snapshots anteriores. Esta
> aprovação não autoriza publicação na fila, chamadas ao LLM, deploy ou produção."

**O que esta aprovação cobre:**
- O escopo de produto do V1: sinais restritos a contas/leads **conhecidos** do tenant — nunca
  mercado amplo, tendência setorial ou benchmarking cross-tenant.
- Os quatro valores de `signalType`: `lead_intent_signal`, `account_lifecycle_signal`,
  `competitive_context_signal`, `content_engagement_signal`.
- O princípio de evolução por versionamento explícito, sem reinterpretação silenciosa de
  contratos/snapshots já persistidos.

**O que esta aprovação NÃO cobre** — seguem propostas técnicas sujeitas a revisão, seção 9:
limites exatos de campos/coleções/payload; regras de precedência entre os quatro tipos;
estrutura de referência ao sujeito (conta/lead); regras de formato/tolerância de datas e URLs;
`reasonCode`s novos; qualquer mudança de autorização, publicação, execução ou infraestrutura.

**D4, D5 e D6 permanecem exatamente como ratificados acima, sem alteração**: `Run.agent` deve
ser exatamente `"radar"`; a confirmação humana continua obrigatória antes de qualquer chamada
ao LLM; `requestedByUserId` permanece preservado e revalidado, sem substituição silenciosa
pelo confirmador.

### Aprovação de contrato técnico — `RadarSignalResultV1` V1 (2026-09-11)

Decisão registrada textualmente, conforme fornecida:

> "Aprovo as recomendações de contrato V1 indicadas nesta revisão, incluindo a matriz de
> elegibilidade e precedência como regras do produtor. Antes da implementação, apresentar o
> contrato completo e corrigir os seis pontos identificados. O TTL de confirmação humana
> permanece separado e pendente. Esta aprovação não autoriza alterações no fingerprint
> existente, publicação na fila, chamadas ao LLM, importação de dados, deploy ou produção."

**O que esta aprovação cobre, além do que já estava aprovado em 2026-09-08**: os limites
individuais e o teto agregado de campos/coleções; as regras de formato/tolerância de
`sourceUrl` e timestamps; a exigência de `evidence` quando `confidenceLevel === "high"`; a
ausência de campo `provenance` no payload; e a matriz de elegibilidade/precedência entre os
quatro `signalType` como regra do produtor. **A lista de "O que esta aprovação NÃO cobre" logo
acima (2026-09-08) fica, portanto, majoritariamente fechada** por esta aprovação — o contrato
técnico completo está na seção 9, já incorporando as duas aprovações.

**O que esta aprovação NÃO cobre**: nenhuma alteração a `stableStringify`/
`computeRequestFingerprint`/`FINGERPRINT_CONTRACT_VERSION`; publicação em fila; chamada ao
LLM; importação de dados; deploy; produção; TTL de confirmação humana (permanece pendente,
seção 20).

**D4, D5 e D6 permanecem exatamente como ratificados, sem alteração.**

### Aprovação de políticas de produto — confirmação humana D6 V1 (2026-09-12)

Decisão registrada, aprovando as recomendações de política apresentadas para o V1 (seção 10,
consolidadas na Rodada 9):

- **TTL da janela de confirmação: 7 dias corridos (168 horas)**, contados desde a criação da
  janela. Edição ou recarga da tela **não renovam** o prazo.
- **Confirmador no V1: somente o próprio `requestedByUserId`**, com autorização vigente no
  momento da confirmação. Confirmação por terceiros fica **fora do V1**.
- **Visualização e edição do rascunho exigem acesso vigente ao encaminhamento e ao sujeito** —
  membership no workspace, sozinha, não basta.
- `requestedByUserId` permanece preservado e sujeito à revalidação D4 imediatamente antes da
  chamada ao LLM — sem alteração, decisão já ratificada acima.

**Esta aprovação não autoriza** implementação, alterações de schema, migrations, fila, LLM,
commit ou publicação — é só a ratificação das políticas de produto; o desenho técnico
correspondente está na seção 22.

**O que permanece proposta técnica, não política de produto**: o protocolo de concorrência, o
mecanismo de unicidade/rollback, e um eventual reforço de imutabilidade no banco (seção 22) —
essas são decisões técnicas a fundamentar, não escolhas de produto já aprovadas por esta
decisão.

**Regras temporais, mantidas distintas**: o TTL acima governa só a janela de confirmação — não
altera a ausência de limite estrutural sobre a idade do sinal (seção 9.3) nem a revalidação de
autoridade (D4), que ocorre sempre no momento real da execução, independentemente de quando a
confirmação ocorreu.

---

## 0. Base verificada e escopo examinado

| Item | Valor |
|---|---|
| Worktree | `/home/jusall/projects/EIAH_SIGNALFORWARD_ORIGIN_FIX` |
| Branch | `experiment/signalforward-origin-fingerprint-fix` |
| HEAD no início da Rodada 3 | `8d76a30a6326761614a41e601015c56ec6758958` |
| HEAD no início da Rodada 4 | `4d91b6c24794849c574da4e57d21aab41779141e` — dois commits além de `8d76a30` (`35229ed` implementação de `fingerprintVersion`, `4d91b6c` evidência/consulta da rodada anterior), confirmado limpo (`git status --short` vazio) antes desta edição |
| Correção de código mais recente | `768e1b2cd331c435a4d11e84cea5ab6733999321` (ancestral de `8d76a30`) — nenhum código novo além de `fingerprintVersion` (`35229ed`) desde a Rodada 3; nenhum dos achados de código das seções 0–6 foi invalidado |
| `main` remota | não reconsultada nesta rodada — sem necessidade, nenhuma mudança de código ocorreu |
| CLAUDE.md/CODEX.md/IA_EIAH.md | lidos integralmente nesta rodada, hashes idênticos às rodadas anteriores desta sessão |
| Infraestrutura | Neon não é usada nem considerada requisito desta frente; PostgreSQL padrão, sem fornecedor escolhido |
| Outras frentes | não tocadas nesta rodada |

**Escopo examinado na Rodada 3** (arquivos lidos, além dos já citados em rodadas anteriores):
`apps/api/src/workers/runWorker.ts` (`processRunPayload`, `resolveActionsForExecution`,
`finalizeCancelledRunPartial`), `apps/api/src/services/agents.ts` (`getAgentProfile`,
`isAgentAvailableInWorkspace`), `apps/api/src/routes/agents.ts` (linha 598 atual),
`apps/api/src/routes/runs.ts` (`RunExecutionSchema` e schemas irmãos, linhas 240-269),
`apps/api/src/services/runArchiveService.ts` (escritas raw SQL), `apps/api/src/services/
runAtivoUniversalAgent/interpreters/mktInterpreter.ts` (achado lateral).

**Escopo examinado na Rodada 4** (leitura adicional, nenhuma alteração de código): confirmação
de que `readAndValidateOrigin` não filtra por agente (`grep` direto, sem ocorrência de
`\bradar\b` fora do próprio módulo `signalForward`); listagem completa dos `agentKey` estáticos
reais em `CORE_AGENT_PROFILES`/`AGENT_GOVERNANCE_OVERRIDES` (`services/agents.ts`); leitura de
`createDestinationRun`/`createRunRecord` confirmando que o `Run` de destino é criado sem campo
`prompt`; leitura de `processRunPayload` confirmando que `prompt` é lido exclusivamente do
payload da fila, nunca de `Run.request`; leitura completa de `packages/core/src/queue/
runQueue.ts` (`publishRun`, `consume`, `removeOnComplete`, `attempts`); leitura de
`updateRunStatus` (`services/runs.ts:311`) confirmando ausência de claim atômico
(`UPDATE` incondicional, sem `WHERE status='pending'`); leitura de `chargeRun`
(`services/billing.ts:361`) confirmando padrão check-then-insert não atômico; leitura de
`schema.prisma` (`User`, `TenantMembership`, `ApiToken`, `WorkspaceAgentAssignment`,
`TenantActionPolicy`, `BillingLedger`); leitura de `enforceTenant.ts`, `rbac.ts`,
`TenantPolicyStore.ts`. Nenhuma dessas leituras alterou código — só confirmação de fatos.

**Correções pontuais de escopo de afirmação (Rodada 6)** — quatro pontos em que uma rodada
anterior (apresentada apenas em chat, nunca gravada neste documento) fez ou poderia sugerir
afirmações mais fortes do que o que foi de fato verificado; registrados aqui com o escopo exato
da verificação, sem inventar o que não foi checado:
- **Registro/assignment do produtor Radar**: `AgentMetadata`/`WorkspaceAgentAssignment` são
  tabelas reais (ver seção 4) capazes de registrar um `agentKey="radar"` em runtime, mas nenhum
  registro desse tipo foi localizado estaticamente no código, e **nenhuma consulta ao banco de
  dados real foi feita** em nenhuma rodada desta frente — a existência dinâmica de um
  `agentKey="radar"` cadastrado hoje em algum tenant **não foi verificada, nem confirmada nem
  descartada**.
- **Hash/identificador próprio do agente Radar**: nenhum hash, assinatura ou identificador de
  conteúdo específico do produtor "radar" foi localizado nos caminhos examinados (`services/
  agents.ts`, `schema.prisma`, módulo `signalForward`). Isso não prova ausência em outros
  caminhos não examinados — só que a busca feita não encontrou.
- **"Sete camadas" da EIAH**: mapeamento apresentado em rodada anterior (chat) como
  correspondência do Radar a uma taxonomia de sete camadas. Verificado nesta rodada: essa
  taxonomia **não é uma estrutura nativa do repositório** (nenhum diretório, módulo, tipo ou
  nome de serviço com essa numeração/nomenclatura foi localizado) — é uma classificação
  conceitual aplicada externamente sobre o código existente, útil como leitura, mas não uma
  garantia, contrato ou módulo real do sistema.
- **Preservação da versão anterior do documento (hash `9e8a11acaa7f01d11b09ef23d1783b8d`)**:
  investigado em rodada anterior via `git diff --cached`, `git stash list`, `git ls-files -s` e
  `git fsck --full --unreachable --dangling` — nenhuma cópia recuperável dessa versão específica
  foi localizada. **Isso permanece não comprovado byte a byte** nesta rodada também; é distinto
  do que a Rodada 6 de fato verificou (que o documento não foi alterado entre o início e o fim
  desta rodada de implementação, via cópia local fora do controle de versão feita no início
  desta rodada e comparada ao final).

---

## 1. Correções explícitas às conclusões da rodada anterior (v2)

| Conclusão em v2 | Problema | Correção nesta rodada |
|---|---|---|
| "Etapa 6 — não rastreado até o fim... para não expandir o escopo" | A própria consulta desta rodada determina que isso está dentro do escopo | Rastreamento fechado até `orchestrator.run(...)` — seção 2 |
| "budget/toneProfile/launchDate" tratados como obrigatórios em um ponto e como aceitando vazio em outro, sem resolver a contradição | Contradição não resolvida, sem evidência de schema | Resolvida com evidência direta: `RunExecutionSchema` (`routes/runs.ts:240-244`) — nenhum desses campos é exigido pelo backend. Seção 2 |
| "Ausência de checkScopePermission/reauthorizeSignalForward/authContext em runWorker.ts (zero ocorrências)" apresentada como prova de ausência de autorização na cadeia | Busca por nome não é prova de ausência de controle equivalente | Corrigido: encontrado `isAgentAvailableInWorkspace` (`agents.ts:1328-1367`), que consulta `TenantActionPolicy`/`DelegationPolicy` — mas seu resultado **não bloqueia execução** (usado só para um campo de exibição). Confirmado com leitura de código, não com ausência de grep. Seção 3 |
| "Nenhum agente 'radar' real existe no sistema hoje" | Afirmação de inexistência global a partir de busca estática | Corrigido para "não localizado no código/configuração estática examinados" — não consultei dados reais de banco. Seção 4 |
| `routes/agents.ts:598` e `workers/runWorker.ts:553` listados como "não verificados" | Pendência explícita da rodada anterior | Fechados nesta rodada — nenhum dos dois escreve `Run.response` com conteúdo arbitrário client-controlado (598 só toca `request`; 553 é write server-side dentro do próprio worker). Seção 4 |
| Qualquer alteração de estado da origem tratada genericamente como "conflito" | Mistura `ConflictError` (fingerprint) com `SignalForwardOriginError` (elegibilidade) | Corrigido — classes e `reasonCode` distintos mapeados por cenário. Seção 6 |
| "FK `ON DELETE RESTRICT` impede exclusão" apresentada perto de afirmações de imutabilidade do snapshot | Mistura duas garantias diferentes | Separado explicitamente: a FK protege só contra exclusão referenciada; não diz nada sobre `UPDATE` em `originSnapshot`. Seção 6 |
| "Alternativa 1 (permitir reuso por outro usuário) é a recomendação consistente" apresentada de forma a soar quase decidida | Risco de decidir política de produto pela ausência de controle atual | Recolocada estritamente como pergunta em aberto, sem inclinar a decisão pela ausência de mecanismo. Seção 7 |

---

## 2. Cadeia completa até a chamada ao LLM

Todas as etapas abaixo lidas na Rodada 3, na revisão `8d76a30` (`768e1b2` não altera nenhum destes arquivos — herdados do baseline `11805d19`). Reconfirmadas sem mudança na Rodada 4 (nenhum destes arquivos foi alterado pelos commits `35229ed`/`4d91b6c`).

### Etapa 1 — Formulário self-service
`apps/web/src/pages/self-service/mkt.tsx:118-212`, `buildRequest`. Campos do formulário:
`goal, kpis, audience, channels[], budget, toneProfile, toneNotes, launchDate, deadline, notes`.
Nenhum `<input>`/`<textarea>` tem atributo `required` (confirmado por leitura do JSX,
linhas 289-410). Produz `{prompt, metadata: {form, domain:"marketing", ...}, rawPayload}`.

### Etapa 2 — Shell de execução
`apps/web/src/pages/self-service/components/AgentFormShell.tsx:359-445`, `executeRun`. Monta
`payload = {agent:"MKT", prompt, workspaceId, metadata:{mode, ...metadata, executionInput}}`.

### Etapa 3 — Cliente HTTP
`apps/web/src/hooks/useAgentExecution.ts:95-102` → `POST /runs`.

### Etapa 4 — Validação backend (evidência que resolve a contradição de v2)
`apps/api/src/routes/runs.ts:240-244`:
```ts
const RunExecutionSchema = z.object({
  agent: z.string().min(1),
  prompt: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});
```
**Único contrato de entrada validado pelo backend para qualquer agente, incluindo MKT.**
`metadata` é `z.record(z.any()).optional()` — **nenhum campo dentro de `metadata.form`
(incluindo `budget`, `toneProfile`, `launchDate`) é exigido ou validado pelo backend.**

`authContext.tenantId/workspaceId/userId` vêm de `enforceTenant` (seção 3), nunca do corpo —
confirmado em `createRunRecord({..., tenantId: authContext.tenantId, ...})`
(`routes/runs.ts:672-674`). `agent` vem de `req.body.agent`, restrito por
`assertWorkspaceAgentEnabled`.

### Etapa 5 — Persistência
`services/runs.ts`, `createRunRecord` → `prepareRunRequestAction`
(`imobRunActionCatalog.ts:70-95`, pass-through para `domain !== "imob"`). Persiste
`Run.request = {prompt, metadata}` (`routes/runs.ts:488`, `requestPayload`).

**Achado da Rodada 4, relevante para D6**: `signalForwardingService.ts`, `createDestinationRun`,
grava `Run.request = { metadata: { signalForwardRequestId, sourceRunId } }` — **sem campo
`prompt`**. Isso não passa por `RunExecutionSchema` (que só valida o corpo da rota HTTP
`/runs`, nunca chamadas diretas a `createRunRecord`).

### Etapa 6 — Publicação e consumo da fila
`routes/runs.ts:834`, `await publishRun({runId, tenantId, workspaceId, userId, agent, prompt,
metadata})` (mesmos campos de `Run`, sem token/authContext). Consumidor:
`workers/runWorker.ts:2533`, `consume(processRunPayload)`.

`processRunPayload` (`runWorker.ts:1060-1069`): desestrutura `{runId, tenantId, workspaceId,
userId, prompt, metadata}` **exclusivamente do payload da fila** — **nunca relê `Run.request`
do banco**. Se `prompt` estiver ausente/vazio, o job é descartado silenciosamente
(`if (!prompt) { ...error; return; }`, sem nunca chamar `finalizeRunRecord`/`updateRunStatus`)
— o `Run` correspondente fica em `status:"pending"` para sempre, e o job já foi consumido e
perdido. **Achado da Rodada 4**: nenhum dos quatro pontos reais que chamam `publishRun`
(`routes/runs.ts` ×2, `routes/agents.ts`, `routes/shadow-executions.ts`) é chamado por
`signalForwardingService.ts` — o `Run` de destino do SignalForward nunca é publicado hoje, com
ou sem as decisões desta rodada.

`processRunPayload`: não há bearer token nem authContext no payload; a identidade que chega ao
worker é só os IDs já resolvidos na criação.

### Etapa 7 — Perfil do agente
`runWorker.ts:1099`, `getAgentProfile(tenantId, workspaceId, agent)` →
`services/agents.ts:1373-1412`. Internamente chama `isAgentAvailableInWorkspace`
(`agents.ts:1328-1367`), que consulta `TenantActionPolicy` (`actionName` = chave do agente,
`allowed:true`) **e** uma `DelegationPolicy` ativa com `MarketplaceItem` do tipo `"agent"`
correspondente.

**Achado decisivo**: o resultado booleano de `isAgentAvailableInWorkspace` só é usado para
compor o campo `participation` do perfil — **não é usado em `processRunPayload` para decidir
se a execução prossegue.** A única checagem que de fato interrompe a execução nesta etapa é
`if (!profile) { ...error "AGENT_NOT_FOUND"... }` (`runWorker.ts:1100-1128`), que só falha se
**nenhum** `AgentProfile` existir para aquele nome de agente — independente de
`isAvailableInWorkspace`. Ou seja: existe uma consulta de política real neste ponto da cadeia,
mas seu resultado **não bloqueia a execução**. **Relevante para D4**: a função certa para
revalidação futura é `assertWorkspaceAgentEnabled` (que já bloqueia, lança
`WorkspaceAgentAssignmentError`), não `isAgentAvailableInWorkspace` (que só informa).

### Etapa 8 — Resolução de ações/ferramentas
`resolveActionsForExecution` (`runWorker.ts:569-611`), chamada logo antes de `orchestrator.run`.
Consulta `TenantActionPolicy` **de novo, ao vivo** (`allowed:true`, `workspaceId` ou `null`)
para filtrar quais ferramentas/ações o agente pode invocar durante a execução. **Fallback
observado**: se não houver nenhuma política resolvida e nenhum resolver customizado
configurado, libera o catálogo inteiro de ações registradas — um "fail-open" explícito para o
caso de ausência total de política.

Este é um controle real, tenant-scoped, avaliado no momento da execução — mas é sobre
**quais ferramentas** o agente pode usar, não sobre **se aquele run específico** tem
autorização para executar.

### Etapa 9 — Chamada ao LLM
`runWorker.ts:1858-1877`:
```ts
context = await orchestrator.run({
  objective: prompt,          // == payload.prompt, passado à fila; NÃO relido de Run.request
  tenantId, workspaceId, runId,
  metadata: orchestratorMetadata,  // {...metadata, userId}
  actions: actionsForTenant,       // resultado da Etapa 8
  maxSteps: process.env.RUN_MAX_STEPS,       // opcional, config de ambiente
  stepTimeoutMs: process.env.RUN_STEP_TIMEOUT_MS,  // opcional, config de ambiente
});
```
Este é o limite da investigação: `orchestrator.run` é o ponto real de chamada ao LLM — o
mesmo ponto onde `chargeRun` (seção 18) e a revalidação D4 (seção 12) devem atuar, esta
última **antes** desta linha. **Não tracei o corpo interno de `orchestrator.run`/
`llmExecutor.ts`** (construção exata da mensagem enviada ao provedor).

### Etapa 10 — Interpretação da saída (confirmado, não é entrada)
`buildMktStructuredOutput` (`runWorkerMktOutput.ts:31-49`) → `buildMktCampaignReport`
(`mktCampaignInterpreter.ts:357-367`), executado **depois** da Etapa 9, sobre `outputText`/
`metadata.form`/`recipeOrchestration`.

**Achado lateral, não aprofundado**: existe um segundo interpretador,
`runAtivoUniversalAgent/interpreters/mktInterpreter.ts` (`interpretMkt`), que também lê
`form.goal/audience/channels/budget/launchDate/toneProfile` com fallback total em cada campo —
reforça o padrão "todo campo de `metadata.form` é opcional em todo consumidor encontrado".

### Classificação de campos

| Campo | Apresentado no formulário | Obrigatório por validação backend | Necessário ao executor (`orchestrator.run`) | Usado só na interpretação da saída | Opcional/fallback |
|---|---|---|---|---|---|
| `prompt` (texto completo) | gerado pelo formulário, não é um campo isolado | **Sim** — `RunExecutionSchema.prompt: z.string().min(1)` | **Sim** — vira `objective` diretamente | não | não |
| `agent` | fixo `"MKT"` | **Sim** — `RunExecutionSchema.agent` | indiretamente (resolve perfil/ações) | não | não |
| `metadata` (objeto todo) | sim | **Não** — `z.record(z.any()).optional()` | passado adiante como contexto | não é usado diretamente no ponto rastreado | sim |
| `metadata.form.goal/audience/channels/kpis` | sim | não | não confirmado como lido por `orchestrator.run` | sim (`buildMktCampaignReport`, `interpretMkt`) | sim, com fallback em todo consumidor encontrado |
| `metadata.form.budget/toneProfile/launchDate` | sim | **não** (evidência: `RunExecutionSchema`) | não | sim (mesmos dois interpretadores) | sim |

**Menor contrato de entrada MKT sustentado pelo código**: `{agent: "MKT", prompt: string não-vazio}`.

---

## 3. Autorização na cadeia efetiva (não por ausência de nomes)

| Etapa | Controle real encontrado | O que garante | O que NÃO garante |
|---|---|---|---|
| Criação (`POST /runs`) | `enforceTenant` (`middlewares/enforceTenant.ts:58-155`) | Bearer token real, validado (`revoked`, `expiresAt`) — `authContext={tokenId,tenantId,workspaceId,userId?}` | `userId` pode ser ausente (token de serviço) |
| Criação | `assertWorkspaceAgentEnabled` (via `createRunRecord`) | Atribuição real do agente ao workspace | Não é permissão de operação por indivíduo |
| Criação | `checkScopePermission` para `runs.execute` | **Não wireado em `POST /runs`** | — |
| Publicação/fila | nenhum | Apenas propagação de dados | Nenhuma reautenticação nem reautorização |
| Consumo (worker) | `getAgentProfile`→`isAgentAvailableInWorkspace` | Consulta política real, mas **não bloqueia** | Não impede execução mesmo se a política negasse |
| Imediatamente antes do LLM | `resolveActionsForExecution` | Filtra **ferramentas/ações** por política tenant-scoped, ao vivo | Fail-open se não houver política nenhuma; não decide "pode este run executar" |
| — | — | — | **Nenhuma etapa revalida se o autor original ainda tem permissão de tenant/workspace/scope entre a criação e a chamada ao LLM** — este é exatamente o problema que D4 ratifica a necessidade de fechar (seção 12) |

**Diferenciação exigida**:
- **Autorização** (pode operar): `checkScopePermission`/`TenantActionPolicy` — existe como mecanismo, não wireado no caminho de criação de run nem revalidado depois.
- **Aprovação** (HITL/governança sobre uma decisão específica): não localizada no caminho MKT rastreado — `approvalStatus`/`approvedBy` existem no schema de `Run`, mas não vi nenhum gate delas neste caminho.
- **Habilitação do agente**: `assertWorkspaceAgentEnabled` (bloqueia) e `isAgentAvailableInWorkspace` (não bloqueia, só informa) — duas checagens com o mesmo propósito aparente e comportamento diferente.
- **Simples propagação de identidade**: `userId`/`tenantId`/`workspaceId` no payload da fila — dados, não verificação.

### Análise de `resumeSignalForwardDispatch` (proposta de rodada anterior)

- **`checkScopePermission` decide por usuário/token ou por tenant/workspace?** Por
  tenant/workspace apenas — `TenantPolicyStore.resolveScopeDecision(tenantId, workspaceId,
  scope)`, sem parâmetro de usuário.
- **Passar `requestedByUserId` muda a decisão?** **Não.** `userId` só alimenta a linha de
  auditoria (`rbac.ts:54`).
- **Qual principal autoriza a retomada, então?** Hoje, nenhum principal individual — a
  autorização é do tenant/workspace persistido em `SignalForwardRequest`. **D4 ratifica que
  isso precisa mudar** antes de qualquer retomada assíncrona real existir (seção 12).
- **Tokens de serviço sem `userId`**: tratados de forma idêntica a requisições com `userId`.
- **Dados persistidos suficientes para revalidar a política proposta**:
  `SignalForwardRequest.tenantId`/`workspaceId` bastam para repetir `checkScopePermission`
  hoje. `requestedByUserId` já está persistido e nunca sobrescrito.
- **Credenciais**: nenhuma credencial bruta é ou seria armazenada — apenas IDs. A regra de
  revogação/autoridade de execução continua sendo uma decisão explícita necessária, não
  presumida — ver D4 (seção "Decisões ratificadas") e a preservação de `requestedByUserId` na
  seção 11.

---

## 4. Procedência de `Run.response`/`Run.agent` — investigação fechada

**Quem define `Run.agent`**: `req.body.agent` no momento da criação, validado por
`assertWorkspaceAgentEnabled`. Busca exaustiva por qualquer `.run.update(...)`/
`.run.upsert(...)`/`.run.updateMany(...)`/SQL cru que grave `agent:` — **nenhuma ocorrência
encontrada**. `Run.agent` é definido uma única vez e nunca reescrito.

**Quem grava/modifica `Run.response`**:
- `routes/agents.ts:598`: grava apenas `data: { request: preparedRequest.request }` — não toca `response`.
- `workers/runWorker.ts:553` (`finalizeCancelledRunPartial`): grava `response` computado a partir do próprio contexto de execução do worker.
- `routes/runs.ts:1092,1229`: alteram apenas campos de uma recomendação já existente.
- `runArchiveService.ts`: grava apenas `archived_at`/`archive_ref`.

**Conclusão**: nenhum endpoint client-facing permite substituir `Run.response` por conteúdo
arbitrário.

**Produtor Radar — separação exigida pela consulta, e o que a Rodada 4 ratifica sobre isso**:
- **Produtor localizado no código**: nenhum agente "radar" em `CORE_AGENT_PROFILES`
  (`services/agents.ts`) nem em nenhum seed estático examinado. **Confirmado de novo na
  Rodada 4**: `grep -rn "\bradar\b"` sobre o código real da aplicação (fora do próprio módulo
  `signalForward`) não retorna nenhuma ocorrência.
- **Lista completa dos `agentKey` estáticos reais** (`CORE_AGENT_PROFILES`/
  `AGENT_GOVERNANCE_OVERRIDES`, `services/agents.ts`, lida linha a linha na Rodada 4):
  `aadv, defi1, diarias, eiah, finnexus, floworchestrator, guardian, ibc, imagenftdiarias,
  j360, mkt, nftpy, onchainmonitor, pitch, riskanalyzer`. Nenhum se chama `"radar"`. **D5
  ratifica que o único valor aceito é exatamente `"radar"`** — a comparação é sempre exata
  contra este literal, independentemente do que existir ou não hoje na lista estática.
- **Configuração dinâmica/cadastro**: `AgentMetadata`/`WorkspaceAgentAssignment` são tabelas
  reais que podem ser populadas em runtime por qualquer tenant — não consultei o banco de
  dados real.
- **`readAndValidateOrigin` hoje**: filtra por `tenantId`+`workspaceId`+`status==="success"`+
  `response` estruturado — **nunca por `agent`**. Qualquer `Run` bem-sucedido de qualquer
  agente do mesmo tenant/workspace é aceito como origem hoje. Isto é um **fato técnico atual**,
  não alterado por D5 ainda não estar implementada.

O contrato técnico `RadarSignalResultV1` foi ratificado como especificação na Rodada 5 (ver
seção 9 e "Aprovação de contrato técnico"). **Atualização da Rodada 6**: a allowlist de
produtor (D5-A) e o validador de conteúdo (D5-B) foram implementados e testados nesta rodada
(detalhe completo, incluindo o que continua fora de escopo, na seção 19) — a frase original
desta seção ("nenhuma linha de código... implementada") descrevia o estado até a Rodada 5 e não
é mais atual. Isso não implica nenhuma alteração de schema/migration, nem resolução de
`subject`, nem TTL de confirmação humana, nem ativação operacional (fila/LLM) — esses seguem
não implementados. A busca original por `RadarSignalResultV1` em `git log --all` (nenhuma
ocorrência fora deste documento até a Rodada 5) não foi refeita nesta rodada porque deixou de
ser relevante: a estrutura de campos agora existe em código não commitado
(`radarSignalResultValidator.ts`), verificável diretamente por `git status`/`git diff`, não por
busca no histórico.

---

## 5. Versionamento e persistência — comparação corrigida

### Correção das premissas apontadas

- **"Snapshot sozinho garante reconstrução determinística"** — falso. Reconstruir a entrada
  exige, além do `originSnapshot`: a versão do contrato de origem, a versão do algoritmo de
  fingerprint, e — se um adaptador existir — a versão exata da lógica do adaptador usada.
- **"Persistir entrada derivada impede evolução do adaptador"** — falso.
- **"Versão do fingerprint substitui as demais"** — falso. São eixos independentes.

### A vs. B, com evidência de código

**Onde `Run.request` já é escrito**: uma única vez, na criação, com merges pontuais
server-computados depois — nunca substituído por completo.

| | A — snapshot + versões, entrada reconstruída sob demanda | B — snapshot + entrada MKT derivada, persistida e versionada |
|---|---|---|
| Onde vive a entrada derivada | recalculada a cada uso | `Run.request` do run de destino (já existe, sem coluna nova) |
| Retomada com payload fixado | requer reconstrução determinística | trivial — já está gravado |
| Custo de schema | nenhum, além de campos de versão | nenhum para a entrada em si; campos de versão continuam necessários |
| Risco de divergência | alto se versões antigas forem removidas do código | baixo |

**Recomendação técnica a avaliar (não decisão ratificada)**: preferir B. **Nota da Rodada 4**:
D6 decide que, no V1, a entrada MKT não é derivada automaticamente de forma alguma — é o
humano que produz/edita `finalPrompt` na confirmação (seção 10). A comparação A/B acima
permanece relevante para uma eventual geração automática futura de `suggestedPrompt`
(opção (a) da antiga seção 7.6), não para o V1 confirmado nesta rodada.

**Imutabilidade — reafirmado**: nenhuma constraint de banco impede `UPDATE` em
`originSnapshot`; a garantia é só disciplinar.

---

## 6. Três caminhos — corrigidos

### A. Repetição HTTP com a mesma chave
Autoriza a tentativa atual (`reauthorizeSignalForward`) → dentro da transação,
`readAndValidateOrigin` verifica a origem conforme a regra existente hoje. Em caso de P2002 na
chave idempotente, `recoverExistingSignalForwardRequest` relê a origem e recalcula o
fingerprint; se divergir, lança **`ConflictError`** — único cenário que a produz.

### B. Consulta de encaminhamento existente
Não implementada.

### C. Retomada interna
Não implementada. **Bloqueada por D4** — só pode ser construída depois da revalidação de
autoridade individual existir (seção 12).

### Estado da origem — classes e `reasonCode` reais

| Cenário | Classe lançada | `reasonCode`/mensagem |
|---|---|---|
| Origem inexistente ou fora do tenant/workspace | `SignalForwardOriginError` | `source_run_not_found_in_scope` |
| Origem em estado não elegível | `SignalForwardOriginError` | `source_run_not_in_required_state` |
| Origem sem `response` estruturado | `SignalForwardOriginError` | `source_run_missing_structured_response` |
| Fingerprint divergente | `ConflictError` | `idempotency_key_reused_incompatible_payload` |
| Solicitação existente sem `destinationRunId` | `SignalForwardInconsistencyError` | `existing_request_without_destination_run` |
| Solicitação não encontrada apesar de P2002 | `SignalForwardInconsistencyError` | `unique_violation_without_matching_row` |
| Autorização negada | `SignalForwardAuthorizationError` | `reasonCode` de `TenantPolicyStore` |
| Atribuição do agente negada | `WorkspaceAgentAssignmentError` | `AGENT_ASSIGNMENT_REQUIRED`/`AGENT_NOT_ENABLED_IN_WORKSPACE` |

**Nenhum handler HTTP existe hoje para `signalForwardingService.ts`.**

### Mudança de conteúdo vs. estado vs. revogação vs. exclusão vs. falha técnica

*(Restaurada nesta auditoria — havia sido removida sem substituição equivalente na Rodada 4;
nenhum conteúdo aqui é novo em relação à Rodada 3.)*

| Tipo de mudança | Comportamento real hoje |
|---|---|
| Conteúdo alterado | `ConflictError` na próxima tentativa A que recalcule o fingerprint |
| Estado alterado (deixou de ser `"success"`) | `SignalForwardOriginError(source_run_not_in_required_state)` numa nova validação de origem |
| Acesso/autorização revogado | `SignalForwardAuthorizationError`, mas **só é revalidado nos pontos que já chamam `reauthorizeSignalForward`** — caminho A e o reuso; não há revalidação automática entre isso e uma futura execução, porque essa execução (fila/worker) não existe ainda para este fluxo |
| Origem excluída | Bloqueado no banco pela FK composta (`ON DELETE RESTRICT`) — **isto é só proteção contra exclusão referenciada**; não diz nada sobre se `originSnapshot` foi ou pode ser sobrescrito, nem sobre imutabilidade em geral (essa garantia é só disciplinar, seção 5) |
| Falha técnica ao consultar autorização | `checkScopePermission` propaga a exceção (sem captura silenciosa na consulta principal) — distinta de negação de política por `reasonCode` |

---

## 7. Decisões de produto — status após a Rodada 4

### 7.1 Quem pode consultar encaminhamentos e resultados — **ainda em aberto**
Sem mudança desde a rodada anterior. Alternativas e consequências preservadas: (1) recurso do
workspace; (2) só `requestedByUserId`; (3) escopo de leitura distinto. Não decidido nesta
rodada.

### 7.2 Quem pode reutilizar a chave/pedido de outro principal — **ainda em aberto**
Sem mudança. Ligado a 7.1 e à separação de identidades da seção 10.

### 7.3 Consulta e execução exigem permissões diferentes? — **ainda em aberto**
Sem mudança. Nome exato do escopo de leitura permanece pendente (seção 20).

### 7.4 Autoridade para execução assíncrona e efeito da revogação — **RATIFICADA como D4**
Ver "Decisões ratificadas" no topo do documento e seção 12 (cadeia de revalidação).

### 7.5 Qual produtor/contrato Radar será aceito — **RATIFICADA como D5**
Ver "Decisões ratificadas". `agentKey` = `"radar"`, exato.

### 7.6 Qual tarefa MKT o encaminhamento deve solicitar — **RATIFICADA como D6**
Ver "Decisões ratificadas". Confirmação humana obrigatória no V1 — ver seção 10 para o
contrato completo.

### Preservação de autoria e auditoria de acesso
`requestedByUserId` permanece a autoria original do pedido. Se o produto decidir registrar
quem mais acessou/reutilizou um encaminhamento, a proposta técnica correta é um **histórico de
eventos** (uma linha por acesso), não um único campo `lastAccessedBy`.

---

## 8. Casos de teste planejados (não executados nesta rodada)

| Caso | Tipo | Status |
|---|---|---|
| Origem de outro tenant/workspace | integração com banco | Evidência histórica: `H-origin-validation.test.ts` |
| Alteração de conteúdo → `ConflictError` | integração | Evidência histórica: `I-fingerprint-integrity.test.ts` |
| Permissão de destino negada | integração | Evidência histórica: `D-assignment-refusal.test.ts` |
| `isAgentAvailableInWorkspace` não bloqueia execução | integração com banco | planejado, não implementado |
| `resolveActionsForExecution` fail-open sem política | unitário | planejado, não implementado |
| Reuso por outro usuário do mesmo workspace | integração | planejado, bloqueado por 7.2 |
| Consulta (caminho B) | integração | planejado, função não existe |
| Retomada interna (caminho C) | integração | planejado, bloqueado por D4 |
| Job descartado por `prompt` ausente (Etapa 6) | integração | **novo na Rodada 4**, planejado |
| Publicação duplicada com `jobId` determinístico | integração | **novo na Rodada 4**, planejado, ver seção 16 |
| Claim atômico impede segunda execução concorrente | integração | **novo na Rodada 4**, planejado, ver seção 16 |
| Worker recusa origem com agente ≠ `"radar"` | integração | **novo na Rodada 4**, planejado, ver D5 |
| Worker recusa por falha em qualquer item da revalidação D4 | integração | **novo na Rodada 4**, planejado, ver seção 12 |
| Fluxo completo de confirmação humana (D6) | integração | **novo na Rodada 4**, planejado, ver seção 10 |
| `Run.agent` imutável após criação | integração | planejado — nunca testado diretamente |

---

## 9. `RadarSignalResultV1` — contrato completo (ratificado nesta rodada, exceto onde indicado)

**Rodada 5 (2026-09-11)**: incorpora a "Aprovação de contrato técnico" registrada acima.
Ratifica limites individuais e agregado, regras de data/`sourceUrl`, a exigência de `evidence`
quando `confidenceLevel === "high"`, a ausência de campo `provenance` no payload, e a matriz de
elegibilidade/precedência como regra do produtor. **Não ratificado**: TTL de confirmação
humana (seção 20). **Estado até a Rodada 5**: nenhum código, schema, migration, teste, fila,
worker, endpoint ou infraestrutura havia sido criado ou alterado para sustentar este contrato —
permanecia documentação, sujeita à menor unidade de implementação da seção 19.

**Atualização da Rodada 6/7**: D5-A (filtro exato do produtor) e D5-B (validador completo de
conteúdo) foram implementados, integrados em `readAndValidateOrigin` e testados — a frase
"não implementado" acima descrevia o estado até a Rodada 5 e não é mais atual; detalhe completo
do que foi implementado/testado, e do que continua fora de escopo (resolução de `subject`, TTL,
D4, D6, outbox, cadastro/provisionamento do agente), na seção 19. A Rodada 7 corrigiu, dentro do
próprio validador, um defeito de ordenação entre a etapa estrutural e as regras relacionais
(`capturedAt`/duplicidade de `id`) — ver seção 19 para os detalhes e a evidência.

**Atualização da Rodada 10 (2026-09-12)**: a frase "Não ratificado: TTL de confirmação humana"
acima descrevia o estado até a Rodada 9. **A política de TTL (7 dias corridos, sem renovação
por edição/recarga) foi ratificada** ("Decisões ratificadas", "Aprovação de políticas de
produto — confirmação humana D6 V1") — o mecanismo de aplicação (enforcement) desse TTL
continua não implementado, distinção mantida (seção 22).

Versão: `radar-signal-result.v1`.

### 9.1 Tabela completa de campos

Unidade dos limites individuais: **caracteres Unicode por code point**
(`Array.from(str).length`, nunca UTF-16, nunca bytes). **Mín e Máx são inclusivos nas duas
pontas, para todo campo desta tabela.**

| Campo | Tipo | Obrig. | `null`? | Vazio/só-espaços? | Mín–Máx (code points) | Enum/regra |
|---|---|---|---|---|---|---|
| `contractVersion` | string literal | Sim | Não | N/A | exato | `"radar-signal-result.v1"` |
| `signalType` | string | Sim | Não | N/A | — | `lead_intent_signal`\|`account_lifecycle_signal`\|`competitive_context_signal`\|`content_engagement_signal` |
| `subject.subjectType` | string | Sim | Não | N/A | — | `"internal_reference"` (único valor reconhecido nesta versão) |
| `subject.subjectId` | string | Sim | Não | Não | 1–64 | opaco |
| `subject.subjectDisplayName` | string | Não | Não | Não | 1–120 | evitar quando `subjectId` bastar |
| `title` | string | Sim | Não | Não | 1–120 | — |
| `summary` | string | Sim | Não | Não | 20–1000 | — |
| `detectedAt` | string, RFC 3339 | Sim | Não | N/A | ver 9.3 | — |
| `confidenceLevel` | string | Sim | Não | N/A | — | `low`\|`medium`\|`high`; se `"high"`, `evidence` com ≥1 item torna-se obrigatório (9.4) |
| `evidence` | array | Não | Não | vazio inválido — omitir | 1–5 itens | — |
| `evidence[].description` | string | Sim (no item) | Não | Não | 1–300 | — |
| `evidence[].externalContentRef` | string | Não | Não | Não | 1–64 | se presente, deve corresponder a um `externalContent.items[].id` do mesmo payload |
| `opportunity` | objeto | Não | Não | N/A | — | — |
| `opportunity.summary` | string | Sim (se `opportunity` presente) | Não | Não | 1–300 | — |
| `opportunity.suggestedAction` | string | Não | Não | Não | 1–200 | — |
| `externalContent` | objeto `{items:[]}` | Não | Não | N/A | — | — |
| `externalContent.items` | array | Sim (no objeto) | Não | vazio inválido — omitir `externalContent` | 1–5 itens | — |
| `externalContent.items[].id` | string | Sim | Não | Não | 1–64 | único no payload |
| `externalContent.items[].sourceUrl` | string | Não | Não | Não | 1–500 | absoluta, `https:` obrigatório, sem credenciais embutidas, sem espaço literal (percent-encoded), só validação sintática RFC 3986 — nenhum fetch é feito |
| `externalContent.items[].rawExcerpt` | string | Sim | Não | Não | 1–800 | — |
| `externalContent.items[].capturedAt` | string, RFC 3339 | Sim | Não | N/A | ver 9.3 | não posterior a `detectedAt` do payload |

**Obrigatórios no nível raiz**: `contractVersion`, `signalType`, `subject`, `title`, `summary`,
`detectedAt`, `confidenceLevel` — sete.

### 9.2 Regras gerais de validação, em todo nível de aninhamento

Aplicadas na raiz, em `subject`, em cada item de `evidence[]`, em `opportunity`, e em cada item
de `externalContent.items[]`:

- **Campos desconhecidos**: rejeitados em todo nível — nenhuma chave fora do schema é aceita.
- **`null`**: rejeitado em todo campo — a forma correta de "ausente" é omitir a chave.
- **Arrays vazios**: rejeitados quando o campo pai está presente.
- **Duplicatas**: `externalContent.items[].id` único dentro do payload.
- **Caracteres de controle**: proibidos, exceto `\n` em `summary`/`rawExcerpt`.
- **Unicode inválido**: *code unit* substituto (surrogate) UTF-16 desemparelhado em qualquer
  string é rejeição — sintaticamente permitido pela gramática JSON, mas não é Unicode válido.
- **Teto agregado — 16.384 bytes**, independente dos limites individuais, medido em **bytes
  UTF-8 do `JSON.stringify` compacto** (sem indentação, ordem de inserção nativa do parser
  JSON — **diferente** da ordem de chaves usada pelo fingerprint, ver 9.10) do payload já
  validado individualmente. Um payload pode respeitar todo limite individual e ainda ser
  rejeitado pelo teto agregado — isso é esperado e intencional; **a medição é sempre real,
  nunca substituída por estimativa**, mesmo quando o pior caso teórico já indicaria
  enquadramento.
- **Nenhuma normalização silenciosa**: `trim()` é usado só para decidir se um campo é
  vazio/só-espaços; o **máximo** de cada campo é medido sobre o valor **original**, sem trim;
  o valor **persistido** é sempre o original, nunca reescrito — nem na persistência, nem na
  entrada usada pelo cálculo do fingerprint (9.10).

### 9.3 Datas e `sourceUrl`

**`detectedAt`/`capturedAt`**: formato RFC 3339 (`YYYY-MM-DDTHH:mm:ss[.fff]Z` ou offset
explícito `±HH:MM`; sem fuso é rejeitado). Segundos obrigatórios; fração opcional até 3
dígitos. Validade de calendário real exigida (checagem de data real, não regex —
`"2026-02-30"`/`"2026-13-01"` são rejeitados). **Tolerância futura: exatamente 5 minutos,
inclusiva** — um `detectedAt` até e incluindo `agora + 5min` é válido; além disso, rejeitado.
`capturedAt` de qualquer item não pode ser posterior a `detectedAt` do payload.

**Mantidos separados**: validade estrutural (acima) ≠ idade do sinal (sem limite estrutural) ≠
TTL da confirmação humana (**pendente**, seção 20 — não aprovado nesta rodada).

**`sourceUrl`**: absoluta, esquema `https:` obrigatório (`http:`, `javascript:`, `data:`,
`file:` rejeitados), sem credenciais embutidas (userinfo), sem espaço literal não codificado,
1–500 code points. Validação só sintática (RFC 3986 + regras acima) — **nenhum fetch é feito**.
Formato válido **não implica** que o endereço é confiável, seguro, ou pertence a quem o
payload sugere — é só uma checagem sintática, sem verificação de propriedade ou reputação do
domínio.

### 9.4 Regra condicional — `confidenceLevel === "high"`

Quando `confidenceLevel` for `"high"`, `evidence` torna-se **obrigatório** (≥1 item,
respeitando os limites de 9.1). Ausência de `evidence` com `confidenceLevel: "high"` é
rejeição. **Evidência obrigatória para `high` não significa veracidade comprovada** — a regra
exige a existência de um lastro estruturado; não avalia, não pontua e não garante que o
conteúdo dessa evidência é verdadeiro, suficiente ou bem fundamentado.

### 9.5 Ordem de validação e comportamento em falha

```
0. O payload é um objeto JSON simples — typeof "object", não null, não array.
   Caso contrário: rejeição imediata (reasonCode radar_signal_payload_not_object), sem
   acessar nenhuma propriedade.
1. contractVersion: presente, é string, e é exatamente "radar-signal-result.v1".
2. Nenhum campo fora do schema em nível raiz.
3. Para cada campo do nível raiz, na ordem fixa da tabela 9.1 (contractVersion, signalType,
   subject, title, summary, detectedAt, confidenceLevel, evidence, opportunity,
   externalContent) — nunca na ordem de inserção das chaves recebidas:
   a. obrigatório e ausente → radar_signal_field_missing;
   b. presente e null → radar_signal_field_invalid (reason: null_not_allowed);
   c. presente: verificar o TIPO antes de qualquer outra coisa (string vs. objeto vs. array,
      conforme o campo) — nenhuma propriedade de um valor é lida antes de seu tipo estar
      confirmado; tipo errado → radar_signal_field_invalid (reason: wrong_type);
   d. só então: enum, comprimento em code points (campos string), ou entrar recursivamente no
      objeto/array (subject, evidence[], opportunity, externalContent), repetindo os passos
      2–3 dentro de cada nível, na mesma ordem fixa, incluindo os campos desconhecidos
      daquele nível; arrays são percorridos por índice, em ordem.
4. Regras semânticas/referenciais, só depois de todo o payload já ter passado 1–3 sem erro:
   a. confidenceLevel "high" ⇒ evidence presente com ≥1 item (9.4);
   b. todo evidence[].externalContentRef presente corresponde a um externalContent.items[].id
      existente no mesmo payload;
   c. externalContent.items[].id únicos entre si;
   d. cada externalContent.items[].capturedAt ≤ detectedAt.
5. Teto agregado (16.384 bytes), medido só agora, sobre o payload inteiro já validado.
```

**Desempate entre erros da mesma etapa**: resolvido pela ordem fixa de campos do passo 3 — o
primeiro campo, na ordem da tabela 9.1, que falhar em qualquer sub-passo (a–d) é o erro
reportado; dentro de um mesmo campo, a ordem interna é sempre presença → `null` → tipo →
enum/comprimento. **Comportamento em múltiplas falhas**: reporta a primeira violação
encontrada nesta ordem, seguindo o estilo já real de `readAndValidateOrigin` (fail-fast
sequencial) — não uma lista consolidada de todos os erros.

### 9.6 Sujeito — três camadas distintas, nunca confundidas

1. **Validade estrutural de `subject`** — o parser confirma só forma:
   `subjectType === "internal_reference"`, `subjectId` 1–64 code points não vazio. **Não prova
   nada além disso.**
2. **Sujeito conhecido, existente, no escopo e autorizado** — camada de **resolução**, fora do
   contrato de conteúdo: confirmar que o registro referenciado por `subjectId` existe de fato,
   pertence ao mesmo `tenantId`/`workspaceId` do `Run` de origem, e que quem confirma tem
   autorização de acesso a esse registro. **Fail-closed obrigatório antes da criação do Run
   MKT.** O parser estrutural **não comprova** nada disso — validade estrutural e
   existência/autorização são coisas inteiramente diferentes. O mecanismo concreto de
   resolução (qual cadastro consultar) é **dependência operacional ainda não implementada** —
   hoje não existe cadastro genérico de contas/leads fora do vertical IMOB (busca já registrada
   em rodada anterior, seção 9.9 histórica), e **nenhum cadastro do IMOB é incorporado
   automaticamente** a esta resolução.
3. **Status comercial do sujeito (lead vs. conta)** — usado só para elegibilidade de
   `signalType` (9.8), **independente** das camadas 1–2. Permitir `competitive_context_signal`/
   `content_engagement_signal` com status comercial **desconhecido** não significa, em nenhuma
   circunstância, aceitar um sujeito **desconhecido** ou **não autorizado** — a camada 2
   continua exigida sempre, para todo `signalType`, independentemente do status comercial ser
   conhecido ou não.

**Dados pessoais**: `subjectDisplayName` é opcional, omitido sempre que `subjectId` bastar —
evita PII desnecessária quando um identificador interno já cumpre a função.

**Por que não existe um `subjectType` por vertical nesta versão**: não crio um valor
`"imob_lead"` amarrado a `ImobLead` — acoplaria um contrato pensado como genérico (MKT não é
vertical-específico) a um único vertical. `subjectType` permanece só `"internal_reference"`
nesta versão (ratificado nesta rodada).

### 9.7 Envelope de proveniência — fora do payload

**Nenhum campo `provenance` é adicionado ao payload `RadarSignalResultV1`** (ratificado nesta
rodada). A proveniência é resolvida inteiramente pelo envelope do servidor, nunca pelo
conteúdo autodeclarado — confirmado pelo exemplo de campo desconhecido (9.13, exemplo 9), que
rejeita explicitamente uma tentativa de autodeclarar produtor dentro do payload.

| Dado | Fonte | Status |
|---|---|---|
| Produtor (`Run.agent`) | linha real do `Run` de origem no banco | **Existente**: `Run.agent` é definido uma única vez na criação e, por busca exaustiva já registrada (seção 4), nenhum caminho de código encontrado o reescreve — isto é uma **disciplina de código confirmada por ausência de escrita**, não uma constraint de banco (nenhum trigger/coluna imutável impõe isso estruturalmente). Checagem de igualdade exata contra `"radar"` é **proposta** (D5), não implementada. |
| `sourceRunId` | **referência fornecida pelo chamador** (parâmetro de `SignalForwardRequestInput`, não do payload de conteúdo) | **Existente, mas não server-derivado por si só** — é entrada do chamador, cuja confiabilidade vem de ser **resolvida e validada pelo servidor** contra o `Run` real, dentro do escopo `tenantId`/`workspaceId` autorizado (`readAndValidateOrigin`). Distinto de `tenantId`/`workspaceId`, que vêm de `authContext` (token), nunca do corpo. |
| Identidade e escopo confirmados no banco | `readAndValidateOrigin` — busca por `tenantId`+`workspaceId`+`id`, `status==="success"`, `response` estruturado | **Existente** |
| Vínculo persistido com snapshot e versão do **fingerprint** | `buildOriginSnapshot`/`FINGERPRINT_CONTRACT_VERSION` (`originContract.ts`) | **Existente**, inalterado |
| Vínculo com versão do **conteúdo** | `RadarSignalResultV1.contractVersion` | **Proposto** — eixo de versionamento **distinto** do fingerprint acima; nunca confundir os dois |

**`Run.agent` sozinho não é proveniência suficiente** — é um entre vários dados que compõem a
cadeia real de origem (junto com o escopo tenant/workspace do `Run`, seu `status`, e a
estrutura de `response`). Nenhum valor enviado pelo cliente no payload de conteúdo substitui
qualquer um desses dados.

`requestedByUserId` (revalidado por D4 antes do LLM) e `confirmedByUserId` (quem confirmou o
conteúdo) permanecem papéis distintos, sem substituição silenciosa de um pelo outro — decisão
já ratificada, não reaberta aqui.

### 9.8 Matriz de elegibilidade e precedência — regra do produtor (ratificada nesta rodada)

**Esta matriz é regra aprovada do produtor nesta rodada** — não estava ratificada antes desta
aprovação; era proposta técnica sujeita a revisão. Ela **completa**, sem contradizer, os dois
princípios já registrados em rodada anterior:

**Regra de agrupamento**: ocorrências do mesmo tipo de evento, na mesma janela de tempo
relacionada, sobre o mesmo sujeito, formam um único sinal (`evidence[]` com vários itens).
Eventos de natureza distinta — mesmo da mesma conta — geram sinais **separados**; nunca forçar
eventos não relacionados num único payload só por pertencerem à mesma conta.

**Elegibilidade por status do sujeito**:

| `signalType` | Elegível para lead | Elegível para conta |
|---|---|---|
| `lead_intent_signal` | Sim | **Não** |
| `account_lifecycle_signal` | **Não** | Sim |
| `content_engagement_signal` | Sim | Sim |
| `competitive_context_signal` | Sim | Sim |

Intenção vinda de um cliente já existente (ex.: pedido de expansão) é sempre
`account_lifecycle_signal`, nunca `lead_intent_signal` — a fronteira é o status do sujeito, não
a intensidade da ação. Como `lead_intent_signal`/`account_lifecycle_signal` nunca são
simultaneamente elegíveis para o mesmo sujeito, **nenhuma precedência é definida entre eles**.

**Precedência entre indícios elegíveis, quando coexistem na mesma interação**:
```
{lead_intent_signal | account_lifecycle_signal}   (conforme o status do sujeito)
        > content_engagement_signal
        > competitive_context_signal
```
O tipo elegível de maior prioridade presente vence; os demais indícios entram em
`evidence`/`summary` do vencedor. `competitive_context_signal` autônomo (sem outro tipo
coexistindo na mesma interação) continua válido.

**Sujeito de status comercial desconhecido**: `lead_intent_signal`/`account_lifecycle_signal`
não podem ser emitidos (fail-closed); `competitive_context_signal`/`content_engagement_signal`
continuam válidos, por não dependerem do status.

**Cenários aplicados:**

| Cenário | Classificação |
|---|---|
| Engajamento seguido de pedido explícito de contato | `lead_intent_signal` |
| Lead pede demonstração e menciona concorrente | `lead_intent_signal` (concorrente em `summary`/`evidence`) |
| Cliente em renovação que menciona concorrente | `account_lifecycle_signal` (concorrente em `summary`/`evidence`) |
| Cliente existente demonstra intenção de expansão | `account_lifecycle_signal` — nunca `lead_intent_signal` |
| Conta com evento de ciclo de vida e engajamento de conteúdo na mesma interação | `account_lifecycle_signal` — engajamento entra em `evidence`/`summary` |
| Contexto competitivo e engajamento de conteúdo, sem lead_intent/account_lifecycle presente | `content_engagement_signal` — menção competitiva entra em `evidence`/`summary` |
| Três ou mais indícios coexistindo | Aplicar a pilha de precedência acima de forma iterativa — o de maior prioridade vence |
| Múltiplos eventos independentes da mesma conta | Sinais **separados** — nunca combinados só por serem da mesma conta |

**Esta matriz é uma regra do produtor (Radar), não uma verificação do parser estrutural** —
nenhuma parte da validação de 9.1–9.5 confirma que um `signalType` foi escolhido de acordo com
esta matriz (em especial, a elegibilidade por status do sujeito depende de um fato de negócio
que não é um campo do payload). A validação estrutural confirma forma; a correção semântica da
classificação é responsabilidade exclusiva de quem produz o sinal.

### 9.9 Sujeito e fontes de dados — limite da investigação realizada (histórico, rodada 4)

**Investigação de código já realizada** (só para decidir se um modelo adequado já existe —
nenhuma tabela foi criada ou alterada): busquei, nas 60 declarações `model` de
`packages/db/prisma/schema.prisma`, termos `lead|account|contact|crm|customer|client|prospect`
(case-insensitive). Resultado: **`ImobLead`** (`id`, `tenantId`, `workspaceId`, `name`,
`document?`, `email?`, `phone?`, entre outros) é o único modelo de "lead" — específico do
vertical IMOB. `TenantBillingAccount` existe, mas é conta de faturamento, não CRM. **Nenhum
modelo genérico (não-IMOB) de lead/conta/contato existe hoje.**

Buscas realizadas: (a) `grep` por `\bradar\b`, case-insensitive, em `apps/api/src` e
`packages/core/src`, fora do módulo `signalForward`; (b) `grep` por
`market.scan`/`marketScan`/`MarketScan` nos mesmos diretórios, fora do vertical IMOB; (c)
leitura de todas as 60 declarações `model` citada acima. **Encontrado**: nenhuma ocorrência de
"radar"; nenhum componente genérico de "market scan" fora do IMOB; um único modelo de lead
(`ImobLead`, vertical-específico); nenhum modelo genérico de conta/contato/CRM. **Não coberto**:
comentários/documentação fora do código-fonte examinado, fixtures/seeds de teste, qualquer
armazenamento fora do Prisma, e o conteúdo real do banco (nunca consultado). **Não afirmo, a
partir dessas buscas, que nenhuma fonte de dados ou pipeline de sinal existe em qualquer lugar
do repositório ou do sistema** — só que essas buscas específicas, nesses locais específicos,
não encontraram nada.

### 9.10 Fingerprint e compatibilidade com reenvios — inalterado

`stableStringify`/`computeRequestFingerprint` (`originContract.ts`) **não são alterados**
nesta rodada, nem é proposta nenhuma alteração a `FINGERPRINT_CONTRACT_VERSION`.
`stableStringify` ordena chaves de objeto (`Object.keys(value).sort()`), mas **preserva a
ordem de elementos de array** — **a ordem dos arrays continua fazendo parte do conteúdo
comparado** (ratificado nesta rodada). Reordenar `evidence[]` ou `externalContent.items[]`
entre tentativas produz um `requestFingerprint` diferente; reusar a mesma `idempotencyKey`
nesse caso resulta em `ConflictError` (`idempotency_key_reused_incompatible_payload`), nunca
em reconciliação automática. Um produtor que deseje reentregas idempotentes do "mesmo" sinal
deve emitir arrays em ordem determinística e estável **antes** de montar o payload — isso é
uma recomendação de prática de produção, não uma regra imposta pelo validador.

Três conceitos distintos:
- **Identidade semântica do sinal** — "é este o mesmo fato de negócio relatado": julgamento de
  produto, não mecanicamente decidível.
- **Igualdade de conteúdo para idempotência** — decidida mecanicamente pelo fingerprint
  (hash de `stableStringify`): sensível a valores e a ordem de array, não à ordem de chaves de
  objeto.
- **Ordem de exibição das evidências** — preocupação de UI/apresentação ao humano na
  confirmação (D6): pode ser reordenada livremente na tela sem afetar o payload nem o
  fingerprint, desde que a reordenação seja só de apresentação.

A validação do `RadarSignalResultV1` ocorreria **antes** de `computeRequestFingerprint` ser
chamado — o payload aceito segue para o cálculo exatamente como está. Este é o **ponto de
validação proposto**, não comportamento já existente — hoje `readAndValidateOrigin` não faz
nenhuma dessas checagens.

### 9.11 Histórico, releitura e nova execução

Três conceitos distintos, nunca confundidos:

- **Interpretação histórica pela versão original**: um snapshot persistido é sempre lido sob o
  `contractVersion` gravado nele mesmo — nunca reinterpretado sob uma versão de contrato mais
  nova, mesmo que os limites/regras mudem depois (9.12).
- **Elegibilidade/autorização para nova execução**: **um snapshot preservado não concede
  autorização permanente.** O fato de um sinal histórico continuar acessível para leitura não
  implica que qualquer ação nova sobre ele (criar um novo `Run` MKT, confirmar, publicar) esteja
  pré-autorizada — toda nova ação exige passar pela cadeia de autorização vigente **no momento
  dessa nova ação** (D4 revalidado, D6 confirmado de novo), como se fosse a primeira vez.
- **Classificação semântica pelo produtor**: o `signalType` gravado num snapshot histórico
  reflete a matriz (9.8) vigente **no momento em que o sinal foi originalmente classificado**.
  Uma mudança futura na matriz não reclassifica sinais já persistidos.

**Releitura de um snapshot antigo não é um novo recebimento temporal** — a tolerância futura
de 5 minutos (9.3) só é avaliada uma vez, no momento da validação original, contra o relógio
daquele instante; nunca é reavaliada depois contra o "agora" de uma releitura posterior (um
`detectedAt` já no passado nunca volta a acionar essa regra).

**O TTL de confirmação humana permanece separado** do contrato de conteúdo — sua política (7
dias, ratificada na Rodada 10) e seu mecanismo de aplicação (não implementado) **não
condicionam** o fechamento estrutural deste contrato, exatamente como antes da ratificação.

### 9.12 Evolução por versionamento

O V1 aprovado tem escopo restrito — nenhuma ampliação silenciosa. Novo `signalType`, campo
obrigatório novo, ou mudança incompatível exige **versão nova**, reconhecida explicitamente
pelos consumidores (`contractVersion` muda) — nunca reinterpretação do valor
`"radar-signal-result.v1"` já existente. Snapshots já persistidos com essa versão a mantêm para
sempre; uma versão nova não reexecuta nem reinterpreta contratos históricos. Compatibilidade e
eventual migração são planejadas separadamente, quando/se uma v2 for proposta — nenhuma v2 é
criada ou implementada nesta rodada.

### 9.13 Exemplos completos (instante de validação fictício fixo: `2026-09-08T12:00:00Z`)

Nos exemplos válidos, `subject.subjectId` refere-se a uma entidade **fictícia** — a validade
referencial (a entidade existir de fato, pertencer ao tenant certo) depende do cenário em que o
exemplo é usado; a validação estrutural do schema não garante isso (9.6). Nenhum exemplo
abaixo foi executado.

**1. Sinal mínimo válido**
```json
{
  "contractVersion": "radar-signal-result.v1",
  "signalType": "lead_intent_signal",
  "subject": { "subjectType": "internal_reference", "subjectId": "lead-fic-00123" },
  "title": "Lead inativo reengajou via formulario de contato",
  "summary": "O lead identificado por lead-fic-00123 respondeu a um e-mail de nutricao apos 62 dias de inatividade e solicitou uma demonstracao pelo formulario de contato do site.",
  "detectedAt": "2026-09-08T11:00:00Z",
  "confidenceLevel": "medium"
}
```

**2. `account_lifecycle_signal` com evidência interna**
```json
{
  "contractVersion": "radar-signal-result.v1",
  "signalType": "account_lifecycle_signal",
  "subject": { "subjectType": "internal_reference", "subjectId": "acct-fic-00456", "subjectDisplayName": "Distribuidora Norte Ltda" },
  "title": "Conta com renovacao proxima e uso em queda",
  "summary": "A conta acct-fic-00456 tem renovacao de contrato em 27 dias e apresentou queda de 38% no uso da plataforma nos ultimos 30 dias em relacao a media historica da conta.",
  "detectedAt": "2026-09-08T07:00:00Z",
  "confidenceLevel": "medium",
  "evidence": [ { "description": "Uso mensal da conta caiu de 420 sessoes para 260 sessoes no ultimo periodo de 30 dias." } ]
}
```

**3. `content_engagement_signal` com conteúdo externo, `confidenceLevel: "high"` com `evidence` — válido**
```json
{
  "contractVersion": "radar-signal-result.v1",
  "signalType": "content_engagement_signal",
  "subject": { "subjectType": "internal_reference", "subjectId": "acct-fic-00789", "subjectDisplayName": "Metalurgica Sul S.A." },
  "title": "Decisor de conta-alvo baixou material tecnico tres vezes",
  "summary": "Um contato identificado como decisor na conta acct-fic-00789 baixou o whitepaper Guia de Automacao Industrial tres vezes na ultima semana, um padrao acima da media historica para essa conta.",
  "detectedAt": "2026-09-08T09:15:00Z",
  "confidenceLevel": "high",
  "evidence": [ { "description": "Tres downloads do mesmo material tecnico pelo mesmo contato em sete dias.", "externalContentRef": "ev-1" } ],
  "externalContent": { "items": [ { "id": "ev-1", "sourceUrl": "https://exemplo-interno.tenant.com/downloads/log/8841", "rawExcerpt": "download_event: whitepaper_automacao_industrial, contact_id=c-4471, count=3, window_days=7", "capturedAt": "2026-09-08T09:10:00Z" } ] }
}
```

**4. Sinal com `opportunity`** *(cenário "lead pede demonstração e menciona concorrente", 9.8)*
```json
{
  "contractVersion": "radar-signal-result.v1",
  "signalType": "lead_intent_signal",
  "subject": { "subjectType": "internal_reference", "subjectId": "lead-fic-00321" },
  "title": "Lead pediu demonstracao e mencionou concorrente",
  "summary": "O lead lead-fic-00321 solicitou uma demonstracao pelo formulario e mencionou estar avaliando tambem um concorrente especifico do setor.",
  "detectedAt": "2026-09-08T11:20:00Z",
  "confidenceLevel": "medium",
  "opportunity": { "summary": "Solicitacao explicita de demonstracao com concorrente em avaliacao paralela sugere janela curta para resposta.", "suggestedAction": "Priorizar contato comercial nas proximas 24 horas, destacando diferenciais frente ao concorrente mencionado." }
}
```
*(`detectedAt` está no passado em relação ao instante de validação fictício — não aciona a
tolerância futura, que só se aplica a timestamps adiante do relógio de validação.)*

**5. `competitive_context_signal` autônomo**
```json
{
  "contractVersion": "radar-signal-result.v1",
  "signalType": "competitive_context_signal",
  "subject": { "subjectType": "internal_reference", "subjectId": "acct-fic-01122" },
  "title": "Conta mencionou avaliar concorrente em conversa de suporte",
  "summary": "Durante um chamado de suporte sem pedido comercial associado, um contato da conta acct-fic-01122 mencionou estar avaliando uma ferramenta concorrente para o mesmo caso de uso.",
  "detectedAt": "2026-09-08T08:00:00Z",
  "confidenceLevel": "low"
}
```

**6. `confidenceLevel: "high"` sem `evidence` — inválido**
```json
{
  "contractVersion": "radar-signal-result.v1",
  "signalType": "lead_intent_signal",
  "subject": { "subjectType": "internal_reference", "subjectId": "lead-fic-01199" },
  "title": "Lead pediu proposta comercial formal",
  "summary": "O lead lead-fic-01199 solicitou explicitamente uma proposta comercial formal por e-mail.",
  "detectedAt": "2026-09-08T10:30:00Z",
  "confidenceLevel": "high"
}
```
Campo: `evidence`. `reasonCode`: `radar_signal_field_missing` (field: `evidence`, reason:
`required_when_confidence_high`).

**7. `externalContent` sem referência de `evidence` — válido**
```json
{
  "contractVersion": "radar-signal-result.v1",
  "signalType": "content_engagement_signal",
  "subject": { "subjectType": "internal_reference", "subjectId": "acct-fic-01300" },
  "title": "Material de contexto anexado sem evidencia estruturada",
  "summary": "Contato interagiu com material tecnico do tenant; anexo o log bruto como contexto, sem vincular a uma evidencia especifica.",
  "detectedAt": "2026-09-08T09:00:00Z",
  "confidenceLevel": "low",
  "externalContent": { "items": [ { "id": "ctx-1", "sourceUrl": "https://exemplo-interno.tenant.com/logs/9002", "rawExcerpt": "page_view: pricing, contact_id=c-8821, duration_s=340", "capturedAt": "2026-09-08T08:55:00Z" } ] }
}
```

**8. `signalType` desconhecido (inválido)**
```json
{
  "contractVersion": "radar-signal-result.v1",
  "signalType": "market_trend_signal",
  "subject": { "subjectType": "internal_reference", "subjectId": "n-a" },
  "title": "Tendencia de mercado identificada",
  "summary": "Aumento geral de buscas pelo termo do setor nos ultimos 30 dias.",
  "detectedAt": "2026-09-08T10:00:00Z",
  "confidenceLevel": "low"
}
```
`reasonCode`: `radar_signal_type_unknown`.

**9. Campo desconhecido**
```json
{
  "contractVersion": "radar-signal-result.v1",
  "signalType": "lead_intent_signal",
  "subject": { "subjectType": "internal_reference", "subjectId": "lead-fic-00654" },
  "title": "Lead solicitou contato comercial",
  "summary": "O lead preencheu o formulario de contato solicitando retorno comercial.",
  "detectedAt": "2026-09-08T11:20:00Z",
  "confidenceLevel": "medium",
  "producerAgentKey": "radar"
}
```
Campo: `producerAgentKey` (fora do schema — proveniência é do envelope do servidor, 9.7).
`reasonCode`: `radar_signal_unknown_field` (field: `producerAgentKey`).

**10. Sujeito ausente**
```json
{
  "contractVersion": "radar-signal-result.v1",
  "signalType": "lead_intent_signal",
  "title": "Lead solicitou contato comercial",
  "summary": "O lead preencheu o formulario de contato solicitando retorno comercial.",
  "detectedAt": "2026-09-08T11:20:00Z",
  "confidenceLevel": "medium"
}
```
`reasonCode`: `radar_signal_field_missing` (field: `subject`).

**11. Referência de evidência quebrada**
```json
{
  "contractVersion": "radar-signal-result.v1",
  "signalType": "content_engagement_signal",
  "subject": { "subjectType": "internal_reference", "subjectId": "acct-fic-00999" },
  "title": "Engajamento com conteudo tecnico",
  "summary": "Contato interagiu repetidamente com material tecnico publicado pelo tenant.",
  "detectedAt": "2026-09-08T09:15:00Z",
  "confidenceLevel": "medium",
  "evidence": [ { "description": "Registro de engajamento com o material tecnico.", "externalContentRef": "ev-99" } ]
}
```
`reasonCode`: `radar_evidence_reference_not_found` — `"ev-99"` não existe em
`externalContent.items[]` (que sequer está presente).

**12. Fronteira inferior de texto (`summary`, 19 code points)**
```json
{
  "contractVersion": "radar-signal-result.v1",
  "signalType": "lead_intent_signal",
  "subject": { "subjectType": "internal_reference", "subjectId": "lead-fic-01010" },
  "title": "Lead solicitou contato comercial",
  "summary": "aaaaaaaaaaaaaaaaaaa",
  "detectedAt": "2026-09-08T11:00:00Z",
  "confidenceLevel": "medium"
}
```
`reasonCode`: `radar_signal_field_invalid` (field: `summary`, reason: `below_minimum_length`,
19 < 20).

**13. Fronteira superior de texto**: idêntico ao exemplo 1, exceto `summary` construído
deterministicamente como `"a".repeat(1001)` (1001 code points). `reasonCode`:
`radar_signal_field_invalid` (field: `summary`, reason: `above_maximum_length`, 1001 > 1000).

**14. Timestamp no limite futuro exato — válido**
```json
{
  "contractVersion": "radar-signal-result.v1",
  "signalType": "lead_intent_signal",
  "subject": { "subjectType": "internal_reference", "subjectId": "lead-fic-01020" },
  "title": "Lead solicitou contato comercial",
  "summary": "O lead preencheu o formulario de contato solicitando retorno comercial.",
  "detectedAt": "2026-09-08T12:05:00Z",
  "confidenceLevel": "medium"
}
```
Válido — exatamente `+5min` sobre o instante de validação fictício fixo (tolerância inclusiva).

**15. Timestamp além do limite futuro — inválido**
```json
{
  "contractVersion": "radar-signal-result.v1",
  "signalType": "lead_intent_signal",
  "subject": { "subjectType": "internal_reference", "subjectId": "lead-fic-01021" },
  "title": "Lead solicitou contato comercial",
  "summary": "O lead preencheu o formulario de contato solicitando retorno comercial.",
  "detectedAt": "2026-09-08T12:05:01Z",
  "confidenceLevel": "medium"
}
```
`reasonCode`: `radar_signal_field_invalid` (field: `detectedAt`, reason:
`too_far_in_future`) — 1 segundo além da tolerância.

**16. Leitura histórica de snapshot (cenário, não payload novo)**: o exemplo 1, persistido sob
`contractVersion: "radar-signal-result.v1"` com limite de `summary` 20–1000, **não é
revalidado** contra regras futuras (ex.: uma eventual v2 com limites diferentes) — permanece
válido para sempre sob a versão gravada nele mesmo (9.11).

**17. Reordenação de array no reenvio (cenário, não payload novo)**: um reenvio do exemplo 3
com os mesmos itens de `evidence`/`externalContent.items` em ordem diferente produz um
`requestFingerprint` diferente (9.10). Reusar a mesma `idempotencyKey` nesse reenvio resulta em
`ConflictError` (`idempotency_key_reused_incompatible_payload`), não em reconciliação
automática.

**Rejeição de conteúdo vs. rejeição de origem**: todos os exemplos inválidos acima rejeitam
**pelo contrato de conteúdo**. Um payload estruturalmente válido (idêntico ao exemplo 1) ainda
seria rejeitado **pelo envelope do servidor**, sem avaliar conteúdo, se `Run.agent !==
"radar"` — `reasonCode` proposto: `source_agent_not_ratified` (D5, seção 15).

### 9.14 `reasonCode`s propostos (conteúdo) — consolidado, nenhum implementado

```
radar_signal_payload_not_object
radar_signal_contract_version_invalid
radar_signal_type_unknown
radar_signal_unknown_field          (contexto: field)
radar_signal_field_missing          (contexto: field, reason)
radar_signal_field_invalid          (contexto: field, reason)
radar_evidence_reference_not_found  (contexto: evidenceIndex, ref)
radar_payload_aggregate_size_exceeded
radar_captured_at_after_detected_at (contexto: itemId)
radar_external_content_duplicate_id (contexto: id)
```
Um código geral com caminho do campo (`field`) evita dezenas de códigos redundantes por campo.
Distintos dos já **reais** em código (`source_run_not_found_in_scope`,
`source_run_not_in_required_state`, `source_run_missing_structured_response`,
`idempotency_key_reused_incompatible_payload`, `existing_request_without_destination_run`,
`unique_violation_without_matching_row`) e dos já **propostos** para o envelope D5/D4 (seção
15: `source_agent_not_ratified`, `requester_*`, `execution_authorizer_*`,
`destination_agent_not_enabled_in_workspace`, `human_confirmation_missing_or_invalid`).

### 9.15 Fixture de tamanho — receita algorítmica reproduzível (não executada)

**Correção aritmética desta rodada**: a soma dos campos de texto variável usados nesta fixture
(que **não** maximiza `evidence[].externalContentRef`/`externalContent.items[].id`, mantidos
curtos como `"ext-1"`..`"ext-5"`) é:
```
title(120) + summary(1000) + 5×evidence.description(300) + opportunity.summary(300)
+ opportunity.suggestedAction(200) + 5×externalContent.rawExcerpt(800)
= 120 + 1000 + 1500 + 300 + 200 + 4000 = 7.120 code points
```
(Distinto do pior caso absoluto de 9.2, que maximizaria **também** `id`/`externalContentRef` —
esse pior caso, sozinho, já demonstra que o teto agregado pode ser excedido mesmo com todo
limite individual respeitado, e permanece: `7.760 code points variáveis × 4 bytes + 2.500
(sourceUrl) + overhead ≈ 34.000 bytes`, muito acima de 16.384.)

```
INSTANTE_FIXO = "2026-09-08T12:00:00Z"
CAPTURED_FIXO = "2026-09-08T11:59:00Z"   // anterior a INSTANTE_FIXO

function buildSizeFixture(charUnit: string):
  payload = {
    contractVersion: "radar-signal-result.v1",
    signalType: "content_engagement_signal",       // elegível para lead ou conta, sem exigir status
    subject: { subjectType: "internal_reference", subjectId: "fixture-subject-0001" },
    title: charUnit.repeat(120),
    summary: charUnit.repeat(1000),
    detectedAt: INSTANTE_FIXO,
    confidenceLevel: "high",                         // exige evidence — 9.4
    evidence: [ para i em 1..5:
      { description: charUnit.repeat(300), externalContentRef: "ext-" + i } ],
    opportunity: { summary: charUnit.repeat(300), suggestedAction: charUnit.repeat(200) },
    externalContent: { items: [ para i em 1..5:
      { id: "ext-" + i,                               // único, referenciado por evidence[i-1]
        sourceUrl: "https://exemplo-fic.tenant.com/" + "x".repeat(469),  // 31 + 469 = 500 chars, ASCII, absoluta, https, sem credenciais
        rawExcerpt: charUnit.repeat(800),
        capturedAt: CAPTURED_FIXO } ] }
  }
  return JSON.stringify(payload)   // medir bytes UTF-8 deste output
```

**Payload abaixo do teto**: `charUnit = "a"` (1 byte UTF-8 por code point, texto variável em
`title`/`summary`/`evidence[].description`/`opportunity.*`/`rawExcerpt`, nunca em `sourceUrl`,
que permanece ASCII por exigência de RFC 3986). Cálculo documental (não executado): `7.120
code points × 1 byte + 5×500 (sourceUrl) + overhead estrutural JSON (400–600) = 7.120 + 2.500 +
400..600 = 10.020–10.220 bytes` — abaixo de 16.384. Asserção do teste futuro:
`sizeInBytes(buildSizeFixture("a")) < 16384`.

**Payload acima do teto, válido em todas as demais regras**: `charUnit = "🚀"` (emoji, 4 bytes
UTF-8 por code point) — usado **só** nos campos de texto variável, nunca em `sourceUrl`. Todo
limite individual continua respeitado (comprimento medido em code points, não em bytes — um
emoji conta como 1 code point). Cálculo documental (não executado): `7.120 × 4 + 2.500 +
400..600 = 28.480 + 2.500 + 400..600 = 31.380–31.580 bytes` — acima de 16.384. Asserção do
teste futuro: `sizeInBytes(buildSizeFixture("🚀")) > 16384` **e**, simultaneamente, cada
verificação de limite individual (9.1) passa isoladamente — demonstrando que o teto agregado é
uma restrição real e adicional, não redundante com os limites individuais.

**Não executei este pseudocódigo** — os valores acima são conferência aritmética documental,
não uma medição real. A medição exata será feita quando este pseudocódigo for implementado e
executado como teste.

### 9.16 Texto e conteúdo externo — regras de produção, não verificáveis pelo parser

- `externalContent` sem nenhuma referência de `evidence` apontando para ele é **permitido**
  (9.1) — um item de contexto adicional não precisa estar amarrado a uma evidência específica.
- Várias `evidence[]` podem referenciar o **mesmo** `externalContent.items[].id` — nenhuma
  regra de unicidade além da já existente (`id` único).
- Toda `evidence[].externalContentRef` presente **deve** existir no mesmo payload — violação
  rejeita o payload inteiro (`radar_evidence_reference_not_found`).
- **Citações brutas e resumos derivados de terceiros permanecem conteúdo não confiável**,
  mesmo depois de estruturalmente validados: todo texto citado literalmente de uma fonte de
  terceiros deve estar em `rawExcerpt`, nunca em `summary`/`evidence[].description`/
  `opportunity.*` (que devem ser sempre autorais/resumidos pelo produtor) — mas esta é uma
  **regra de produção**, não verificável estruturalmente: o validador não tem como confirmar
  se um texto em `summary` é ou não uma cópia disfarçada de conteúdo de terceiros.
- **Validação estrutural e revisão humana (D6) são controles complementares — nenhum dos dois
  garante neutralização de prompt injection.** A validação reduz superfície (tamanho,
  caracteres de controle, formato) mas não analisa semântica de conteúdo. A confirmação humana
  garante que um humano está no caminho antes de qualquer chamada ao LLM, não que esse humano
  identificará uma tentativa de injeção sofisticada embutida em um `rawExcerpt` longo. Nenhum
  dos dois controles, isolado ou em conjunto, deve ser apresentado como imunidade a prompt
  injection.

---

## 10. Contrato de confirmação humana — proposto, ainda sujeito a detalhes

**Não implementado.** Consolidado na Rodada 9 a partir de propostas discutidas em chat (não
gravadas antes desta rodada) — continua proposta, nenhuma parte desta seção é decisão
ratificada além do que já constava em "Decisões ratificadas" (D6, no topo do documento).

### Derivado do sistema (somente leitura)
- `radarSignal`: o `RadarSignalResultV1` completo.
- `suggestedPrompt`: gerado a partir do sinal (função nova, não existe). **Por exigência de
  D6, esta geração não pode envolver nenhuma chamada ao LLM** — D6 exige que nenhuma chamada
  ao LLM ocorra antes da confirmação humana, e `suggestedPrompt` é exibido *antes* dela. A
  função proposta é determinística (ex.: template sobre os campos de `RadarSignalResultV1`),
  não uma geração via modelo.
- `sourceRunId`, `sourceAgent`: contexto de origem.

### Fornecido ou confirmado pelo humano

| Campo | Obrigatório |
|---|---|
| `finalPrompt` | **Sim, não pode ficar vazio** |
| `objective` | **Sim** |
| `audience` | Opcional |
| `channels` | Opcional |
| `budget` | Opcional |
| `toneProfile` | Opcional |
| `toneNotes` | Opcional |
| `launchDate` | Opcional |
| `deadline` | Opcional |
| `explicitConfirmation` | **Sim** — ação explícita, nunca implícita |

### Gerados exclusivamente pelo servidor
- `confirmedAt`
- `humanConfirmationContractVersion`
- `confirmedPayloadSnapshot` (cópia imutável de tudo que foi exibido + preenchido no instante da confirmação)

**Nenhum identificador de usuário deve ser confiado quando enviado pelo corpo da
requisição** — `confirmedByUserId` (seção 11) é sempre derivado do `authContext` da
requisição de confirmação pelo servidor, nunca aceito do corpo, mesma disciplina já aplicada a
`FINGERPRINT_CONTRACT_VERSION`/`fingerprintVersion`.

### Rascunho persistido e revisão monotônica — **proposto**

O modelo recomendado é **rascunho persistido com revisão controlada**, não edição só no
navegador — resolve perda de trabalho em queda de conexão e dá identidade estável à revisão
revisada pelo humano. Cada rascunho carrega um número de **revisão** monotônico, incrementado
a cada gravação. Salvar uma edição exige declarar a revisão esperada; o servidor só aceita se
ela bater com a revisão atual, incrementando-a na mesma operação — revisão desatualizada
produz conflito, **nunca sobrescrita silenciosa**.

### Confirmação: somente a revisão persistida — **proposto**

A requisição de confirmação referencia **apenas um número de revisão** — **não aceita** novos
valores de `finalPrompt`/campos de negócio no próprio corpo da confirmação; esses precisam já
estar persistidos na revisão declarada. O servidor obtém `finalPrompt`, campos de negócio,
`radarSignal`/`suggestedPrompt` e versões de contrato a partir do estado persistido **naquela
revisão exata** — nunca do corpo da requisição de confirmação. Edição concorrente e
confirmação disputam a mesma revisão: nenhuma edição é aceita depois que o registro atinge um
estado terminal de confirmação, e nenhuma confirmação é aceita contra uma revisão que já foi
substituída por uma edição mais recente.

### Snapshot confirmado como única fonte autoritativa — **proposto**

`confirmedPayloadSnapshot` é a **única** fonte autoritativa do conteúdo confirmado. Uma
eventual cópia em `Run.request` (necessária porque `Run.request` já é o único lugar que
`processRunPayload` popularia via fila — seção 2, Etapa 5/6) é sempre uma **cópia derivada**,
nunca uma segunda autoridade — nasce do mesmo valor em memória, na mesma transação que grava o
snapshot, e nenhum código deste módulo deve escrever nela depois de criada. Igualdade inicial
**não é prova de imutabilidade futura**: a garantia de que as duas cópias não divirjam depois
depende hoje de disciplina de aplicação (nenhum caminho de código escreve nesses campos após a
criação) — um eventual reforço de banco (gatilho de imutabilidade, mesmo padrão já real em
`packages/db/prisma/migrations/20260119133736_add_immutable_trigger_to_ledger`) é só uma
referência de mecanismo possível, **não proposto para execução nesta rodada**. Um futuro
publicador deve preferir ler do snapshot; se usar a cópia de `Run.request`, deve comparar
`Run.request.prompt` com `confirmedPayloadSnapshot.finalPrompt` (e os campos de negócio
equivalentes) e **bloquear a publicação** se divergirem — nunca resolver a divergência
escolhendo um lado. Esse mecanismo de comparação é novo e separado; `stableStringify`/
`computeRequestFingerprint`/`FINGERPRINT_CONTRACT_VERSION` permanecem inalterados, escopados só
à identidade de conteúdo de origem (D5).

### Recuperação idempotente sujeita à autorização vigente — **proposto**

Um reenvio da mesma operação de confirmação (mesma chave, mesmo conteúdo/revisão), pelo mesmo
usuário já autorizado, devolve o resultado já persistido — isso é diferente de **mudar** uma
confirmação já concluída, que nunca é aceito. A autorização de quem reenvia é **sempre
reavaliada no momento do reenvio** — se o solicitante perdeu acesso, o reenvio falha por
autorização, **sem revelar** o conteúdo ou resultado cacheado. Posse da chave da operação não
é autorização e não substitui `requestedByUserId`.

### Autorização estendida a conteúdo derivado, metadados e evidências — **proposto**

Nenhum campo é presumido seguro para exibição só por ser metadado ou por ter passado na
validação estrutural (D5-B). `signalType`, `confidenceLevel`, proveniência, `title`, `summary`,
`evidence[]`, `suggestedPrompt` e qualquer erro ou resultado recuperado por reenvio idempotente
estão sujeitos à mesma autorização de acesso aplicável ao encaminhamento. A resolução
autorizada do `subject` (seção 9.6, camada 2) **continua pendente** — nenhum rótulo, nenhuma
validação estrutural e nenhuma das checagens acima a substitui.

---

## 11. Separação das identidades humanas

Três identidades distintas, que podem ou não coincidir na mesma pessoa:

- **`requestedByUserId`**: usuário que iniciou o encaminhamento (já existe hoje). **D4 exige
  a revalidação da autoridade deste principal imediatamente antes da chamada ao LLM** — ver
  "Decisões ratificadas".
- **`confirmedByUserId`**: usuário autenticado que revisou e confirmou conteúdo e parâmetros
  (novo, seção 10).
- **`executionAuthorizedByUserId`**: campo **proposto**, cuja semântica depende de decisão
  explícita ainda não tomada — ver abaixo.

**Enquanto não houver nova aprovação, valem as seguintes regras, sem exceção:**
- a revalidação de `requestedByUserId` permanece obrigatória (D4, sem alteração);
- `confirmedByUserId` **não substitui silenciosamente** `requestedByUserId`;
- a confirmação por outra pessoa **não concede automaticamente** autoridade para executar;
- a política de confirmação entre usuários diferentes permanece pendente (seção 20);
- as permissões do confirmador devem ser definidas e verificadas no próprio ato da
  confirmação — isso não substitui a revalidação de `requestedByUserId` no worker;
- exigir **também** autoridade vigente do confirmador no worker (além de
  `requestedByUserId`) é uma decisão adicional, ainda não tomada, e não deve ser presumida.

**Alternativa proposta, não ratificada**: `executionAuthorizedByUserId` = `confirmedByUserId`
no momento da confirmação. Esta alternativa é **incompatível com substituir a obrigação
original de D4 sem uma nova decisão explícita e datada** — nesta rodada, ela **não é
ratificada**, permanece registrada apenas como opção a avaliar.

**Decisão ainda pendente, não escolhida silenciosamente aqui**: se a revogação posterior de
`requestedByUserId` também deve bloquear a execução quando `requestedByUserId` e
`confirmedByUserId` forem pessoas diferentes. Ver seção 20.

---

## 12. Cadeia de revalidação D4 e limitações reais do schema atual

### Limitações reais do schema (fato técnico, confirmado por leitura direta)

- `User` **não possui** hoje campo de ativo/desativado — existência de uma linha em `User`
  **não equivale a** um estado ativo verificável.
- `TenantMembership` é escopada **por tenant**, não diretamente por workspace — membership no
  tenant, sozinha, **não demonstra** uma autorização individual por workspace; não existe uma
  tabela de "membership de workspace" separada.
- A política de `TenantActionPolicy`/`checkScopePermission` é por tenant/workspace, sozinha
  **não demonstra** permissão individual — nunca olha para `userId` na decisão (seção 3).
- A existência do usuário (linha em `User`) é verificável; sua situação ativa/inativa não é.
- "Usuário ativo" **ainda não é completamente representável** no schema atual.
- "Membership de workspace" não existe como conceito separado no schema atual.

Nenhuma tabela ou campo acima é inventado como se já existisse — isto é um registro de
limitação, não uma implementação proposta com nome de campo definitivo. **Dadas essas
limitações, D4 não deve ser apresentada como implementada, nem como completamente
verificável pelo schema atual** — o schema hoje só sustenta parte do que D4 exige.

### Cadeia a revalidar, imediatamente antes da chamada ao LLM

Por padrão, o principal a revalidar é `requestedByUserId` (obrigação original de D4, seção
"Decisões ratificadas" e seção 11). `executionAuthorizedByUserId` é uma alternativa
**proposta, não ratificada** — ver seção 11.

| # | O que revalidar | Fonte real hoje | Função a reusar | Observação |
|---|---|---|---|---|
| 1 | Existência de `requestedByUserId` | `User` | `prisma.user.findUnique` | "Ativo" não é totalmente verificável hoje — ver limitação acima |
| 2 | Membership aplicável | `TenantMembership` | `prisma.tenantMembership.findFirst({tenantId, userId})` | Só tenant-scoped |
| 3 | Scope de execução ainda concedido | `TenantActionPolicy` via `TenantPolicyStore` | `checkScopePermission` | Tenant/workspace-scoped, nunca por usuário — limitação preexistente |
| 4 | Agente de destino ainda autorizado no workspace | `WorkspaceAgentAssignment` | **`assertWorkspaceAgentEnabled`** — nunca `isAgentAvailableInWorkspace`, que só informa e não bloqueia | Ver Etapa 7 |
| 5 | Produtor `"radar"` ratificado | `Run.agent` do run de origem | comparação exata contra o literal `"radar"` | D5 |
| 6 | Confirmação humana válida e não expirada | `SignalForwardRequest`/registro de confirmação | checagem de estado + janela | D6 |

Qualquer falha em qualquer item bloqueia a chamada ao LLM, fail-closed.

---

## 13. Momento da confirmação e criação do Run

O Run MKT só pode ser criado depois de:
- `explicitConfirmation` válida;
- `confirmedPayloadSnapshot` persistido;
- validações síncronas aplicáveis aprovadas.

A confirmação humana, o snapshot imutável, a criação do `Run` e a criação da intenção de
publicação na outbox **devem ocorrer dentro da mesma transação PostgreSQL**.

**PostgreSQL e BullMQ não compartilham transação** — isto não é descrito em nenhum lugar deste
documento como se fossem uma única transação. A publicação no BullMQ ocorre **depois**, fora
da transação PostgreSQL, por processamento assíncrono da outbox (seção 16).

### Protocolo contra Run duplicado por encaminhamento — **proposto, disciplina de aplicação**

A garantia de **no máximo um Run de destino por encaminhamento** não é atribuída a um único
campo isolado, nem apresentada como constraint declarativa de banco — é um **conjunto**, que
toda operação relevante deve obedecer, na mesma ordem:

1. **No máximo uma janela de confirmação ativa** por encaminhamento (uma segunda janela só
   pode ser criada depois que a anterior chegar a um estado terminal).
2. Toda operação (criar janela, expirar/cancelar, confirmar) adquire trava sobre a linha do
   encaminhamento **primeiro**, depois sobre a do registro de confirmação — ordem fixa, sempre
   a mesma, para não haver deadlock por ordenação inconsistente.
3. A confirmação só prossegue se, **sob essa trava**, nenhuma confirmação concluída já existir
   para o mesmo encaminhamento.
4. A escrita que marca a confirmação como concluída é **condicionada** a essa ausência prévia
   (equivalente a "só grava se o campo que registra a confirmação concluída ainda está vazio")
   — não uma leitura separada seguida de uma escrita incondicional.
5. Criação do Run e essa escrita condicionada ocorrem na **mesma transação**; se a condição
   falhar, a transação inteira é revertida, **incluindo o Run** — nenhum Run órfão.
6. Depois de uma confirmação concluída, **nenhuma nova janela** é aceita para o mesmo
   encaminhamento.

Isto é diferente da constraint `signalForwardDestinationRunUnique` já existente no schema
(`packages/db/prisma/schema.prisma`), que resolve um problema distinto — impede que **dois
encaminhamentos diferentes** apontem para o mesmo Run — e continua válida sem alteração; o
protocolo acima é adicional, cobrindo a duplicação **dentro de um único** encaminhamento.
**Uma nova execução intencional exige um novo encaminhamento** (novo `SignalForwardRequest`,
D5), respeitando a `idempotencyKey` já existente (`signalForwardIdempotencyKey`) exatamente
como está — nenhuma mudança de semântica dessa chave é proposta aqui.

### Estado "confirmação concluída, Run criado, publicação pendente" — **proposto**

O estado recomendado para essa situação exata é `SignalForwardRequest.status = "dispatch_pending"`
(nome já usado nesta seção, ver "Máquinas de estados", seção 14) — as três coisas ocorrem na
mesma transação do protocolo acima: a confirmação alcança seu estado terminal de sucesso; o Run
é criado em seu estado inicial normal (`pending`, sem alteração à sua própria máquina); e
`SignalForwardRequest` transiciona para `dispatch_pending`. Só quando um mecanismo de outbox
(seção 16, **não implementado, fora do escopo de D6 isolada**) registrar, numa transação
**separada**, que a publicação foi bem-sucedida, haveria a transição `dispatch_pending` →
`run_created`.

**Diferença do código real hoje**: `signalForwardingService.ts` grava `status:"run_created"`
**de forma síncrona**, na própria criação do Run, sem fase `dispatch_pending` e sem outbox —
porque hoje não existe nenhuma publicação a aguardar. A sequência com `dispatch_pending` acima
é a mudança **futura**, condicionada à implementação do outbox, não implementada nesta rodada.

**Ressalva preservada, não resolvida por esta proposta**: quando o publicador existir,
`dispatch_pending` **não prova** que o job nunca chegou à fila — o worker pode processar (e
recusar por D4) um job antes de o publicador registrar sucesso de volta no PostgreSQL. Ver a
corrida completa logo abaixo.

### Corrida entre publicação e processamento — registrada, não resolvida nesta rodada

Como a transação PostgreSQL acima e a publicação no BullMQ não são atômicas entre si, existe
uma corrida real:

1. A transação PostgreSQL confirma a confirmação humana, o snapshot, o `Run` e a intenção na
   outbox.
2. O publicador (processo separado que lê a outbox) envia o job ao BullMQ.
3. O worker pode começar a processar o job **antes** de o publicador registrar, de volta no
   PostgreSQL, que a publicação teve sucesso.
4. Nesse intervalo, `SignalForwardRequest` pode continuar em `dispatch_pending`.
5. O worker pode recusar a execução por falha em D4 (seção 12) e finalizar o `Run` em `error`
   — enquanto `SignalForwardRequest` ainda mostra `dispatch_pending`.
6. O registro posterior da publicação (quando o publicador finalmente grava sucesso) **não
   pode sobrescrever nem reinterpretar** o resultado do `Run` já finalizado.

Consequências para a leitura correta dos dois estados:
- `SignalForwardRequest` acompanha confirmação e despacho — **não** acompanha execução.
- `Run` acompanha execução.
- `dispatch_pending` **não prova** que nenhum job foi publicado — só significa que o registro
  de sucesso da publicação ainda não foi gravado no PostgreSQL.
- `run_created`, nesta semântica proposta, registra a **confirmação de que a publicação foi
  registrada com sucesso** — não o sucesso da execução, que é sempre lido no estado do
  próprio `Run`.
- Uma falha de D4 pertence sempre ao `Run` (`error` + `errorCode`), independentemente de qual
  estado `SignalForwardRequest` estiver no momento em que a falha ocorre.
- A reconciliação da publicação deve ser **independente** da finalização da execução — não
  deve tentar alterar o resultado de um `Run` já finalizado.

**Nenhuma implementação é proposta nesta rodada para eliminar esta corrida** — ela é só
registrada como comportamento esperado do desenho descrito nas seções 13 e 16.

---

## 14. Máquinas de estados — separadas

**Correção de modelagem (Rodada 9)**: uma redação anterior atribuía os estados de confirmação
(`awaiting_human_completion`/`cancelled_by_human`/`expired`) diretamente a `SignalForwardRequest`.
A proposta consolidada (seção 10) move a confirmação para um **registro associado**, com sua
própria máquina de estados — são **três** máquinas distintas agora, não duas: confirmação,
`SignalForwardRequest` e `Run`.

### Confirmação (registro associado) — **proposto**

Estados: `awaiting_human_completion` · `cancelled_by_human` (terminal) · `expired` (terminal) ·
`concluded` (terminal).

Fluxo:
```
awaiting_human_completion → cancelled_by_human      (terminal)
awaiting_human_completion → expired                  (terminal, TTL da janela de confirmação)
awaiting_human_completion → concluded                (terminal, confirmação bem-sucedida)
```
Depois de `cancelled_by_human`/`expired`, uma **nova janela** (novo registro) pode ser criada
para o mesmo encaminhamento — desde que nenhum registro já tenha alcançado `concluded` (seção
13, protocolo contra Run duplicado). Depois de `concluded`, nenhuma nova janela é aceita.

### `SignalForwardRequest`

Estados já reais hoje **[EXISTENTE]**: `pending_dispatch` · `run_created` (síncrono, sem
outbox). Estado proposto adicional para quando o outbox existir (seção 13): `dispatch_pending`,
entre a conclusão da confirmação e o registro de sucesso da publicação.

Fluxo proposto (substitui o anterior, que confundia os estados de confirmação com os do
encaminhamento):
```
pending_dispatch → dispatch_pending    (confirmação concluded, Run criado — mesma transação)
dispatch_pending → run_created          (publicação confirmada — depende do outbox, seção 16)
```

### `Run`

Estados relevantes já existentes ou a confirmar no código: `pending`, `running`, `success`,
`error`.

A falha de qualquer item da revalidação D4 (seção 12) produz:
- `Run` em `error`;
- `errorCode` específico (seção 15 — `reasonCode`s propostos);
- nenhuma chamada ao LLM.

**Correção de modelagem**: `authority_revalidation_failed` **não é** uma etapa da máquina de
`SignalForwardRequest` — pertence exclusivamente à máquina de `Run` (`error` + `errorCode`).

**Correção adicional feita nesta auditoria**: uma redação anterior desta seção afirmava que,
no momento da falha de D4, `SignalForwardRequest` "já alcançou `run_created`". **Essa ordem
não é garantida** — ver seção 13, "Corrida entre publicação e processamento". O worker pode
processar (e recusar por D4) um job antes de o publicador registrar `run_created` no
PostgreSQL; o `Run` pode chegar a `error` por falha de D4 enquanto `SignalForwardRequest`
ainda está em `dispatch_pending`. A afirmação correta é apenas: a falha de D4 pertence à
máquina de estados do `Run`, independentemente de qual estado `SignalForwardRequest` estiver
no momento.

---

## 15. `reasonCode`s propostos

Padrão local em `snake_case`, consistente com `SignalForwardOriginError`:

```
requester_user_not_found
requester_membership_not_found
execution_authorizer_user_not_found
execution_authorizer_membership_not_found
execution_authorizer_scope_no_longer_granted
destination_agent_not_enabled_in_workspace
source_agent_not_ratified
human_confirmation_missing_or_invalid
```

Os códigos `requester_*` cobrem a revalidação de `requestedByUserId`, o principal padrão
exigido por D4 (seção 11). Os códigos `execution_authorizer_*` só se tornam aplicáveis **se**
a alternativa `executionAuthorizedByUserId` (seção 11, ainda não ratificada) vier a ser
aprovada — até lá, são especulativos. **A lista definitiva depende da decisão pendente da
seção 11** (se `requestedByUserId` revogado também bloqueia quando diferente de
`confirmedByUserId`). **Nenhum destes códigos está implementado** — são propostos.

---

## 16. Publicação confiável — estratégia recomendada, implementação futura

**Não implementado.**

1. Outbox transacional em PostgreSQL — grava, de forma durável, a **intenção** de publicar na
   mesma transação da seção 13. A outbox registra a intenção; ela não é a publicação em si.
2. Publicação assíncrona no BullMQ — um processo separado lê a outbox e chama `publishRun`. A
   **entrega efetiva depende do publicador, de suas políticas de retry e da operação** — a
   outbox por si só não entrega nada, apenas garante que a intenção não se perde silenciosamente.
3. `jobId` determinístico como proteção **complementar** (não suficiente sozinha — seção 17).
4. Claim atômico do `Run` no PostgreSQL, com semântica equivalente a:
   ```sql
   UPDATE runs
   SET status = 'running'
   WHERE id = <runId>
     AND status = 'pending'
   ```
   A implementação futura deve verificar a quantidade de linhas afetadas. Se nenhuma linha for
   afetada, o processamento duplicado deve parar **antes** de `orchestrator.run`.
5. Revalidação D4 (seção 12) depois do claim e antes do LLM.
6. Finalização fail-closed quando a revalidação falhar (`Run` → `error` + `errorCode`).

**Achados de código que sustentam esta recomendação** (Rodada 4, leitura direta, não
presumida): `removeOnComplete: true` sem `removeOnFail` explícito (`runQueue.ts:149`); nenhum
dos quatro call sites reais de `publishRun` passa `jobId` customizado; `updateRunStatus`
(`runs.ts:311`) faz `UPDATE` **incondicional**, sem `WHERE status='pending'`; `chargeRun`
(`billing.ts:361`) usa checagem *check-then-insert*, não atômica; `BillingLedger.requestId`
**não tem `@unique`** no schema — só índices não-únicos.

---

## 17. Limite real da garantia de idempotência

**Não usar "exactly once" como garantia geral — não é o que este desenho oferece.**

O que cada proteção efetivamente garante:
- **Outbox**: evita perda silenciosa da intenção de publicação.
- **`jobId` determinístico**: reduz duplicação **enquanto o job correspondente ainda existe no
  BullMQ** — não protege depois que o job original completa e é removido
  (`removeOnComplete:true` apaga essa proteção quase imediatamente).
- **Claim atômico**: impede que duas entradas concorrentes **iniciem normalmente** a mesma
  execução, **sob as condições documentadas acima** (não cobre os cenários pendentes listados
  a seguir). **Claim atômico não deve ser apresentado como solução completa para cobrança
  duplicada** — ele reduz a duplicação de *processamento* de um `Run`, mas a idempotência da
  própria escrita em `BillingLedger` (seção 18) é um problema distinto, não resolvido por esta
  proteção.

**Estas proteções não resolvem sozinhas** falhas ambíguas durante ou depois da chamada ao
provedor de LLM. Cenários ainda pendentes, não resolvidos por nenhuma das três proteções
acima:
- queda depois do claim e antes da chamada ao LLM;
- queda durante a chamada ao provedor;
- resposta do LLM recebida, mas não persistida;
- cobrança registrada sem conclusão do `Run`;
- `Run` abandonado em `running`.

**Um `Run` em `running` não pode ser automaticamente restaurado para `pending` sem uma
política aprovada** — isso pode causar uma segunda chamada paga. A política de recuperação de
`Run`s abandonados ou ambíguos permanece **decisão separada**, não coberta por esta rodada.

---

## 18. Cobrança — fato técnico e necessidade futura

Confirmado por leitura direta nesta rodada:
- `chargeRun` (`billing.ts:361`) usa *check-then-insert* (lê se já existe um
  `RunUsageBreakdown` com `meterType==="run"`, só insere se não existir).
- Esse mecanismo **não é atomicamente idempotente**.
- `BillingLedger.requestId` **não possui unicidade de banco**.
- Processamento concorrente do mesmo `Run` **pode produzir cobrança duplicada**.

**Necessidade futura**: idempotência de cobrança garantida no banco (ex.: constraint única
sobre `requestId` ou mecanismo equivalente). **Nenhuma migration é escolhida ou implementada
nesta rodada** — só o registro do problema.

---

## 19. Menor unidade futura de implementação

**D5 tinha duas partes distintas. Ambas foram implementadas e testadas na Rodada 6, dentro do
escopo estrutural autorizado:**

**A. Regra de identidade do produtor — implementada.** `RATIFIED_RADAR_AGENT_KEY = "radar"`
(`originContract.ts`), comparação exata (`===`) em `readAndValidateOrigin`, sem trim, sem
lowercase, sem heurística, sem alias, sem fallback. Testado em `K-producer-ratification.test.ts`
contra banco descartável real: produtor exato aceito; produtor diferente rejeitado sem nenhum
efeito colateral (nenhum `SignalForwardRequest`/`Run` de destino criado); variações de
caixa/espaço (`"Radar"`, `"RADAR"`, `" radar"`, `"radar "`, `"rad ar"`) todas rejeitadas; ordem
de checagem confirmada (produtor antes do validador de conteúdo; escopo/estado antes do
produtor).

**B. Schema completo de `RadarSignalResultV1` (seção 9) — implementado como módulo puro e
testado isoladamente.** `radarSignalResultValidator.ts` implementa a ordem de validação
determinística da seção 9.5, os limites/regras de 9.1–9.4 e 9.6–9.16 medidos de forma real (não
estimada), e é chamado dentro de `readAndValidateOrigin` logo após o filtro de produtor (A),
antes do cálculo de fingerprint. Testado em `L-radar-signal-result-validator.test.ts` (~50
casos unitários, sem banco) cobrindo cada `signalType`, campos ausentes/nulos/desconhecidos,
limites exatos de tamanho (incluindo a fixture corrigida: prefixo de URL de 31 caracteres +
469 de padding = 500, soma de 7.120 code points, tamanhos medidos via `Buffer.byteLength` real),
Unicode/surrogates/controle, datas RFC 3339 com calendário real e a janela de +5min futura,
`capturedAt` vs. `detectedAt`, seleção determinística do primeiro erro independente da ordem de
inserção das chaves do objeto de entrada, e não-mutação/não-reordenação do payload (mesma
referência devolvida). Um `subjectId` fictício mas estruturalmente válido passa no validador —
confirmando que **B não resolve nem consulta o `subject`** (camada 2 da seção 9.6), só valida a
forma. Resultado real da suíte completa (A–L, 90 testes): **90 passam, 0 falham**, executados
contra PostgreSQL descartável local, container criado e removido nesta rodada.

**O que a implementação desta rodada explicitamente NÃO cobre** (isolado de propósito, não
esquecido):
- resolução autorizada do `subject` (seção 9.6, camada 2) — nenhum cadastro genérico de
  contas/leads fora do IMOB é consultado; um `subjectId` que não existe em lugar nenhum passa
  igualmente na validação estrutural;
- TTL/fluxo de confirmação humana (D6, seção 10/20);
- D4 (revalidação de autoridade assíncrona no worker);
- outbox/claim atômico (seção 16), idempotência de cobrança (seção 18);
- cadastro ou provisionamento real de um agente `"radar"` em `WorkspaceAgentAssignment`;
- publicação na fila, chamada real ao LLM, importação de dados, deploy, produção.

**Sobre os dois itens que bloqueavam "a implementação completa de B" (redação de rodadas
anteriores)**: nem a ausência de resolução de `subject` nem o TTL pendente bloqueiam construir e
testar o validador estrutural isolado — ambos só bloqueiam a **ativação operacional completa**
do fluxo (aceitar um sinal Radar de ponta a ponta até uma tarefa MKT confirmada por humano e
executada). Essa distinção, já apontada em rodada anterior de chat como necessária, agora se
aplica simetricamente aos dois bloqueios (antes só o TTL tinha essa ressalva explícita) e é
exatamente o que esta rodada demonstrou na prática: o validador foi construído, integrado e
testado de ponta a ponta em `readAndValidateOrigin`/`forwardSignalToMkt` sem que `subject` fosse
resolvido e sem que o TTL de confirmação humana exista.

**Nenhum commit foi criado nesta rodada.** As alterações descritas acima existem apenas na
árvore de trabalho local do worktree `/home/jusall/projects/EIAH_SIGNALFORWARD_ORIGIN_FIX`
(`git status --short`/`git diff --stat` no relatório desta rodada), para revisão humana antes de
qualquer commit, push, PR, merge ou deploy.

**Rodada 7 — correção de ordenação em `radarSignalResultValidator.ts`**: uma auditoria
identificou que `capturedAt ≤ detectedAt` e a unicidade de `externalContent.items[].id` (regras
relacionais, seção 9.5 passos 4c/4d) eram avaliadas durante a etapa estrutural (passo 3), item a
item, em vez de só depois que TODO o payload já tivesse passado por essa etapa — permitindo que
uma violação relacional de um item anterior antecipasse o erro estrutural de um item posterior
ainda não percorrido, contrariando a ordem determinística ratificada em 9.5. Corrigido nesta
rodada: as duas checagens foram movidas para o bloco de regras relacionais (junto de 4a/4b),
avaliadas só depois que o array inteiro de `externalContent.items` já passou pela validação
estrutural. Reproduzido antes da correção e revertido depois, com 6 testes de regressão novos em
`L-radar-signal-result-validator.test.ts` (2 provando a ordem estrutural-antes-de-relacional para
`capturedAt` e para `id` duplicado — inclusive com a duplicata resolvida cedo, não só entre a 1ª
e a 2ª ocorrência —, 2 confirmando que payloads estruturalmente corretos continuam retornando seu
`reasonCode` relacional específico, e 2 confirmando a precedência 4b > 4c > 4d entre violações
relacionais simultâneas). Suíte completa (A–L, 96 testes): 96 passam, 0 falham. Nenhum
`reasonCode` foi criado, removido ou renomeado; nenhuma regra documental de 9.5 foi alterada para
justificar o achado — só o código foi corrigido para cumprir a ordem já ratificada.

**Rodada 7 — comparação de typecheck HEAD vs. estado atual, em ambientes equivalentes**: a
rodada anterior havia descartado uma comparação direta contra HEAD por ambiente não equivalente
(discrepância inexplicada em erros `TS7006`). Refeita naquela rodada com dois worktrees temporários
isolados (fora da árvore de trabalho), cada um com `pnpm install --offline` e os mesmos pacotes
do monorepo pré-compilados (`packages/*/dist`) espelhados simetricamente — o que eliminou a
discrepância anterior (causada por `.d.ts`/cliente Prisma gerado ausentes, não por symlink em si).
Resultado determinístico, comparado por arquivo+código+mensagem: **304 diagnósticos idênticos
entre HEAD e o estado atual** (preexistentes, confirmados); **6 diagnósticos novos**, todos
`TS5097` (import com extensão `.ts`, a mesma convenção já usada nos 26 diagnósticos preexistentes
deste módulo), em `helpers.ts` (+1) e nos arquivos novos `K-producer-ratification.test.ts`/
`L-radar-signal-result-validator.test.ts` (+5) — nenhum resolvido por D5, nenhum de origem
indeterminada, nenhum nos arquivos de produção (`originContract.ts`/
`radarSignalResultValidator.ts`, 0 erros nos dois).

**Correção de processo (Rodada 8)**: a execução de `pnpm install --offline` na rodada anterior,
mesmo em cópia temporária, contrariou a proibição já vigente de instalar dependências — registrado
aqui como reconhecimento explícito do desvio, não repetido nesta rodada.

**Rodada 8 — os 6 diagnósticos `TS5097` foram corrigidos, com solução local**: a afirmação
anterior ("corrigir exigiria mudança fora do escopo... não implementada") estava incompleta — uma
alternativa local existia e funcionou. Os seis imports relativos que apontavam para
`radarSignalResultValidator.ts`/`originContract.ts`/`signalForwardingService.ts`/`helpers.ts` com
extensão `.ts` explícita foram reescritos sem extensão (forma nativa aceita por
`moduleResolution: "Bundler"`, já usada implicitamente por qualquer especificador sem extensão no
projeto), sem tocar `tsconfig`, `allowImportingTsExtensions`, `package.json` ou qualquer
configuração global. Comprovado simultaneamente contra `tsc --noEmit -p tsconfig.typecheck.json`
(0 erros nesses seis pontos) e contra o executor real dos testes (`tsx --test`, suíte completa
96/96 passam). Comparação diferencial refeita nesta rodada, sem `pnpm install` em nenhum momento
(worktree temporário isolado com `git worktree add` + symlinks para `node_modules`/`dist`/cliente
Prisma gerado já existentes, artefatos verificados como equivalentes porque `schema.prisma` está
idêntico entre HEAD e o estado atual): **304 diagnósticos idênticos, 0 novos, 0 resolvidos por
D5, 0 de origem indeterminada** — as únicas 3 diferenças de linha são deslocamentos de coluna já
explicados (mesma causa, uma linha de import mais longa de rodada anterior), não diagnósticos
distintos. Typecheck global: `exit code 2`, **não aprovado** — 304 diagnósticos preexistentes
seguem sem correção, fora do escopo desta frente.

### D6 (estrutural, sem outbox) — delimitação preliminar (Rodada 9), superada pelo desenho da seção 22

Menor unidade isolada de D6, delimitada na Rodada 9 só como **proposta documental** (seção
10/13/14) — nenhuma parte foi implementada, e esta delimitação **não autorizava** início de
implementação. **A Rodada 10 detalha o desenho técnico completo na seção 22** (modelos,
protocolo de concorrência, arquivos da primeira implementação) — o resumo abaixo permanece
como registro do escopo preliminar já então identificado:

- schema novo (registro de confirmação com revisão, TTL, chave de operação, snapshot) — exige
  migration, fora do escopo de qualquer rodada documental;
- gerador determinístico de `suggestedPrompt` (função pura, sem I/O, sem LLM);
- protocolo de confirmação atômica (seção 13: trava ordenada, escrita condicionada, rollback
  integral);
- `Run.request` populado com a entrada confirmada, a partir do snapshot, na mesma transação.

**Continua fora mesmo dessa menor unidade**: transporte para a fila/outbox (seção 16); D4
implementada; resolução autorizada do `subject`; qualquer rota HTTP para qualquer etapa deste
fluxo (D5 incluído — hoje inexistente, seção 2/§11). TTL/política de confirmador **foram
ratificados na Rodada 10** ("Decisões ratificadas", 2026-09-12) — não são mais "recomendações
não ratificadas"; a implementação segue não autorizada.

---

## 20. Decisões que devem permanecer pendentes

- Mecanismo concreto de resolução autorizada do `subject` (seção 9.6, camada 2) — qual
  cadastro consultar para confirmar existência/tenant/autorização de contas e leads
  referenciados; hoje sem cadastro genérico disponível fora do vertical IMOB, e nenhum
  cadastro do IMOB é incorporado automaticamente a essa resolução. **Os demais detalhes
  técnicos do contrato `RadarSignalResultV1`** — precedência, limites individuais e agregado,
  `subject`/`subjectType`, regras de `sourceUrl`/timestamp, condicional
  `confidenceLevel`+`evidence`, ordem de array no fingerprint — **foram ratificados na Rodada
  5** (seção 9, "Aprovação de contrato técnico") e não estão mais nesta lista.
- Significado persistido de "usuário ativo" (seção 12).
- Granularidade tenant versus workspace da membership (seção 12).
- Se `requestedByUserId` também deve permanecer autorizado quando for diferente de
  `confirmedByUserId` (seção 11).
- Nome exato do escopo de leitura de 7.3.
- Política de recuperação de `Run`s presos ou ambíguos (seção 17).
- Idempotência definitiva da cobrança (seção 18).
- Revalidação adicional do confirmador além de `requestedByUserId` (`executionAuthorizedByUserId`,
  seção 11) — **quem confirma no V1 já foi decidido** (seção "Decisões ratificadas",
  2026-09-12: só `requestedByUserId`); o que resta pendente é só a hipótese de exigir **também**
  autoridade adicional do confirmador no worker, não coberta por essa decisão.
- Se um reforço de banco (gatilho de imutabilidade) será adotado para o snapshot/`Run.request`
  (seção 22), além da disciplina de aplicação já descrita — decisão técnica, não de produto.
- Mecanismo de unicidade/protocolo contra Run duplicado (seção 22) — descrito, mas não
  fundamentado como decisão técnica definitiva.
- Implementação do outbox que faria `dispatch_pending` → `run_created` existir de fato (seção 16).
- Dependência técnica ainda não resolvida sobre o momento de criação do Run em `forwardSignalToMkt`
  (seção 22) — não é decisão de produto, é integração de código pendente.

### Políticas de produto D6 V1 — já ratificadas (2026-09-12)

**Ratificadas** — ver "Decisões ratificadas", "Aprovação de políticas de produto — confirmação
humana D6 V1": TTL de 7 dias corridos sem renovação por edição/recarga; confirmador no V1
restrito a `requestedByUserId` com autorização vigente; visualização/edição exigindo acesso
vigente ao encaminhamento e ao sujeito; confirmação por terceiros fora do V1;
`requestedByUserId` preservado e sujeito a D4.

**Registro histórico**: a tabela abaixo, desta seção, descrevia esses mesmos itens como
"proposta, não aprovada" antes da ratificação de 2026-09-12 acima — preservada como histórico
da evolução da decisão, não como estado atual.

| Item | Redação histórica (antes de 2026-09-12) | Status atual |
|---|---|---|
| TTL da janela de confirmação | 7 dias corridos desde a criação da janela; sem extensão por edição ou recarga da tela | **[RATIFICADO, 2026-09-12]** |
| Confirmador no V1 | O próprio `requestedByUserId`, com autorização vigente no momento da confirmação | **[RATIFICADO, 2026-09-12]** |
| Visualização/edição | Solicitante com acesso vigente ao encaminhamento **e** ao sujeito; membership no workspace, sozinha, não basta | **[RATIFICADO, 2026-09-12]** |
| Confirmação por terceiros | Evolução futura, dependente de decisão explícita e datada | **[RATIFICADO como fora do V1, 2026-09-12]** — evolução futura continua dependente de nova decisão |
| Revalidação de `requestedByUserId` antes do LLM | Já ratificada (D4) — não é recomendação nova | **[RATIFICADO — D4, inalterado]** |

Nenhum item marcado "proposta" acima vira decisão só por estar registrado aqui. O requisito de
reavaliar a validade do prazo **depois** de uma eventual espera por trava (seção 13) é uma regra
técnica a demonstrar só na implementação futura — TTL da confirmação, idade do sinal (seção 9.3)
e autorização para execução (D4) seguem três conceitos distintos, nunca confundidos.

---

## 21. Benefício de produto B2B

**Nada nesta seção está implementado.** Confirmação humana (D6), revalidação de autoridade no
worker (D4), outbox e claim atômico (seção 16) são **propostas de implementação**, não
proteções disponíveis hoje. As decisões ratificadas *quando implementadas* pretendem oferecer
ao cliente empresarial:
- confirmação antes do consumo de LLM (depende de D6 estar implementada);
- atribuição do custo de execução (parcialmente já real hoje via `RunUsageBreakdown`/
  `BillingLedger` por `Run`, tenant, workspace e usuário — mas sem a idempotência de cobrança
  ainda pendente, seção 18);
- rastreabilidade de solicitante e confirmador (depende de `requestedByUserId`/
  `confirmedByUserId`, seção 11, sendo implementados);
- **redução** do risco de execução duplicada, sob as condições e limites documentados nas
  seções 16–17 — não uma garantia de execução única;
- bloqueio operacional após revogação de autoridade (depende de D4 e das limitações de schema
  ainda pendentes, seção 12 — não é completo hoje);
- isolamento organizacional por tenant/workspace (já real hoje no mecanismo de autorização
  existente, seção 3 — isolamento **individual** dentro do workspace continua limitado, seção 12);
- preservação do conteúdo efetivamente confirmado (`confirmedPayloadSnapshot`, depende de D6
  estar implementada);
- auditoria de origem, versão e execução (parcialmente real hoje; depende das seções acima
  para ficar completa).

**Não confundir com garantias já disponíveis**: execução única, bloqueio operacional completo
após revogação, ausência de cobrança duplicada, isolamento individual completo e recuperação
automática confiável de `Run`s ambíguos **não existem hoje** e não são prometidas por este
documento — todas dependem de trabalho ainda não implementado (seções 13–19).

**Não confundir orçamento de campanha com limite de consumo de LLM**: o campo `budget` do
contrato de confirmação humana (seção 10) é um valor de negócio informativo, fornecido pelo
humano, sobre o orçamento pretendido da campanha MKT — não é um limite técnico de gasto com o
provedor de LLM, e não existe hoje nenhum mecanismo que ligue um ao outro. **Confirmar uma
execução MKT não autoriza automaticamente publicar campanhas nem gastar em mídia** — o
contrato desta rodada cobre só a confirmação da execução do agente MKT (uma chamada ao LLM),
não nenhuma ação de publicação ou compra de mídia, que continuam fora do escopo de tudo o que
está descrito neste documento.

---

## 22. Desenho técnico de D6 — primeira implementação (Rodada 10)

**Documentação apenas.** Nada nesta seção foi implementado; nenhum schema, migration, código,
teste ou configuração foi criado ou alterado. As políticas de produto citadas abaixo (TTL,
confirmador, visualização/edição) estão ratificadas ("Decisões ratificadas", 2026-09-12) — o
desenho técnico que as sustenta permanece proposta.

### 22.1 Modelos e relacionamentos

**Modelo novo — `HumanConfirmation`** (nome provisório): representa uma janela de confirmação.
Um encaminhamento (`SignalForwardRequest`) pode ter várias, ao longo do tempo, mas no máximo
uma ativa e no máximo uma concluída (22.2).

| Campo | Tipo conceitual | Obrigatório | Origem |
|---|---|---|---|
| `id` | identificador | Sim | Gerado na criação |
| `tenantId`, `workspaceId` | string | Sim | Mesmo escopo do encaminhamento (nunca outro) |
| `signalForwardRequestId` | referência | Sim | O encaminhamento (D5) a que esta janela pertence — **não duplica** `originSnapshot`; lê-se por essa referência, já imutável desde a criação do encaminhamento (D5) |
| `status` | string | Sim | `awaiting_human_completion` \| `cancelled_by_human` \| `expired` \| `concluded` — servidor |
| `revision` | inteiro | Sim | Servidor, monotônico, começa em 0, incrementado a cada gravação de rascunho |
| `suggestedPrompt` | string | Sim | Gerado uma vez, na criação da janela, por função determinística — **imutável depois** |
| `suggestedPromptRuleVersion` | string | Sim | Versão da função geradora, congelada com o texto acima |
| `humanConfirmationContractVersion` | string | Sim | Constante do módulo, análoga a `FINGERPRINT_CONTRACT_VERSION` |
| `draftFinalPrompt`, `draftObjective`, `draftAudience`, `draftChannels`, `draftBudget`, `draftToneProfile`, `draftToneNotes`, `draftLaunchDate`, `draftDeadline` | tipos do §10 | `finalPrompt`/`objective` sim, demais opcionais | Humano, só editáveis enquanto `awaiting_human_completion` |
| `expiresAt` | timestamp | Sim | Servidor, `createdAt + 168h` (7 dias) na criação |
| `confirmedAt` | timestamp, opcional | Não (até concluir) | Servidor, `clock_timestamp()` no instante da conclusão (22.3) |
| `confirmedByUserId` | string, opcional | Não (até concluir) | Servidor, de `authContext.userId` — nunca do corpo |
| `confirmedPayloadSnapshot` | objeto imutável, opcional | Não (até concluir) | Servidor, na conclusão — ver 22.4 |
| `createdAt`, `updatedAt` | timestamp | Sim | Servidor |

**Por que não um histórico de revisões intermediárias**: as garantias descritas (detectar
edição concorrente, vincular a confirmação à revisão exata) só exigem saber **se** a revisão
mudou, não o que cada revisão intermediária continha — basta o contador atual e o conteúdo
atual do rascunho, sobrescritos em cada gravação. Se o produto quiser auditoria de cada edição
intermediária, isso é uma decisão nova, fora desta unidade.

**Correção de imutabilidade versus retenção (Rodada 11)**: uma redação anterior descrevia o
conteúdo final como "permanentemente preservado... para sempre" — corrigido para: uma vez
concluída a confirmação, `confirmedPayloadSnapshot` é **imutável enquanto armazenado**, sujeito
à política de retenção e exclusão que vier a se aplicar (nenhum prazo de retenção, exclusão
automática ou garantia de armazenamento permanente é definido ou inventado aqui). O rascunho
atual (revisão corrente) segue sem histórico de revisões intermediárias, como acima; já as
janelas anteriores de um mesmo encaminhamento (registros `HumanConfirmation` que chegaram a
`cancelled_by_human`/`expired`) permanecem, elas próprias, como histórico — cada uma é uma
linha própria, nunca sobrescrita ou removida por uma janela seguinte (seção 22.2).

**Alteração necessária em `SignalForwardRequest` (existente)**: dois campos novos, ambos
opcionais, ambos referências a `HumanConfirmation` — **correção (Rodada 11)**: uma redação
anterior descrevia os dois como preenchidos "uma única vez"; isso só é verdade para o segundo.
- `activeHumanConfirmationId` — nulo quando não há janela aberta; aponta para a janela **ativa**;
  **liberado (volta a nulo) ou substituído** ao longo do tempo, conforme janelas terminam sem
  confirmação e novas são abertas — ver ciclo completo em 22.2.
- `concludedHumanConfirmationId` — nulo até a primeira conclusão; **preenchido uma única vez,
  nunca reescrito depois**; uma vez preenchido, nenhuma nova janela é permitida (22.2).

Ambos escopados ao mesmo `tenantId`/`workspaceId` do encaminhamento, mesmo padrão de FK
composta já usado para `sourceRun`/`destinationRun` no modelo atual.

**Sem outros modelos novos.** `Run.request` (já `Json`, schema atual) recebe, na conclusão, uma
cópia derivada do snapshot — não é um modelo, é conteúdo de um campo já existente.

### 22.2 Protocolo de concorrência — matriz de garantias

**Correção (Rodada 11)**: uma redação anterior descrevia `activeHumanConfirmationId` como
preenchido "uma única vez", igual a `concludedHumanConfirmationId`. Isso está errado —
`activeHumanConfirmationId` precisa ser **liberado ou substituído** quando uma janela termina
sem confirmação, para que uma nova janela possa existir. Só `concludedHumanConfirmationId` é
write-once. A guarda de criação/conclusão também foi estendida para checar `destinationRunId
IS NULL`, cobrindo o caso de um encaminhamento anterior a D6 que já tem Run sem nenhuma
confirmação (seção 22.9).

| Garantia | Mecanismo | Trava | Condição da escrita | Rollback | Limite |
|---|---|---|---|---|---|
| No máximo uma janela ativa por encaminhamento | Campo único `activeHumanConfirmationId` em `SignalForwardRequest`, preenchido por escrita condicionada | Linha de `SignalForwardRequest` | `UPDATE ... SET activeHumanConfirmationId = novoId WHERE id = X AND activeHumanConfirmationId IS NULL AND concludedHumanConfirmationId IS NULL AND destinationRunId IS NULL` | Se 0 linhas afetadas, reverte a transação inteira (inclusive a criação do registro `HumanConfirmation`, evitando linha órfã) | Só cobre o próprio encaminhamento; não impede múltiplos encaminhamentos para a mesma origem (D5) |
| Janela liberada ao terminar sem confirmação | Escrita condicionada que limpa o ponteiro, guardada pela identidade da própria janela | Linha de `SignalForwardRequest` | `UPDATE ... SET activeHumanConfirmationId = NULL WHERE id = X AND activeHumanConfirmationId = Y` (`Y` = id da janela que expirou/foi cancelada) | Se 0 linhas afetadas (o ponteiro já não é mais `Y`), não faz nada — não limpa nem substitui o ponteiro de uma janela mais nova | Só libera; não impede reabertura imediata |
| No máximo uma confirmação concluída | Campo único `concludedHumanConfirmationId`, preenchido uma única vez | Linha de `SignalForwardRequest` | `UPDATE ... SET concludedHumanConfirmationId = Y, activeHumanConfirmationId = NULL, status = 'dispatch_pending' WHERE id = X AND concludedHumanConfirmationId IS NULL AND destinationRunId IS NULL AND activeHumanConfirmationId = Y` | Reverte tudo, inclusive o Run criado na mesma transação | Depende das guardas anteriores |
| No máximo um Run de destino por encaminhamento | Consequência da guarda acima — Run só é criado na mesma transação que preenche `concludedHumanConfirmationId`, e essa escrita exige `destinationRunId IS NULL` | — | — | — | **Não é** a constraint `signalForwardDestinationRunUnique` já existente (essa impede que dois encaminhamentos diferentes apontem pro mesmo Run — problema distinto, continua válida sem alteração) |
| Nenhuma nova janela após conclusão | Mesma condição `concludedHumanConfirmationId IS NULL` acima | — | — | — | Cobre também encaminhamentos legados com Run pré-D6 (`destinationRunId IS NULL` na mesma guarda) |
| Nenhuma edição após confirmação | Guarda de status na própria escrita de rascunho | Linha de `HumanConfirmation` | `UPDATE HumanConfirmation SET revision=revision+1, draft...=... WHERE id=Y AND revision=$esperada AND status='awaiting_human_completion'` | 0 linhas afetadas → conflito, sem sobrescrita | — |

**Ciclo dos dois ponteiros, valor por operação** (`W1`/`W2` = ids de janelas sucessivas do
mesmo encaminhamento):

| Operação | `activeHumanConfirmationId` antes | depois | `concludedHumanConfirmationId` |
|---|---|---|---|
| Criação da janela `W1` | `NULL` | `W1` | `NULL` |
| Edição/revisão (em `W1`) | `W1` | `W1` (inalterado — edição não toca o encaminhamento) | `NULL` |
| Expiração de `W1` | `W1` | `NULL` | `NULL` |
| Cancelamento de `W1` | `W1` | `NULL` | `NULL` |
| Abertura de nova janela `W2` (após `W1` expirar/cancelar) | `NULL` | `W2` | `NULL` |
| Confirmação concluída de `W2` | `W2` | `NULL` | `W2` |
| Operação atrasada tentando expirar/cancelar `W1` depois de `W2` já existir | guarda `activeHumanConfirmationId = W1` falha (já é `W2` ou `NULL`) — **nenhum efeito** | inalterado | inalterado |

**Correção de ordem de travas (Rodada 13)**: a Rodada 12 havia mudado a ordem para
`HumanConfirmation` primeiro, só para bater com a redação então existente em 22.4 — isso foi
insuficiente como fundamento, e a própria Rodada 12 reconhecia isso sem resolver o caso
assimétrico: **na criação da primeira janela, `HumanConfirmation` ainda não existe**, então não
há como travá-la primeiro. Qualquer ordem única e consistente **precisa** admitir
`SignalForwardRequest` como o primeiro (e, na criação, único) ponto de trava — não é uma
escolha entre duas opções equivalentes, é a única capaz de cobrir a criação de janela sem virar
caso especial.

**Ordem corrigida, fundamentada pela execução concorrente**: `SignalForwardRequest` é sempre o
**primeiro ponto comum de serialização**, para toda operação que precise dele —
`HumanConfirmation`, quando já existe, é travada **depois**, com sua identidade obtida a partir
da própria leitura que já travou `SignalForwardRequest` (nunca de uma leitura anterior e
destravada). Concretamente, cada operação que toca as duas linhas começa por
`SELECT ... FROM SignalForwardRequest WHERE id = X FOR UPDATE` — isso adquire a trava **e**
devolve o valor atual de `activeHumanConfirmationId`/`concludedHumanConfirmationId`/
`destinationRunId` no mesmo instante, sem uma leitura solta anterior cujo resultado precisaria
ser revalidado depois. **Localizar** qual janela é a ativa (para saber qual linha de
`HumanConfirmation` travar em seguida) e **adquirir a trava** sobre `SignalForwardRequest`
acontecem, portanto, na mesma operação — nunca em passos separados onde o segundo confia
cegamente no primeiro. Só depois disso, com o vínculo já confirmado sob trava, a operação trava
`HumanConfirmation` (quando existente). Isso evita, por construção, qualquer caminho de
aquisição inversa: nenhuma operação deste protocolo jamais tenta travar `HumanConfirmation`
antes de `SignalForwardRequest`, porque nenhuma delas *pode* saber qual `HumanConfirmation`
travar sem antes ler (sob trava) `SignalForwardRequest`. Detalhe operação a operação na tabela
logo abaixo ("Tabela obrigatória por operação"). Isso **não elimina toda possibilidade teórica
de deadlock no sistema como um todo** —
só garante que, dentro deste protocolo específico, nenhum caminho de escrita adquire as duas
travas em ordem oposta a outro.

**Criar/reabrir janela** só trava uma linha existente (`SignalForwardRequest`, pela mesma
leitura-com-trava acima) — `HumanConfirmation` é inserção nova, sem outra escrita concorrente
disputando essa linha ainda inexistente, então nunca compete por ordem com nada. A operação que
só toca `HumanConfirmation` (salvar edição) também não compete por essa ordem — e é
precisamente por isso que sua guarda própria (`revision`+`status`) continua indispensável: uma
edição concorrente com uma confirmação não passa pela trava de `SignalForwardRequest`
nenhuma vez.

**Nível de isolamento**: `READ COMMITTED` (padrão do PostgreSQL) é suficiente, mas agora
depende de um `SELECT ... FOR UPDATE` explícito no início de cada operação que toca as duas
linhas — não basta mais dizer que a condição de uma única `UPDATE ... WHERE ...` "acontece no
mesmo instante" da trava; o vínculo com `HumanConfirmation` precisa ser obtido **sob** essa
trava antes de qualquer escrita seguinte. `SERIALIZABLE` continua desnecessário para as
garantias descritas aqui.

**Não é uma constraint declarativa de banco** — é disciplina de aplicação sobre escritas
condicionadas, real e concorrência-segura pelo mecanismo de trava de linha do PostgreSQL
descrito acima, mas dependente de todo código de escrita seguir exatamente este protocolo, não
de um índice único autoexecutável independente da aplicação.

**Cenários** (ordem corrigida — `SignalForwardRequest` sempre primeiro):
- **Duas criações de janela concorrentes**: ambas tentam `SELECT ... FOR UPDATE` sobre a mesma
  linha de `SignalForwardRequest`; só uma adquire a trava primeiro, revalida (`activeHumanConfirmationId
  IS NULL` etc.), insere seu `HumanConfirmation` e atualiza o ponteiro; a segunda, ao adquirir a
  trava em seguida, revalida e encontra a condição já falsa (ponteiro preenchido) — aborta antes
  de inserir qualquer `HumanConfirmation`, nenhum registro órfão.
- **Edição concorrente com confirmação**: a edição nunca trava `SignalForwardRequest` (só
  `HumanConfirmation`, guarda `revision`+`status`); a confirmação trava `SignalForwardRequest`
  primeiro, depois `HumanConfirmation` com a mesma guarda — quem commitar primeiro invalida a
  condição da outra.
- **Cancelamento/expiração concorrentes com confirmação**: ambas disputam a mesma trava de
  `SignalForwardRequest` primeiro; a que adquire primeiro revalida `activeHumanConfirmationId =
  Y` sob a trava e prossegue; a outra, ao adquirir a trava depois, já vê o ponteiro alterado (ou
  `concludedHumanConfirmationId` preenchido) e aborta **antes** de tocar `HumanConfirmation`.
- **Operação atrasada sobre janela antiga** (ex.: expiração processada tarde, depois que a
  janela já foi substituída): a leitura-com-trava sobre `SignalForwardRequest` revela
  `activeHumanConfirmationId` já apontando para a janela nova (ou nulo) — a operação atrasada
  aborta nesse instante, **nunca chega a tocar** a linha de `HumanConfirmation` da janela nova
  nem da antiga.
- **Duas confirmações**: mesma trava de `SignalForwardRequest` primeiro; a que perde, ao
  adquirir a trava depois, encontra `concludedHumanConfirmationId` já preenchido — lê de volta e
  compara `operationKey` (22.3): mesma chave → réplica idempotente; chave diferente → rejeitada.
- **Falha depois de criar o Run, antes de concluir a transação**: toda a transação reverte —
  Run não persiste, `HumanConfirmation` permanece exatamente como antes (ainda
  `awaiting_human_completion`, mesma `revision`), `SignalForwardRequest` com o ponteiro ainda
  apontando pra mesma janela, confirmável de novo.
- **Repetição após perda da resposta**: a tentativa repetida adquire a trava de
  `SignalForwardRequest`, encontra `concludedHumanConfirmationId` já preenchido, lê de volta,
  `operationKey` bate → devolve o resultado já persistido, nenhum novo Run.

**Nova execução intencional exige novo encaminhamento** (novo `SignalForwardRequest`, D5),
respeitando `signalForwardIdempotencyKey` como já existe — nenhuma mudança de semântica.

**Tabela obrigatória por operação** — a ordem é compatível entre todos os caminhos de escrita;
não promete ausência absoluta de deadlock no sistema como um todo, só que, dentro deste
protocolo, nenhum caminho adquire as duas travas em ordem oposta a outro:

| Operação | Registros existentes no início | Primeira trava | Segunda trava (quando aplicável) | Condições revalidadas após adquirir as travas | Escrita condicionada | Resultado em conflito |
|---|---|---|---|---|---|---|
| Primeira janela | Só `SignalForwardRequest` | `SELECT ... FROM SignalForwardRequest WHERE id=X FOR UPDATE` | `HumanConfirmation` não existe ainda (inserida depois, sem disputa) | `activeHumanConfirmationId IS NULL`, `concludedHumanConfirmationId IS NULL`, `destinationRunId IS NULL` | `INSERT HumanConfirmation`, depois `UPDATE SignalForwardRequest SET activeHumanConfirmationId=novoId` | Se a revalidação falhar, aborta antes de inserir — nenhuma linha órfã |
| Reabertura (após cancelar/expirar) | `SignalForwardRequest` + `HumanConfirmation` antiga (terminal) | Igual à primeira janela | Igual | Mesmas condições — já satisfeitas pela liberação anterior | Igual à primeira janela | Igual |
| Salvar revisão | `HumanConfirmation` existente | `UPDATE HumanConfirmation ... WHERE id=Y AND revision=$esperada AND status='awaiting_human_completion'` (única trava — nunca toca `SignalForwardRequest`) | Não aplicável | `revision` e `status` reavaliados na própria escrita | A `UPDATE` acima, condicionada | 0 linhas afetadas → conflito, sem sobrescrita |
| Cancelar | `SignalForwardRequest` + `HumanConfirmation` (`awaiting_human_completion`) | `SELECT ... FROM SignalForwardRequest WHERE id=X FOR UPDATE` | `HumanConfirmation` (linha `Y`, já confirmada como a ativa pela primeira trava) | `activeHumanConfirmationId = Y` (sob a primeira trava); `status='awaiting_human_completion'` (sob a segunda) | `UPDATE HumanConfirmation SET status='cancelled_by_human'`, depois `UPDATE SignalForwardRequest SET activeHumanConfirmationId=NULL` | Falha na 1ª revalidação → aborta sem tocar `HumanConfirmation`; falha na 2ª (edição concorrente já mudou `status`/`revision`) → aborta antes da 2ª escrita |
| Expirar | Igual a "cancelar" | Igual | Igual | Igual, mais `expiresAt < clock_timestamp()` (22.3) | Igual, com `status='expired'` | Igual |
| Confirmar | `SignalForwardRequest` + `HumanConfirmation` (`awaiting_human_completion`) | `SELECT ... FROM SignalForwardRequest WHERE id=X FOR UPDATE` | `HumanConfirmation` (linha `Y`) | `activeHumanConfirmationId = Y`, `concludedHumanConfirmationId IS NULL`, `destinationRunId IS NULL` (1ª); `status='awaiting_human_completion'`, `revision=$esperada`, `clock_timestamp() <= expiresAt` (2ª, 22.3) | `UPDATE HumanConfirmation SET status='concluded', ...`, `INSERT Run`, `UPDATE SignalForwardRequest SET concludedHumanConfirmationId=Y, activeHumanConfirmationId=NULL, status='dispatch_pending'` | Falha na 1ª → aborta sem criar Run; falha na 2ª → aborta, Run não persiste (rollback) |
| Recuperação idempotente (reenvio de confirmação já concluída) | `SignalForwardRequest` + `HumanConfirmation` (`concluded`) | **Não exige trava de escrita** — leitura autorizada é suficiente, porque dado concluído é imutável (22.1/22.4) | — | Autorização atual (22.5) + `operationKey` comparado contra `confirmedPayloadSnapshot.operationKey` | Nenhuma — é leitura, não escrita | `operationKey` diferente → conflito; autorização ausente → erro, sem revelar o conteúdo |

**Leitura autorizada vs. aquisição de trava, distinção explícita**: uma tentativa de reenviar a
operação de confirmar que chega **enquanto a confirmação original ainda está em voo** (transação
não commitada) segue o caminho de escrita normal ("Confirmar" acima) — ela **precisa** da trava,
porque tentará o mesmo `SELECT ... FOR UPDATE` e vai esperar a transação original terminar antes
de revalidar. Só depois que a confirmação original **já commitou**, uma nova tentativa de
recuperar o resultado é pura leitura, sem necessidade de trava — porque o dado já é imutável.

### 22.2.1 Cenários concorrentes — demonstração

**A. Duas criações concorrentes**: ambas as transações emitem `SELECT ... FROM
SignalForwardRequest WHERE id=X FOR UPDATE`. O PostgreSQL serializa as duas sobre a mesma linha
— uma adquire a trava, lê `activeHumanConfirmationId IS NULL`, insere seu `HumanConfirmation` e
grava o ponteiro; só então libera a trava (commit). A segunda, que esperava, adquire a trava em
seguida e **observa o estado já commitado pela primeira** — `activeHumanConfirmationId` não é
mais nulo — sua revalidação falha, ela aborta sem inserir seu próprio `HumanConfirmation` (ou
reverte o insert já feito antes da tentativa de escrita condicionada, se essa ordem interna for
usada). Resultado: exatamente uma janela ativa, a da transação que venceu a corrida pela trava.

**B. Reabertura concorrente**: mesmo mecanismo do item A — duas tentativas de reabrir uma janela
depois que a anterior expirou/foi cancelada disputam a mesma trava de `SignalForwardRequest`;
só uma vence, a outra observa o ponteiro já preenchido e aborta. Resultado: só uma janela ativa
sobrevive, mesmo com duas tentativas concorrentes de reabertura.

**C. Operação atrasada**: uma edição, expiração, cancelamento ou confirmação dirigida à janela
antiga `W1`, processada depois que `W2` já é a ativa, sempre começa pela mesma leitura-com-trava
sobre `SignalForwardRequest` (exceto "salvar edição", que trava só `HumanConfirmation(W1)`
diretamente — nesse caso a guarda `id=W1 AND status='awaiting_human_completion'` falha
diretamente, porque `W1` já está em estado terminal). Para cancelar/expirar/confirmar
direcionadas a `W1`: a leitura-com-trava sobre `SignalForwardRequest` revela
`activeHumanConfirmationId = W2` (não `W1`) — a condição `activeHumanConfirmationId = W1` falha
**antes** de qualquer trava ser adquirida sobre `HumanConfirmation`, então a operação atrasada
nunca chega a tocar nem `W1` nem `W2`. **Nenhuma operação antiga limpa o ponteiro ativo sem
conferir que ele ainda aponta para aquela janela** — essa conferência é exatamente a
revalidação sob a primeira trava.

Verificações presentes em toda operação que toca `SignalForwardRequest` (criar/reabrir janela,
cancelar, expirar, confirmar): vínculo da confirmação com o encaminhamento certo e seu escopo
(`tenantId`/`workspaceId`, pela própria FK composta); `activeHumanConfirmationId` igual ao id
esperado (quando a operação age sobre uma janela específica); estado e revisão pertinentes (na
segunda trava, sobre `HumanConfirmation`); ausência de confirmação concluída
(`concludedHumanConfirmationId IS NULL`); `destinationRunId IS NULL`, quando a operação é
criar/reabrir janela ou confirmar.

**Recuperação idempotente de confirmação já concluída permanece um caso distinto** de qualquer
transição de estado acima — não compete por trava com nenhuma das operações de escrita, é leitura
autorizada sobre dado imutável (tabela acima).

### 22.2.2 Testes concorrentes previstos (não implementados, não executados)

- Duas primeiras janelas concorrentes sobre o mesmo encaminhamento → só uma sobrevive.
- Duas reaberturas concorrentes (após expirar/cancelar) → só uma janela ativa resultante.
- Edição concorrente com confirmação → qualquer uma que commitar primeiro invalida a outra.
- Cancelamento/expiração concorrente com confirmação → resultado sempre consistente, nunca
  ambos aplicados.
- Operação antiga (`W1`) processada depois que `W2` já é a ativa → nenhum efeito sobre `W2`.
- Duas confirmações concorrentes → exatamente um Run criado.
- Falha transacional (ex.: erro após criar o Run, antes do commit) → nenhum registro parcial;
  `HumanConfirmation`/`SignalForwardRequest` exatamente como antes da tentativa.

**Coordenação das transações**: os testes futuros devem usar barreiras/pontos de instrumentação
controlados dentro da própria transação — mesmo padrão já real hoje em
`ForwardSignalTestHooks` (`signalForwardingService.ts`, `afterInsert`/`afterRunCreate`),
reaproveitado/estendido para `humanConfirmationService.ts` — nunca `sleep`/atraso arbitrário.
Um hook de teste pausa a transação A logo após adquirir a trava de `SignalForwardRequest`
(antes de revalidar/escrever), permitindo que a transação B seja disparada e fique
deterministicamente bloqueada esperando a mesma trava; a transação A é então liberada para
concluir, e só depois disso B prossegue — tornando a ordem de vitória determinística para o
teste, em vez de depender de tempo real.

### 22.3 Tempo e identidade da operação idempotente

- **Relógio autoritativo**: o do PostgreSQL, nunca o do cliente.
- **Instante de aceitação**: o momento em que a condição de prazo é avaliada dentro da própria
  escrita condicional de conclusão — usando o relógio de parede real naquele instante
  (`clock_timestamp()`), não o de início da transação (`now()`, que fica congelado no início da
  transação em PostgreSQL). Início de transação, avaliação do prazo e commit são três instantes
  diferentes; só o do meio decide.
- **Fronteira**: inclusiva — `clock_timestamp() <= expiresAt` válido.
- **Espera por trava**: se a escrita condicional tiver que esperar (por outra operação
  concorrente sobre a mesma linha) e o prazo vencer durante a espera, a condição, reavaliada só
  depois de a trava ser obtida, corretamente falha — a tentativa é tratada como expirada, mesmo
  que tivesse sido válida no instante em que foi originalmente disparada.
- **`confirmedAt`**: gravado pela mesma escrita condicional, com o mesmo `clock_timestamp()`
  usado para aceitar o prazo — nunca um valor calculado antes, em código de aplicação.

**Identidade da operação idempotente**: `{tenantId, workspaceId, signalForwardRequestId,
humanConfirmationId, revision declarada, operationKey, confirmedByUserId}`. `operationKey` é
fornecido pelo cliente (gerado uma vez por tentativa de confirmação, mesmo padrão de
`idempotencyKey` já usado em D5) e gravado dentro de `confirmedPayloadSnapshot` só na conclusão
— não precisa de uma constraint de unicidade própria: uma tentativa repetida que encontra a
linha já `concluded` simplesmente lê `confirmedPayloadSnapshot.operationKey` e compara com a
sua.

**Autorização sempre antes da recuperação do resultado**: nenhuma tentativa (nova ou repetida)
lê `confirmedPayloadSnapshot` antes de a autorização atual do solicitante ser confirmada — uma
confirmação concluída pode ser recuperada idempotentemente **mesmo depois do prazo vencido**,
sem reabrir a janela nem criar outro Run (o prazo só governa a transição a partir de
`awaiting_human_completion`); mas nunca para quem perdeu acesso.

### 22.4 Conteúdo e estado na conclusão

**Sequência corrigida (Rodada 13)**, seguindo a ordem de travas de 22.2 — `SignalForwardRequest`
primeiro: (1) `SELECT ... FROM SignalForwardRequest WHERE id=X FOR UPDATE`, revalidando
`activeHumanConfirmationId = Y`, `concludedHumanConfirmationId IS NULL`,
`destinationRunId IS NULL`; (2) `UPDATE HumanConfirmation` (guarda de `revision`+`status`,
mais TTL — 22.3), gravando `confirmedPayloadSnapshot` (radarSignal via `originSnapshot` do
encaminhamento, `suggestedPrompt`+versão, `finalPrompt`+campos de negócio, versões de contrato,
`confirmedByUserId`, `confirmedAt`, `operationKey`) e marcando `status = "concluded"`; (3) cria
o Run em `pending`, com `request = {prompt: finalPrompt, metadata: {form: {...campos de
negócio}, signalForwardRequestId, sourceRunId, humanConfirmationId}}`; (4)
`UPDATE SignalForwardRequest SET concludedHumanConfirmationId=Y, activeHumanConfirmationId=NULL,
status="dispatch_pending"` (sem guarda adicional — a linha já está travada desde o passo 1,
nada mais pôde alterá-la nesse intervalo). Tudo numa única transação — **não exige outbox
implementado** para só gravar o valor de estado do passo 4.

**Fonte autoritativa única**: `confirmedPayloadSnapshot`. `Run.request` é sempre uma cópia
derivada, nunca uma segunda autoridade. Um futuro publicador deve preferir ler do snapshot; se
usar a cópia de `Run.request`, deve comparar `Run.request.prompt` com
`confirmedPayloadSnapshot.finalPrompt` (e os campos de negócio equivalentes) e **bloquear a
publicação** se divergirem. **Sem promessa de imutabilidade absoluta**: a garantia de que as
duas cópias não divirjam depois da criação depende de disciplina de aplicação (nenhum código
escreve nesses campos depois) — um eventual gatilho de banco (mesmo padrão de
`add_immutable_trigger_to_ledger`, já real no schema) é só uma referência de mecanismo possível,
não implementada.

**Só o futuro publicador registraria a transição `dispatch_pending → run_created`** — dependência
do outbox (§16), fora desta unidade. **Ressalva preservada**: `dispatch_pending` não prova que
o job nunca chegou à fila — o worker pode processar (e recusar por D4) antes de o publicador
registrar sucesso de volta no PostgreSQL (§13).

### 22.5 Autorização e limites desta primeira unidade

**Correção (Rodada 12)**: exercitar `checkScopePermission`/`TenantActionPolicy` com fixtures
reais em teste (mesmo padrão de D5) prova que **essa camada específica** funciona — não prova
que **toda** a autorização exigida por D6 está resolvida. São quatro camadas independentes, e
nenhuma substitui as demais:

1. **Autenticação e identidade confiável** — `authContext.userId`, resolvido pelo middleware de
   autenticação da plataforma (fora deste módulo) antes de qualquer coisa aqui. Confirma **quem**
   está fazendo a requisição; não diz nada sobre o que essa identidade pode fazer.
2. **Autorização sobre o encaminhamento** — pela política ratificada, `authContext.userId ===
   requestedByUserId` do `SignalForwardRequest` — checagem direta, sem mecanismo novo.
3. **Permissões existentes de tenant/workspace** — `checkScopePermission`/`TenantActionPolicy`,
   mesmo mecanismo real já usado por `reauthorizeSignalForward` (D5). Escopado a
   tenant/workspace, **nunca por usuário individual, nunca por sujeito** — limitação já
   registrada (§12).
4. **Resolução e autorização sobre o sujeito** — confirma que o `subject.subjectId` referenciado
   no `RadarSignalResultV1` (i) existe, (ii) pertence ao mesmo tenant/workspace, e (iii) esta
   identidade tem acesso a ele. **Não existe hoje** (§9.6, camada 2) — nenhuma das três camadas
   acima, sozinha ou combinada, supre essa ausência.

**Interface obrigatória para a camada 4 (proposta, não implementada)**:

```
SubjectAuthorizationResolver(input: {
  confirmedIdentity: string,   // authContext.userId — nunca do corpo
  tenantId: string,            // authContext.tenantId
  workspaceId: string,         // authContext.workspaceId
  subjectType: "internal_reference",
  subjectId: string,           // lido de RadarSignalResultV1.subject, via originSnapshot já
                                // validado (D5) — nunca aceito solto do corpo da confirmação
  operation: "view" | "edit" | "confirm" | "recover",
}) => SubjectAuthorizationOutcome
```

`SubjectAuthorizationOutcome` — um destes, nunca inferido, nunca combinado:
`authorized` | `subject_not_found` | `subject_out_of_scope` | `access_denied` |
`resolver_unavailable` | `resolution_failed`.

**Origem das entradas**: `confirmedIdentity`/`tenantId`/`workspaceId` sempre de `authContext`
(mesma disciplina já real para `tenantId`/`workspaceId` em `routes/runs.ts` e para
`confirmedByUserId` acima); `subjectType`/`subjectId` sempre lidos do `originSnapshot` já
persistido e validado por D5-B — nunca aceitos soltos do corpo da requisição de confirmação
(evitaria um cliente afirmar um sujeito diferente do que está realmente no sinal).

**Significado limitado do sucesso**: `authorized` significa só que, **neste instante**, esta
identidade pode realizar **esta** operação sobre **este** sujeito — não é concessão permanente,
não prova que os dados do sujeito são corretos ou atuais, e não dispensa nenhuma das outras três
camadas.

**Tratamento de cada resultado — todos bloqueiam, sem exceção**:
- `subject_not_found` / `subject_out_of_scope` / `access_denied` → bloqueia, `reasonCode`
  próprio, fail-closed.
- `resolver_unavailable` (mecanismo ainda não implementado ou não configurado) → bloqueia.
  **Correção (Rodada 13)**: isso é o comportamento bloqueante **previsto para a implementação
  futura** de D6 quando faltar o resolvedor — não uma funcionalidade operacional já existente
  hoje (D6 ainda não foi implementada; não há código real que retorne `resolver_unavailable` ou
  bloqueie nada, porque o fluxo de confirmação inteiro ainda não existe). Quando a implementação
  futura existir, a ausência de resolvedor real deverá produzir esse resultado e bloquear toda
  operação protegida por padrão.
- `resolution_failed` (erro técnico ao chamar o resolvedor) → bloqueia — nunca trata timeout ou
  exceção como autorizado.
- Qualquer resultado inconclusivo ou ausente → bloqueia. **Nenhum fallback permissivo.**

**Operações que dependem desta checagem**: exposição de conteúdo derivado do sujeito (`title`,
`summary`, `evidence[]`, `suggestedPrompt`), edição do rascunho, confirmação, e recuperação de
resultados protegidos (snapshot confirmado, visualização de janela ativa).

**Ponto de revalidação antes da confirmação**: a mesma checagem é refeita **dentro da mesma
operação transacional de conclusão** (22.2/22.4) — uma autorização obtida quando a janela foi
aberta ou o rascunho editado **não é concessão permanente**; se o acesso ao sujeito mudar entre
a revisão e a confirmação, a confirmação é bloqueada. **Distinta de D4**: esta checagem é sobre
**autorização de acesso ao dado** referenciado (subject); D4 é sobre **autoridade de execução**
de `requestedByUserId`, revalidada imediatamente antes do LLM — camadas diferentes, nenhuma
substitui a outra, nenhuma é tocada pela outra.

**Testes controlados, sem caminho permissivo real**: o substituto da interface é implementado
**inteiramente em código de teste** (`__tests__/`), nunca em `apps/api/src/services/signalForward/
*.ts` — uma função/tabela determinística que o próprio teste controla (ex.: um conjunto fixo de
`subjectId`s sintéticos mapeados para `authorized`, qualquer outro para
`subject_not_found`/`access_denied`). O código de produção só conhece a **interface** (a
assinatura acima) — nunca uma implementação-padrão. **Ponto de composição**: o resolvedor é
recebido como dependência injetada por `humanConfirmationService.ts` (parâmetro explícito, nunca
importado de um módulo fixo dentro do próprio arquivo) — em produção, ninguém pode montar o
serviço sem fornecer um resolvedor real, que **não existe hoje**; essa ausência **é** o bloqueio
operacional, não um detalhe escondido por trás de uma flag. **Não proponho** `authorized: true`
no corpo, variável de ambiente que libere autorização, sucesso quando a dependência está ausente,
ou qualquer implementação permissiva alcançável pelo caminho normal da aplicação. As permissões
já existentes (camadas 1–3) continuam exercitadas pelo código real, com dados sintéticos —
exatamente como já é feito hoje em D5 (`seedRealScenario`/`grantScope`,
`__tests__/helpers.ts`) — o substituto cobre **só** a camada 4, ainda inexistente.

**Critérios de aceite da interface (não implementados, não executados)** — ver lista completa
em 22.10; resumo: sujeito autorizado permite prosseguir; ausência/recusa/falha do resolvedor
bloqueia confirmação **e** criação do Run; tenant/workspace ou sujeito divergentes são
recusados; perda de acesso entre revisão e confirmação bloqueia a confirmação; recuperação
idempotente também exige acesso atual (camada 4, além da autorização geral já descrita em
22.3).

**Demonstrável em testes controlados**: protocolo de concorrência completo, TTL, idempotência,
integridade do snapshot, **e agora também** o bloqueio correto da interface de autorização do
sujeito em cada um dos resultados acima. **Não demonstrável nem prometido**: exposição segura de
conteúdo real a um cliente — esta unidade isolada não pode ser habilitada para clientes reais e
não é chamada de fluxo operacional pronto.

### 22.6 Arquivos da primeira implementação e ordem

| Categoria | Caminho | Justificativa |
|---|---|---|
| Schema/migration (futuro) | `packages/db/prisma/schema.prisma` | Modelo `HumanConfirmation` + 2 campos novos em `SignalForwardRequest` (22.1) |
| Lógica pura | `apps/api/src/services/signalForward/suggestedPromptGenerator.ts` (novo) | Template determinístico, sem I/O, mesmo estilo de `radarSignalResultValidator.ts` |
| Contrato/erros/estado | `apps/api/src/services/signalForward/humanConfirmationContract.ts` (novo) | Tipos, `HumanConfirmationError`, TTL/guarda de revisão, **e a interface `SubjectAuthorizationResolver`/`SubjectAuthorizationOutcome`** (22.5) — só o contrato/tipos, nenhuma implementação real — mesmo papel de `originContract.ts` |
| Operações transacionais | `apps/api/src/services/signalForward/humanConfirmationService.ts` (novo) | Criar janela/salvar rascunho/cancelar/confirmar; **recebe o resolvedor de sujeito como dependência injetada** (ponto de composição, 22.5) — mesmo papel de `signalForwardingService.ts` |
| Integração com o encaminhamento atual | `apps/api/src/services/signalForward/signalForwardingService.ts` (alteração) | Remover a criação síncrona do Run em `forwardSignalToMkt`; corrigir a checagem de `recoverExistingSignalForwardRequest` — ver 22.7 |
| Testes | `__tests__/M-...` em diante (convenção de letras já usada), incluindo um arquivo dedicado ao substituto controlado da interface de autorização do sujeito (ex.: `__tests__/N-subject-authorization-boundary.test.ts`) + revisão de `A-real-creation.test.ts`/`K-producer-ratification.test.ts`/`B-concurrency.test.ts`/`G-classification.test.ts`/`I-fingerprint-integrity.test.ts` | Ver lista completa em 22.7/22.8/22.10 |
| Documentação | `README.md` do módulo | Procedimento de teste, se novo symlink/env for necessário |

**Fora desta primeira unidade**: rotas HTTP, **implementação real** do resolvedor de sujeito
(só a interface/contrato entra — 22.5), resolução do sujeito em si, D4 no worker, outbox,
publicação.

**Ordem**: (1) schema/migration; (2) `suggestedPromptGenerator.ts` (sem dependências); (3)
`humanConfirmationContract.ts`, incluindo a interface de autorização do sujeito (depende do
schema); (4) alterar `signalForwardingService.ts` (remover criação síncrona do Run, corrigir
`recoverExistingSignalForwardRequest` — 22.7); (5) `humanConfirmationService.ts` (depende de
1–4, recebe o resolvedor por injeção — 22.5); (6) testes (novos, incluindo o substituto
controlado da interface, + revisão dos cinco existentes, 22.7/22.8); (7) documentação. Nenhuma
etapa foi executada nesta rodada.

### 22.7 Integração da criação tardia do Run ao fluxo de D6

**Correção (Rodada 11)**: a rodada anterior classificou isto como "dependência técnica
remanescente, não resolvida". Está corrigido — **adiar a criação do Run é parte necessária e já
integrada ao desenho**, não uma pendência solta. O que segue é o desenho concreto.

**Sequência**:
1. `forwardSignalToMkt` cria o `SignalForwardRequest` (D5: origem validada, `originSnapshot`,
   `requestFingerprint`, escopo) — **sem criar nenhum Run**. `status` inicial:
   `pending_dispatch` (nome já existente, sem mudança).
2. A primeira janela de confirmação é criada **numa operação separada e posterior**
   (`humanConfirmationService.ts`, nova — não dentro de `forwardSignalToMkt`), sobre um
   `SignalForwardRequest` já existente e com `status="pending_dispatch"`.
3. Revisão e edição do rascunho (seção 22.1/22.2) operam só sobre a janela — nenhuma delas toca
   o encaminhamento nem cria Run.
4. Só a conclusão de uma confirmação **válida** (guardas de 22.2, revisão correta, TTL não
   vencido) cria o Run, grava `confirmedPayloadSnapshot` e associa os dois registros — tudo na
   mesma transação (22.4).
5. Depois da conclusão, `SignalForwardRequest.status = "dispatch_pending"` (22.4) — sem
   publicação na fila em nenhuma das operações acima.

**Contrato de retorno — `forwardSignalToMkt`/`recoverExistingSignalForwardRequest`
(`signalForwardingService.ts`)**: o tipo `SignalForwardResult` já existente
(`{forwardRequestId, destinationRunId: string | null, status: string, reused: boolean}`) **já
comporta `destinationRunId: null`** sem mudança de tipo — só de comportamento:

| Situação | `destinationRunId` | `status` | `reused` |
|---|---|---|---|
| Encaminhamento recém-criado, aguardando confirmação | `null` | `"pending_dispatch"` | `false` |
| Recuperação (`recoverExistingSignalForwardRequest`) de encaminhamento ainda sem confirmação concluída | `null` | `"pending_dispatch"` | `true` |
| Recuperação de encaminhamento com confirmação concluída | id real do Run | `"dispatch_pending"` (ou `"run_created"`, quando o outbox existir) | `true` |
| Encaminhamento legado, anterior a D6, com Run mas sem confirmação | id real do Run | `"pending_dispatch"` ou `"run_created"` (o que já estiver gravado) — **nunca reinterpretado como confirmado** | `true` |

**Não invento** um `destinationRunId` temporário, não crio Run antecipadamente para satisfazer
o tipo atual (o tipo já aceita `null`), e a mudança de comportamento fica **explícita** acima —
não escondida.

**Correção necessária em `recoverExistingSignalForwardRequest`**: o código real hoje tem
```ts
if (!existing.destinationRunId) {
  throw new SignalForwardInconsistencyError("existing_request_without_destination_run", ...);
}
```
Essa checagem presumia que `destinationRunId` nulo sempre era inconsistência — sob D6, um
encaminhamento legitimamente aguardando confirmação **tem `destinationRunId` nulo por design**,
não é mais um erro. A checagem precisa ser restrita a estados que **deveriam** ter Run
(`dispatch_pending`/`run_created`) e só sinalizar inconsistência se, **nesses** estados
especificamente, o campo estiver nulo — nunca para `pending_dispatch`.

**Consumidores e testes afetados (reais, confirmados por leitura)**:
- `apps/api/src/services/signalForward/signalForwardingService.ts` — `forwardSignalToMkt`
  (remover a chamada a `createDestinationRun`), `recoverExistingSignalForwardRequest` (corrigir
  a checagem acima). Nenhum outro arquivo de produção chama essas funções (`grep` confirma:
  fora de `__tests__/`, só este próprio arquivo as referencia — nenhuma rota HTTP existe hoje).
- `apps/api/src/services/signalForward/__tests__/A-real-creation.test.ts` — linhas 23–24, 29–30,
  44: assume `status==="run_created"`/`destinationRunId` truthy/`Run.findUnique` síncronos.
- `apps/api/src/services/signalForward/__tests__/K-producer-ratification.test.ts` — linha 32:
  `assert.equal(result.status, "run_created")`.
- `apps/api/src/services/signalForward/__tests__/B-concurrency.test.ts` — linhas 47–48:
  compara/assume `destinationRunId` presente entre duas chamadas concorrentes.
- `apps/api/src/services/signalForward/__tests__/G-classification.test.ts` — linha 28: compara
  `destinationRunId` entre duas tentativas.
- `apps/api/src/services/signalForward/__tests__/I-fingerprint-integrity.test.ts` — linha 80:
  compara `destinationRunId` antes/depois de uma tentativa de alterar a origem.

Todos os cinco precisariam de revisão quando D6 for implementada — não creio que "quebrem" no
sentido de estarem errados, mas suas asserções sobre Run síncrono deixam de valer.

**Diferença entre criação, recuperação do encaminhamento e recuperação da confirmação**: criação
(`forwardSignalToMkt`) e recuperação do encaminhamento (`recoverExistingSignalForwardRequest`)
seguem operando só sobre `SignalForwardRequest` (D5, inalterado) — nunca criam nem leem
`HumanConfirmation`. Recuperar o **resultado de uma confirmação** (reenvio da operação de
confirmar, 22.3) é uma operação **distinta**, sobre `HumanConfirmation`, que só incidentalmente
também expõe `destinationRunId` quando concluída.

**Preservação de D5**: validação da origem (`readAndValidateOrigin`, D5-A/D5-B) continua
executada exatamente como hoje, tanto na criação quanto no reenvio — nada nesta integração a
contorna. Comportamento de conflito (`ConflictError` por fingerprint divergente) e o próprio
`stableStringify`/`computeRequestFingerprint`/`FINGERPRINT_CONTRACT_VERSION` permanecem
inalterados — a confirmação lê `originSnapshot` **através da referência ao encaminhamento**
(22.1), nunca por uma releitura direta da origem que pudesse divergir do snapshot já validado
por D5.

### 22.8 Fluxo completo: encaminhar → revisar → confirmar → recuperar

| Operação | Pré-condições/autorização | Registros lidos/gravados | Estado e retorno | Reenvio | Run |
|---|---|---|---|---|---|
| **Encaminhar** (`forwardSignalToMkt`) | Escopo `runs.execute` (D5); origem válida (D5-A/B) | Cria `SignalForwardRequest` | `pending_dispatch`; `destinationRunId: null` | Mesma `idempotencyKey` → `recoverExistingSignalForwardRequest` (D5, inalterado) | Não existe |
| **Abrir janela** | `authContext.userId === requestedByUserId`; `SignalForwardRequest.destinationRunId IS NULL` e sem janela ativa/concluída | Cria `HumanConfirmation`; guarda em `SignalForwardRequest` (22.2) | `awaiting_human_completion`, `revision=0` | N/A (operação de criação, não idempotente por chave) | Não existe |
| **Reabrir janela** (após expirar/cancelar) | Igual acima + nenhuma confirmação concluída ainda | Nova linha `HumanConfirmation`; guarda liberada e reocupada (22.2) | Nova janela `awaiting_human_completion`, `revision=0` | — | Não existe |
| **Salvar revisão** | Autorização de edição (§10); janela em `awaiting_human_completion` | `UPDATE HumanConfirmation` (guarda de `revision`+`status`) | `revision+1`; revisão desatualizada → conflito, sem sobrescrita | N/A | Não existe |
| **Confirmar** | `authContext.userId === requestedByUserId`; janela em `awaiting_human_completion`; revisão correta; TTL não vencido (22.3); interface de autorização do sujeito retorna `authorized` (22.5) | `HumanConfirmation` → `concluded`; `confirmedPayloadSnapshot`; `SignalForwardRequest` → `dispatch_pending` + ponteiros; cria `Run` | `concluded`/`dispatch_pending`; retorna `destinationRunId` real | Mesma `operationKey` + mesma revisão → resultado já persistido (22.3); chave/revisão diferente → conflito | **Criado, exatamente um** |
| **Recuperar janela expirada/cancelada** | Autorização de leitura (§7.1, ainda pendente) | Leitura de `HumanConfirmation` em estado terminal não-concluído | `expired`/`cancelled_by_human`; **sem** `confirmedPayloadSnapshot` (nunca existiu para esta janela); `originSnapshot` do encaminhamento (D5) segue intacto e disponível, por ser de um registro diferente | Idempotente por natureza (leitura) | Não existe — chamador deve abrir nova janela |
| **Recuperar encaminhamento** | Autorização de leitura (§7.1, ainda pendente) | Leitura de `SignalForwardRequest` | Reflete o estado atual (`pending_dispatch`/`dispatch_pending`/`run_created`) | Idempotente por natureza (leitura) | Conforme o estado |
| **Recuperar confirmação concluída** | Autorização atual reavaliada a cada leitura (§10), inclusive interface de autorização do sujeito (22.5) | Leitura de `HumanConfirmation.confirmedPayloadSnapshot` | `concluded`, com `destinationRunId` | Sem autorização vigente → erro, nunca revela o conteúdo | Existe, o mesmo sempre |

**Ausência de `confirmedPayloadSnapshot` ≠ ausência de `originSnapshot`**: uma janela
`expired`/`cancelled_by_human` nunca teve (e nunca terá) `confirmedPayloadSnapshot` — esse
campo só existe a partir da conclusão (22.1). Isso **não afeta** `originSnapshot`
(`SignalForwardRequest`, D5), que é escrito uma única vez na criação do encaminhamento e
permanece intacto independentemente de quantas janelas de confirmação forem abertas,
expiradas ou canceladas sobre ele — são dois campos, em dois registros diferentes, com ciclos
de vida independentes; um nunca substitui nem prova a existência do outro.

**Ajustes necessários em testes existentes** (mesma lista de 22.7): `A-real-creation.test.ts`,
`K-producer-ratification.test.ts`, `B-concurrency.test.ts`, `G-classification.test.ts`,
`I-fingerprint-integrity.test.ts` — revisar as asserções sobre `destinationRunId`/`status`
síncronos.

**Cenários novos (não implementados, não executados)**:
- Encaminhamento não cria Run (`forwardSignalToMkt` retorna `destinationRunId: null`).
- Confirmação cria exatamente um Run, mesmo sob concorrência (22.2).
- Revisão desatualizada é rejeitada sem sobrescrita.
- Expiração/cancelamento seguidos de nova janela funcionam (ponteiro liberado, 22.2).
- Operação atrasada sobre janela antiga não afeta a janela nova (22.2).
- Reenvio antes da confirmação (recupera o encaminhamento, `destinationRunId: null`) e depois
  da confirmação (recupera com Run) — dois comportamentos distintos, nunca confundidos.
- Registros anteriores a D6 (com Run, sem confirmação) nunca aparecem como `concluded` (22.9).
- Regras de origem e fingerprint de D5 preservadas — mesmos testes/comportamento de hoje.
- Reabertura de janela após expiração/cancelamento, **sem** confirmação concluída: nova janela
  criada normalmente, `revision=0`, sem qualquer resquício da janela anterior.
- `suggestedPromptGenerator`: saída esperada para um `RadarSignalResultV1` fixo; determinismo
  (mesma entrada, mesma saída, em chamadas repetidas); não modifica o objeto de entrada; nenhuma
  chamada externa (sem rede, sem banco, sem LLM) — função pura.
- Ausência de resolução do sujeito (interface retorna `resolver_unavailable` ou equivalente)
  bloqueia a operação protegida — nunca assume autorização.

### 22.9 Compatibilidade com encaminhamentos anteriores a D6

**Identificação**: um `SignalForwardRequest` com `destinationRunId IS NOT NULL` e
`concludedHumanConfirmationId IS NULL` é, por construção, um registro anterior a D6 — um Run
real existe, mas nenhuma confirmação humana jamais foi concluída para ele (porque o mecanismo
não existia quando foi criado). Essa combinação é suficiente para identificá-lo, sem campo
novo.

**Não faço, para esses registros**:
- não infiro `explicitConfirmation`;
- não fabrico `confirmedAt`, `confirmedByUserId` ou `confirmedPayloadSnapshot`;
- não declaro o Run existente como humanamente aprovado;
- não publico nem executo esses Runs automaticamente;
- não excluo nem reescrevo esses registros nesta rodada — nenhuma alteração de dados está
  autorizada.

**Como os retornos distinguem**: a tabela de 22.7 já cobre isso — `destinationRunId` não-nulo
com `concludedHumanConfirmationId` nulo nunca é reportado como `"concluded"` nem carrega
`confirmedAt`/`confirmedByUserId`; um consumidor que precise diferenciar consulta diretamente
os dois campos (nenhum campo novo é necessário só para essa distinção).

**A guarda de 22.2 já impede dois Runs**: como a escrita condicional de conclusão exige
`destinationRunId IS NULL` (22.2, corrigido nesta rodada), **nenhuma nova janela de confirmação
pode concluir** sobre um encaminhamento legado que já tem Run — a mesma guarda que impede duas
confirmações concluídas cobre também esse caso, sem mecanismo adicional.

**Recomendação para nova revisão humana**: não retrofitar uma confirmação sobre o registro
antigo (o Run dele não foi de fato gated por revisão humana — fingir que foi distorceria o
histórico). Em vez disso, um **novo encaminhamento** (novo `SignalForwardRequest`, D5) para a
mesma origem, com uma **nova** `idempotencyKey` — a chave existente (`signalForwardIdempotencyKey`,
escopada a `tenantId+workspaceId+destinationAgent+idempotencyKey`) não muda de semântica; só
recebe um valor novo, como qualquer nova execução intencional já exigia (22.2). Isso evita dois
Runs para o mesmo encaminhamento **antigo** (que continua com só o seu Run original, intocado)
e sujeita a nova execução ao gate de confirmação de D6 desde o início.

**Distinção de migração de dados**: esta é uma recomendação de **compatibilidade operacional**
(como tratar e como recomendar seguir em frente) — não uma migração de dados. Nenhuma migração
que altere, preencha ou reclassifique registros existentes é proposta ou autorizada aqui; se o
produto eventualmente quiser um backfill (ex.: marcar registros antigos com algum indicador
explícito de "anterior a D6"), isso é decisão e trabalho futuro separado.

### 22.10 Critérios de aceite propostos (não implementados, não executados)

- Janela única sob concorrência: duas criações simultâneas → só uma sobrevive, a outra reverte
  por completo.
- Revisão desatualizada: edição/confirmação contra revisão antiga → conflito, sem sobrescrita.
- Edição vs. confirmação: qualquer uma que commitar primeiro invalida a guarda da outra.
- Confirmação vs. cancelamento/expiração: mesma guarda de status, resultado sempre consistente.
- TTL vencendo durante espera por trava: tentativa que só prossegue após o vencimento é
  rejeitada como expirada.
- Conteúdo persistido idêntico à revisão confirmada: snapshot e `Run.request` nascem do mesmo
  valor, na mesma transação.
- Rollback sem Run órfão: falha antes do commit reverte tudo, inclusive o Run.
- Um único Run por encaminhamento, sob confirmações concorrentes.
- Operação atrasada sobre janela antiga (ex.: expiração processada tarde) não limpa nem
  substitui o ponteiro de uma janela nova já aberta.
- Reenvio idempotente (mesma chave/conteúdo) recupera o resultado; conflito quando diverge.
- Reenvio **antes** da confirmação (recupera o encaminhamento, `destinationRunId: null`) e
  **depois** (recupera com Run) — comportamentos distintos, nunca confundidos.
- Perda de autorização bloqueia reenvio, sem revelar o resultado cacheado.
- Confirmação por terceiro (usuário ≠ `requestedByUserId`) é sempre rejeitada.
- Registro anterior a D6 (com Run, sem confirmação) nunca é reportado como `concluded`, nunca
  bloqueia a criação de um novo encaminhamento, e nunca permite uma segunda confirmação
  concluir sobre ele.
- Ausência de publicação/fila/LLM em qualquer cenário desta unidade.
- Fingerprint (`stableStringify`/`computeRequestFingerprint`/`FINGERPRINT_CONTRACT_VERSION`) e
  comportamento pertinente de D5 (validação de origem, conflito por divergência) preservados,
  sem alteração observável.
- Reabertura de janela após expiração/cancelamento (sem confirmação concluída) cria uma janela
  nova e funcional, `revision=0`, sem resíduo da anterior.
- `suggestedPromptGenerator`: saída esperada, determinismo, não modifica a entrada, nenhuma
  chamada externa.
- Ausência de resolução do sujeito bloqueia qualquer operação protegida (exposição de conteúdo,
  edição, confirmação, recuperação), mesmo com validação estrutural (D5-B) aprovada — nunca
  assume autorização.

**Critérios de aceite da interface de autorização do sujeito (22.5, novos nesta rodada)**:
- Sujeito autorizado (substituto controlado retorna `authorized`) permite prosseguir nos
  testes controlados.
- Ausência (`resolver_unavailable`), recusa (`access_denied`) ou falha (`resolution_failed`) do
  resolvedor bloqueia **tanto** a confirmação **quanto** a criação do Run — nunca só uma das
  duas.
- Tenant/workspace divergente (`subject_out_of_scope`) ou sujeito inexistente
  (`subject_not_found`) são recusados.
- Perda de acesso entre a revisão e a tentativa de confirmação (substituto muda de `authorized`
  para `access_denied` no intervalo) bloqueia a confirmação, mesmo com revisão/TTL corretos.
- Recuperação idempotente de uma confirmação concluída também exige `authorized` atual da
  interface do sujeito — não só a autorização geral de acesso ao encaminhamento (22.3).

### 22.11 Implementação de D6 e correção da revalidação de autorização no reenvio (Rodada 14, 2026-09-14)

**Implementação de D6** (modelos, migration, `humanConfirmationContract.ts`,
`humanConfirmationService.ts`, integração em `signalForwardingService.ts`, testes M–P) ocorreu em
rodada anterior a esta, com evidência apresentada só em relatório de conversa — nunca registrada
neste documento até agora.

**Defeito encontrado** (revisão delimitada): o ramo de réplica idempotente de
`confirmHumanConfirmation` (reenvio da mesma `operationKey` sobre uma confirmação já `concluded`)
lia `confirmedPayloadSnapshot` e devolvia `destinationRunId` sem revalidar a autorização do
sujeito (camada 4, seção 22.5) — violando o critério de aceite logo acima e a regra de 22.3
("nenhuma tentativa, nova ou repetida, lê `confirmedPayloadSnapshot` antes da autorização atual").
`recoverHumanConfirmation` já revalidava corretamente; o defeito era exclusivo deste reenvio.

**Correção**: inserida uma chamada a `assertSubjectAuthorized` (`operation: "recover"`, mesmo
padrão de `recoverHumanConfirmation`) no início do ramo de réplica idempotente, antes de ler
`confirmedPayloadSnapshot`, usando o `originSnapshot` já obtido pela trava de
`SignalForwardRequest` na mesma operação. Nenhuma fonte nova de identidade/escopo, nenhum
resolvedor novo, nenhuma alteração de ordem de travas, TTL, idempotência ou schema.

**Regressão**: `N-human-confirmation-confirm.test.ts`, teste "[regressão] reenvio de confirmação
já concluída via confirmHumanConfirmation revalida a autorização do sujeito: access_denied
bloqueia...". Falha reproduzida antes da correção (`Missing expected rejection`); passa depois.
Dois testes adicionais cobrem `resolver_unavailable` e `resolution_failed` no mesmo ramo; o caso
autorizado já era coberto pelos testes N7/N10 existentes.

**Resultados**: suíte completa (A–P, 129 testes) 129/129 passam, exit code 0, em Postgres local
descartável. Typecheck (`tsc --noEmit -p tsconfig.typecheck.json`) comparado entre o estado
imediatamente anterior e o corrigido: conjunto de diagnósticos idêntico byte a byte (297
preexistentes, 0 novos atribuíveis à correção).

**Retratação**: números de uma comparação histórica mais ampla (HEAD vs. estado da implementação
de D6: "304 → 297", "9 resolvidos") e a afirmação de que `originContract.ts`/
`radarSignalResultValidator.ts` seriam "idênticos ao HEAD" foram apresentados **apenas no
relatório de conversa** de uma rodada de revisão anterior — nunca registrados neste documento. A
preservação de D5 nesta e nas rodadas anteriores é comprovada por comparação de hash contra o
estado imediatamente anterior à implementação de D6 (hashes registrados nas evidências de cada
rodada), não contra o commit HEAD — `originContract.ts` já continha alterações locais de D5 antes
de D6 existir, e `radarSignalResultValidator.ts` nunca foi rastreado pelo Git.

---

## Resposta final às quatro questões originais (Rodada 3, reconfirmada)

1. **Quais conteúdos podem ser encaminhados**: tecnicamente, hoje, qualquer `Run` do mesmo
   tenant/workspace com `status="success"` e `response` objeto — sem produtor Radar ratificado
   implementado ainda (D5 ratifica a regra, seção 19 é a menor unidade para implementá-la).
2. **Quem pode encaminhar e recuperar**: hoje, qualquer identidade cujo tenant/workspace tenha
   `runs.execute` concedido — sem diferenciação individual em nenhum ponto da cadeia. D4
   ratifica que isso precisa mudar antes de qualquer execução assíncrona real.
3. **Qual conteúdo será usado pelo MKT**: hoje, o menor contrato real é `{agent:"MKT", prompt}`
   — mas o `Run` de destino do SignalForward nem grava `prompt`. D6 ratifica que, no V1, é o
   humano quem produz `finalPrompt` na confirmação (seção 10), não um adaptador automático.
4. **Como tratar alteração da origem sem modificar o encaminhamento anterior**: resolvido para
   o caminho A com `ConflictError`. Caminho C continua não implementado e agora
   explicitamente bloqueado por D4 até a cadeia de revalidação da seção 12 existir.
