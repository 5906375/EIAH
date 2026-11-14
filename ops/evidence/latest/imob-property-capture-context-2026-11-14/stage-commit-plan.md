# Preparação exata de stage e commit — continuidade IMOB

Preparado em 2026-11-14 por Codex, sem subagentes. **Os comandos abaixo não foram executados.**
Branch: `feat/front-door-intake-run-lifecycle-imob-evaluation`.
HEAD: `453a3b0bf5e666e227a129b4930399e5ffac6efb`.

## Conferência realizada

- Stage vazio, HEAD e branch preservados.
- Antes do stage, `changes.diff` coincidiu byte a byte com o diff da tarefa (SHA-256 original: `a5633388e3974883b093f281445d81dbe2d2c886b39fecb26d82da038f3b42cf`). No stage autorizado, 20 linhas vazias de contexto tiveram o marcador de espaço removido para satisfazer `git diff --cached --check`, sem alterar conteúdo de código. SHA-256 do artefato normalizado: `2f6bc3f83318d225310d2530fd10bbd798f66cfd095ddb5367fd0570852e0651`.
- `git diff --check` aprovado, saída 0.
- Manifesto de testes e `test:ci-unit-suite` sincronizados; 12 nomes de logs referenciados no JSON existem. Os quatro logs históricos complementares também entram na seleção.
- Evidências anteriores reaproveitadas. Nenhuma suíte foi repetida nesta preparação.
- Uma busca por padrões de credenciais encontrou apenas a fixture local existente `user:pass@127.0.0.1:1/test` no contexto de package.json dentro do diff. Nenhum padrão de chave privada foi encontrado nessa busca; isso não equivale a uma auditoria completa de segredos.
- `CLAUDE.md` e `CODEX.md` permanecem com suas alterações preexistentes e ficam fora dos comandos.
- O conjunto tem **39 arquivos**: 18 de implementação/contrato/testes/CI/índice e 21 de evidências/preparação. Entre eles, 16 logs são ignorados por `.gitignore:17` e exigem adição explícita com `-f`.
- Nenhuma exceção global de gitignore é necessária. Nenhum caminho de diretório, curinga, `git add .` ou `git add -A` é usado.

## Stage proposto: 23 arquivos não ignorados

Executar a partir da raiz do repositório, somente quando for autorizado fazer stage:

```bash
git add -- \
  'apps/api/src/routes/imob.ts' \
  'apps/api/src/services/imob/crm/imobCrmTurnEngine.ts' \
  'apps/api/src/services/imob/imobAgentContract.ts' \
  'apps/api/src/services/imob/imobTurnResolver.ts' \
  'apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts' \
  'apps/api/src/tests/imob-property-capture-intake.test.ts' \
  'apps/web/src/components/agents/ChatAgentLauncher.tsx' \
  'apps/web/src/components/agents/chatLauncherEngine.ts' \
  'apps/web/src/features/imob/structured/createImobStructuredForms.test.ts' \
  'apps/web/src/features/imob/structured/types.ts' \
  'apps/web/src/features/imob/structured/useImobFormState.ts' \
  'apps/web/src/features/imob/structured/useImobFrontDoorForms.ts' \
  'apps/web/src/lib/api.ts' \
  'docs/EVIDENCE_INDEX.md' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/README.md' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/changes.diff' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/results.json' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/stage-commit-plan.md' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/typecheck-focused.mjs' \
  'package.json' \
  'packages/contracts/src/imobPropertyCapture.ts' \
  'packages/contracts/src/index.ts' \
  'scripts/unit-tests-manifest.txt'
```

## Stage proposto: 16 logs ignorados

O `-f` é limitado aos logs locais reais desta tarefa; preserva aprovações, falhas iniciais e as revalidações autorizadas fora do sandbox.

```bash
git add -f -- \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/contracts-typecheck.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/entrypoint-gate.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/evidence-gate-authorized.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/evidence-gate.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/forms-final-focused.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/forms-tests.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/intake-final.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/intake-tests.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/launcher-gate.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/no-db-diagnostic.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/no-db-gate.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/regression-tests.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/snapshot-gate.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/tests-initial.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/typecheck-final.log' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/typecheck-initial.log'
```

## Conferência depois do stage

Com o stage originalmente vazio e sem outras alterações simultâneas, `--name-only` deve listar exatamente os 39 caminhos dos dois comandos acima. A consulta específica a CLAUDE.md/CODEX.md deve continuar sem saída.

```bash
git diff --cached --check
git diff --cached --name-only
git diff --cached --name-only -- CLAUDE.md CODEX.md
git diff --cached --stat
```

## Commit proposto

Título:

```text
fix(imob): preserve property draft context in chat
```

Descrição sugerida:

> Prioriza o formulário de imóvel pendente antes do roteamento isolado e interpreta a continuação pelo runtime central com o rascunho atual. Aplica somente patches validados ao mesmo formulário, preserva perguntas/edições e descarta retornos de outro contexto, sem persistência automática.
>
> Inclui testes e evidências locais: intake 9/9, formulários 180/180 com revalidação final dos 7 afetados, isolamento sem DB 2/2, gates arquiteturais, tipagem focal/contratos e Evidence Index. Provider real, navegador e HTTP com banco permanecem não validados; 17 diagnósticos de dependências ficaram fora do typecheck focal.

A criação de commit permanece pendente de autorização. Preparar a seleção não executa stage nem commit.

## Estado e limites

A preparação está evidenciada pelas verificações de leitura e consistência acima; a implementação continua **parcial** quanto à validação externa. Não altera o status dos testes anteriores nem afirma aprovação global de tipagem ou CI remoto. Os comandos de stage, conferência pós-stage e commit são apenas propostos.

Arquivos de código/testes não foram alterados nesta etapa. Foi criado somente este plano de preparação, incluído explicitamente na própria seleção. Os artefatos anteriores foram preservados. Sem chamadas pagas, gravações de domínio, stage, commit, push, PR ou deploy.
