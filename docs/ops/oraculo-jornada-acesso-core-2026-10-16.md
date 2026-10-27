# Oráculo SC — começar pela jornada de acesso do core

**Atualização posterior nesta sessão:** a conexão de liberação, ativação e
sessão foi implementada e testada localmente em escopo context_only. A análise
abaixo registra o ponto de partida anterior; veja
[implementação e limites](logistica-core-integracao-2026-10-16.md).

Data: 16/10/2026. Status: **parcial**. Codex, sem subagentes. Baseline:
`5c4a9b2`, com trabalho local posterior ainda não commitado.

## Ordem da jornada

1. Primeiro acesso: usar `/access` e o onboarding existente para organização,
   usuário e workspace. Autenticação é infraestrutura do core, não outro app.
2. Usuário existente: login existente; convite vincula ao workspace sem criar
   uma conta paralela. O responsável autorizado pode convidar pelo Front Door.
3. Resolver identidade, vínculo ativo, tenant/workspace e perfil no servidor.
4. Responsável solicita liberação de Logística & Comex pelo fluxo EIAH.
5. Administrador da plataforma decide; score do agente apenas recomenda.
6. Ativação no workspace por quem tem competência, respeitando liberação,
   instalação e políticas. Cadastro não implica ativação.
7. Sessão expõe capacidades efetivamente permitidas, não inferidas pela UI.
8. Front Door encaminha ao Oráculo preservando contexto e retorno.
9. Preparação da devolução admite dados pendentes. Ações sensíveis exigem
   autoridade e validação próprias; acesso ao cockpit não libera gate.

Os passos descrevem a jornada-alvo com reaproveitamento. A conexão logística
dos passos 4–8 ainda precisa de implementação/verificação; não está liberada
por esta nota. Não se implementa outro cadastro, login ou sistema de perfis.

## Base existente conferida

| Etapa | Fonte | Situação/limite |
| --- | --- | --- |
| Primeiro cadastro | pages/access.tsx; routes/onboarding.ts | Cria organização, workspace, usuário e vínculo; provisiona agentes Front Door |
| Login/convite | routes/auth.ts; services/workspaceResponsibility.ts | Login, preview/aceite, senha própria, perfil e vínculo; execução integrada atual não realizada |
| Convite pelo Front Door | frontDoorAccessEngine.ts; FrontDoorAccessPanel.tsx; services/frontDoorAccess.ts | Reutiliza convite; exige gerência de membros e ao menos uma vertical aprovada no workspace; não atribui Founder via convite |
| Permissões e identidade | workspaceResponsibility.ts; enforceTenant.ts; apiTokenRepository.ts | Contexto do servidor, token, expiração/revogação, escopo e papéis existentes |
| Liberação EIAH | ADR-011; products/verticalAccessApproval.ts | Liberação por tenant/workspace/vertical, decisão humana, auditoria e modos de revogação |
| Ativação | products/productActivation.ts | ActivatableProduct atualmente é somente IMOB; não há ativação logística comprovada nesse serviço |
| Sessão | routes/session.ts; state/sessionStore.ts; lib/api.ts | Domínios core/imob; não basta adicionar link para Oráculo |
| PRE-DUIMP | logistica/control/preDuimpAccessResolver.ts | Reusa instalação LOGISTICA, piloto e policy shadow; isso não autoriza todo o cockpit |

O requisito de ao menos uma vertical aprovada para convidar pelo Front Door
é distinto da criação inicial da organização. Não inverter a sequência e
exigir convite de workspace inexistente para o primeiro responsável.

## Próximo corte antes da preparação visual

Conferir de ponta a ponta o registro logístico nos contratos de pedido e
decisão de liberação, ativação/provisionamento, policy e sessão. Reutilizar a
orquestração de produto já usada por IMOB, respeitando os contratos próprios
da vertical. O código LOGISTICA já existe no resolver; não criar outro produto
ou conceder scopes globais por conveniência.

Preservar as distinções: administrador EIAH decide liberação; responsável do
workspace ativa conforme permissão; usuário usa capacidades autorizadas;
revisor de domínio aprova somente ações de sua competência. Um papel local
não se torna administrador da plataforma.

Critérios de aceite do corte: primeiro acesso termina no Front Door; login e
convite reaproveitados; instalação sem liberação não concede uso; liberação
sem instalação/permissão não concede uso; revogação, expiração e troca de
workspace são refletidas no contexto; acesso direto ao cockpit verifica as
mesmas regras do Front Door. Nenhum score autoriza sozinho.

## Verificação desta rodada

Executado com Node 22/tsx e tsconfig web: frontDoorAccessEngine.test.ts,
FrontDoorSessionHeader.test.tsx e sessionContextSync.test.ts. Resultado:
38 aprovados, zero falhos/ignorados. São testes de engine/apresentação e
sincronização, não E2E de cadastro nem prova de autorização logística.

Testes integrados de front-door-access e workspace.invitation-grant foram
identificados, mas não executados: importam Prisma e escrevem fixtures no
banco. O setup Prisma e um banco de aplicação isolado com baseline adequado
ainda são pré-requisitos. Não apontar esses testes ao ambiente de um usuário
nem ao banco mínimo CI1 por aproximação.

Nenhum comportamento de acesso ou permissão foi alterado nesta rodada.
A preparação pura implementada antes é preservada e será ligada depois da
jornada de identidade/liberação; não é substituto desses controles.
