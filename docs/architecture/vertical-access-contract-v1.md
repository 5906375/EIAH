# Acesso transversal a verticais — Passo 1

Contrato `vertical.access.v1`, aditivo em `verticalEntitlementGateContract.ts`, e resolver puro
`services/products/verticalAccessResolver.ts`. Este corte não tem consumidor operacional.

A decisão de acesso a uma capability não autoriza Agent Protocol action. Toda decisão retorna
`actionAuthorization=not_evaluated`, inclusive quando `allowed=true`. RBAC de action,
TenantActionPolicy, approval, tier, receipt e execução continuam em seus gates próprios.
`critical_action` não é um modo aceito neste contrato de acesso.

## Auditoria e reconciliação

| Fonte existente | Decisão neste corte |
| --- | --- |
| `workspaceVerticalRegistry.ts` | Preservar leitor. Atualmente consulta entitlement IMOB, usage, assignments e permissão; não conectar o resolver novo. |
| `verticalRegistryComposition.ts` | Reutilizar `IMOB_CHAT_PERMISSION` e catálogo de capabilities para exportar somente um descriptor IMOB novo; composição, handoff e contrato público do registry permanecem iguais. |
| `productActivation.ts` | Preservar instalação e provisionamento atuais. O resolver não importa este módulo nem ativa produto, atribuição ou policy. |
| `verticalAccessApproval.ts` | Reutilizar o fato `VerticalUsage` já resolvido por `resolveVerticalUsage`; não duplicar lifecycle, migração, score ou tabela de liberação. Seus leitores executam ensure/backfill, portanto não são chamados pelo resolver puro. |
| `imobAccessGate.ts` | Preservar erros, CTAs e auditoria das rotas; o resolver não importa o módulo com dependências de DB/auditoria. |
| `imobEntitlements.ts` | Preservar `REAL_ESTATE_CORE = instalação ativa OU policy imobiliária`; este alias legado não é input de entitlement no novo contrato. |
| `schema.prisma` | `TenantProductInstallation` sustenta produto por tenant/workspace; `VerticalAccessApproval` sustenta liberação/revogação; `TenantActionPolicy` sustenta autorização de action. Nenhum model/migration necessário. |
| `ops/verticals/imob/vertical.manifest.v1.json` | Preservar cadeia crítica, actions HIGH, owners e proofs. Acesso a capability não substitui o manifesto nem habilita essas actions. |
| `verticalEntitlementGateContract.ts` | Estender schema puro existente; reutilizar `TenantProductInstallationLike` e `resolveOperationalEntitlementStatus`. Gate legado de assignment/history permanece igual. |
| `workspaceResponsibility.ts` | Permissões e stage continuam resolvidos pelos helpers existentes (`hasWorkspacePermission`, `canWorkspaceOperateImobStage`) na futura borda autenticada, sem copiar RBAC para outro subsistema. |

Fontes consultadas: CLAUDE.md, CODEX.md, roadmap canônico v8.1, AGENTS.md,
agent-chat-runtime.md, EVIDENCE_INDEX.md e IA_EIAH.md; ADR-010, ADR-011 e
`docs/ops/vertical-entitlement-billing-policy.md` para reconciliação.

Checklists IMOB: `imob-data-pr-execution-checklist.md`, Etapa 8 Trilha B, é aplicável à
base contratual sem migration. `imob-data-trilha-b-runtime-minimo-execution-checklist.md`
foi consultado para preservar o runtime fechado; nenhum assignment foi alterado/reaberto.
Run Archive e Funil + Equipe foram consultados e são não afetados: nenhuma alteração de
run, archive, KPI, broker, dashboard ou equipe. IMOB Cost não é afetado; nenhum preço,
quota, cobrança, ledger ou provisionamento financeiro é alterado.

## Semântica mínima

- `verticalId`: identidade explícita do descriptor, sem lista global que promova verticais futuras.
- `productId`: deve coincidir exatamente com o produto da instalação escopada.
- `installationRequired`: habilita checagem da instalação; se dispensada explicitamente,
  `entitlementKey` deve ser null. Não dispensa permission, scope ou usage.
- `entitlementKey`: identifica o entitlement derivado da instalação; não consulta boolean map,
  REAL_ESTATE_CORE ou TenantActionPolicy. Neste corte não há fonte alternativa de entitlement.
- `workspacePermission`: exige fato servidor `{key, allowed:true}` correspondente.
- `stagePolicy`: `not_required` para seleção de capability no front door sem caso;
  `required` exige stage na solicitação e fato de permissão correspondente e permitido.
- `revocationPolicy`: `resolved_usage`, com usage explícito produzido pela base ADR-011.
- `capabilities`: catálogo explícito, IDs únicos e modos `read_only` / `requires_write`.

O resolver valida schema com safeParse e nega fatos ausentes/malformados, scope vazio ou
divergente, vertical desconhecida/duplicada, produto ausente/inativo ou divergente,
capability/modo inválidos, permissão negada e stage incompatível quando requerido.
Reutiliza a normalização de status do gate genérico existente. Não muda a exigência de
`active` literal do PRE_DUIMP: nenhuma integração PRE_DUIMP foi criada.

Revogação conforme ADR-011: `bloqueio_total` → usage `blocked` → nega tudo;
`somente_leitura` → `read_only` → nega escrita, permite leitura autorizada;
`sem_nova_ativacao` → `full` → preserva uso instalado. O resolver trata somente uso,
não nova ativação. Usage ausente ou desconhecido nega; não herda o default full do registry.
Histórico/evidência continuam no gate legado `read_history`, fora deste acesso a capability.

O caller futuro deve fornecer fatos frescos de scope autenticado, identidade/membership,
instalação, permission, stage e usage. Booleanos vindos de cliente não são fatos confiáveis.
O Passo 1 não implementa esse adapter nem garante sua origem operacional.

## Limites e compatibilidade

O descriptor IMOB exportado reutiliza o catálogo atual, sem alterar seu consumidor.
LOG/PRE_DUIMP, MARKETING e LEGAL aparecem somente em fixtures sintéticas de extensibilidade;
não são registrados, instalados ou promovidos a operacionais. Stage mapping por capability,
fontes reais e ativação de novos consumidores ficam para cortes explícitos posteriores.

Os reasonCodes `VERTICAL_ACCESS_*` são decisões internas deste resolver desconectado.
Não promovem o catálogo público de erros/receipts nem substituem reasonCodes IMOB atuais.
Antes de exposição HTTP/Agent Protocol, reconciliar com o catálogo canônico e seus gates.

Os testes são ligados ao `test:ci-unit-suite` existente e ao manifesto de unitários.
A evidência local registra execução sintética e checks focados; não prova CI remoto,
E2E HTTP, staging, produção ou autorização de HIGH. Nenhum commit/push faz parte deste corte.
