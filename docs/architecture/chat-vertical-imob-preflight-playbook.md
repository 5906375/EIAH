# Playbook — Chat Vertical Handoff Preflight (IMOB)

> Status: **parcial** — playbook documental que consolida PR1–PR5. Não fecha
> nenhuma frente operacionalmente, não autoriza execução, não abre LEGAL nem
> qualquer outra vertical. Ver [Limites explícitos de escopo](#limites-explícitos-de-escopo).

## 1. Objetivo

Consolidar, em um único documento replicável, o caminho já implementado e
testado para IMOB — `contract -> resolver -> confidence -> clarification ->
handoff preflight` (PR1–PR5) — como referência canônica para qualquer
vertical futura que queira reutilizar a mesma arquitetura de preflight
determinístico, schema-driven e fail-closed do chat.

Este playbook **não** implementa nada novo. Ele documenta o que já existe,
com arquivo:linha real, e define o checklist/gates obrigatórios para que uma
próxima vertical (LEGAL, MKT, BPO Financeiro, LOG ou outra) siga o mesmo
padrão sem reabrir decisões já tomadas nem introduzir drift.

## 2. Estado atual

| Etapa | Status | Evidência de código |
|---|---|---|
| PR1 — Contrato v2 + registry + shadow snapshot | concluído (merge `origin/main`) | `apps/api/src/types/chatVerticalHandoffV2Contract.ts`, `apps/api/src/types/chatVerticalHandoffV2ShadowSnapshot.ts` |
| PR2 — Candidate resolver IMOB | concluído (merge `origin/main`) | `apps/api/src/resolvers/chatVerticalImobCandidateResolver.ts` |
| PR3 — Confidence IMOB | concluído (merge `origin/main`) | `apps/api/src/resolvers/chatVerticalImobConfidence.ts` |
| PR4 — Clarificação IMOB | concluído (merge `origin/main`) | `apps/api/src/resolvers/chatVerticalImobClarification.ts` |
| PR5 — Handoff preflight IMOB | concluído (merge `origin/main`) | `apps/api/src/resolvers/chatVerticalImobHandoff.ts` |
| PR6 — Este playbook | **parcial** — documental apenas | `docs/architecture/chat-vertical-imob-preflight-playbook.md` |

Nenhuma dessas etapas conecta runtime de chat, rota HTTP, `ChatAgentLauncher`,
Knowledge Search real, provider, criação de run/conversa/mensagem ou
entitlement/RBAC/policy em produção. Todo o caminho PR1–PR5 é uma cadeia de
funções puras, testadas isoladamente, protegidas por um gate arquitetural
estático (`scripts/checkArchChatContracts.ts`).

## 3. Sequência PR1 → PR5

```
PR1  contrato v2 + registry + shadow snapshot
  │  evaluateChatVerticalHandoffV2() / buildChatVerticalHandoffV2ShadowSnapshot()
  ▼
PR2  candidate resolver IMOB
  │  resolveChatVerticalImobCandidate() → status: not_applicable | candidate | clarification_needed | blocked
  ▼
PR3  confidence IMOB
  │  scoreChatVerticalImobConfidence() → level: high | medium | low  (consumido dentro do PR2)
  ▼
PR4  clarificação IMOB
  │  buildChatVerticalImobClarification(resolution) → clarification_ready | not_applicable
  ▼
PR5  handoff preflight IMOB
     resolveChatVerticalImobHandoffPreflight(input) → handoff_ready | not_applicable
```

PR3 não é uma etapa "depois" de PR2 em termos de dado — `chatVerticalImobConfidence.ts`
é importado e chamado *dentro* de `resolveChatVerticalImobCandidate()`
(`apps/api/src/resolvers/chatVerticalImobCandidateResolver.ts:147`). A ordem
acima é a ordem de **entrega dos PRs**, não a ordem de execução em runtime.

Em runtime, o fluxo de dados real é:

```
intent + confidenceSignals + registry + governance
        │
        ▼
resolveChatVerticalImobCandidate()  ── chama scoreChatVerticalImobConfidence() internamente
        │
        ├─ status "candidate" (confidence.level === "high")
        │        │
        │        ▼
        │  resolveChatVerticalImobHandoffPreflight({ kind: "candidate_resolution", resolution })
        │        → handoff_ready (source: "high_confidence")
        │
        ├─ status "clarification_needed" (confidence.level === "medium")
        │        │
        │        ▼
        │  buildChatVerticalImobClarification(resolution) → clarification_ready
        │        │
        │        ▼  (usuário responde "confirm_inventory_preview")
        │  resolveChatVerticalImobHandoffPreflight({ kind: "clarification_confirmation", clarification, reply })
        │        → handoff_ready (source: "clarification_confirmed")
        │
        └─ status "not_applicable" | "blocked" → nenhum handoff em nenhum caminho
```

## 4. Arquivos principais por etapa

| Peça | Arquivo | Símbolo principal |
|---|---|---|
| Contrato v2 | `apps/api/src/types/chatVerticalHandoffV2Contract.ts` | `chatVerticalHandoffV2Schema` (:115), `evaluateChatVerticalHandoffV2()` (:192), `verticalRegistryV1Schema` (:84), `VERTICAL_HANDOFF_REASON_CODES` (:19) |
| Shadow snapshot | `apps/api/src/types/chatVerticalHandoffV2ShadowSnapshot.ts` | `chatVerticalHandoffV2ShadowSnapshotSchema` (:15), `buildChatVerticalHandoffV2ShadowSnapshot()` (:63) |
| Candidate resolver IMOB | `apps/api/src/resolvers/chatVerticalImobCandidateResolver.ts` | `resolveChatVerticalImobCandidate()` (:144) |
| Confidence IMOB | `apps/api/src/resolvers/chatVerticalImobConfidence.ts` | `scoreChatVerticalImobConfidence()` (:58), `IMOB_CONFIDENCE_THRESHOLDS` (:1, high=80/medium=50) |
| Clarification IMOB | `apps/api/src/resolvers/chatVerticalImobClarification.ts` | `buildChatVerticalImobClarification()` (:52), `IMOB_CLARIFICATION_ALLOWED_REPLIES` (:5) |
| Handoff preflight IMOB | `apps/api/src/resolvers/chatVerticalImobHandoff.ts` | `resolveChatVerticalImobHandoffPreflight()` (:162), `chatVerticalImobHandoffPreflightPayloadSchema` (:18) |
| Schemas JSON | `contracts/chat/chat.vertical_handoff.v2.schema.json`, `contracts/chat/chat.vertical_handoff_shadow_snapshot.v1.schema.json`, `contracts/chat/vertical.registry.v1.schema.json`, `contracts/chat/vertical.reason_codes.v1.json` | — |
| Baselines/exemplos | `contracts/chat/chat.vertical_handoff.v2.baseline.json`, `contracts/chat/chat.vertical_handoff_shadow_snapshot.v1.baseline.json`, `contracts/chat/vertical.registry.v1.baseline.json`, `contracts/examples/chat.vertical_handoff.v2.example.json`, `contracts/examples/vertical.registry.v1.example.json` | — |
| Testes | `apps/api/src/tests/chat-vertical-handoff-snapshot.test.ts`, `apps/api/src/tests/chat-vertical-imob-candidate-resolver.test.ts`, `apps/api/src/tests/chat-vertical-imob-confidence.test.ts`, `apps/api/src/tests/chat-vertical-imob-clarification.test.ts`, `apps/api/src/tests/chat-vertical-imob-handoff.test.ts` | — |
| Gate arquitetural | `scripts/checkArchChatContracts.ts` | valida os 6 schemas acima, o catálogo de `reasonCode`, e escaneia `apps/api/src` + `apps/web/src` em busca de consumers/imports/tokens proibidos |
| Scripts npm | `package.json` | `check:arch-chat-contracts`, `test:chat-vertical-handoff-snapshot` |

## 5. Gates/checks obrigatórios

Sempre que qualquer peça desta cadeia (IMOB ou uma vertical futura) for
alterada, os seguintes checks devem passar antes de considerar a mudança
pronta para revisão:

```bash
pnpm check:arch-chat-contracts
pnpm test:chat-vertical-handoff-snapshot
pnpm check:chat-launcher-render-only
pnpm check:docs-link-integrity
pnpm check:evidence-index
git diff --check
```

`check:arch-chat-contracts` é o gate central desta arquitetura. Ele faz três
coisas, todas fail-closed (`scripts/checkArchChatContracts.ts`):

1. Valida forma/consistência dos 6 schemas JSON (`type: object`,
   `additionalProperties: false`, campos obrigatórios/opcionais presentes,
   `version.const` correto, baseline/exemplo consistentes com o schema) —
   `checkAdditionalProperties()`/loop principal (:233-360).
2. Valida que nenhum schema declara `prompt`, `response`, `rawDocument` ou
   `documentBody` como propriedade (`PROHIBITED_CONTENT_FIELDS`, :140;
   `checkProhibitedProperties()`, :271-290).
3. Escaneia todo `apps/api/src` + `apps/web/src` (exceto `tests/`, `types/`
   e `*.test.ts`) e falha se:
   - um módulo listado em `GUARDED_V2_PREFLIGHT_MODULES` (:144-148) importar
     algo fora do seu allowlist declarado em `ALLOWED_V2_PREFLIGHT_IMPORTS`
     (:149-163);
   - um módulo guardado contiver qualquer token de `PROHIBITED_V2_PREFLIGHT_RUNTIME_TOKENS`
     (:164-184) — `fetch(`, `process.env`, `node:fs`, `node:http(s)`,
     `prisma`, `redis`, `queue`, `provider`, `axios`, `knowledge.search`,
     `createRun`, `createConversation`, `createMessage`, `api/imob`,
     `.create(`/`.update(`/`.delete(`;
   - qualquer arquivo **fora** de `ALLOWED_V2_PREFLIGHT_CONSUMERS` (:141-143
     — hoje só `chatVerticalImobCandidateResolver.ts`) contiver as strings
     `"chat.vertical_handoff.v2"`, `"chatVerticalHandoffV2Contract"` ou
     `"chatVerticalHandoffV2ShadowSnapshot"` (:450-457).

`test:chat-vertical-handoff-snapshot` (`package.json`) roda em sequência os
cinco arquivos de teste da cadeia IMOB no mesmo processo `node --test`,
garantindo que uma alteração em qualquer etapa não quebre as etapas
anteriores nem posteriores.

## 6. Checklist para replicar em nova vertical

Antes de abrir qualquer PR de resolver/scorer/clarifier/handoff para uma
vertical nova (LEGAL, MKT, BPO Financeiro, LOG ou outra), confirmar item a
item:

- [ ] `VerticalId` canônico já existe em `KNOWN_VERTICAL_IDS`
      (`apps/api/src/types/chatVerticalHandoffV2Contract.ts:3-11`) ou segue o
      padrão `custom:${string}` validado por `customVerticalIdPattern` (:40).
- [ ] A capability da nova vertical está registrada em uma instância válida
      de `verticalRegistryV1Schema` (:84), com `id` único e `allowedModes`
      não vazio.
- [ ] O `mode` da capability usado no preflight é `read_only` — nenhum outro
      modo é elegível a preflight (ver [Critérios fail-closed](#critérios-fail-closed)).
- [ ] O `outcome` usado no preflight é `preview_only` — `allowed` nunca é
      elegível a preflight.
- [ ] O `reasonCode` usado é um dos valores canônicos de
      `VERTICAL_HANDOFF_REASON_CODES` (:19-32) e está sincronizado com
      `contracts/chat/vertical.reason_codes.v1.json` (o gate
      `check:arch-chat-contracts` falha se divergirem, :394-419).
- [ ] Existe um scorer determinístico próprio da vertical (equivalente a
      `scoreChatVerticalImobConfidence()`), com thresholds explícitos e
      `sideEffects: 0` em todo retorno.
- [ ] Existe um clarifier determinístico próprio da vertical (equivalente a
      `buildChatVerticalImobClarification()`), com `allowedReplies` fechado
      (tupla, não array livre) e `defaultReply` dentro de `allowedReplies`.
- [ ] Existe um handoff preflight próprio da vertical (equivalente a
      `resolveChatVerticalImobHandoffPreflight()`), aceitando `unknown` na
      entrada e validando estruturalmente — nunca confiando em tipos
      estáticos de um resultado que pode ter sido montado por terceiros.
- [ ] O payload público do preflight não contém PII, `tenantId`,
      `workspaceId`, `governance`, `refs`, `prompt`, `response`,
      `rawDocument` nem `documentBody` (ver seção 8).
- [ ] `sideEffects: 0` em **todo** ramo de retorno do scorer, do clarifier e
      do handoff — inclusive nos ramos de erro/`not_applicable`.
- [ ] Toda inconsistência estrutural (campo ausente, valor fora do enum,
      `level`/`score`/`mode`/`outcome` incoerentes entre si) resulta em
      `not_applicable`/bloqueio — nunca em exceção não tratada nem em
      aprovação otimista.
- [ ] Existem testes positivos (caminho feliz: high confidence, clarificação
      confirmada) **e** negativos (medium sem reply, replies não-confirm,
      low/non-vertical/blocked, metadata que tenta se passar por
      autorização, inputs malformados/nulos) — seguindo o padrão de
      `chat-vertical-imob-handoff.test.ts`.
- [ ] O novo módulo de handoff foi adicionado a `GUARDED_V2_PREFLIGHT_MODULES`
      e a `ALLOWED_V2_PREFLIGHT_IMPORTS` em
      `scripts/checkArchChatContracts.ts` — **nunca** a
      `ALLOWED_V2_PREFLIGHT_CONSUMERS` (esse conjunto é reservado ao
      candidate resolver original, salvo decisão explícita em contrário) —
      e `pnpm check:arch-chat-contracts` passa antes do PR ser considerado
      pronto.

## 7. Critérios fail-closed

Estes critérios já estão implementados na cadeia IMOB e são obrigatórios
para qualquer réplica:

- Ausência de campo obrigatório, tipo incorreto ou enum fora do catálogo
  → `not_applicable`/`blocked`, nunca exceção nem aprovação por omissão
  (`chatVerticalImobHandoff.ts:96-131`, `chatVerticalHandoffV2Contract.ts:192-296`).
- `governance.registry.decision`, `governance.rbac.decision`,
  `governance.entitlement.decision` ou `governance.policy.decision` iguais
  a `"not_evaluated"` → bloqueado com `VERTICAL_GOVERNANCE_NOT_EVALUATED`
  (`chatVerticalHandoffV2Contract.ts:248-255`).
- `capability.mode === "critical_action"` sem `governance.hitl.status ===
  "approved"` → bloqueado com `VERTICAL_HITL_REQUIRED`
  (`chatVerticalHandoffV2Contract.ts:281-283`).
- `presentation.source === "fixture"` exige `capability.mode === "read_only"`
  e `outcome === "preview_only"`; `presentation.source === "shadow"` proíbe
  `outcome === "allowed"` (`chatVerticalHandoffV2Contract.ts:269-280`).
- Confidence `score` incoerente com `level` declarado (ex.: `level: "high"`
  com `score` abaixo do threshold) → `not_applicable` no handoff preflight
  (`chatVerticalImobHandoff.ts:105-114`).
- `resolution.candidate.outcome === "allowed"` ou
  `resolution.candidate.capability.mode !== "read_only"` → `not_applicable`
  no handoff preflight, mesmo com `confidence.level === "high"`
  (`chatVerticalImobHandoff.ts:79-93`, coberto pelo teste "inconsistent
  high-confidence resolution fails closed" em
  `chat-vertical-imob-handoff.test.ts`).

## 8. Critérios de payload público/redigido

Todo payload retornado ao chat (clarificação ou handoff preflight) é uma
**projeção pública mínima** — nunca o objeto interno de governança completo:

- `buildChatVerticalImobClarification()` retorna apenas `{ kind, verticalId,
  capabilityId, reason, questionKey, allowedReplies, defaultReply,
  sideEffects }` (`chatVerticalImobClarification.ts:11-26`) — sem
  `tenantId`, `workspaceId`, `governance` ou `refs`.
- `resolveChatVerticalImobHandoffPreflight()` retorna apenas `{ kind,
  verticalId, capabilityId, handoffIntentKey, source, allowedNextActions,
  defaultNextAction, sideEffects }` (`chatVerticalImobHandoff.ts:18-33`) —
  mesma garantia.
- Ambos os schemas Zod usam `.strict()`, então **qualquer** campo extra
  injetado (`tenantId`, por exemplo) faz o `safeParse()` falhar — validado
  explicitamente nos testes ("public payload excludes tenant, workspace,
  governance, refs and sensitive content" em ambos os arquivos de teste).
- `PROHIBITED_CONTENT_FIELDS` no gate arquitetural (`prompt`, `response`,
  `rawDocument`, `documentBody`) garante que nenhum schema JSON desta
  família jamais declare esses campos (`checkArchChatContracts.ts:140,
  271-290`).
- Nenhum dos dois payloads contém PII — eles carregam apenas identificadores
  de vertical/capability/intent e enums de próxima ação, nunca dado de
  domínio (nome, documento, endereço, valor de imóvel etc.).

## 9. Anti-patterns proibidos

Qualquer um dos itens abaixo, se encontrado em código novo desta família,
deve bloquear o PR:

- Metadata (`selectedVertical`, `routeIntent`, `label` ou similar) sendo
  usada para autorizar vertical/capability — só `intent.verticalId`
  estrutural conta (coberto por
  `chatVerticalImobCandidateResolver.ts:153`, testado em "PR5: selectedVertical,
  routeIntent and label metadata cannot authorize a handoff").
- `label` definindo identidade em vez de `verticalId` (testado em "PR4:
  label cannot define clarification identity").
- Redirect automático real (nenhuma rota/URL operacional é produzida por
  nenhum destes módulos).
- Knowledge Search real conectada a qualquer resolver/clarifier/handoff
  desta cadeia.
- Chamada a `provider`, criação de `run`, `conversation` ou `message`
  operacional dentro de um módulo guardado — bloqueado estaticamente por
  `PROHIBITED_V2_PREFLIGHT_RUNTIME_TOKENS`
  (`checkArchChatContracts.ts:164-184`).
- `outcome: "allowed"` sendo aceito por um handoff preflight — preflight só
  aceita `outcome: "preview_only"`.
- `capability.mode: "critical_action"` (ou `"requires_write"`) sendo aceito
  por um handoff preflight.
- Qualquer lógica cognitiva nova (regra de resposta, handoff, fallback,
  bloqueio, clarificação, quick reply) escrita diretamente em
  `ChatAgentLauncher.tsx` — regra permanente de
  `docs/architecture/agent-chat-runtime.md` e `AGENTS.md`, reforçada aqui
  porque esta cadeia inteira existe no backend precisamente para não
  precisar tocar o launcher.
- Abrir resolver/scorer/clarifier/handoff de uma vertical nova antes deste
  playbook (ou uma revisão dele) estar lido e o checklist da seção 6 estar
  seguido.
- Entrada no Evidence Index apontando para arquivo inexistente ou para
  evidência não gerada por execução real.
- Declarar qualquer PR desta família como `DONE`/operacionalmente fechado
  sem evidência indexável real.

## 10. DoD por etapa

| Etapa | DoD |
|---|---|
| Contrato v2 + registry + shadow snapshot | Schemas Zod `.strict()`; `evaluateChatVerticalHandoffV2()` cobre todos os `reasonCode` de bloqueio canônicos; JSON Schemas correspondentes existem em `contracts/chat/` com baseline/exemplo consistentes; `check:arch-chat-contracts` passa. |
| Candidate resolver | Cobre os 4 status (`not_applicable`, `candidate`, `clarification_needed`, `blocked`); nunca lança exceção para input malformado; `sideEffects: 0` em todo ramo; testes cobrem alta/média/baixa confiança e bloqueio por governança. |
| Confidence | Scorer puro, sem I/O; thresholds explícitos e nomeados (não mágicos); `classifyImobConfidenceScore()` e o scorer principal têm teste unitário direto; `sideEffects: 0`. |
| Clarification | Payload com `allowedReplies` fechado (tupla) e `defaultReply` dentro do conjunto; só produz `clarification_ready` para `status: "clarification_needed"` com `confidence.level === "medium"` consistente; testes cobrem alta/baixa confiança (sem clarificação), bloqueado (sem clarificação), inconsistências (fail-closed) e ausência de dado sensível no payload. |
| Handoff preflight | Só produz `handoff_ready` para (a) `status: "candidate"` com `confidence.level === "high"` e forma elegível (`read_only`/`preview_only`), ou (b) clarificação confirmada com a reply canônica de confirmação; testes cobrem os dois caminhos, as replies não-confirmatórias, metadata que tenta autorizar, inconsistências em ambos os caminhos e payload sem dado sensível; módulo registrado como *guarded* (não *consumer*) em `checkArchChatContracts.ts`. |
| Playbook (esta etapa) | Documento existe, referencia arquivo:linha real (não hipotético), checklist de replicação está completo, `check:docs-link-integrity` e `check:evidence-index` passam, nenhuma alteração de escopo proibido foi feita. |

## 11. Limites explícitos de escopo

Este playbook, e o PR6 que o introduz, **não fazem**:

- Não iniciam a vertical `LEGAL`.
- Não iniciam `MKT`, `BPO Financeiro`, `LOG` ou qualquer vertical custom.
- Não criam resolver/scorer/clarifier/handoff para nenhuma vertical nova.
- Não alteram frontend nem `ChatAgentLauncher`.
- Não criam redirect real, não conectam Knowledge Search real, não chamam
  API IMOB real.
- Não criam conversa/mensagem operacional, não acionam provider, não criam
  run, não executam write funcional.
- Não alteram runtime de chat, rotas HTTP, nem entitlement/RBAC/policy em
  produção.
- Não declaram paridade operacional entre a cadeia PR1–PR5 e um fluxo de
  produção real.
- Não declaram este PR, nem PR1–PR5, como `DONE` ou operacionalmente
  fechados — o `Status do Roadmap` para Track P / IMOB permanece o que está
  registrado em `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`, que este
  documento não altera.

## 12. Invariantes de arquitetura (referência rápida)

- Contracts-first: nenhum código de resolver/scorer/clarifier/handoff nasce
  antes do schema Zod correspondente existir e validar.
- Schema-driven: todo payload público é produzido via `safeParse()` de um
  schema `.strict()`, nunca montado como objeto literal sem validação.
- Fail-closed: qualquer ambiguidade, inconsistência ou dado ausente resulta
  em bloqueio/`not_applicable`, nunca em aprovação otimista.
- `sideEffects: 0` é obrigatório em todo retorno de todo módulo de
  preflight — este é o sinal explícito de que nenhuma escrita ocorreu.
- Metadata não autoriza; `label` não define identidade — só campos
  estruturais canônicos (`verticalId`, `capabilityId`) contam.
- `VerticalId` precisa ser canônico/registrado (`KNOWN_VERTICAL_IDS` ou
  padrão `custom:`); capability precisa estar registrada no
  `vertical.registry.v1`; `mode` precisa estar em `allowedModes` da
  capability.
- `outcome: "allowed"` e `capability.mode: "critical_action"` são proibidos
  em qualquer preflight — preflight é, por definição, pré-execução.
- Execução crítica futura (fora do escopo deste playbook) exigirá a cadeia
  `run -> bundle/receipt -> ledger` e `txId` quando a política exigir,
  seguindo os contratos já existentes em `packages/core/src/services/sclLedger.ts`
  e `apps/api/src/services/receiptCanonService.ts` — este playbook não
  implementa isso, apenas registra a exigência para quando essa fase for
  aberta por decisão explícita.
- Operação sensível futura exigirá `tenantId`/`workspaceId`/`scope`, RBAC,
  entitlement, policy e HITL quando aplicável — os mesmos campos já
  presentes em `governance` no contrato v2 (`chatVerticalHandoffV2Contract.ts:146-165`),
  hoje usados apenas para avaliação read-only/preview.

## 13. `chat.vertical_handoff.v1` — physical read-only producer (PR8J)

> Este item resolve o achado de auditoria P2: `buildChatVerticalHandoffSnapshot`
> existe e é testado, mas não tinha nenhum guardrail estático que impedisse
> um call site runtime silencioso. Este é um item **documental +
> guardrail estático**, não um item de wiring. Nenhuma rota, resolver ou
> componente foi conectado a este producer nesta etapa.

`chat.vertical_handoff.v1` é uma família **separada** de `chat.vertical_handoff.v2`
(seções 1–12 deste playbook). Não compartilham schema, versão, nem cadeia de
execução. Não confundir as duas ao consultar este documento.

### 13.1 Classificação explícita

`chat.vertical_handoff.v1` é:

- **physical read-only producer** — `buildChatVerticalHandoffSnapshot()`
  (`apps/api/src/services/chatVerticalHandoffSnapshot.ts:221`) é uma função
  pura: recebe um input, não faz I/O, não escreve em nenhum lugar, não chama
  rede/DB/fila/provider. `validateChatVerticalHandoffSnapshotAgainstSchema()`
  (`:215`) apenas lê o schema físico do disco e valida estruturalmente.
- **schema-validated** — todo snapshot `ok: true` é validado contra o schema
  físico `contracts/chat/chat.vertical_handoff.v1.schema.json` antes de ser
  retornado (`:283-293`); o schema também é validado estruturalmente pelo
  gate `check:arch-chat-contracts` (`scripts/checkArchChatContracts.ts:22-49`
  — forma do schema, `required`/`optional` fields, `additionalProperties:
  false`, `version.const`).
- **`sideEffects=0`** — todo ramo de retorno, sucesso ou falha, declara
  `sideEffects: 0` explicitamente (`chatVerticalHandoffSnapshot.ts:70,77,231,
  242,290,299`); confirmado pelo teste "producer is read-only and exposes
  zero side effects without external/mutational calls"
  (`apps/api/src/tests/chat-vertical-handoff-snapshot.test.ts:146-159`).
- **fail-closed em input ausente** — `tenantId`, `workspaceId`, `scope`,
  `userId`, `verticalId`, `intentId`, `handoffMessage`, `reasonCode`,
  `riskLevel` são obrigatórios; ausência de qualquer um retorna `ok: false`
  com `reasonCode` dedicado (`CHAT_VERTICAL_HANDOFF_*_REQUIRED`,
  `chatVerticalHandoffSnapshot.ts:83-93,224-234`); `riskLevel: "critical"`
  sem `hitlRequired: true` também falha fechado (`:236-244`).
- **not runtime-enforced unless/until a live route/resolver call site
  exists** — `grep -rn "buildChatVerticalHandoffSnapshot"` no repositório
  inteiro (exceto `node_modules`/`dist`) retorna apenas a própria declaração
  em `chatVerticalHandoffSnapshot.ts:221` e o arquivo de teste
  `apps/api/src/tests/chat-vertical-handoff-snapshot.test.ts`. Nenhuma rota
  (`apps/api/src/routes/**`), nenhum resolver (`apps/api/src/resolvers/**`)
  e nenhum outro serviço importa ou chama este producer. Não há endpoint
  HTTP, montado ou não, que o exponha.

### 13.2 Eco estrutural no frontend — não é wiring

Existe hoje uma superfície de apresentação e uma fixture estática que
**reproduzem a forma** do snapshot v1 por convenção de tipo, sem importar ou
chamar o producer:

- `apps/web/src/components/chat/ChatVerticalHandoffSurface.tsx` — componente
  React puro (`ChatVerticalHandoffSurface({ snapshot })`), redeclara
  localmente o tipo `ChatVerticalHandoffSurfaceSnapshot` (não importa nada
  de `chatVerticalHandoffSnapshot.ts`); apenas renderiza um `snapshot` já
  recebido via prop.
- `apps/web/src/features/imob/imobPilot2FixturePreview.ts` — objeto literal
  estático (`imobPilot2FixturePreview`), com `status:
  "fixture_only_not_executed"`, `dataPolicy.syntheticOnly: true`, e
  `reasonCodes` incluindo explicitamente `NO_SHADOW_DRY_RUN_EXECUTION`,
  `NO_PILOT_SMALL_ROLLOUT_EXECUTION`, `NO_DB_LEDGER_AUDIT_WRITE`,
  `NO_RECEIPT_BUNDLE_PROOF_GENERATION`, `NO_PROVIDER_EXTERNAL_CALL`,
  `NO_MUTATION_EXTERNAL_SIDE_EFFECT`. O campo `handoffSnapshot` desse objeto
  usa o literal `version: "chat.vertical_handoff.v1"` apenas porque o tipo
  `ChatVerticalHandoffSurfaceSnapshot` o exige estruturalmente — não porque
  o producer foi chamado.
- `apps/web/src/components/chat/FrontDoorImobFixturePreviewPanel.tsx`
  renderiza essa fixture estática via `<ChatVerticalHandoffSurface
  snapshot={preview.handoffSnapshot} />`, atrás de um gate de query params
  bem específico (`shouldRenderImobPilot2FixturePreview`).
- `apps/api/src/services/chatGateProofAdapters.ts:94` declara
  `"chat.vertical_handoff.v1"` apenas como um valor possível do union type
  `ProofReceiptBundleSource` — um adapter read-only e presentacional (ver
  seção de auditoria P2 anterior) que recebe estado já resolvido como
  input, não o produz.

Nenhum desses quatro arquivos importa `chatVerticalHandoffSnapshot.ts`, chama
`buildChatVerticalHandoffSnapshot()` ou `validateChatVerticalHandoffSnapshotAgainstSchema()`,
nem valida contra o schema físico. É reuso de forma (shape), não reuso do
producer nem enforcement de runtime. Por isso o guardrail da seção 13.3
verifica os identificadores reais do producer (`chatVerticalHandoffSnapshot`,
`buildChatVerticalHandoffSnapshot`, `validateChatVerticalHandoffSnapshotAgainstSchema`),
não a string de versão isolada — do contrário, esses quatro arquivos
legítimos e pré-existentes seriam falsos positivos.

### 13.3 Guardrail estático (novo, PR8J)

`scripts/checkArchChatContracts.ts` ganhou um guard analogous ao já existente
para v2 (`ALLOWED_V2_PREFLIGHT_CONSUMERS`), mas para v1:

```ts
const ALLOWED_V1_HANDOFF_SNAPSHOT_FILES = new Set([
  path.normalize("apps/api/src/services/chatVerticalHandoffSnapshot.ts"),
]);
```

Qualquer arquivo em `apps/api/src/**` ou `apps/web/src/**` (fora de
`tests/`, `types/` e `*.test.ts`) que referencie `chatVerticalHandoffSnapshot`,
`buildChatVerticalHandoffSnapshot` ou `validateChatVerticalHandoffSnapshotAgainstSchema`
sem estar nesse allowlist falha o check com
`chat_vertical_handoff_v1_runtime_call_site_requires_explicit_decision`.

Isso significa que o item "not runtime-enforced unless/until a live
route/resolver call site exists" deixa de ser apenas uma afirmação
documental: **`pnpm check:arch-chat-contracts` falha em CI** no momento em
que qualquer PR futuro importar o producer fora deste arquivo, forçando uma
decisão explícita (atualizar o allowlist) em vez de permitir wiring por
drift silencioso.

### 13.4 O que este item NÃO faz

- Não conecta `buildChatVerticalHandoffSnapshot()` a nenhuma rota HTTP,
  resolver ou componente.
- Não altera `ChatAgentLauncher.tsx`, runtime shadow, provider, `createRun`,
  write path, Receipt/Ledger, economy ou LEGAL.
- Não declara `chat.vertical_handoff.v1` como operacionalmente pronto,
  `DONE` ou runtime-enforced.
- Não move nem substitui a cadeia v2 (seções 1–12) — v2 permanece a única
  cadeia de handoff vertical IMOB efetivamente em uso pelos resolvers
  guardados (`chatVerticalImobRuntimeShadow*`), e permanece, ela mesma, sem
  runtime HTTP montado por padrão fora da flag
  `EIAH_CHAT_IMOB_RUNTIME_SHADOW_ROUTE_ENABLED`.
- Não decide se/quando `chat.vertical_handoff.v1` deve ganhar um call site
  real — essa decisão permanece em aberto, exigindo autorização explícita
  futura, exatamente como o achado de auditoria original pedia.
