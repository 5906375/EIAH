# F0.49 — layer B future gate readiness checklist

## Data
2026-07-13

## Objetivo
Criar um checklist documental/audit-only de readiness para um gate futuro da Camada B, consolidando os critérios mínimos que uma eventual etapa futura de validação controlada deverá provar antes de qualquer execução real de release/publish.

## Pré-condição confirmada

- `main` atualizado após o merge da F0.48
- `docs/EVIDENCE_INDEX.md` aponta para a evidência F0.48
- `ops/evidence/latest/f0-48-layer-b-negative-path-audit-2026-07-13.md` existe
- `ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md` existe
- `.github/workflows/release.yml` produtivo permanece intocado
- a Camada B continua não autorizada para execução produtiva

## Escopo desta etapa

Esta etapa é audit-only/documental.

Não:

- implementa gate futuro;
- altera workflows;
- executa publish;
- libera release produtivo;
- declara Camada B como pronta.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md`
- `ops/evidence/latest/f0-48-layer-b-negative-path-audit-2026-07-13.md`
- `.github/workflows/release.yml`

## Base consolidada

F0.47 confirmou que a Camada B tem readiness documental crescente, mas ainda não está pronta para decisão executiva de publish real.

F0.48 acrescentou o mapa de negative paths, critérios fail-closed e reasonCodes sugeridos para bloquear promoção inadequada antes de qualquer side effect externo.

F0.49 consolida isso em um checklist mínimo obrigatório para qualquer gate futuro da Camada B.

## Checklist mínimo de readiness para gate futuro da Camada B

### 1. Escopo e superfície

- [ ] A superfície alvo está explicitada como `cli`, `api`, `workers` ou `multi_surface`
- [ ] Não há ambiguidade entre validação documental e execução real
- [ ] O gate futuro deixa explícito que readiness/preflight/gate sem side effects não equivalem a publish real

### 2. Versão e imutabilidade

- [ ] `target_version` está presente e em formato válido
- [ ] A versão alvo é tratada como imutável para a superfície promovida
- [ ] O gate futuro falha fechado se a versão for inválida ou reaproveitável de forma ambígua

### 3. Owners e responsabilização

- [ ] Há owner técnico nomeado para a superfície promovida
- [ ] Há owner operacional nomeado para execução e monitoramento
- [ ] Há responsabilização explícita para decisão, execução, observabilidade e rollback

### 4. Janela operacional

- [ ] Existe janela operacional verificável
- [ ] A janela está descrita de forma auditável
- [ ] O gate futuro falha fechado quando a janela estiver ausente, inválida ou incompatível

### 5. Rollback por superfície

- [ ] Existe referência de rollback exercível
- [ ] O rollback é específico por superfície
- [ ] O gate futuro falha fechado se o rollback permanecer genérico, abstrato ou ausente

### 6. Boundary de secrets

- [ ] O boundary de `NPM_TOKEN` e `REGISTRY_PAT` está explicitado
- [ ] O uso de secrets depende de autorização dedicada e auditável
- [ ] O gate futuro prova que aborta antes de ler/injetar secret quando esse boundary não estiver aprovado

### 7. Registry login, GHCR e Docker

- [ ] O caminho de login em registry/GHCR está explicitamente separado do preflight sem side effects
- [ ] Existe regra fail-closed para `docker/login-action` ou login equivalente
- [ ] O gate futuro bloqueia autenticação externa fora da fase autorizada
- [ ] Push de imagem não pode ocorrer sem superfície, owners, janela e rollback já validados

### 8. Tags, releases e `latest`

- [ ] `tags/releases` continuam segregados atrás de gate próprio
- [ ] Promoção de `latest` exige política explícita
- [ ] O gate futuro bloqueia `latest` sem artefato versionado, regra operacional e rollback correspondente

### 9. Retry, idempotência e reaprovação

- [ ] Há política explícita para retry
- [ ] O retry não pode duplicar side effects
- [ ] Existe regra de reaprovação para rerun quando aplicável
- [ ] A superfície promovida possui estratégia de idempotência verificável

### 10. Evidência mínima exigida

- [ ] Existe evidência real de negative-path bloqueado por superfície
- [ ] Existe evidência real de boundary de secrets aprovado ou bloqueado
- [ ] Existe evidência real de gate para `latest` e `tags/releases`
- [ ] Existe evidência real de rollback exercível por superfície
- [ ] Existe evidência real de retry/idempotência sem ambiguidade
- [ ] Publish real, se um dia autorizado, terá evidência separada e própria

## Mapeamento para reasonCodes e fail-closed

O gate futuro deve, no mínimo, manter aderência às categorias documentadas em F0.48:

- `RELEASE_VERSION_INVALID`
- `RELEASE_SURFACE_UNSPECIFIED`
- `TECHNICAL_OWNER_REQUIRED`
- `OPERATIONAL_OWNER_REQUIRED`
- `OPERATIONAL_WINDOW_INVALID`
- `ROLLBACK_REFERENCE_REQUIRED`
- `SECRET_BOUNDARY_NOT_APPROVED`
- `REGISTRY_LOGIN_NOT_AUTHORIZED`
- `CLI_PUBLISH_NOT_IDEMPOTENT`
- `LATEST_TAG_PROMOTION_BLOCKED`
- `RETRY_POLICY_MISSING`
- `ROLLBACK_NOT_SURFACE_SCOPED`
- `TAG_PROMOTION_NOT_AUTHORIZED`
- `READINESS_NOT_EQUIVALENT_TO_RELEASE`

## Leitura conservadora

Após F0.47, F0.48 e esta F0.49:

- a Camada B está melhor estruturada documentalmente;
- os critérios mínimos para um gate futuro estão mais explícitos;
- ainda não existe autorização para publish real;
- ainda não existe autorização para secrets produtivos, registry login, GHCR/Docker push ou tags/releases;
- `release.yml` produtivo continua intocado e fora da trilha autorizada.

## Decisão documental

O próximo passo aceitável continua sendo apenas uma futura etapa controlada e separada que prove, com evidência real, os itens deste checklist antes de qualquer execução produtiva da Camada B.

Esta etapa não reduz o status para "pronto". Ela apenas aumenta a clareza do que ainda falta provar.

## Comandos executados

```bash
git status --short
git log --oneline -8
grep -n "F0.48\|f0-48-layer-b-negative-path-audit\|F0.47\|Camada B\|release.yml\|publish\|secrets\|GHCR\|tags" docs/EVIDENCE_INDEX.md
ls -la ops/evidence/latest/f0-48-layer-b-negative-path-audit-2026-07-13.md
ls -la ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md
grep -n "negative\|fail-closed\|reasonCode\|Camada B\|release.yml\|publish\|secrets\|registry\|GHCR\|Docker\|tags\|rollback\|não autorizada" ops/evidence/latest/f0-48-layer-b-negative-path-audit-2026-07-13.md
grep -n "Camada B\|readiness\|não está pronta\|não autorizada\|publish\|secrets\|rollback" ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md
ls -la .github/workflows/release.yml
pnpm check:evidence-index
pnpm check:docs-link-integrity
git diff --check
git diff -- .github/workflows/release.yml
git diff -- .github/workflows/release-activation-rollback-gate.yml
git diff -- .github/workflows/release-publish-preflight.yml
git diff -- .github/workflows/release-node22-readiness.yml
git diff -- .github/workflows/release-node22-validation-build-dry-run.yml
git diff -- package.json
git diff -- pnpm-lock.yaml
git diff -- apps
git diff -- packages
git diff -- scripts
git status --short
git diff --stat
```

## Resultados reais dos checks

`pnpm check:evidence-index`

```text
> eiah-builder@ check:evidence-index /home/jusall/projects/EIAH_BUILDER
> node --experimental-strip-types scripts/checkEvidenceIndex.ts

{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 173345,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 477
}
(node:14) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
```

`pnpm check:docs-link-integrity`

```text
> eiah-builder@ check:docs-link-integrity /home/jusall/projects/EIAH_BUILDER
> node --import tsx scripts/checkDocsLinkIntegrity.ts

{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 15,
  "targets": [
    "AGENTS.md",
    "CLAUDE.md",
    "CODEX.md",
    "IA_EIAH.md",
    "docs/architecture/EIAH_MULTICHANNEL_IMPLEMENTATION_PLAN_v1.md",
    "docs/architecture/EIAH_OUTPUTS_MATRIX_v1.md",
    "docs/architecture/adr-imob-journey-governed-by-case.md",
    "docs/architecture/agent-chat-runtime.md",
    "docs/architecture/chat-runtime-entrypoint-debt.md",
    "docs/architecture/fase-3-dividas-documentadas-closure.md",
    "docs/architecture/imob-crm-governed-runtime.md",
    "docs/architecture/p3-economy-hardening-closure.md",
    "docs/architecture/presentation-snapshot-v1.md",
    "docs/architecture/white-label-runtime-gap.md",
    "docs/architecture/worker-topology.md"
  ]
}
```

`git diff --check`

```text
sem saída
```

## Prova de isolamento

Os diffs abaixo devem permanecer sem saída:

- `git diff -- .github/workflows/release.yml`
- `git diff -- .github/workflows/release-activation-rollback-gate.yml`
- `git diff -- .github/workflows/release-publish-preflight.yml`
- `git diff -- .github/workflows/release-node22-readiness.yml`
- `git diff -- .github/workflows/release-node22-validation-build-dry-run.yml`
- `git diff -- package.json`
- `git diff -- pnpm-lock.yaml`
- `git diff -- apps`
- `git diff -- packages`
- `git diff -- scripts`

`git status --short` após o diff

```text
 M docs/EVIDENCE_INDEX.md
?? ops/evidence/latest/f0-49-layer-b-future-gate-readiness-checklist-2026-07-13.md
```

`git diff --stat`

```text
 docs/EVIDENCE_INDEX.md | 1 +
 1 file changed, 1 insertion(+)
```

## Status
Status: parcial/evidenciado
