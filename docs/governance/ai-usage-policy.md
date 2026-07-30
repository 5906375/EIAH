# Política de Uso de Inteligência Artificial — EIAH

Versão documental: v1
Data de referência: 2026-07-30
Status normativo: Proposta
Escopo: desenvolvimento, administração, operação e revisão humana de sistemas de IA do EIAH

## 1. Finalidade

Esta política estabelece regras para uso responsável e governado de IA no EIAH. Ela descreve o estado real dos controles no repositório e não substitui avaliação jurídica, análise de impacto, decisão humana ou procedimentos operacionais específicos.

Este documento não declara conformidade nem certificação ISO/IEC 42001. O mapeamento à estrutura de sistema de gestão e ao ciclo Plan-Do-Check-Act (PDCA) é orientativo. A ISO descreve esse ciclo como meio de estabelecer, implementar, manter e melhorar continuamente um sistema de gestão de IA.

## 2. Abrangência

Aplica-se a:

- agentes, engines, workers, APIs, modelos e integrações que produzam ou consumam decisões de IA;
- operadores, administradores, revisores humanos e mantenedores;
- dados de tenants e workspaces usados em prompts, contexto, telemetria, receipts, SCL ou ledger;
- mudanças de policy, classificação de risco, automação, aprovação, promoção e rollback;
- assistentes de coding que atuem no repositório.

O código de conduta complementar está em `docs/governance/ai-code-of-conduct.md`.

## 3. Princípios obrigatórios

1. **Finalidade e proporcionalidade:** usar IA somente para finalidade definida, com autonomia compatível com o risco.
2. **Fail-closed:** ausência de identidade, tenant, workspace, scope, entitlement, policy ou aprovação obrigatória deve bloquear a ação sensível.
3. **Supervisão humana:** decisões que a régua de risco ou o contrato do fluxo reservem a uma pessoa não podem ser simuladas ou inferidas pelo agente.
4. **Rastreabilidade honesta:** registrar somente evidência real; separar execução, inferência, limitação e proposta.
5. **Privacidade e minimização:** não incluir PII, credenciais, URLs de banco ou segredos quando não forem necessários; aplicar masking antes de exposição a modelo ou persistência quando a policy exigir.
6. **Transparência:** respostas e registros devem preservar reason codes, proveniência e limitações aplicáveis sem prometer controles inexistentes.
7. **Não discriminação e revisão:** resultados potencialmente materiais para pessoas devem admitir contestação e revisão humana.
8. **Segurança e reversibilidade:** não ampliar permissões nem executar ação crítica fora do contrato; rollback só pode ser tratado como operacional quando houver handler, teste e evidência.

## 4. Inventário de controles e estado real

Os estados usados são:

- **evidenciado:** artefato versionado e gate ou teste localizável sustentam a capacidade delimitada;
- **parcial:** existe implementação, mas a cobertura, recorrência, integração, ratificação ou governança ainda é insuficiente;
- **proposta:** não há implementação operacional comprovada.

| Controle | Estado | Base atual e limite |
| --- | --- | --- |
| Escopo `tenantId`/`workspaceId` | parcial | `apps/api/src/middlewares/requireScope.ts` transporta o contexto ao RBAC e `packages/core/src/policy/TenantPolicyStore.ts` falha fechado para contexto vazio ou policy incompatível. Isso não prova cobertura universal de todos os fluxos. |
| RBAC | parcial | `requireScope()` bloqueia decisões negadas com reason code. O Evidence Index registra owner formal ainda não ratificado e drift histórico de artefato `dist`; a governança completa permanece aberta. |
| Policy Engine / policy por tenant | parcial | `TenantPolicyStore` resolve policy por tenant/workspace e bloqueia ausência, desabilitação e indisponibilidade. Cobertura ponta a ponta e owner governado não estão fechados. |
| Trust Score | parcial | Há avaliação em rotas e serviços, inclusive `apps/api/src/services/trustScore.ts` e `packages/core/src/services/sclLedger.ts`; outros contratos admitem `not_evaluated` ou valor nulo. Não há prova de avaliação uniforme. |
| Aprovação humana | parcial | Schema, estados e gates existem em recortes de runtime. `docs/ops/evidence/main-hard-gates-applied-2026-07-27.md` registra `approvals=0` no ruleset de `main`; reviewer humano diferente do autor não é exigência técnica comprovada. |
| Classificação de risco | evidenciado | A fonte versionada é `contracts/risk-tier-policy.v1.json`; `packages/core/src/policy/riskTierPolicy.ts` carrega e valida o JSON, e o gate P1 o consome. Leitores P2 ainda extraem snapshots diretamente de fontes de ações; a migração da fase 2 permanece pendente. |
| Catálogo de reason codes | evidenciado | `packages/core/src/reasons/reasonCatalog.ts` é o canon e `scripts/checkReasonCodeCanon.ts` verifica consistência estrutural. O check está no job `EvidenceIndex`; códigos `proposed` continuam sem ativação operacional. |
| SCL e ledger | parcial | Serviços e persistência existem. A evidência de falha do runWorker grava `reasonCode` governado em `SclLedger.payload`; exposição por endpoint e integração real com banco para essa herança permanecem pendentes. |
| Receipt Canon | parcial | Contrato versionado, baseline e gate de compatibilidade existem. A cobertura de integração real e recorrente de todos os fluxos críticos não é inferida apenas do gate de contrato. |
| Masking de PII e segredos | parcial | `apps/api/src/services/masker.ts` e o executor LLM aplicam masking conforme knowledge policy; existem policies `conditional` e `none`. A existência do utilitário não prova sanitização universal de canais, logs e payloads. |
| Gates de CI e proteção de `main` | evidenciado | O registro pós-save de 2026-07-27 comprova ruleset ativo com 20 required checks. O check de reason-code canon agora executa dentro de um job requerido. Isso não fecha HITL, staging nem produção. |
| Rastreabilidade via Evidence Index | parcial | `scripts/checkEvidenceIndex.ts` remove `:linha` durante a normalização e valida existência do path. O gate não verifica se a linha citada contém o conteúdo alegado; revisão semântica e de linha continua manual. |
| Reconciliação e telemetria APE | parcial | A auditoria dos ciclos #45–#48 registra `auditGap` e `duplicateSideEffects` hardcoded em ciclos recentes. Esses valores não podem ser usados como prova de recorrência medida. |
| Auto-rollback de policy | proposta | Não há handler de rollback, leitura de `EXPERIMENT_AUTO_ROLLBACK_ON_PROMOTION_FAIL` nem tratamento de `PROMOTION_GATE_FAILED` em `apps/api/src/routes/governance.ts` na data de referência. |

## 5. Regras por ciclo de vida

### Planejar

- definir finalidade, owner, pessoas afetadas, dados, risco e critério de saída;
- registrar dependências de tenant/workspace, RBAC, policy, Trust Score e approval;
- classificar a ação pela fonte versionada de risco;
- identificar requisitos de masking, receipt, SCL, ledger e revisão humana;
- manter propostas separadas de capacidades operacionais.

### Executar

- usar somente identidade, permissões, dados e ferramentas autorizados;
- bloquear contexto ausente ou inconsistente em vez de aplicar fallback permissivo;
- minimizar dados enviados a modelos e integrações;
- preservar reason codes governados nas fronteiras;
- não executar decisão reservada a revisor humano.

### Verificar

- revisar logs, SCL, ledger, receipts, masking e efeitos colaterais;
- conferir manualmente fidelidade de citações `arquivo:linha` no Evidence Index;
- não aceitar métricas hardcoded como telemetria medida;
- distinguir gate estrutural verde de integração real, staging ou ratificação operacional;
- documentar incidentes, desvios, contestação e decisão humana.

### Agir e melhorar

- corrigir causa raiz sem silenciar gates;
- rebaixar documentalmente controles que não existam no runtime;
- versionar mudança de policy ou contrato e executar gates aplicáveis;
- exigir nova evidência antes de promover estado;
- manter ação corretiva aberta enquanto integração, recorrência ou ratificação estiver pendente.

## 6. Supervisão humana

O revisor humano deve receber contexto suficiente para decidir: ação, escopo, risco, policy, reason code, evidência, limitações e efeitos esperados. Aprovação não pode ser fabricada por agente nem deduzida de ausência de rejeição.

Quando a ação puder produzir efeito jurídico, financeiro, de publicação, comunicação externa, mudança de acesso ou impacto material sobre pessoa, deve prevalecer a régua de approval e policy do fluxo. Onde essa régua ainda for parcial, a operação deve permanecer limitada ou bloqueada.

## 7. Logs, evidência e retenção

- Logs e registros devem ser auditáveis por tenant/workspace e minimizar conteúdo sensível.
- SCL, ledger e receipts são controles de rastreabilidade, não autorização autônoma.
- O Evidence Index não deve antecipar execução e seu gate verde não comprova fidelidade semântica de linha.
- Retenção e descarte devem seguir policy específica do dado e do ambiente; esta política não cria prazo de retenção inexistente.

## 8. Incidentes e desvios

Em suspeita de vazamento, acesso indevido, decisão fora de policy, efeito duplicado, receipt inconsistente ou comportamento inseguro:

1. interromper ou limitar a automação;
2. preservar evidência mascarada;
3. identificar tenant/workspace e efeitos;
4. notificar owner e revisor humano aplicável;
5. registrar causa, contenção e ação corretiva;
6. não afirmar rollback automático; executar somente procedimento manual realmente disponível e autorizado;
7. revalidar antes de retomar.

## 9. Mapeamento orientativo à ISO/IEC 42001

| Tema do sistema de gestão | Aplicação nesta política | Estado |
| --- | --- | --- |
| Liderança, política e responsabilidades | Política formal, papéis e código de conduta | parcial — documentos propostos; enforcement organizacional ainda requer adoção humana |
| Planejamento de riscos e oportunidades | Risk tier, finalidade, impacto e critérios de saída | parcial — fonte de risco P1 evidenciada; leitores P2 pendentes |
| Suporte, competência e informação documentada | Responsabilidades, Evidence Index, runbooks e contratos | parcial — rastreabilidade de linha e HITL técnico têm gaps |
| Operação | RBAC, tenant/workspace, policy, approval, masking, SCL e receipts | parcial — controles existem em recortes, sem cobertura universal comprovada |
| Avaliação de desempenho | CI, logs, telemetria e reconciliação | parcial — CI está evidenciado; recorrência APE recente está contaminada por métricas hardcoded |
| Melhoria contínua | PDCA, incidentes, correção de causa raiz e revalidação | proposta/parcial — processo definido documentalmente; adoção recorrente não comprovada |

## 10. Manutenção

Mudanças nesta política exigem revisão humana, coerência com o roadmap canônico e atualização do estado dos controles somente com evidência real. A criação deste documento prova apenas a existência do artefato documental; não prova execução, adoção organizacional ou certificação.
