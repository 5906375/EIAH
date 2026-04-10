import {
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  ImobOperationalUpdateContext,
  OperationalResolution,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";
import { findOwnerForOwnerActions } from "./imobCrmOperationalOwnerLookup";

export async function resolveImobOwnerDelete(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalConsultContext | ImobOperationalUpdateContext,
): Promise<OperationalResolution | null> {
  if ("asksDelete" in context && "wantsOwner" in context) {
    if (!(context.wantsOwner && context.asksDelete)) return null;
    const owner = await findOwnerForOwnerActions(params, helpers, context);
    if (!owner) return null;
    return {
      mode: "consult",
      action: "crm.owner.delete",
      threadLabel: "Proprietário",
      conversationState: params.threadState ?? helpers.createEmptyThreadState(),
      presentation: {
        text: `Confirme o arquivamento do proprietário ${owner.name}.`,
        dedupeKey: `crm.owner.delete.confirm:${owner.id}`,
        card: {
          title: `Arquivar proprietário ${owner.name}`,
          lines: ["Essa ação arquiva o cadastro e remove o proprietário das consultas operacionais padrão."],
          ctas: [
            { id: `owner-delete-confirm-${owner.id}`, label: "Confirmar arquivamento", kind: "primary", action: "send_suggested_message", nextMessage: `confirmar arquivamento do proprietário ${owner.id}` },
          ],
        },
      },
    };
  }

  if (!helpers.isOwnerDeleteConfirmationMessage(params.message) || !context.ownerCrudId) return null;
  const owner = await params.prisma.imobOwner.findFirst({
    where: { id: context.ownerCrudId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
  });
  if (!owner) return null;

  const activePropertiesCount = await params.prisma.imobProperty.count({
    where: { tenantId: params.tenantId, workspaceId: params.workspaceId, ownerId: owner.id, status: { not: "archived" } },
  });
  const activeCasesCount = await params.prisma.imobCase.count({
    where: { tenantId: params.tenantId, workspaceId: params.workspaceId, ownerId: owner.id },
  });
  if (activePropertiesCount > 0 || activeCasesCount > 0) {
    return {
      mode: "consult",
      action: "crm.owner.delete",
      threadLabel: "Proprietário",
      conversationState: params.threadState ?? helpers.createEmptyThreadState(),
      presentation: {
        text: `Não posso excluir o proprietário ${owner.name} porque ainda existem imóveis ou casos ativos vinculados a esse cadastro.`,
        blocker: "Excluir ou desvincular os registros ativos antes de arquivar o proprietário.",
        dedupeKey: `crm.owner.delete.blocked:${owner.id}`,
      },
    };
  }
  const metadata = helpers.asObject(owner.metadata) ?? {};
  const archived = await params.prisma.imobOwner.update({
    where: { id: owner.id },
    data: { status: "archived", metadata: { ...metadata, archivedAt: new Date().toISOString(), archivedByUserId: null, source: "imob-chat" } },
  });
  await helpers.recordImobCrmAuditEvent({
    prisma: params.prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    userId: params.userId ?? null,
    agentId: helpers.auditAgentId,
    subjectType: "owner",
    subjectId: owner.id,
    action: "deleted",
    summary: `Owner ${owner.name} archived from chat`,
    before: owner,
    after: archived,
    metadata: { source: "imob-chat" },
  });
  return {
    mode: "consult",
    action: "crm.owner.delete",
    threadLabel: "Proprietário",
    conversationState: params.threadState ?? helpers.createEmptyThreadState(),
    presentation: {
      text: `Cadastro do proprietário ${owner.name} arquivado com sucesso.`,
      nextStep: "O cadastro não aparecerá mais nas consultas operacionais padrão.",
      dedupeKey: `crm.owner.delete:${owner.id}`,
    },
  };
}
