# Agentes no seletor do Front Door

Consulta estática do código em 2026-11-10. Não consulta contratos ou permissões reais de nenhum tenant/workspace, não contrata e não ativa agentes.

## Catálogo-base

`apps/api/src/services/agents.ts`, `CORE_AGENT_PROFILES`, declara 15 perfis. Os nomes vêm de `packages/core/src/actions/agents/*Action.ts`:

| Identificador canônico | Nome exibido |
|---|---|
| AADV | AADV Self-Service |
| DeFi_1 | DeFi One |
| Diarias | Diarias GPS |
| EIAH | EIAH (perfil: EIAH Core) |
| fin-nexus | FinNexus |
| flow-orchestrator | Flow Orchestrator |
| guardian | Guardian |
| I_BC | I_BC GPS |
| ImageNFTDiarias | Image NFT Diarias |
| J_360 | Jurídico |
| MKT | Marketing GPS |
| NFT_PY | NFT PY |
| onchain-monitor | On-chain Monitor |
| Pitch | Pitch |
| risk-analyzer | Risk Analyzer |

O banco e o registro de ações podem fornecer outros agentes. Ter perfil no catálogo-base não comprova publicação comercial, assinatura vigente, autorização ou disponibilidade operacional para um workspace específico.

## Por que não aparecem

`AgentSelect` recebe `useAgents` → `GET /api/agents` → `listAgents(tenantId, workspaceId)`.

A lista é filtrada por:

1. Delegação vigente, vinculada a um item Marketplace do tipo agent, com escopo read/execute/admin.
2. Política `TenantActionPolicy` do workspace com `allowed: true` e chave correspondente.
3. Para agentes governados, habilitação comercial verificável vigente, ligada à decisão humana, designação e delegação exata (`agentEnablement.ts`).
4. Perfil/preço/ação conhecido para construir a entrada de catálogo.

A ausência pode resultar de assinatura ausente/expirada, política de outro workspace ou habilitação não verificável. A mensagem antiga "Nenhum agente assinado no marketplace" não distinguia essas causas; agora a UI informa "Nenhum agente disponível neste workspace". Erros de carregamento continuam separados. A causa real no workspace do usuário requer leitura autenticada de seus dados, não realizada nesta tarefa.

## Onde contratar e ativar

Na página `/self-service#marketplace-assinaturas`, seção **Marketplace → Assine fluxos publicados**, abrir o item publicado e confirmar **Assinar**. Requer autoridade comercial válida; não basta o agente estar declarado no código.

O handler `POST /api/marketplace/:id/subscribe` valida essa autoridade, cria/atualiza a delegação, habilita a política para o workspace atual e registra a habilitação comercial dos agentes governados. A seleção no chat não contrata nem concede permissão.

Depois da contratação, recarregar o chat no mesmo workspace para atualizar o cache de `useAgents`. O menu Marketplace de verticais (`/app/marketplace`) tem ativação de módulos como IMOB; isso não equivale a assinar todos os agentes especialistas.
