# F2.6 — Read-Only Adapter Observability / Evidence Bundle — 2026-07-15

## Resumo executivo

F2.6 adiciona um `evidenceBundle` explícito e sanitizado ao fluxo read-only do adapter WhatsApp. O bundle é construído por helper dedicado em `apps/api/src/services/whatsappEvidenceBundle.ts` e acompanha tanto decisões aceitas quanto bloqueadas, preservando `reasonCode`, `httpStatus`, `eventId`, `provider`, `messageType`, `tenantId`, `workspaceId`, `scope`, classificação da decisão e `sideEffects: 0`. A etapa mantém o comportamento read-only, não introduz side effects, não expõe PII bruta, não toca workflow/package/manifest e preserva `ChannelBinding`, `Replay Guard` e todos os `reasonCodes` existentes.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `apps/api/src/routes/whatsapp.ts`
- `apps/api/src/services/channelBinding.ts`
- `apps/api/src/services/replayGuard.ts`
- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
- `apps/api/src/tests/channel-binding.test.ts`
- `apps/api/src/tests/replay-guard.test.ts`
- `scripts/unit-tests-manifest.txt`
- `package.json`
- `scripts/checkOrphanTests.ts`
- `ops/evidence/latest/f2-05-read-only-adapter-operational-hardening-negative-e2e-matrix-2026-07-15.md`

## Pré-condição F2.5 mergeada

Confirmada antes de qualquer diff:

- `main` em `c65707e` (`Merge pull request #281 from 5906375/test/f2-5-read-only-adapter-negative-e2e-matrix`)
- `CI Monorepo`
  - Run ID: `29441066107`
  - Status: `completed`
  - Conclusion: `success`
  - URL: `https://github.com/5906375/EIAH/actions/runs/29441066107`
- `IMOB Worker Mutation E2E`
  - Run ID: `29441066070`
  - Status: `completed`
  - Conclusion: `success`
  - URL: `https://github.com/5906375/EIAH/actions/runs/29441066070`

## Problema resolvido

F2.5 já endurecia a superfície read-only com matriz negativa mais completa, mas a resposta do adapter ainda não materializava um pacote observável mínimo e uniforme para aceitação/bloqueio. Faltava um bundle pequeno, sanitizado e testável para registrar:

- `reasonCode`
- `httpStatus`
- `eventId`
- `provider`
- `messageType`
- `tenantId`
- `workspaceId`
- `scope`
- classificação explícita da decisão
- `sideEffects: 0`

sem incluir telefone bruto, `phoneHash`, payload sensível, assinatura completa, header sensível, token ou secret.

## Causa raiz

O handler `apps/api/src/routes/whatsapp.ts` retornava dados úteis, mas a observabilidade estava espalhada entre:

- `reasonCode` top-level no caso aceito
- `error.code` no caso bloqueado
- `data` parcial apenas no sucesso

Isso dificultava uma leitura canônica e consistente do que foi decidido pelo adapter sem reprocessar o corpo completo.

## Correção aplicada

Arquivos alterados/criados:

- `apps/api/src/services/whatsappEvidenceBundle.ts`
- `apps/api/src/routes/whatsapp.ts`
- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f2-06-read-only-adapter-observability-evidence-bundle-2026-07-15.md`

Implementação:

- novo helper `buildWhatsappEvidenceBundle(...)` centraliza a construção do bundle sanitizado;
- o helper normaliza apenas campos textuais permitidos e rebaixa ausências para `null`;
- o handler passou a anexar `evidenceBundle` em:
  - falhas de validação/header/signature;
  - falhas de binding/entitlement/scope;
  - replay/duplicidade;
  - aceitação `202 ACCEPTED_READ_ONLY`;
- o contrato existente foi preservado de forma aditiva:
  - `ok`, `reasonCode`, `error.code` e `data` continuam presentes;
  - o bundle apenas acrescenta observabilidade consistente.

## Bundle evidenciado

Shape efetivo do bundle:

```json
{
  "reasonCode": "ACCEPTED_READ_ONLY",
  "httpStatus": 202,
  "eventId": "evt-whatsapp-valid",
  "provider": "whatsapp",
  "messageType": "text",
  "tenantId": "tenant-imob-read-only",
  "workspaceId": "workspace-imob-read-only",
  "scope": "whatsapp:inbound:read_only",
  "decisionClass": "accepted_read_only",
  "sideEffects": 0
}
```

Garantias mantidas:

- nenhum telefone bruto no bundle;
- nenhum `fromPhoneHash` no bundle;
- nenhuma assinatura/header sensível no bundle;
- nenhum token/secret no bundle;
- nenhuma carga bruta do provider no bundle.

## Testes ajustados

O teste existente `apps/api/src/tests/whatsapp.webhook-read-only.test.ts` passou a provar:

- bundle completo no caso aceito;
- bundle completo no caso de assinatura inválida;
- bundle completo no caso de `TENANT_NOT_RESOLVED`;
- ausência de PII, `phoneHash`, secret e nome de header sensível na serialização final.

Nenhum arquivo de teste novo foi criado. Consequências:

- `scripts/unit-tests-manifest.txt` permaneceu intocado;
- `package.json` permaneceu intocado;
- `check:orphan-tests` continuou verde sem ampliar allowlist.

## Por que o comportamento read-only foi preservado

- `sideEffects: 0` é explícito em todos os bundles;
- nenhuma mutação foi habilitada;
- `ChannelBinding` e `Replay Guard` continuam como fontes canônicas de decisão;
- `reasonCodes` existentes foram reutilizados, não substituídos;
- o handler continua bloqueando ação crítica, replay, duplicidade, entitlement e `readOnly=false`.

## Checks executados

Comandos executados:

```bash
pnpm check:orphan-tests
node --import tsx --test apps/api/src/tests/whatsapp.webhook-read-only.test.ts
node --import tsx --test apps/api/src/tests/channel-binding.test.ts
node --import tsx --test apps/api/src/tests/replay-guard.test.ts
pnpm check:evidence-index
pnpm check:docs-link-integrity
git diff --check
git diff -- .github/workflows release.yml apps packages scripts
```

Saída real resumida:

- `pnpm check:orphan-tests`
  - `ok: true`
  - `orphanCount: 50`
  - `allowlistedOrphanCount: 50`
  - `blockingOrphanCount: 0`
- `node --import tsx --test apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
  - `pass 1`
  - `fail 0`
- `node --import tsx --test apps/api/src/tests/channel-binding.test.ts`
  - `pass 1`
  - `fail 0`
- `node --import tsx --test apps/api/src/tests/replay-guard.test.ts`
  - `pass 1`
  - `fail 0`
- `pnpm check:evidence-index`
  - `ok: true`
  - `refsChecked: 529`
- `pnpm check:docs-link-integrity`
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`
  - sem saída
- `git diff -- .github/workflows release.yml apps packages scripts`
  - diff apenas em `apps/api/src/routes/whatsapp.ts`, `apps/api/src/services/whatsappEvidenceBundle.ts` e `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
  - sem diff em `.github/workflows`
  - sem diff em `release.yml`
  - sem diff em `packages/**`
  - sem diff em `scripts/**`

## Prova de isolamento

Sem alteração em:

- `.github/workflows/**`
- `release.yml`
- `package.json`
- `scripts/unit-tests-manifest.txt`
- `scripts/checkOrphanTests.ts`
- `apps/api/src/services/channelBinding.ts`
- `apps/api/src/services/replayGuard.ts`
- `ChatAgentLauncher`
- runtime/engine

## Riscos residuais

- a assinatura ainda é stub/local;
- o `Replay Guard` continua em memória de processo;
- o binding continua via configuração governada, não storage produtivo;
- a observabilidade agora é melhor, mas ainda local/controlada, sem provider real.

## Próximos passos

- manter qualquer evolução futura do adapter em modo read-only até autorização separada;
- se houver próxima etapa operacional, preservar este bundle como contrato mínimo de decisão observável;
- não promover para integração produtiva sem storage/governança adicionais.

## Status final

Status: parcial/evidenciado
