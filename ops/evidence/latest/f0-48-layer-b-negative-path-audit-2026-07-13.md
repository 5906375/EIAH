# F0.48 — layer B negative-path audit

## Data
2026-07-13

## Objetivo
Criar uma auditoria documental/audit-only de negative paths da Camada B antes de qualquer execução real de release/publish.

## Pré-condição confirmada

- `main` atualizado após o merge da F0.47
- `docs/EVIDENCE_INDEX.md` aponta para a evidência F0.47
- `ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md` existe
- `release.yml` produtivo permanece intocado
- a Camada B continua não autorizada para execução produtiva

## Escopo desta etapa

Esta etapa é audit-only/documental.

Não:

- executa publish;
- libera release produtivo;
- altera `release.yml`;
- altera workflows;
- altera runtime;
- altera `ChatAgentLauncher`;
- usa `secrets` produtivos;
- faz registry login;
- faz Docker/GHCR push;
- cria tags/releases;
- declara Camada B pronta.

## Arquivos lidos

- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md`
- `.github/workflows/release.yml`

## Escopo do negative-path audit

Esta auditoria cobre negative paths esperados antes de qualquer execução real de:

- publish CLI;
- registry login;
- push de imagem API/worker;
- uso de `secrets`;
- `tags/releases`;
- rollback;
- retry/idempotência.

## Matriz de negative paths

### NP-01 — versão alvo ausente ou inválida

- Falha esperada:
  - versão sem formato válido ou incompatível com promoção controlada
- Critério fail-closed:
  - não preparar publish nem login
- ReasonCode sugerido:
  - `RELEASE_VERSION_INVALID`
- Evidência futura mínima:
  - input real recusado pelo gate com log do valor inválido

### NP-02 — superfície de release não explicitada

- Falha esperada:
  - tentativa ambígua de promover `cli`, `api` e `workers` sem escolha explícita
- Critério fail-closed:
  - não permitir caminho multi-superfície implícito
- ReasonCode sugerido:
  - `RELEASE_SURFACE_UNSPECIFIED`
- Evidência futura mínima:
  - gate recusando surface ausente ou divergente

### NP-03 — owner técnico ausente

- Falha esperada:
  - promoção sem responsável técnico rastreável
- Critério fail-closed:
  - bloquear decisão antes de qualquer uso de secret
- ReasonCode sugerido:
  - `TECHNICAL_OWNER_REQUIRED`
- Evidência futura mínima:
  - execução bloqueada com owner ausente e decisão não promovida

### NP-04 — owner operacional ausente

- Falha esperada:
  - janela operacional sem owner de execução/monitoramento
- Critério fail-closed:
  - impedir promoção por falta de responsabilidade operacional
- ReasonCode sugerido:
  - `OPERATIONAL_OWNER_REQUIRED`
- Evidência futura mínima:
  - bloqueio explícito no gate ou checklist operacional

### NP-05 — janela operacional ausente ou inválida

- Falha esperada:
  - tentativa de promoção sem janela UTC verificável
- Critério fail-closed:
  - não autorizar passo real fora de janela documentada
- ReasonCode sugerido:
  - `OPERATIONAL_WINDOW_INVALID`
- Evidência futura mínima:
  - gate recusando formato ou ausência de janela

### NP-06 — referência de rollback ausente

- Falha esperada:
  - promoção sem rollback exercível por superfície
- Critério fail-closed:
  - bloquear qualquer passo real de publish
- ReasonCode sugerido:
  - `ROLLBACK_REFERENCE_REQUIRED`
- Evidência futura mínima:
  - gate rejeitando ausência de runbook/reference

### NP-07 — boundary de secrets não aprovado

- Falha esperada:
  - tentativa de usar `NPM_TOKEN` ou `REGISTRY_PAT` sem decisão explícita
- Critério fail-closed:
  - zero uso de secret antes de autorização dedicada
- ReasonCode sugerido:
  - `SECRET_BOUNDARY_NOT_APPROVED`
- Evidência futura mínima:
  - prova de que a etapa aborta antes de ler/injetar secret

### NP-08 — login em registry não autorizado

- Falha esperada:
  - tentativa de `docker/login-action` ou login equivalente fora de fase autorizada
- Critério fail-closed:
  - sem autenticação externa
- ReasonCode sugerido:
  - `REGISTRY_LOGIN_NOT_AUTHORIZED`
- Evidência futura mínima:
  - documentação/check bloqueando a promoção antes do login

### NP-09 — publish CLI sem imutabilidade de versão

- Falha esperada:
  - publish de pacote sem política de idempotência/imutabilidade clara
- Critério fail-closed:
  - não executar publish se a versão não for tratada como imutável
- ReasonCode sugerido:
  - `CLI_PUBLISH_NOT_IDEMPOTENT`
- Evidência futura mínima:
  - demonstração de bloqueio quando a versão puder ser reutilizada incorretamente

### NP-10 — push de imagem com `latest` sem política explícita

- Falha esperada:
  - promoção de `latest` sem regra clara de precedência/rollback
- Critério fail-closed:
  - impedir `latest` antes de artefato versionado e decisão operacional
- ReasonCode sugerido:
  - `LATEST_TAG_PROMOTION_BLOCKED`
- Evidência futura mínima:
  - evidência de bloqueio específico para `latest`

### NP-11 — retry não governado

- Falha esperada:
  - rerun manual ou automático que possa duplicar side effects
- Critério fail-closed:
  - exigir política explícita `no retry without reapproval` ou equivalente
- ReasonCode sugerido:
  - `RETRY_POLICY_MISSING`
- Evidência futura mínima:
  - log/check mostrando recusa de retry sem reaprovação

### NP-12 — rollback não executável por superfície

- Falha esperada:
  - rollback genérico que não distingue `cli`, `api` e `workers`
- Critério fail-closed:
  - impedir promoção enquanto rollback for abstrato
- ReasonCode sugerido:
  - `ROLLBACK_NOT_SURFACE_SCOPED`
- Evidência futura mínima:
  - runbook por superfície e bloqueio quando ausente

### NP-13 — `tags/releases` sem gate dedicado

- Falha esperada:
  - tentativa de usar `push.tags`/release sem política separada
- Critério fail-closed:
  - não acionar promoção por tag enquanto `release.yml` produtivo estiver fora da trilha autorizada
- ReasonCode sugerido:
  - `TAG_PROMOTION_NOT_AUTHORIZED`
- Evidência futura mínima:
  - prova de bloqueio documental/operacional antes de criação de tag produtiva

### NP-14 — divergência entre readiness documental e release produtivo

- Falha esperada:
  - assumir que readiness verde equivale a publish green
- Critério fail-closed:
  - manter `release.yml` fora da promoção até evidência específica
- ReasonCode sugerido:
  - `READINESS_NOT_EQUIVALENT_TO_RELEASE`
- Evidência futura mínima:
  - trilha documental que mostre recusa dessa equivalência em decisão operacional

## Critérios fail-closed transversais

Qualquer decisão futura da Camada B deve falhar fechado se ocorrer qualquer uma das condições:

- versão inválida;
- superfície ambígua;
- owners ausentes;
- janela ausente;
- rollback ausente;
- boundary de `secrets` não aprovado;
- login em registry sem autorização;
- publish/push sem política de idempotência;
- `latest` sem regra;
- retry sem reaprovação;
- tag/release fora de gate próprio;
- suposição de que readiness green equivale a release produtivo.

## Evidências futuras mínimas antes de Camada B produtiva

Para qualquer decisão futura de promoção real, a evidência mínima ainda ausente deve incluir:

1. um negative-path real por superfície (`cli`, `api`, `workers`) bloqueando execução inadequada;
2. evidência de boundary explícita de `secrets`;
3. evidência de gate para `latest` e `tags/releases`;
4. evidência de rollback exercível por superfície;
5. evidência de retry/idempotência não ambígua;
6. evidência separada para publish real, se e somente se houver autorização futura.

## Decisão conservadora

Após F0.47 e esta F0.48:

- a Camada B está mais bem especificada documentalmente;
- os negative paths principais estão mapeados;
- os critérios fail-closed estão mais claros;
- a Camada B continua **não autorizada** para execução produtiva;
- esta auditoria não altera a conclusão de que a Camada B **não está pronta**.

## Comandos executados

```bash
git status --short
git log --oneline -8
grep -n "F0.47\|f0-47-layer-b-readiness-decision-audit\|Camada B\|release.yml\|publish\|secrets\|GHCR\|tags" docs/EVIDENCE_INDEX.md
ls -la ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md
grep -n "Camada B\|release.yml\|publish\|secrets\|registry\|GHCR\|Docker\|tags\|rollback\|não está pronta\|não autorizada" ops/evidence/latest/f0-47-layer-b-readiness-decision-audit-2026-07-13.md
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
{
  "ok": true,
  "check": "check:evidence-index",
  "file": "docs/EVIDENCE_INDEX.md",
  "sizeChars": 172758,
  "roadmap": "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md",
  "refsChecked": 476
}
```

`pnpm check:docs-link-integrity`

```text
{
  "ok": true,
  "check": "check:docs-link-integrity",
  "filesChecked": 15
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
?? ops/evidence/latest/f0-48-layer-b-negative-path-audit-2026-07-13.md
```

`git diff --stat`

```text
 docs/EVIDENCE_INDEX.md | 1 +
 1 file changed, 1 insertion(+)
```

## Status
Status: parcial/evidenciado
