# Presentation Snapshot v1

## Objetivo

Definir o contrato mínimo e estável entre `engine` e `ChatAgentLauncher` para renderização de mensagens de chat sem mutação estrutural posterior.

## Princípio

O `engine` decide.

O `presentationSnapshot` congela o resultado renderizável do turno.

O `launcher` renderiza sem reinterpretar a intenção original da mensagem.

No estado atual do chat, o `ChatAgentLauncher` deve ser tratado como camada `render-first`: ele recebe snapshot pronto, resolve compatibilidade conservadora quando necessário e evita mutação estrutural fora dos helpers do `engine`.

## Escopo

O `presentationSnapshot v1` vale para:
- respostas locais do agente;
- handoffs;
- respostas guiadas;
- respostas associadas a run;
- mensagens persistidas ou reidratadas do histórico.

## Campos Canônicos

### Obrigatórios

- `snapshotVersion`
  - valor esperado:
    - `v1`

- `routeIntent`
  - valores esperados:
    - `proposal`
    - `imob`
    - `playbook`
    - `help`
    - `orchestrator`
    - `self_intro`
    - `capabilities_summary`
    - `legal_handoff`

- `showConfidence`
  - controla se a mensagem exibe bloco de confiança/proveniência.

- `provenanceMode`
  - valores:
    - `none`
    - `recommended`
    - `required`

- `signals`
  - lista curta de sinais operacionais do turno.

- `quickReplies`
  - conjunto final de quick replies renderizáveis para a mensagem.

- `renderVariant`
  - valores:
    - `simple_help`
    - `self_intro`
    - `handoff`
    - `guided_flow`
    - `proposal`

### Opcionais

- `quickReplySource`
  - valores:
    - `backend_payload`
    - `agent_contract`
    - `frontend_copy`
    - `none`

- `eiahMode`
  - valores:
    - `help`
    - `orchestrator`
    - `proposal`

- `proposalDomain`
  - valores:
    - `saas`
    - `imob`

- `conversationStage`
  - valores atuais:
    - `proposal_idle`
    - `proposal_collecting_usage`
    - `proposal_recommended`
    - `proposal_ready_to_open`
    - `proposal_opening`

- `confidencePercent`
- `nextDecision`
- `responseShape`
- `maxCognitiveLoad`
- `inputPlaceholder`
- `attachmentEnabled`
- `attachmentPrimaryActionLabel`
- `attachmentSecondaryActionLabel`
- `attachmentHelpText`
- `governedRuntime`
  - uso inicial:
    - `IMOB`
  - contrato atual:
    - `domain = IMOB`
    - `contractVersion = imob.crm.governed.v1`
    - `launcherPolicy = render_only`
    - `quickRepliesSource = backend_payload`
    - `recommendedActionsSource = backend_payload`
    - `agentActivitiesSource = backend_payload`

## Semântica

### `routeIntent`

Representa o papel conversacional do turno, não apenas o tópico.

### `quickReplies`

Devem ser:
- curtas;
- úteis;
- válidas como input;
- sem duplicação;
- já filtradas pelo `engine` e pelo contexto da conversa.

O launcher não deve inventar quick replies novas fora da política de compatibilidade.

### `quickReplySource`

Explicita de onde saiu o conjunto final de quick replies.

Uso esperado:
- `backend_payload` quando a decisão veio do runtime backend governado;
- `agent_contract` quando veio diretamente do contrato do agente;
- `frontend_copy` apenas em caminhos help/compatibilidade claramente genéricos;
- `none` quando não há quick reply.

Regra:
- para `IMOB` governado, o caminho normal deve ser `backend_payload`;
- `frontend_copy` não deve ser usado para operação IMOB.

### `proposalDomain`

Congela o domínio efetivo do turno quando `routeIntent = proposal`.

Uso esperado:
- `saas` para billing/plano/trial/demo/proposta comercial do workspace;
- `imob` para proposta imobiliária.

Objetivo:
- impedir mistura entre proposta SaaS e jornada IMOB;
- permitir que o launcher renderize chips corretos sem inferência própria.

### `conversationStage`

Congela o estágio conversacional já resolvido pelo `engine`.

Uso esperado:
- chips por estágio;
- observabilidade operacional;
- prevenção de regressão quando o turno seguinte depende de contexto anterior.

### `snapshotVersion`

Identifica a versão contratual do payload.

Mudança semântica incompatível exige nova versão.

### `nextDecision`

Representa CTA ou próximo passo estrutural do turno.

Não deve ser promovido automaticamente a chip.

### `showConfidence`

Quando `false`, o launcher não deve expor bloco de confiança, proveniência ou sinais.

### `governedRuntime`

Congela no snapshot quando um domínio já está operando sob runtime governado e `render-only`.

Uso esperado:
- o launcher pode verificar se deve apenas renderizar affordances vindas do payload;
- testes de regressão podem falhar se a UI voltar a inferir quick replies ou próximos passos localmente.

Estado atual:
- `IMOB` já marca `governedRuntime` quando o turno usa quick replies resolvidas por payload backend.

Contrato mínimo para `IMOB` governado:
- `compatibilityMode = snapshot`
- `routeIntent = imob`
- `quickReplySource = backend_payload`
- `governedRuntime.contractVersion = imob.crm.governed.v1`
- `governedRuntime.launcherPolicy = render_only`
- `governedRuntime.quickRepliesSource = backend_payload`
- `governedRuntime.recommendedActionsSource = backend_payload`
- `governedRuntime.agentActivitiesSource = backend_payload`

Regra fail-closed:
- se `governedRuntime` vier presente mas esse conjunto estiver inconsistente, o launcher não deve considerar o snapshot como governado;
- nesse caso, `quickReplies` do snapshot devem ser suprimidas;
- o launcher não pode preencher o gap com inferência de domínio IMOB.

### `canonicalSnapshot`

O `IMOB` passou a expor, dentro de `presentation.metadata`, um marcador de snapshot canônico autoritativo produzido pelo backend.

Uso esperado:
- declarar que a superfície renderizável já foi resolvida pelo `turn engine`;
- permitir que a UI suprima payloads legados concorrentes, especialmente `card`;
- distinguir coleta, sucesso, bloqueio e leitura consultiva sem reinterpretação local.

Contrato atual:
- `presentation.metadata.canonicalSnapshot.authoritative = true`
- `presentation.metadata.canonicalSnapshot.source = imob_crm_turn_engine`
- `presentation.metadata.canonicalSnapshot.variant`

Variants canônicos atuais do `IMOB`:
- `collecting_fields`
- `form_draft`
- `success_created`
- `success_updated`
- `success_deduped_update`
- `blocked_missing_data`
- `blocked_scope`
- `consult`
- `fallback`

Regra operacional:
- quando `canonicalSnapshot.authoritative = true` e o variant representar coleta ou sucesso governado, o launcher não deve renderizar `card` legado concorrente;
- o frontend deve preferir `blocks`, `form`, `quickReplies` e `proof` já resolvidos pelo backend.

Regra específica de `proof`:
- para fluxos governados migrados, `presentation.proof` é a única fonte visual válida;
- `message.proof` existe para persistência, reload e export como espelho da mesma resolução final;
- `card.proof` só pode ser usado como fallback compatível em snapshots não migrados.

## Regras do Launcher

Quando a mensagem possui `presentationSnapshot`:
- o launcher não recalcula intenção;
- o launcher não injeta CTA adicional;
- o launcher não injeta quick replies globais;
- o launcher não adiciona bloco de confiança fora do que o snapshot já autorizou.
- o launcher não substitui affordances de attachment fora do que o snapshot/contrato já resolveu.
- o launcher não escolhe `renderVariant` por conta própria fora dos helpers do `engine`.
- se `governedRuntime.launcherPolicy = render_only`, o launcher não reinterpreta comportamento de domínio.
- se `governedRuntime` estiver presente mas inconsistente, o launcher falha fechado e não renderiza affordances governadas como se o contrato estivesse válido.
- se `presentation.metadata.canonicalSnapshot.authoritative = true`, o launcher não pode ressuscitar `card` legado para substituir `form` ou `blocks` governados.
- se `presentation.metadata.canonicalSnapshot.authoritative = true`, o launcher não pode ressuscitar `card.proof` como fonte visual alternativa.

## Política de Compatibilidade

### Mensagens com snapshot

- usar o snapshot como fonte única de renderização.

### Mensagens sem snapshot

- permitir fallback conservador;
- não tentar reconstruir personalidade completa do turno;
- evitar inventar affordances que não estejam no conteúdo ou no agente atual.
- não inventar quick replies estruturais para substituir decisão do `engine`;
- permitir apenas placeholder e rendering mínimo quando o snapshot estiver ausente.

### `compatibilityMode`

Valores:
- `snapshot`
- `legacy_conservative`

Semântica:
- `snapshot`: mensagem renderizável sob o contrato v1 completo;
- `legacy_conservative`: compatibilidade legada mínima, sem enriquecimento estrutural novo.

Caminhos legados atualmente aceitos:
- eventos de run que chegam antes do registro local de `runPresentationRef`;
- histórico antigo persistido sem snapshot;
- conversões de conteúdo legado estruturado para markdown.

Observação operacional:
- mesmo nesses caminhos, o launcher deve permanecer conservador e usar helpers do `engine` para reconstrução mínima de snapshot quando necessário.

Para `IMOB` governado:
- o caminho normal não deve depender de `legacy_conservative`;
- `legacy_conservative` fica restrito a histórico antigo, eventos incompletos ou compatibilidade mínima de reidratação.
- em `proof`, isso inclui o uso residual de `card.proof` apenas fora dos fluxos governados migrados.

## Evolução de Versão

Mudanças em `presentationSnapshot` devem seguir:
1. adição de campo opcional;
2. atualização da spec;
3. atualização do schema versionado em `contracts/`;
4. atualização do baseline versionado;
5. atualização do `engine`;
6. atualização do launcher;
7. validação de compatibilidade.

Mudanças que alterem semântica de campo existente exigem nova versão contratual.

Mudança breaking:
- não alterar `presentation-snapshot.v1.schema.json` de forma incompatível;
- criar `presentation-snapshot.v2.schema.json` e baseline correspondente;
- promover o novo contrato com gate/CI dedicados.

## Critério de Pronto

O `presentationSnapshot v1` atinge maturidade contratual quando:
- todos os campos acima estiverem documentados;
- o payload estiver tipado e versionado no runtime;
- existir schema versionado em `contracts/presentation-snapshot.v1.schema.json`;
- existir baseline versionado em `contracts/presentation-snapshot.v1.baseline.json`;
- existir gate dedicado `check:presentation-snapshot-contract`;
- o launcher renderizar mensagens com base no snapshot sem enriquecimento estrutural indevido;
- a política de compatibilidade estiver explícita;
- novas mudanças de UX passarem primeiro por essa spec.

Estado atual:
- `v1` está ativo como contrato renderizável tipado no frontend;
- `compatibilityMode` já diferencia `snapshot` de `legacy_conservative`;
- snapshots de execução e fallback de resumo já são resolvidos pelo `engine`.
- `proposalDomain` e `conversationStage` já são usados para proposta SaaS/IMOB e para reduzir regressão de contexto.
- `quickReplySource` e `governedRuntime` já permitem marcar quando um domínio está em modo governado render-only.
- o contrato renderizável `presentationSnapshot v1` é formalizado por schema, baseline e check dedicado.
- `docs/EVIDENCE_INDEX.md` referencia esses artefatos com escopo limitado ao contrato renderizável v1.

## Campos Proibidos

Os campos abaixo não pertencem ao `presentationSnapshot`:
- `tenantId`
- `workspaceId`
- `payload`
- `proofHash`
- `sourceRefs`
- `receiptId`
- `ledger`
- `receipt`
- `txId`
- `runId`

Uso legítimo:
- esses campos podem existir em runtime backend, receipts, ledger, exports e payloads operacionais;
- não podem ser promovidos a campos próprios do snapshot renderizável.

Regra:
- o schema do snapshot deve falhar fechado para esses campos;
- o gate `check:chat-launcher-render-only` continua bloqueando regressão local no `ChatAgentLauncher`;
- o gate `check:presentation-snapshot-contract` passa a bloquear drift do contrato renderizável.
- no CI monorepo, o job `chat_engine_regression` deve executar primeiro o gate render-only, depois o gate do contrato e só então a suíte `test:chat-engine`.
