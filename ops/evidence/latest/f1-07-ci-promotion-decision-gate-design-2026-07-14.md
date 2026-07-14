# F1.7 — CI Promotion Decision and Gate Design for Mobile Smoke

## Status

proposta/documental

## Fontes lidas

- `CODEX.md`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `.github/workflows/ci.yml`
- `ops/evidence/latest/f1-06g-front-door-mobile-chromium-sandbox-validation-2026-07-14.md`
- `ops/evidence/latest/f1-06h-controlled-browser-smoke-environment-2026-07-14.md`
- `ops/evidence/latest/f1-06i-chromium-provisioning-strategy-2026-07-14.md`
- `ops/evidence/latest/f1-06j-controlled-chromium-provisioning-execution-2026-07-14.md`
- `ops/evidence/latest/f1-06k-dedicated-playwright-runtime-base-image-selection-2026-07-14.md`
- `ops/evidence/latest/f1-06l-controlled-official-playwright-runner-execution-2026-07-14.md`
- `ops/evidence/latest/f1-06m-manual-smoke-closure-ci-promotion-boundary-2026-07-14.md`

## Agentes envolvidos

- `Codex` como executor técnico governado

## Objetivo

Decidir e desenhar a promoção futura do smoke mobile F1 para CI, partindo do PASS manual/controlado de F1.6l e do boundary explícito de F1.6m, sem alterar workflows nesta etapa.

## Resumo da cadeia F1.6g–F1.6m

| Etapa | Resultado | Estado |
| --- | --- | --- |
| F1.6g | host local falhou por sandbox | `ENV_SANDBOX_BLOCKED` |
| F1.6h | `eiah-web` falhou por browser ausente | `CHROMIUM_BINARY_MISSING` |
| F1.6i | definiu estratégia de provisioning | `proposta/parcial` |
| F1.6j | runner `node:22-bookworm` falhou por `libnspr4.so` ausente | `parcial` |
| F1.6k | escolheu imagem oficial Playwright como base canônica | `proposta/parcial` |
| F1.6l | runner oficial Playwright passou manualmente | `evidenciado` |
| F1.6m | consolidou PASS manual/controlado e manteve CI fora do escopo | `evidenciado/documental` |

Leitura consolidada:
- a cadeia técnica já provou que o script F1.4 é válido;
- a variável crítica era o runtime/browser environment;
- a tag oficial validada manualmente foi `mcr.microsoft.com/playwright:v1.61.1-noble`;
- a promoção para CI ainda não foi implementada e continua dependendo de decisão separada.

## Decisão recomendada

### Recomendação inicial

**Gate inicialmente informativo.**

### Justificativa

Apesar do PASS manual/controlado da F1.6l, ainda faltam medições e decisões próprias de CI:
- custo e tempo reais do job em GitHub Actions;
- política de `pull`/cache da imagem;
- risco de flake em ambiente CI;
- estratégia de artefatos/logs;
- definição explícita de timeout e retry;
- impacto no tempo total do `CI Monorepo`.

Conclusão conservadora:
- F1.7 deve apenas desenhar a promoção;
- uma implementação futura em F1.8 ou F1.7a deve começar como **informativa**;
- a promoção para **obrigatória** só deve ocorrer após execução CI real estável.

## Tag da imagem

Tag validada manualmente em F1.6l:

- `mcr.microsoft.com/playwright:v1.61.1-noble`

Decisão documental:
- essa deve ser a tag de referência para a futura primeira implementação em CI;
- qualquer mudança de tag deve ser tratada como nova decisão explícita;
- a etapa futura deve registrar também `image id` e, quando disponível, `digest`.

## Política de pull/cache

Recomendação:
- CI deve usar **tag fixa explícita** na primeira implementação;
- o uso de tag fixa reduz ambiguidade em relação à F1.6l;
- ainda assim, existe risco de mutabilidade operacional da tag remota.

Recomendação futura:
- avaliar **digest pinning** em etapa posterior;
- documentar comportamento de cache/pull do runner;
- registrar se o job fará `pull` sempre ou reaproveitará cache do host/runner.

Leitura conservadora:
- cache pode reduzir custo e tempo;
- cache stale pode mascarar drift;
- essa política deve ser fixada junto da implementação futura, não nesta etapa.

## Custo/tempo

Estado atual:
- **não medido em CI real**.

Regra desta etapa:
- não inventar números.

Métrica proposta para futura execução real:
- `durationSeconds`

Métricas auxiliares desejáveis:
- tempo de bootstrap da imagem
- tempo de execução do smoke
- tempo total do job

## Artefatos/logs

Artefatos mínimos recomendados para a futura implementação:
- stdout do smoke
- stderr do smoke
- JSON completo do smoke
- `route_status`
- tag da imagem usada
- `image id` e `digest`, quando disponível

Artefatos opcionais, apenas se aprovados em etapa futura:
- screenshots
- traces Playwright

Regra:
- a implementação futura deve preservar artefatos suficientes para auditoria sem inflar desnecessariamente o CI.

## Fail-closed

### Fase inicial informativa

Se o smoke falhar:
- registrar `classification`
- registrar `reasons`
- **não bloquear merge inicialmente**

### Fase futura obrigatória

Somente após estabilidade comprovada:
- bloquear merge quando `classification != PASS`
- tratar ausência de saída válida como falha
- manter semântica fail-closed no job

## Impacto no CI

Riscos principais:
- aumento do tempo total do CI
- necessidade de `pull` externo
- risco de flake de browser/runtime
- dependência de ambiente compatível com Playwright
- risco de acoplamento ao padrão atual `container:eiah-web`, que não existe como tal no GitHub Actions

Leitura operacional importante:
- a estratégia de rede usada manualmente em F1.6l (`container:eiah-web`) não pode ser copiada cegamente para CI;
- a implementação futura precisará definir como o front door será servido/descoberto dentro do job CI.

## Critérios mínimos para implementação futura

Uma futura implementação de gate deve atender no mínimo:

1. job isolado ou workflow separado
2. tag fixa da imagem Playwright
3. digest fixo em etapa posterior, se aprovado
4. timeout explícito
5. política de cache/pull documentada
6. upload de artefatos/logs
7. não interferir em `apps/**`, `packages/**`, runtime ou engine
8. política de retry apenas se houver evidência de flake
9. decisão explícita para transição de informativo -> obrigatório
10. aprovação explícita antes de qualquer alteração em `.github/workflows`

## Bloqueios preservados

Confirmado:
- sem alteração em `.github/workflows`
- sem alteração em `release.yml`
- sem Docker
- sem smoke
- sem `docker pull`
- sem `docker run`
- sem `docker build`
- sem `docker push`
- sem `apt-get`
- sem `playwright install-deps`
- sem alteração em `apps/**`
- sem alteração em `packages/**`
- sem alteração em `scripts/**`
- sem alteração em runtime
- sem alteração em engine
- sem alteração em `ChatAgentLauncher`
- sem `secrets`
- sem `publish`
- sem `tags/releases`
- sem avanço F2/F3
- sem declaração de CI implementado
- sem declaração de CI-ready obrigatório

## Checks executados

```bash
pnpm check:evidence-index
pnpm check:docs-link-integrity
git diff --check
git diff -- .github/workflows release.yml apps packages scripts
```

## Arquivos alterados

- `docs/EVIDENCE_INDEX.md`
- `ops/evidence/latest/f1-07-ci-promotion-decision-gate-design-2026-07-14.md`

## Status final

proposta/documental
