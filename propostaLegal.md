# propostaLegal

## 1. Resumo executivo

A proposta de vertical `LEGAL` **condiz parcialmente** com o código atual. O projeto **já possui runtime real reaproveitável** para `Tenant Recipes`, `Recipe_Orchestrator`, `J_360 legal_review`, `Guardian`, `HTML/PDF export`, `run bundle` e `receipt/ledger`. Isso significa que **não faz sentido criar um runtime novo de Legal**.

O caminho correto é:

- reaproveitar `Tenant Recipes` como contrato operacional;
- usar `recipeId` + `linkedRecipe` + `self-service`;
- deixar `Recipe_Orchestrator` selecionar `intent=legal_review`, `domain=legal`, `primaryAgent=J_360`;
- reaproveitar `J_360LegalReport` + renderer `HTML/PDF`;
- usar `Guardian` como gate/review quando risco/governança exigirem;
- manter `Receipt Canon`, `bundle`, `txId`, `runId`, `audit trail` e `Evidence Index` no mesmo pipeline existente.

Os gaps reais não são “falta de base”. São estes:

- **não existe `published`** no status de recipe; hoje o código usa `draft | homologated | deprecated`;
- **não existe `recipeVersion`** no contrato atual;
- a governança em `Recipe_Orchestrator` e parte do output jurídico aparece forte no payload/render, mas **a avaliação real de RBAC/entitlement/TrustScore/CostGuard não está provada como executada end-to-end no fluxo Legal**;
- o chat segue com **drift no front-end**, porque há um `chatLauncherEngine` web com regras por domínio/especialista, embora o `ChatAgentLauncher` em si esteja mais render-only.

Conclusão curta:

- **Pode reaproveitar o que já existe?** `SIM, PARCIALMENTE`
- **A vertical LEGAL deve usar Tenant Recipes existente ou criar runtime novo?** `Deve usar Tenant Recipes existente`
- **Próximo PR recomendado:** formalização aditiva de `LEGAL` sobre `Tenant Recipes`, com `recipeVersion`, status/versionamento, entitlement/policy real no runtime e limpeza de drift launcher-side.

---

## 2. Achados no código

### Tenant Recipes já são runtime real

Arquivos:

- [apps/api/src/routes/tenant-recipes.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/tenant-recipes.ts)
- [apps/api/src/types/tenantRecipeContract.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/types/tenantRecipeContract.ts)
- [apps/api/src/routes/tenantRecipeWorkspaceSelection.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/tenantRecipeWorkspaceSelection.ts)
- [apps/api/src/tests/tenant-recipe-contract.test.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/tenant-recipe-contract.test.ts)
- [apps/api/src/tests/tenant-recipe-workspace-selection.test.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/tenant-recipe-workspace-selection.test.ts)

Achados:

- existe tabela física `tenant_recipes`;
- a recipe já tem vínculo com `tenantId`, `agentId`, `workspaceScope`;
- a recipe já tem estados reais persistidos;
- `HOMOLOGATED` já existe de verdade como `status="homologated"` e `homologatedAt`;
- a visibilidade por workspace já é validada por tenant/workspace real;
- `content v2` já existe como contrato operacional estruturado com:
  - `goal`
  - `expectedOutcome`
  - `goCondition`
  - `blockCondition`
  - `steps[]`

### Self-service já abre recipe homologada e gera run

Arquivos:

- [apps/web/src/pages/self-service/router.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/pages/self-service/router.tsx)
- [apps/web/src/pages/self-service/j360.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/pages/self-service/j360.tsx)
- [apps/web/src/pages/self-service/recipePrefill.ts](/home/jusall/projects/EIAH_BUILDER/apps/web/src/pages/self-service/recipePrefill.ts)
- [apps/web/src/pages/self-service/recipePrefill.test.ts](/home/jusall/projects/EIAH_BUILDER/apps/web/src/pages/self-service/recipePrefill.test.ts)

Achados:

- o self-service lê `recipeId` da URL;
- carrega a recipe homologada;
- mostra `linkedRecipe`;
- faz prefill do formulário;
- envia `linkedRecipe` no `metadata` do run;
- no caso do `J_360`, já suporta anexos/documentos e `supportingDocs`.

### Recipe_Orchestrator já suporta LEGAL

Arquivos:

- [apps/api/src/workers/runWorkerRecipeOrchestration.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/workers/runWorkerRecipeOrchestration.ts)
- [apps/api/src/tests/run-worker-recipe-orchestration.test.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/run-worker-recipe-orchestration.test.ts)
- [packages/core/src/actions/reporting/recipeOrchestrationSchema.ts](/home/jusall/projects/EIAH_BUILDER/packages/core/src/actions/reporting/recipeOrchestrationSchema.ts)

Achados:

- `linkedRecipe` é lida do `metadata` do run;
- o runtime já classifica recipe como `legal_review`;
- o domínio já sai como `legal`;
- o líder já sai como `j_360`;
- `riskLevel` já sai do pipeline;
- `requiresGuardianReview` já existe;
- `howToProceedNow`, `recommendedRecipes` e `nextBestImplementationAction` já existem no contrato.

### J_360 legal_review já existe como contrato + engine + export

Arquivos:

- [apps/api/src/workers/runWorkerJ360Output.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/workers/runWorkerJ360Output.ts)
- [apps/api/src/services/runAtivoUniversalAgent/interpreters/j360LegalInterpreter.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/services/runAtivoUniversalAgent/interpreters/j360LegalInterpreter.ts)
- [packages/core/src/actions/reporting/j360LegalReportSchema.ts](/home/jusall/projects/EIAH_BUILDER/packages/core/src/actions/reporting/j360LegalReportSchema.ts)
- [packages/core/src/actions/reporting/j360LegalReportRenderer.ts](/home/jusall/projects/EIAH_BUILDER/packages/core/src/actions/reporting/j360LegalReportRenderer.ts)
- [packages/core/src/actions/reporting/index.ts](/home/jusall/projects/EIAH_BUILDER/packages/core/src/actions/reporting/index.ts)
- [apps/api/src/tests/j360-legal-interpreter.test.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/j360-legal-interpreter.test.ts)
- [apps/api/src/tests/run-worker-j360-output.test.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/run-worker-j360-output.test.ts)

Achados:

- existe `J360LegalReportSchema`;
- existe `manualReviewRequired`;
- existe `riskLevel low | medium | high | critical`;
- existe `evidenceRefs`;
- existe `executiveGuidance`;
- existe `reportSections` e `tableOfContents`;
- existe renderer dedicado de HTML/PDF;
- existe coleta real de evidência PDF no worker.

### Receipt / audit / bundle / ledger já existem

Arquivos:

- [apps/api/src/routes/runs.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/runs.ts)
- [apps/api/src/routes/governance.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/governance.ts)
- [docs/EVIDENCE_INDEX.md](/home/jusall/projects/EIAH_BUILDER/docs/EVIDENCE_INDEX.md)

Achados:

- existe `GET /runs/:id/bundle`;
- o bundle export grava evento em ledger;
- existe `GET /ledger/:txId`;
- existe `receiptCanon`;
- existe vínculo `runId -> bundleHash -> bundle`;
- o índice de evidências já referencia `receipt canon`, `bundle`, `run bundle api contract`, `ledger`.

---

## 2.1 Integração da proposta revisada de áreas jurídicas

Analisei a proposta revisada com integração de áreas jurídicas e a leitura correta, comparando com o código, é esta:

### O que condiz com o código

- a vertical `LEGAL` **não precisa** de runtime novo;
- faz sentido tratar cada área do direito como **recipe homologada** sobre o mesmo pipeline;
- o caminho `Tenant Recipe -> self-service -> linkedRecipe -> Recipe_Orchestrator -> J_360 -> Guardian -> HTML/PDF -> receipt/bundle/ledger` **condiz com o runtime atual**;
- `Trabalhista`, `Contratual` e `LGPD/Privacidade` fazem sentido como primeiras recipes, porque não exigem uma arquitetura diferente da já existente;
- `Imobiliário jurídico` pode mesmo reaproveitar `linkedRecipe` e conversar com a vertical `IMOB`, desde que a governança entre domínios seja explícita no runtime;
- a expansão por tiers é compatível com o código **como roadmap de recipes**, não como novos runtimes.

### O que condiz parcialmente

- a afirmação de que o runtime “suporta 15 áreas sem criar runtime paralelo” é **parcialmente verdadeira**:
  - é verdadeira no sentido de pipeline base;
  - não é plenamente verdadeira no sentido de contrato/governança por área já formalizados.
- a ideia de `Guardian obrigatório em high/critical` por área jurídica é boa, mas **a obrigatoriedade ainda não está formalizada de forma geral no runtime**;
- a ideia de `source policy por área` é correta, mas **isso ainda não existe como contrato explícito por domínio jurídico**;
- a ideia de `schema explícito por área` também é plausível, mas hoje o que existe é um schema jurídico genérico do `J_360`, não um schema por subárea.

### O que não condiz como “já existente”

- não existe `trabalhista_review`, `contratual_review`, `lgpd_express`, `societario_review`, `tributario_review` etc. como recipes comprovadas no código atual;
- não existe `entitlement` específico por área jurídica no contrato atual;
- não existe `source policy` específica por `CLT/TST`, `ANPD`, `CARF`, `BACEN`, `CVM` etc.;
- não existe `recipeVersion`, então falar em rollout controlado de 15 áreas com compatibilidade está correto como proposta, mas não como estado presente do código;
- não existe comprovação de que `penal_empresarial` já teria `manualReviewRequired=true sempre` como política hardcoded de runtime.

### Leitura final da proposta revisada

Essa proposta revisada **condiz como arquitetura-alvo incremental** e **não condiz como descrição do estado atual já implementado**.

Formulação correta:

- o código atual **já suporta** uma vertical `LEGAL` unificada com múltiplas recipes sobre o mesmo pipeline;
- o código atual **ainda não entrega** 15 áreas jurídicas formalizadas com entitlement, source policy, versionamento e gates específicos por área.

### Veredito sobre a proposta revisada

`CONDIZ PARCIALMENTE`

Motivo:

- condiz no desenho de reaproveitamento;
- não condiz integralmente se lida como “isso já está pronto no código”.

---

## 3. Evidências de Tenant Recipes já existentes

### Onde recipe é criada

- [apps/api/src/routes/tenant-recipes.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/tenant-recipes.ts)
  - `POST /tenant-recipes`

### Onde recipe é salva como draft

- [apps/api/src/routes/tenant-recipes.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/tenant-recipes.ts)
  - `status` default `draft`

### Onde recipe é homologada/publicada

- homologação existe:
  - `status = homologated`
  - `homologatedAt`
- publicação como status separado **não existe**

Arquivos:

- [apps/api/src/routes/tenant-recipes.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/tenant-recipes.ts)
- [apps/api/src/types/tenantRecipeContract.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/types/tenantRecipeContract.ts)

### Onde HOMOLOGATED vive

- [apps/api/src/types/tenantRecipeContract.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/types/tenantRecipeContract.ts)
  - `tenantRecipeStatusSchema = ["draft", "homologated", "deprecated"]`

### Onde recipe é associada ao agente

- [apps/api/src/types/tenantRecipeContract.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/types/tenantRecipeContract.ts)
  - campo `agentId`

### Onde recipe é associada a tenant/workspace/scope

- [apps/api/src/routes/tenant-recipes.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/tenant-recipes.ts)
- [apps/api/src/routes/tenantRecipeWorkspaceSelection.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/tenantRecipeWorkspaceSelection.ts)

### Onde recipe abre no self-service

- [apps/web/src/pages/self-service/router.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/pages/self-service/router.tsx)
- [apps/web/src/pages/self-service/j360.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/pages/self-service/j360.tsx)

### Como gera run

- [apps/web/src/pages/self-service/j360.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/pages/self-service/j360.tsx)
  - request já envia `metadata.linkedRecipe`

### Como Recipe_Orchestrator seleciona intent/domain/risk/leader

- [apps/api/src/workers/runWorkerRecipeOrchestration.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/workers/runWorkerRecipeOrchestration.ts)
- [apps/api/src/tests/run-worker-recipe-orchestration.test.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/run-worker-recipe-orchestration.test.ts)

### Como Guardian é acionado

- o runtime já possui `requiresGuardianReview`;
- o `Guardian` já existe como gate/review para fluxos críticos;
- para `LEGAL`, o padrão existe, mas o acionamento automático como gate final **ainda é parcial**.

Arquivos:

- [apps/api/src/workers/runWorkerRecipeOrchestration.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/workers/runWorkerRecipeOrchestration.ts)
- [apps/api/src/workers/runWorkerGuardianOutput.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/workers/runWorkerGuardianOutput.ts)

### Como o resultado vira PDF/HTML

- [packages/core/src/actions/reporting/index.ts](/home/jusall/projects/EIAH_BUILDER/packages/core/src/actions/reporting/index.ts)
- [packages/core/src/actions/reporting/j360LegalReportRenderer.ts](/home/jusall/projects/EIAH_BUILDER/packages/core/src/actions/reporting/j360LegalReportRenderer.ts)
- [apps/web/src/components/runs/RunViewer.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/components/runs/RunViewer.tsx)

### Se o run já tem receipt / audit / bundle / ledger

- `bundle`: sim
- `ledger`: sim
- `receiptCanon`: sim
- `txId`: existe no pipeline governado, condicionado à policy

Arquivos:

- [apps/api/src/routes/runs.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/runs.ts)
- [apps/api/src/routes/governance.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/governance.ts)

### Se human review é recomendado ou bloqueante

- no `J_360LegalReport`: `manualReviewRequired`
- no `Guardian`: gate/review existe
- como bloqueio jurídico final automático para `high/critical`: **parcial**

---

## 4. Evidências de Legal/J_360/Guardian já existentes

### LEGAL / J_360

- `intent=legal_review` já existe
- `domain=legal` já existe
- `primaryAgent=j_360` já existe
- `J360LegalReportSchema` já existe
- `HTML/PDF` jurídicos já existem
- coleta de evidência PDF já existe

### Guardian

- Guardian report estruturado já existe
- `policyDecision`, `reasonCode`, `checklist`, `coverageMatrix`, `governance` já existem
- HTML/PDF do Guardian já existem

### Testes

- [apps/api/src/tests/run-worker-recipe-orchestration.test.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/run-worker-recipe-orchestration.test.ts)
- [apps/api/src/tests/j360-legal-interpreter.test.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/j360-legal-interpreter.test.ts)
- [apps/api/src/tests/run-worker-j360-output.test.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/run-worker-j360-output.test.ts)
- [apps/api/src/tests/tenant-recipe-contract.test.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/tenant-recipe-contract.test.ts)
- [apps/api/src/tests/tenant-recipe-workspace-selection.test.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/tenant-recipe-workspace-selection.test.ts)

---

## 5. Itens reaproveitáveis

### EXISTE E PODE SER REAPROVEITADO

- `Tenant Recipes` como contrato e runtime base
- `content v2` de recipes
- `recipeId` no self-service
- `linkedRecipe` no `metadata`
- `Recipe_Orchestrator`
- `J_360 legal_review`
- `J360LegalReportSchema`
- `J360LegalReportRenderer`
- `RunViewer`/HTML/PDF
- `run bundle`
- `receiptCanon`
- `ledger`
- `Evidence Index`

### EXISTE MAS PRECISA ADAPTAR

- status de publicação
- versionamento explícito de recipe
- enforcement jurídico de `high/critical -> revisão humana`
- Guardian como gate jurídico mais explícito
- policy/entitlement/trust/costguard executados e auditáveis no fluxo Legal
- source policy jurídica
- capability registry / entitlement registry da vertical Legal

### EXISTE MAS NÃO DEVE SER USADO

- qualquer proposta de runtime paralelo de Legal fora de `Tenant Recipes`
- qualquer lógica nova resolvida só no `ChatAgentLauncher`

### RISCO DE DRIFT / P0

- `chatLauncherEngine.ts` web contém regras por domínio/especialista
- docs/pitch de Legal poderiam sugerir publicação/status/versionamento que o runtime ainda não tem

---

## 6. Itens inexistentes

- `published` como status distinto de recipe
- `recipeVersion`
- `recipe output schema` explícito como contrato próprio de recipes
- `recipe evidence schema` explícito
- `legal vertical registry entry` comprovado como artefato próprio
- `legal capability registry` explícito
- `legal entitlement` explícito
- `source policy` jurídica dedicada
- check de compatibilidade específico de recipe contract/version
- recipes jurídicas especializadas comprovadas no código, como:
  - `trabalhista_review`
  - `contratual_review`
  - `lgpd_express`
  - `societario_review`
  - `tributario_review`
  - `compliance_review`
  - `imobiliario_review`
  - `consumidor_review`
  - `pi_review`
  - `regulatorio_review`
  - `ambiental_esg`
  - `penal_empresarial`
  - `previdenciario_review`
  - `internacional_review`
  - `licitacoes_review`

---

## 7. Itens apenas pré-configurados / stub / mock

- `published`: inexistente
- `recipeVersion`: inexistente
- governança Legal forte por `RBAC/entitlement/TrustScore/CostGuard` no fluxo jurídico: **parcial / pré-carregada via metadata**, não comprovada como execução plena end-to-end
- `Guardian` como gate jurídico obrigatório em `high/critical`: **parcial**
- alguns dados de governança nos renderers aparecem mais como **reflexo do payload** do que prova de avaliação independente naquele run

---

## 8. Riscos P0-P4

### P0

- drift entre arquitetura agent-driven declarada em [AGENTS.md](/home/jusall/projects/EIAH_BUILDER/AGENTS.md) e a existência de roteamento/regras por domínio no front-end em [apps/web/src/components/agents/chatLauncherEngine.ts](/home/jusall/projects/EIAH_BUILDER/apps/web/src/components/agents/chatLauncherEngine.ts)
- ausência de `published`/`recipeVersion` se a doc/proposta de Legal assumir isso como já existente
- qualquer tentativa de criar runtime paralelo de Legal ignorando `Tenant Recipes`

### P1

- governança aparecer no payload/render sem prova suficiente de avaliação runtime real para Legal
- `high/critical` sem bloqueio jurídico final automático suficientemente formalizado
- `manualReviewRequired` existir no contrato, mas não haver política canônica final de gate por risco

### P2

- ausência de `recipeVersion`
- ausência de baseline/política de breaking change para recipes
- ausência de schema explícito de output/evidence de recipe

### P3

- monetização/entitlement de Legal sem vínculo explícito comprovado a invoice/receipt/settlement

### P4

- ausência de rollout/checklist/gates formais da vertical Legal como vertical onboarded

---

## 9. Aderência à arquitetura agent-driven

### 1. O ChatAgentLauncher contém lógica residual por agente?

`PARCIALMENTE NÃO` no componente; `SIM` na camada launcher-side.

Evidência:

- [apps/web/src/components/agents/ChatAgentLauncher.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/components/agents/ChatAgentLauncher.tsx)
- [apps/web/src/components/agents/chatLauncherEngine.ts](/home/jusall/projects/EIAH_BUILDER/apps/web/src/components/agents/chatLauncherEngine.ts)

Leitura:

- o componente `ChatAgentLauncher` está mais orientado a renderização;
- mas o ecossistema launcher-side ainda carrega regras especializadas em `chatLauncherEngine.ts` e resolvers web.

### 2. Há regras de IMOB, LEGAL, J_360, Guardian ou especialistas hardcoded no launcher?

`SIM`, fora do componente puro, mas ainda no front-end launcher layer.

Evidência:

- imports como `resolveLegalJourneyStage`, `resolveGuardianDecision`, `resolveJuridicoDecision`, `resolveImobVerticalContext`, `resolveSpecialistExplainTarget` em [apps/web/src/components/agents/chatLauncherEngine.ts](/home/jusall/projects/EIAH_BUILDER/apps/web/src/components/agents/chatLauncherEngine.ts)

### 3. O engine já suporta handoff por contrato de agente?

`PARCIALMENTE`

- no chat front-end, existe handoff/decisão launcher-side;
- no self-service/run worker, existe seleção de agente líder por `Recipe_Orchestrator`.

### 4. O engine já suporta recipe/receita como fluxo governado?

`SIM`

Evidência:

- [apps/api/src/workers/runWorkerRecipeOrchestration.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/workers/runWorkerRecipeOrchestration.ts)

### 5. Existe padrão reutilizável para vertical LEGAL?

`SIM, PARCIALMENTE`

- padrão existe via `J_360 legal_review`;
- ainda falta formalização de vertical registry/entitlement/source policy próprios.

### 6. O padrão de entitlement por tenant/workspace/plano já existe?

`SIM`, mas não está provado como plenamente acoplado ao fluxo Legal.

### 7. O fallback fail-closed já existe?

`SIM`, em várias frentes do projeto, inclusive recipes/context missing e policy missing.

### 8. Há reasonCodes para bloqueio por ausência de entitlement/permissão/policy/recipe?

`SIM, PARCIALMENTE`

Exemplos:

- `RECIPE_ORCHESTRATION_CONTEXT_MISSING`
- `policy_blocked_missing_entitlement`
- `POLICY_NOT_FOUND`

### 9. Existe estrutura para quick replies determinadas pelo engine?

`SIM`

Mas hoje isso vive fortemente no `chatLauncherEngine.ts` web.

### 10. Existe snapshot/payload de apresentação por mensagem?

`SIM`

Evidência:

- `MessagePresentationSnapshot` e funções associadas no launcher/chat presentation stack.

### 11. Existe separação clara entre agente, engine e launcher?

`PARCIALMENTE`

- existe uma boa intenção estrutural;
- no self-service/run worker, isso está mais aderente;
- no chat launcher, ainda há drift.

### 12. A abertura no self-service passa pelo engine ou pula governança?

`PARCIALMENTE`

- ela passa por runtime real de run worker/orchestrator;
- mas a governança do fluxo jurídico ainda não está totalmente demonstrada como enforcement forte end-to-end.

---

## 10. Aderência a Tenant Recipes / Recipe_Orchestrator

`ALTA`

Motivos:

- schema real de recipe já existe;
- `recipeId` já existe;
- recipe homologada já existe;
- recipe abre self-service real;
- gera run real;
- `Recipe_Orchestrator` já classifica `legal_review`;
- `J_360` já lê recipe e produz relatório jurídico estruturado.

Gap principal:

- falta `recipeVersion` e formalização de status/versionamento além de `homologated`.

---

## 11. Aderência a tenant/workspace/entitlement

`MÉDIA`

### Confirmado

- tenant/workspace/scope de recipe existem;
- workspace visibility de recipe existe e possui teste;
- `linkedRecipe` trafega com `tenant/workspace` no run;
- o projeto possui sistemas de `entitlement`, `RBAC`, `trustScore`, `CostGuard`.

### Não comprovado integralmente para Legal

- que o fluxo `legal_review` já execute esses gates como política dura e auditada antes do parecer final.

Leitura correta:

- **a infraestrutura existe**;
- **a aderência específica de Legal ainda é parcial**.

---

## 12. Aderência a Receipt Canon / audit / ledger

`ALTA`

### Confirmado

- `run -> bundle`
- `bundleHash`
- `ledger`
- `txId`
- `receiptCanon`
- export de evidência

Arquivos:

- [apps/api/src/routes/runs.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/runs.ts)
- [apps/api/src/routes/governance.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/governance.ts)
- [docs/EVIDENCE_INDEX.md](/home/jusall/projects/EIAH_BUILDER/docs/EVIDENCE_INDEX.md)

### Limite atual

- o `Legal Proof` ainda deve **usar esse pipeline**, não criar recibo paralelo.

Veredito aqui:

- **o pipeline existe e deve ser reaproveitado**.

---

## 13. Aderência a PDF / HTML export

`ALTA`

### Confirmado

- renderer jurídico dedicado existe;
- HTML e PDF jurídicos existem;
- `RunViewer` já integra esse renderer;
- o renderer já suporta estrutura jurídica, ABNT no PDF e navegação no HTML.

Arquivos:

- [packages/core/src/actions/reporting/j360LegalReportRenderer.ts](/home/jusall/projects/EIAH_BUILDER/packages/core/src/actions/reporting/j360LegalReportRenderer.ts)
- [packages/core/src/actions/reporting/index.ts](/home/jusall/projects/EIAH_BUILDER/packages/core/src/actions/reporting/index.ts)
- [apps/web/src/components/runs/RunViewer.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/components/runs/RunViewer.tsx)

Gap:

- o conteúdo do parecer depende ainda da qualidade da saída `J_360`, não mais da arquitetura do renderer.

---

## 14. Arquivos candidatos a alteração

### Contrato e versionamento

- [apps/api/src/types/tenantRecipeContract.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/types/tenantRecipeContract.ts)
- [apps/api/src/routes/tenant-recipes.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/tenant-recipes.ts)

### Runtime Legal / governance

- [apps/api/src/workers/runWorkerRecipeOrchestration.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/workers/runWorkerRecipeOrchestration.ts)
- [apps/api/src/services/runAtivoUniversalAgent/interpreters/j360LegalInterpreter.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/services/runAtivoUniversalAgent/interpreters/j360LegalInterpreter.ts)
- [apps/api/src/workers/runWorkerJ360Output.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/workers/runWorkerJ360Output.ts)

### Render / export

- [packages/core/src/actions/reporting/j360LegalReportSchema.ts](/home/jusall/projects/EIAH_BUILDER/packages/core/src/actions/reporting/j360LegalReportSchema.ts)
- [packages/core/src/actions/reporting/j360LegalReportRenderer.ts](/home/jusall/projects/EIAH_BUILDER/packages/core/src/actions/reporting/j360LegalReportRenderer.ts)
- [apps/web/src/components/runs/RunViewer.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/components/runs/RunViewer.tsx)

### Launcher drift

- [apps/web/src/components/agents/chatLauncherEngine.ts](/home/jusall/projects/EIAH_BUILDER/apps/web/src/components/agents/chatLauncherEngine.ts)
- [apps/web/src/components/agents/ChatAgentLauncher.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/components/agents/ChatAgentLauncher.tsx)

---

## 15. Testes e checks necessários

### Já existem

- `tenant recipe contract`
- `tenant recipe workspace selection`
- `run worker recipe orchestration`
- `j360 legal interpreter`
- `run worker j360 output`
- `renderer j360`

### Precisam ser adicionados

- compatibilidade de `recipeVersion`
- status/versionamento (`draft/homologated/published/deprecated` se houver evolução)
- fail-closed de Legal sem entitlement/policy/source policy
- `high/critical -> human review required`
- `high/critical -> sem parecer final automatizado`
- consistência `run -> receipt -> bundle -> export`
- drift guard entre docs/contract/runtime para recipes legais
- no-launcher-drift para novas regras de Legal

---

## 16. Plano incremental recomendado

### Fase A — Auditoria sem alteração funcional

- consolidar inventário dos arquivos acima;
- congelar matriz de reaproveitamento;
- marcar gaps P0/P1 reais;
- validar cobertura já existente em testes.

### Fase B — Formalização de Tenant Recipes

- adicionar `recipeVersion`;
- decidir se `published` vira status real ou se `homologated` permanece como canônico;
- criar schema explícito de output/evidence de recipe, se necessário;
- formalizar `recipe -> agent`, `recipe -> capability`, `recipe -> entitlement`.

### Fase C — Contratos Legal

- formalizar contrato da vertical Legal sobre `J_360`;
- source policy jurídica;
- reason codes jurídicos;
- policy de risco e revisão humana.

### Fase D — Engine

- manter tudo em `runWorker` / `Recipe_Orchestrator` / agent contracts;
- nenhum comportamento novo deve nascer no `ChatAgentLauncher`;
- endurecer fail-closed para `LEGAL` quando faltar governance/entitlement/source policy.

### Fase E — Proof / Governance

- usar o pipeline existente:
  - `receiptCanon`
  - `bundle`
  - `ledger`
  - `txId`
  - `HTML/PDF`
  - masking de PII

### Fase F — Recipes Legal

- contratos IA
- LGPD Express
- Legal Proof
- análise trabalhista/contratual/compliance
- expansão por tiers, apenas depois do núcleo estabilizado:
  - `trabalhista_review`
  - `contratual_review`
  - `lgpd_express`
  - `societario_review`
  - `tributario_review`
  - `compliance_review`
  - `imobiliario_review`
  - `consumidor_review`
  - `pi_review`
  - `regulatorio_review`
  - `ambiental_esg`
  - `penal_empresarial`
  - `previdenciario_review`
  - `internacional_review`
  - `licitacoes_review`

### Fase G — Testes e CI

- unit
- contract
- e2e
- fail-closed
- no launcher drift
- recipe schema compatibility
- receipt/bundle/export consistency
- evidence index references
- `high/critical human review`

---

## 17. Bloqueios antes de implementar

- definir se `published` será criado ou se `homologated` será o status público oficial;
- decidir política de `recipeVersion`;
- decidir se `Guardian` será obrigatório em `LEGAL high/critical` ou apenas review recomendado;
- resolver o drift arquitetural do launcher para não introduzir regra nova de Legal na UI;
- formalizar entitlement/source policy jurídica antes de vender `LEGAL` como vertical operacional completa.

---

## 18. Veredito

`CONDIZ PARCIALMENTE`

Condiz porque:

- existe base real de runtime para Recipes/Legal/J_360/Guardian/export/receipt;

Não condiz integralmente porque:

- faltam `published`, `recipeVersion`, enforcement jurídico-governado final e limpeza de drift launcher-side.

---

## 19. Pode reaproveitar o que já existe?

`SIM, PARCIALMENTE`

Sim para:

- recipes
- orchestrator
- J_360
- Guardian
- export
- receipt/bundle/ledger

Parcialmente porque:

- ainda precisa formalizar versionamento/governança específica.

---

## 20. A vertical LEGAL deve usar Tenant Recipes existente ou criar runtime novo?

`DEVE USAR TENANT RECIPES EXISTENTE`

Justificativa:

- o runtime já existe;
- o self-service já existe;
- o orchestrator já existe;
- o `J_360 legal_review` já existe;
- o proof/export já existe;
- criar runtime novo aumentaria drift, duplicação e risco arquitetural sem necessidade.

---

## 21. Próximo PR recomendado

**PR recomendado:** formalização aditiva de `LEGAL` sobre `Tenant Recipes`

Escopo mínimo:

1. adicionar `recipeVersion`;
2. decidir e formalizar `published` vs `homologated`;
3. criar contrato aditivo de governança Legal:
   - source policy
   - entitlement
   - risk policy
   - `high/critical -> human review`
4. amarrar isso no `Recipe_Orchestrator` / `J_360`, não no `ChatAgentLauncher`;
5. adicionar testes de fail-closed e compatibilidade.

**Leitura do roadmap de áreas jurídicas**

Depois desse PR base, a sequência correta é:

1. estabilizar `trabalhista_review`
2. estabilizar `contratual_review`
3. estabilizar `lgpd_express`
4. só então abrir o tier 2 em diante

Isso condiz melhor com o código do que tentar formalizar 15 áreas ao mesmo tempo.

---

## Matriz de reaproveitamento

| Item da proposta | Arquivo(s) encontrados | Função atual do código | Estado real | Reaproveitamento recomendado | Lacuna | Risco | Testes necessários |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tenant Recipes | `apps/api/src/routes/tenant-recipes.ts`, `apps/api/src/types/tenantRecipeContract.ts` | CRUD, contrato e persistência de recipes | implementado, runtime ativo, possui teste, possui evidência indexável | reaproveitar integralmente | falta `recipeVersion` | P2 | compat/version |
| Status draft/homologated | mesmos acima | ciclo real de status | implementado, runtime ativo | reaproveitar | `published` não existe | P1 | status transition |
| Workspace scope de recipe | `apps/api/src/routes/tenantRecipeWorkspaceSelection.ts` | seleção segura por tenant/workspace | implementado, runtime ativo, possui teste, possui evidência indexável | reaproveitar integralmente | sem gap material | P0 se ignorado | selection regression |
| Recipe aberta no self-service | `apps/web/src/pages/self-service/router.tsx`, `j360.tsx`, `recipePrefill.ts` | abre recipe homologada, prefill e cria run | implementado, runtime ativo, possui teste, possui evidência indexável | reaproveitar integralmente | heurísticas podem evoluir | P1 | prefill/e2e |
| Recipe_Orchestrator | `apps/api/src/workers/runWorkerRecipeOrchestration.ts` | classifica intent/domain/risk/leader/governance | implementado, runtime ativo, possui teste | reaproveitar integralmente | governance Legal ainda parcial | P1 | legal governance gates |
| LEGAL via J_360 | `runWorkerJ360Output.ts`, `j360LegalInterpreter.ts`, `j360LegalReportSchema.ts` | converte output em parecer jurídico estruturado | implementado, runtime ativo, possui teste | reaproveitar integralmente | source policy / enforcement final | P1 | legal fail-closed |
| Guardian review/gate | `runWorkerGuardianOutput.ts`, `guardianPlanManager.ts` | gate/checklist/governança para fluxos críticos | implementado, runtime ativo, possui teste | reaproveitar, adaptando para Legal | papel jurídico final ainda parcial | P1 | high/critical review |
| HTML/PDF export | `j360LegalReportRenderer.ts`, `reporting/index.ts`, `RunViewer.tsx` | renderer jurídico e export | implementado, runtime ativo, possui teste | reaproveitar integralmente | depende da qualidade do payload | P2 | export consistency |
| Receipt Canon / bundle / ledger | `apps/api/src/routes/runs.ts`, `apps/api/src/routes/governance.ts` | bundle, ledger, receiptCanon, txId | implementado, runtime ativo, possui evidência indexável | reaproveitar integralmente | Legal Proof não pode bifurcar | P0 | receipt-bundle-export |
| recipeId | `j360.tsx`, `runWorkerRecipeOrchestration.ts` | vínculo recipe -> run | implementado, runtime ativo | reaproveitar integralmente | sem `recipeVersion` | P2 | recipe linkage |
| recipeVersion | não encontrado | inexistente | não existe | criar de forma aditiva | contrato/versionamento faltando | P2 | schema compatibility |
| Published status | não encontrado | inexistente | não existe | decidir se precisa criar | doc/produto podem divergir | P1 | status contract |
| Legal entitlement/policy | infraestrutura genérica em `requireScope`, entitlements, governance payloads | controle genérico existe | parcial | adaptar | Legal específico não formalizado | P1 | fail-closed entitlement |
| Recipes jurídicas por área | não encontradas como artefatos específicos | roadmap de produto implícito, não runtime atual | não existe | criar como recipes homologadas sobre a base atual | falta catálogo real por área | P2 | contract/e2e por recipe |
| Guardian obrigatório por área high/critical | existe `requiresGuardianReview` e `manualReviewRequired`, mas não regra universal por área | governança parcial | parcial | adaptar no engine, não na UI | falta policy canônica transversal | P1 | high-critical gate |
| Source policy jurídica por área | não encontrada como contrato dedicado | referência normativa hoje é inferida pelo `J_360` | não existe | criar de forma aditiva | falta vínculo formal por área | P1 | source policy contract |
| Chat launcher rules | `ChatAgentLauncher.tsx`, `chatLauncherEngine.ts` | roteamento/quick replies/ajuda por domínio | implementado, runtime ativo, possui teste | **não ampliar aqui** | drift launcher-side | P0 | launcher drift guard |
