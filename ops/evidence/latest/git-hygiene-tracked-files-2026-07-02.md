# Git Hygiene — tracked ignored files audit — 2026-07-02

## Data

- 2026-07-02

## Método usado

- leitura de `CLAUDE.md`, `CODEX.md`, `IA_EIAH.md`, `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` e `.gitignore`
- inspeção de arquivos rastreados com `git ls-files`
- auditoria específica com `git -c core.quotepath=off ls-files -ci --exclude-standard`
- classificação conservadora por path/política de preservação

## Resumo do `.gitignore`

Pontos relevantes para esta auditoria:

- ignora `uploads/`, `tmp/`, `artifacts/`, `Backups/`, `dist/`, `build/`, `node_modules/`
- ignora `*.odt`, `*.zip`, `*.log`
- ignora parte de `docs/*` e reabre apenas subconjuntos específicos
- preserva explicitamente `docs/EVIDENCE_INDEX.md`, `docs/ops/**`, `docs/operations/**` e `docs/architecture/agent-chat-runtime.md`

Conclusão:

- o `.gitignore` atual marca corretamente uploads e backups como conteúdo não versionável;
- ele também é amplo demais para `docs/**`, o que faz alguns docs rastreados aparecerem como tracked ignored sem serem lixo gerado.

## Lista de arquivos rastreados suspeitos

Resumo por classificação:

- `generated_safe_to_untrack`: 8
- `source_keep`: 19
- `unknown_review`: 23
- `evidence_keep`: 0
- `contract_keep`: 0

### `generated_safe_to_untrack`

- `apps/api/uploads/31e26590-7825-47e8-aebc-6ab459479b01.pdf`
- `apps/api/uploads/33c3edbe-df4e-4d5e-8a61-0ed24191c2c6.txt`
- `apps/api/uploads/606bee44-1628-47d1-9c26-2cf838f4513d.pdf`
- `apps/api/uploads/61428e08-a13d-42cc-8d3e-32d3ca535ad6.png`
- `apps/api/uploads/64ee6870-c177-4b95-88be-4ae97de75adc.pdf`
- `apps/api/uploads/69abf67b-9404-4b0f-8660-6db5bf5f0609.png`
- `apps/api/uploads/8a3a5869-787f-480d-b6ca-5029686cb85d.txt`
- `apps/api/uploads/ef02749e-f7b2-413a-8cb1-63510c26b9d3.txt`

### `source_keep`

- `docs/EIAH_OVERVIEW.md`
- `docs/adr/ADR-001-domain-runtime-stack.md`
- `docs/architecture/adr-imob-journey-governed-by-case.md`
- `docs/architecture/imob-crm-governed-runtime.md`
- `docs/architecture/p3-economy-hardening-closure.md`
- `docs/architecture/presentation-snapshot-v1.md`
- `docs/architecture/worker-topology.md`
- `docs/plans/eiah-imob-chat-onboarding-plan.md`
- `docs/plans/imob-crm-continuity-hardening-phase-1-plan.md`
- `docs/plans/imob-dedupe-agent-e2e-implementation-plan.md`
- `docs/plans/imob-document-agent-e2e-implementation-plan.md`
- `docs/plans/imob-follow-up-agent-e2e-implementation-plan.md`
- `docs/plans/imob-guardian-evidence-agent-e2e-implementation-plan.md`
- `docs/plans/imob-market-scan-agent-e2e-implementation-plan.md`
- `docs/plans/imob-orchestrator-mission-e2e-p0-implementation-plan.md`
- `docs/plans/imob-proposal-agent-e2e-implementation-plan.md`
- `docs/plans/imob-visit-agent-e2e-implementation-plan.md`
- `docs/pr-checklists/diagnostic-hotfixes.md`
- `docs/product/imob-one-pager.md`

### `unknown_review`

- `Backups/Agentic_1.odt`
- `Backups/Guia Interativo.odt`
- `Backups/Imagens/1.png`
- `Backups/Imagens/EIAH_0.mp4`
- `Backups/Imagens/EIAH_1.mp4`
- `Backups/Imagens/grok-video-cc8242b3-86dd-4868-856c-ba6c87279002-2.mp4`
- `Backups/Imagens/j_360.mp4`
- `Backups/Prompt_otimizador.odt`
- `Backups/RAG_Tradicional_vs_Visual.odt`
- `Backups/SISTEMA EIAH.odt`
- `Backups/agentic_2.odt`
- `Backups/comparação_1_e_2.odt`
- `Backups/construir agentes de IA sem usar código.odt`
- `Backups/custo_RAG_Hibrido.odt`
- `Backups/fluxo_x_onboarding_interativo_html.html`
- `Backups/formS_Wasapp.odt`
- `Backups/gpt-realtime_prompt.odt`
- `Backups/guia_interativo_html_billing_quotas_footer.html`
- `Backups/onboarding_web2_web3_docs.html`
- `Backups/prompt resiliente .odt`
- `Backups/prompts...odt`
- `Backups/roteiro_1.odt`
- `MODELOS_COGNIÇÃO.odt`

## Classificação de cada achado

- `generated_safe_to_untrack`: uploads rastreados que batem com política de conteúdo gerado/temporário; não foram removidos neste PR por preservar o legado e evitar ação em massa sem decisão explícita.
- `source_keep`: documentação rastreada válida; aparece no audit por causa do `.gitignore` amplo de `docs/**`, não por ser lixo gerado.
- `unknown_review`: backups/manuais/artefatos avulsos rastreados; o padrão de ignore indica que não deveriam entrar, mas a remoção/untrack exige decisão posterior.

## Ações realizadas

- criado `scripts/checkTrackedIgnoredFiles.ts`
- criado script `pnpm check:tracked-ignored-files`
- conectado o check ao CI em `.github/workflows/ci.yml`
- atualizado `docs/EVIDENCE_INDEX.md`

## Ações não realizadas e motivo

- não removi arquivos de `apps/api/uploads/**` do índice Git
  motivo: embora classificados como `generated_safe_to_untrack`, isso ainda é alteração destrutiva de rastreamento e ficou fora deste PR conservador
- não removi `Backups/**` nem `MODELOS_COGNIÇÃO.odt`
  motivo: classificados como `unknown_review`; exigem decisão explícita
- não alterei `.gitignore`
  motivo: o guardrail já consegue distinguir `source_keep` de lixo gerado sem arriscar drift documental neste PR

## Saída real dos checks

### Primeira execução de `pnpm check:tracked-ignored-files`

```text
> eiah-builder@ check:tracked-ignored-files /home/jusall/projects/EIAH_BUILDER
> node --import tsx scripts/checkTrackedIgnoredFiles.ts

node:internal/child_process:1120
...
Error: spawnSync git EPERM
...
stdout: 'Backups/Agentic_1.odt
...
docs/product/imob-one-pager.md
'
```

Observação:

- a primeira execução falhou por detalhe de runtime do `spawnSync git` no ambiente, apesar de `stdout` e `status=0` virem corretos
- o wrapper do processo foi corrigido sem alterar a lógica do audit

### Segunda execução de `pnpm check:tracked-ignored-files`

```text
> eiah-builder@ check:tracked-ignored-files /home/jusall/projects/EIAH_BUILDER
> node --import tsx scripts/checkTrackedIgnoredFiles.ts

{
  "ok": true,
  "check": "check:tracked-ignored-files",
  "summary": {
    "generated_safe_to_untrack": 8,
    "evidence_keep": 0,
    "contract_keep": 0,
    "source_keep": 19,
    "unknown_review": 23,
    "legacyPending": true,
    "newViolations": 0
  }
}
```

### `pnpm check:docs-link-integrity`

```text
> eiah-builder@ check:docs-link-integrity /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkDocsLinkIntegrity.ts

{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 11
}
```

### `pnpm check:evidence-index` antes de criar esta evidência

```text
> eiah-builder@ check:evidence-index /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkEvidenceIndex.ts

{
  "ok": false,
  "check": "check:evidence-index",
  "message": "EVIDENCE_INDEX has missing file references",
  "details": {
    "missingCount": 1,
    "missingRefs": [
      "ops/evidence/latest/git-hygiene-tracked-files-2026-07-02.md"
    ]
  }
}
```

### `pnpm check:evidence-index` após criar esta evidência

```text
> eiah-builder@ check:evidence-index /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkEvidenceIndex.ts

{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 119439,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 350
}
```

## Status conservador

- guardrail/check: `evidenciado`
- legado rastreado pendente: `parcial`
- remoção/untrack de legado: `proposta`
