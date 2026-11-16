# Plano vigente — conversa guiada do cadastro IMOB

Preparado em 2026-11-16 por Codex, sem subagentes. **Somente preparação: nenhum comando de stage ou commit executado.**
Esta seção rege o próximo commit. Abaixo do marcador de histórico conserva-se integralmente o plano anterior, já superado; seus 39 caminhos e título antigo não compõem a seleção atual.

## Estado conferido

- Branch: `fix/imob-property-draft-context`.
- HEAD: `d60655c4fd344dca39fbbdb90d2e46bbd44a3b78`.
- Upstream: `origin/fix/imob-property-draft-context` (consulta local, sem fetch/push).
- Stage vazio. Dez arquivos de código/testes, Evidence Index, este plano e pacote de evidências integram o incremento.
- `CLAUDE.md` e `CODEX.md`: alterações preexistentes preservadas byte a byte e excluídas. Nenhuma outra alteração local alheia foi identificada no status normal.
- Testes já registrados em `scripts/unit-tests-manifest.txt:233` e `:280`, script `test:ci-unit-suite`, chamado por `.github/workflows/ci.yml:820`. Esses três arquivos já estão em HEAD, não mudaram e não devem ser adicionados neste incremento. Nenhum teste novo órfão.
- Os resultados anteriores continuam válidos segundo o relatório reaproveitado. Nenhum teste, build, provider ou gate amplo foi repetido para preparar o plano.

## Evidências e limites

Pacote: `ops/evidence/latest/imob-property-guided-draft-2026-11-14/README.md` e `results.json`.

- Validação com dublês, em execuções seletivas: 13 casos de intake, 14 do adaptador e 5 de correlação; falhas iniciais preservadas. Não equivale a nova suíte integral.
- Build web 897 módulos e contratos exit 0 reaproveitados. Typecheck focal final exit 0: somente 12 raízes, inclui vite-env, exclui 17 diagnósticos de dependências.
- Reaproveitamento explícito dos logs de formulários, no-DB e três gates do pacote anterior, todos já versionados em HEAD. Não duplicar esses arquivos no stage.
- Provider real, navegador e HTTP com banco não validados. **Status técnico PARCIAL. A causa do retorno inválido em staging continua não comprovada.**
- Oferta de avaliação intocada. P1 `weekly_cycle_evidence_too_old` preservado, sem reinvestigação ou alteração de gate.
- Hashes anteriores: 29/29 coincidentes antes do empacotamento. Inventário de entrega: `source-hashes.json`, 28 hashes para os 29 caminhos abaixo, excluindo o próprio inventário.
- Busca por padrões sensíveis não identificou credencial real no escopo revisado; ocorrência de atribuição classificada como fixture preexistente `synthetic-test-only`. Não é auditoria exaustiva.
- Três cópias de logs em `published/`: somente remoção explícita do prefixo absoluto do workspace (2/6/1 ocorrências) e espaços finais em 2/0/1 linhas. Originais locais intactos/excluídos. Proveniência e hashes em `results.json` → `packaging.sanitizedLogs`.
- `changes.diff.gz` entrega o diff original comprimido sem normalização (27 linhas de contexto contêm espaço no original). Descompressão idêntica ao Git e ao `changes.diff` local, que fica excluído.

## Lista exata — 16 adições normais

Comando **proposto**, somente após autorização, a partir da raiz:

```bash
git add -- \
  'apps/api/src/routes/imob.ts' \
  'apps/api/src/services/imob/crm/imobProposalReviewContinuity.ts' \
  'apps/api/src/services/imob/imobAgentContract.ts' \
  'apps/api/src/services/imob/intake/imobPropertyCaptureIntake.ts' \
  'apps/api/src/tests/imob-property-capture-intake.test.ts' \
  'apps/web/src/components/agents/chatLauncherEngine.ts' \
  'apps/web/src/features/imob/structured/createImobStructuredForms.test.ts' \
  'apps/web/src/features/imob/structured/types.ts' \
  'apps/web/src/features/imob/structured/useImobFrontDoorForms.ts' \
  'docs/EVIDENCE_INDEX.md' \
  'ops/evidence/latest/imob-property-capture-context-2026-11-14/stage-commit-plan.md' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/README.md' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/changes.diff.gz' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/results.json' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/source-hashes.json' \
  'packages/contracts/src/imobPropertyCapture.ts'
```

## Lista exata — 13 adições forçadas

Cada caminho é ignorado pela regra `.gitignore:17:*.log`; não usar `-f` nos demais caminhos, diretórios, curingas ou no scratchpad inteiro.

```bash
git add -f -- \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/adapter-confirmation-guards.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/adapter-withdrawal.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/contracts-typecheck.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/diff-check.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/forms-second.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/intake-reproduction.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/intake-withdrawal.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/published/forms-first.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/published/intake-first.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/published/web-build.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/review-correlation-regression.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/typecheck-final.log' \
  'ops/evidence/latest/imob-property-guided-draft-2026-11-14/typecheck-first.log'
```

**Total: 29 caminhos únicos = 16 normais + 13 ignorados.** As duas listas não se sobrepõem.

## Arquivos excluídos

- `CLAUDE.md` e `CODEX.md` — trabalho preexistente; hashes preservados em `results.json`.
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/changes.diff` — original local, entregue como gzip sem perda.
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/intake-first.log` — original local; entregar somente a cópia `published/intake-first.log`.
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/forms-first.log` — original local; entregar somente a cópia `published/forms-first.log`.
- `ops/evidence/latest/imob-property-guided-draft-2026-11-14/web-build.log` — original local; entregar somente a cópia `published/web-build.log`.
- `apps/web/dist/`, caches, `node_modules/`, temporários, ambientes e scratchpad fora da seleção explícita.
- Package/workflow/manifesto, exports browser e demais arquivos anteriores sem diff: já presentes em HEAD; não adicionar novamente. A única alteração no pacote de evidências anterior é este plano reutilizado.

## Verificações após autorização do stage

Não executadas nesta etapa:

```bash
git diff --cached --name-only
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
git diff --cached --name-only -- CLAUDE.md CODEX.md
git diff --cached
```

1. Comparar o conjunto staged com as duas listas acima: igualdade exata de 29 caminhos, sem duplicações/extras. Consulta específica às instruções sem saída.
2. Ler `:ops/evidence/latest/imob-property-guided-draft-2026-11-14/source-hashes.json` do índice. Para cada entrada, conferir SHA-256 dos bytes retornados por `git show :<caminho>`; todos os 28 alvos devem estar staged. Conferir o próprio inventário contra a cópia revisada do working tree.
3. Validar JSON e referências usando o conteúdo staged e arquivos reaproveitados de HEAD: README, results, nova linha do Evidence Index, plano, helper de tipagem e logs versionados. Originais explicitamente locais são só proveniência, não dependências da entrega.
4. Descomprimir o diff staged e comparar com `git diff --cached -- <dez caminhos de código/testes>`; preservar os bytes do artefato original. Se o Git variar apenas ordem de apresentação, comparar também os dez blocos por arquivo antes de concluir divergência.
5. Conferir novamente dados sensíveis nos bytes staged e o tratamento declarado dos três logs. Não normalizar logs originais nem adicionar uma fonte local excluída por engano.
6. `git diff --cached --check` deve sair com 0. Stage vazio agora não demonstra esse check futuro; se algo divergir após autorização, parar antes do commit.
7. Criar somente o commit autorizado, por fluxo normal com hooks. Não usar `--no-verify`, não desativar hooks nem alterar gates para aprovação. Não repetir suítes já válidas sem nova alteração que justifique.

## Mensagem proposta do commit

Título:

```text
feat(imob): confirm guided property draft updates in chat
```

Corpo:

```text
Apresenta uma proposta de alterações pelo intake contextual central do IMOB com o rascunho atual. Somente a confirmação contextual da proposta vigente aplica suas mudanças integralmente ao mesmo rascunho; salvar o imóvel permanece uma ação explícita separada do formulário.

Preserva perguntas, recusa, ambiguidade, pausa e retomada pelo provider contextual. Edição manual, proposta substituída ou resposta tardia não sobrescrevem campos; retirar todas as diferenças limpa a proposta anterior.

Validação local com dublês: cobertura seletiva de 13 casos de intake, 14 do adaptador e 5 de correlação, reutilizando resultados válidos e preservando falhas históricas. Build web (897 módulos) e contratos aprovados localmente. Typecheck limitado a 12 raízes, com 17 diagnósticos de dependências excluídos.

Status técnico PARCIAL. Provider real, navegador e HTTP com banco não validados. A causa do retorno inválido em staging continua não comprovada; esta entrega não é apresentada como correção comprovada desse incidente. Evidências e transformações de publicação documentadas; ratificação P1 weekly_cycle_evidence_too_old preservada.
```

## Prontidão

Seleção preparada para futura autorização de stage/commit, condicionada à conferência dos bytes staged e aos hooks normais. Não há alegação de CI remoto aprovado ou de validação operacional completa. A implementação continua PARCIAL.
Nenhum código/teste, build, ambiente externo ou .gitignore alterado nesta preparação. Originais preservados; novos artefatos de publicação têm destino explícito na seleção. Sem exclusões genéricas, stage, commit, push, PR, merge ou deploy.

---

# Histórico — plano anterior preservado, não executar

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
