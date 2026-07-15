# F2.3a — WhatsApp Read-Only Handler Orphan Test Registration — 2026-07-15

## Resumo executivo

F2.3a corrige a falha real do CI em `check:orphan-tests` causada por `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`. A correção adotada foi registrar o teste no mecanismo canônico de descoberta/cobertura já existente no repositório, adicionando-o ao manifesto `scripts/unit-tests-manifest.txt` e ao script `test:ci-unit-suite` em `package.json`. O gate não foi enfraquecido, a allowlist de órfãos não foi ampliada e o teste permanece executável.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `docs/EVIDENCE_INDEX.md`
- `scripts/checkOrphanTests.ts`
- `scripts/unit-tests-manifest.txt`
- `scripts/orphan-tests-allowlist.txt`
- `package.json`
- `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`
- `ops/evidence/latest/f2-03-whatsapp-adapter-read-only-handler-controlled-implementation-2026-07-15.md`

## Falha original do CI

Falha observada em `check:orphan-tests`:

- `orphanCount: 51`
- `allowlistedOrphanCount: 50`
- `blockingOrphanCount: 1`
- `blockingOrphans: apps/api/src/tests/whatsapp.webhook-read-only.test.ts`

## Causa raiz

O gate `scripts/checkOrphanTests.ts` considera coberto apenas o teste que:

- aparece referenciado diretamente em `package.json` ou workflows; ou
- cai sob um root dinâmico coberto por `find ... -name '*.test.ts'`.

O teste F2.3 foi criado e executado localmente, mas não foi amarrado a nenhum script/workflow canônico. Por isso entrou como novo órfão bloqueante.

## Correção aplicada

Correção escolhida:

- registrar `apps/api/src/tests/whatsapp.webhook-read-only.test.ts` no manifesto canônico `scripts/unit-tests-manifest.txt`;
- refletir o mesmo arquivo no script `test:ci-unit-suite` em `package.json`.

Motivo:

- o repositório já documenta `scripts/unit-tests-manifest.txt` como fonte da verdade da suíte unitária do Grupo B;
- o teste F2.3 é compatível com esse grupo: é unitário/local, não exige provider real, não exige workflow novo, não usa segredo, não muta e já roda em `node --import tsx --test`;
- isso cria cobertura real, em vez de simplesmente esconder o teste na allowlist de órfãos.

## Por que o gate não foi enfraquecido

- `scripts/checkOrphanTests.ts` não foi alterado;
- `scripts/orphan-tests-allowlist.txt` não foi alterado;
- nenhum glob genérico foi ampliado;
- nenhum workflow foi relaxado;
- o teste deixou de ser órfão porque passou a ter referência canônica real.

## Checks executados

```bash
pnpm check:orphan-tests
node --import tsx --test apps/api/src/tests/whatsapp.webhook-read-only.test.ts
pnpm check:evidence-index
pnpm check:docs-link-integrity
git diff --check
git diff -- .github/workflows release.yml apps packages scripts
```

## Prova de isolamento

- `.github/workflows/**` intocados
- `release.yml` intocado
- `apps/**` intocado nesta etapa
- `packages/**` intocados
- `scripts/checkOrphanTests.ts` intocado
- `scripts/orphan-tests-allowlist.txt` intocado
- `ChatAgentLauncher` intocado
- runtime/engine intocados

Arquivos alterados apenas nesta F2.3a:

- `scripts/unit-tests-manifest.txt`
- `package.json`
- `ops/evidence/latest/f2-03a-whatsapp-read-only-handler-orphan-test-registration-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

## Riscos residuais

- `test:ci-unit-suite` continua sendo um script longo e manualmente sincronizado com o manifesto;
- outros 50 órfãos baselineados continuam como dívida conhecida governada;
- esta etapa não prova execução completa do `test:ci-unit-suite`, apenas o registro canônico necessário para retirar o bloqueio órfão deste arquivo específico.

## Próximos passos

- quando houver escopo apropriado, reduzir progressivamente a baseline dos 50 órfãos restantes;
- se houver futura mudança estrutural na suíte unitária, manter `scripts/unit-tests-manifest.txt` e `package.json` sincronizados;
- preservar F2.3 em modo read-only sem provider real.

## Status final

Status: evidenciado
