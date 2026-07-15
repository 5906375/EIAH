# F2.4 — ChannelBinding + Replay Guard Canonicalization — 2026-07-15

## Resumo executivo

F2.4 canoniza as duas responsabilidades que estavam inline no handler read-only do webhook WhatsApp: `ChannelBinding` e `Replay Guard`. A rota `apps/api/src/routes/whatsapp.ts` agora delega a decisão de binding para `apps/api/src/services/channelBinding.ts` e a decisão de replay/duplicidade para `apps/api/src/services/replayGuard.ts`, preservando o comportamento HTTP, os `reasonCodes`, o fail-closed, o masking de PII e o modo estritamente read-only. Foram adicionados testes unitários focados para as duas superfícies canônicas e ambos foram registrados na suíte canônica para não gerar orphan tests.

## Pré-condição de CI F2.3/F2.3a

Pré-condição confirmada antes de qualquer diff:

- `main` em `3dad38b` (`Merge pull request #279 from 5906375/feat/f2-3-whatsapp-read-only-handler`)
- F2.3/F2.3a já mergeadas em `main`
- Workflows pós-merge do commit correspondente consultados via API GitHub:
  - `CI Monorepo`
    - Run ID: `29438213716`
    - Status: `completed`
    - Conclusion: `success`
    - URL: `https://github.com/5906375/EIAH/actions/runs/29438213716`
  - `IMOB Worker Mutation E2E`
    - Run ID: `29438213655`
    - Status: `completed`
    - Conclusion: `success`
    - URL: `https://github.com/5906375/EIAH/actions/runs/29438213655`

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `apps/api/src/routes/whatsapp.ts`
- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
- `scripts/unit-tests-manifest.txt`
- `package.json`
- `scripts/checkOrphanTests.ts`
- `ops/evidence/latest/f2-03-whatsapp-adapter-read-only-handler-controlled-implementation-2026-07-15.md`
- `ops/evidence/latest/f2-03a-whatsapp-read-only-handler-orphan-test-registration-2026-07-15.md`

## Problema resolvido

O handler F2.3 já estava tecnicamente correto para read-only controlado, mas concentrava no mesmo arquivo:

- parsing/decisão de binding `phoneHash -> tenant/workspace/scope/entitlement`
- replay/duplicidade via `Map` em memória

Isso dificultava:

- teste unitário isolado dessas decisões;
- reaproveitamento mínimo em futuras etapas read-only;
- inspeção explícita das decisões fail-closed.

## Arquitetura antes

Antes da F2.4, `apps/api/src/routes/whatsapp.ts` continha:

- parse do JSON `WHATSAPP_READ_ONLY_BINDINGS_JSON`
- resolução inline do binding
- guards de replay/duplicidade inline
- limpeza inline das janelas temporais

O handler já funcionava, mas a superfície canônica dessas duas decisões ainda não existia.

## Arquitetura depois

Depois da F2.4:

- `apps/api/src/services/channelBinding.ts`
  - parseia bindings governados
  - resolve a decisão canônica de binding
- `apps/api/src/services/replayGuard.ts`
  - mantém store local de replay/evento
  - resolve a decisão canônica de replay/duplicidade
- `apps/api/src/routes/whatsapp.ts`
  - continua validando headers, payload, assinatura e read-only
  - delega binding e replay para os serviços acima

## ChannelBinding canônico

Serviço criado: `apps/api/src/services/channelBinding.ts`

Decisão exposta:

- `allowed: true | false`
- `tenantId`
- `workspaceId`
- `scope`
- `entitlement`
- `reasonCode` quando negado

Comportamentos preservados:

- `WHATSAPP_PHONE_NOT_BOUND`
- `TENANT_NOT_RESOLVED`
- `WORKSPACE_NOT_RESOLVED`
- `SESSION_EXPIRED`
- `ENTITLEMENT_REQUIRED`

O serviço continua usando apenas configuração governada (`WHATSAPP_READ_ONLY_BINDINGS_JSON`) e não cria persistência nova nem provider real.

## Replay Guard canônico

Serviço criado: `apps/api/src/services/replayGuard.ts`

Decisão exposta:

- `accepted`
- `duplicate`
- `replay`
- `reasonCode`

Comportamentos preservados:

- `WHATSAPP_REPLAY_DETECTED`
- `WHATSAPP_EVENT_DUPLICATE`

O store continua local/em memória de processo, por design controlado desta etapa, sem persistência distribuída e sem side effects externos.

## Read-only enforcement

F2.4 não altera a natureza do endpoint:

- continua `POST /api/webhooks/whatsapp/inbound`
- continua aceitando apenas `readOnly=true`
- continua bloqueando ações críticas (`lead.create`, `lead.discard`, `create`, `update`, `delete`, `publish`, `settle`, `approve`, `mutate`)
- continua sem provider real, sem mutações, sem criação/descarte de lead e sem chamada externa

## Fail-closed

O handler continua falhando fechado para:

- assinatura ausente/inválida
- timestamp ausente/fora da janela
- payload inválido
- `eventId` ausente
- provider não suportado
- `messageType` não suportado
- phone sem binding
- tenant/workspace não resolvidos
- entitlement ausente
- sessão expirada
- replay
- duplicidade
- ação crítica

## PII masking

- nenhum telefone bruto foi introduzido
- o binding continua resolvido por `fromPhoneHash`
- a resposta de sucesso continua expondo apenas `fromPhoneMasked` rebaixado pelo handler
- a evidência não inclui payload bruto nem segredos

## Testes adicionados/ajustados

Novos testes:

- `apps/api/src/tests/channel-binding.test.ts`
- `apps/api/src/tests/replay-guard.test.ts`

Teste mantido:

- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`

Cobertura nova:

- binding válido canônico
- phone sem binding
- sessão expirada
- entitlement incompleto
- primeira aceitação no replay guard
- replay por mesma `replayKey`
- duplicidade por mesmo `eventKey` com `replayKey` diferente
- pruning da janela temporal

## Orphan test compliance

Os dois testes novos foram registrados no mecanismo canônico:

- `scripts/unit-tests-manifest.txt`
- `package.json` -> `test:ci-unit-suite`

Resultado:

- `pnpm check:orphan-tests` passou
- nenhuma allowlist foi ampliada
- `scripts/checkOrphanTests.ts` permaneceu intocado
- o gate não foi enfraquecido

## Checks executados

Comandos executados:

```bash
node --import tsx --test apps/api/src/tests/channel-binding.test.ts
node --import tsx --test apps/api/src/tests/replay-guard.test.ts
node --import tsx --test apps/api/src/tests/whatsapp.webhook-read-only.test.ts
pnpm check:orphan-tests
pnpm check:evidence-index
pnpm check:docs-link-integrity
git diff --check
git diff -- .github/workflows release.yml apps packages scripts
```

Saída real resumida:

- `apps/api/src/tests/channel-binding.test.ts`
  - `pass 1`
  - `fail 0`
- `apps/api/src/tests/replay-guard.test.ts`
  - `pass 1`
  - `fail 0`
- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
  - `pass 1`
  - `fail 0`
- `pnpm check:orphan-tests`
  - `ok: true`
  - `orphanCount: 50`
  - `allowlistedOrphanCount: 50`
  - `blockingOrphanCount: 0`
- `pnpm check:evidence-index`
  - `ok: true`
  - `refsChecked: 527`
- `pnpm check:docs-link-integrity`
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`
  - sem saída
- `git diff -- .github/workflows release.yml apps packages scripts`
  - diffs apenas em `apps/api/src/routes/whatsapp.ts` e `scripts/unit-tests-manifest.txt`
  - sem diff em `.github/workflows/**`
  - sem diff em `release.yml`
  - sem diff em `packages/**`

## Prova de isolamento

Alterações desta etapa restritas a:

- `apps/api/src/routes/whatsapp.ts`
- `apps/api/src/services/channelBinding.ts`
- `apps/api/src/services/replayGuard.ts`
- `apps/api/src/tests/channel-binding.test.ts`
- `apps/api/src/tests/replay-guard.test.ts`
- `scripts/unit-tests-manifest.txt`
- `package.json`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f2-04-channelbinding-replay-guard-canonicalization-2026-07-15.md`

Sem alteração em:

- `.github/workflows/**`
- `release.yml`
- `ChatAgentLauncher`
- runtime/engine
- provider real
- secrets produtivos
- side effects externos

## Riscos residuais

- replay guard continua local/em memória, não distribuído
- binding continua vindo de JSON governado, não de storage canônico persistente
- assinatura continua stub/local
- WhatsApp continua não operacional e sem provider integrado

## Próximos passos

- eventual etapa futura pode trocar o source de binding por storage canônico governado, sem alterar semântica
- eventual etapa futura pode trocar replay guard local por store persistente/distribuído, ainda fail-closed
- qualquer avanço para mutação ou provider real deve ficar em PR separado

## Status final

Status: parcial/evidenciado
