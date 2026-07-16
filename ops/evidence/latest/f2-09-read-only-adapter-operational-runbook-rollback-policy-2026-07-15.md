# F2.9 — Read-Only Adapter Operational Runbook / Rollback Policy — 2026-07-15

## Resumo executivo

F2.9 cria o runbook operacional do WhatsApp Adapter read-only e formaliza a politica de rollback/disable para a superficie controlada evidenciada em F2.3-F2.8. A etapa e documental: preserva provider real ausente, secret produtivo ausente, mutacoes bloqueadas e `sideEffects=0`, sem criar webhook produtivo, ledger produtivo obrigatorio, `lead.create`, `lead.discard`, acao critica, workflow novo ou alteracao em runtime, engine e `ChatAgentLauncher`.

## Pre-condicao

Confirmacao local antes do diff:

- branch atual: `main`;
- merge F2.8 presente no historico local: `4ef3f89 Merge pull request #284 from 5906375/test/f2-8-read-only-contract-freeze-gate`;
- evidencia F2.8 lida: `ops/evidence/latest/f2-08-read-only-adapter-contract-freeze-compatibility-gate-2026-07-15.md`.

Limite de verificacao desta etapa:

- a CLI `gh` disponivel neste ambiente e `gitsome` e nao possui subcomando `gh run`;
- a consulta direta ao CI pos-merge por GitHub Actions nao foi confirmada por ferramenta local nesta etapa;
- por isso o status permanece conservador: `proposta/parcial evidenciada documentalmente`.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f2-08-read-only-adapter-contract-freeze-compatibility-gate-2026-07-15.md`
- `ops/evidence/latest/f2-07-read-only-adapter-run-bundle-export-contract-2026-07-15.md`
- `docs/ops/billing-webhook-runbook.md`
- `docs/ops/interop-runbook.md`

## Artefato criado

- `docs/ops/whatsapp-read-only-adapter-operational-runbook.md`

## Conteudo operacional definido

O runbook define:

- objetivo e escopo do adapter WhatsApp read-only;
- invariantes obrigatorios;
- fora de escopo operacional;
- owners e escalation;
- classes de incidente WA-RO-P0, WA-RO-P1, WA-RO-P2 e WA-RO-P3;
- criterios fail-closed;
- politica de disable imediato;
- rollback documental/contratual;
- rollback de codigo futuro;
- evidencia minima por incidente;
- checks obrigatorios antes de promocao;
- criterios minimos para qualquer promocao futura fora de read-only controlado.

## Invariantes preservados

Esta etapa preserva explicitamente:

- provider real ausente;
- secret produtivo ausente;
- webhook produtivo ausente;
- ledger produtivo obrigatorio ausente;
- mutacoes bloqueadas;
- `lead.create` ausente no adapter;
- `lead.discard` ausente no adapter;
- acoes criticas bloqueadas;
- `sideEffects=0`;
- `piiMasked=true`;
- contrato `whatsapp.read_only.bundle_export.v1` como baseline congelada;
- ausencia de regra cognitiva nova em runtime, engine ou `ChatAgentLauncher`.

## Fail-closed definido

O runbook fixa bloqueio auditavel para:

- provider ausente ou nao suportado;
- assinatura ausente, malformada ou invalida;
- timestamp fora da janela;
- replay ou duplicidade por `eventId`;
- envelope invalido;
- payload minimo invalido;
- telefone sem binding;
- tenant, workspace, scope ou entitlement nao resolvido;
- sessao expirada;
- `readOnly=false`;
- tentativa de `lead.create`, `lead.discard` ou acao critica;
- falha na geracao sanitizada do `evidenceBundle` ou `bundleExport`.

## Politica de rollback/disable

Resumo da politica criada:

- WA-RO-P0 e WA-RO-P1 exigem disable imediato;
- drift de contrato/evidencia exige rollback documental/contratual e reexecucao de checks;
- alteracao futura de codigo deve voltar ao ultimo estado que preserva F2.8;
- qualquer rollback deve confirmar `sideEffects=0`, `piiMasked=true`, reasonCodes criticos e ausencia de PII/sensitives;
- Evidence Index so deve ser atualizado depois de evidencia fisica e verificavel.

## Prova de isolamento

F2.9 nao altera:

- `.github/workflows/**`
- `release.yml`
- `apps/**`
- `packages/**`
- `scripts/**`
- runtime
- engine
- `ChatAgentLauncher`
- provider real
- secrets produtivos
- webhook produtivo
- ledger produtivo obrigatorio
- mutacoes

## Checks executados

Saidas reais desta etapa:

```text
$ pnpm check:evidence-index
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 206631,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 533
}
```

```text
$ pnpm check:docs-link-integrity
{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 15
}
```

```text
$ git diff --check
sem saida
```

```text
$ git diff -- .github/workflows release.yml apps packages scripts
sem saida
```

## Status final

Status: proposta/parcial evidenciada documentalmente
