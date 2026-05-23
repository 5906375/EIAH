import {
  asPendingItems,
  ImobOperationalResolverParams,
  ImobOperationalUpdateContext,
  mapOwnerPendingLabels,
  OperationalResolution,
  OWNER_DOCUMENT_PENDING_KEYS,
  removeResolvedOwnerPendingItems,
  OwnerSummary,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";

function buildOwnerUpdateConversationState(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  pendingLabels: string[],
) {
  const current = helpers.asObject(params.threadState);
  const operational = helpers.asObject(current?.operational);
  if (!operational || helpers.asString(operational.flow) !== "owner.create") {
    return params.threadState ?? helpers.createEmptyThreadState();
  }

  const nextOperational = {
    ...operational,
    status: pendingLabels.length > 0 ? "collecting" : "ready_for_review",
    pendingFields: pendingLabels,
  };

  return {
    ...(current ?? {}),
    operational: nextOperational,
  };
}

export async function resolveImobOwnerUpdate(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalUpdateContext,
): Promise<OperationalResolution | null> {
  const currentCaseNextStep = params.caseId
    ? "Concluir vínculo do proprietário com este imóvel ou seguir para a etapa documental do caso."
    : "Vincular o proprietário ao próximo imóvel ou etapa documental.";
  if (context.asksEdit && context.ownerCrudId) {
    const owner = await params.prisma.imobOwner.findFirst({
      where: { id: context.ownerCrudId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
    });
    if (owner) {
      const patch: Record<string, unknown> = {};
      const resolvedPendingFlags = {
        ownerName: Boolean(context.ownerExplicitName),
        ownerPhone: Boolean(context.ownerExplicitPhone),
        ownerEmail: Boolean(context.ownerExplicitEmail),
        ownerDocument: Boolean(context.ownerExplicitDocument),
      };
      if (context.ownerExplicitName) patch.name = context.ownerExplicitName;
      if (context.ownerExplicitPhone) patch.phone = context.ownerExplicitPhone;
      if (context.ownerExplicitEmail) patch.email = context.ownerExplicitEmail;
      const nextPending = removeResolvedOwnerPendingItems(owner.pendingItems, resolvedPendingFlags);
      if (
        resolvedPendingFlags.ownerName
        || resolvedPendingFlags.ownerPhone
        || resolvedPendingFlags.ownerEmail
        || resolvedPendingFlags.ownerDocument
      ) {
        patch.pendingItems = nextPending;
        patch.status = nextPending.length > 0 ? "pending_data" : "ready_for_review";
      }
      if (context.ownerExplicitDocument) {
        patch.document = context.ownerExplicitDocument;
      }
      if (Object.keys(patch).length === 0) {
        const displayName = await helpers.resolveOwnerDisplayName({
          prisma: params.prisma,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          agentId: helpers.auditAgentId,
          owner,
        });
        return {
          mode: "consult",
          action: "crm.owner.update",
          threadLabel: "Proprietário",
          conversationState: params.threadState ?? helpers.createEmptyThreadState(),
          presentation: {
            text: "",
            dedupeKey: `crm.owner.update.form:${owner.id}`,
            form: helpers.buildOwnerUpdateForm(owner, displayName),
          },
        };
      }
      if (Object.keys(patch).length > 0) {
        const updated = await params.prisma.imobOwner.update({ where: { id: owner.id }, data: patch });
        const updatedProfile = await params.prisma.imobOwner.findFirst({
          where: { id: owner.id, tenantId: params.tenantId, workspaceId: params.workspaceId },
          include: { _count: { select: { properties: true, cases: true } } },
        });
        const updatedDisplayName = await helpers.resolveOwnerDisplayName({
          prisma: params.prisma,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          agentId: helpers.auditAgentId,
          owner: updatedProfile ?? updated,
        });
        await helpers.recordImobCrmAuditEvent({
          prisma: params.prisma,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          userId: params.userId ?? null,
          agentId: helpers.auditAgentId,
          subjectType: "owner",
          subjectId: owner.id,
          action: "updated",
          summary: `Owner ${updatedDisplayName} updated from chat`,
          before: owner,
          after: updatedProfile ?? updated,
          metadata: { source: "imob-chat" },
        });
        const ownerForCard = updatedProfile ?? updated;
        return {
          mode: "consult",
          action: "crm.owner.update",
          threadLabel: "Proprietário",
          conversationState: buildOwnerUpdateConversationState(
            params,
            helpers,
            mapOwnerPendingLabels(ownerForCard.pendingItems),
          ),
          presentation: {
            text: "Cadastro atualizado. Como podemos seguir?",
            pendingFieldLabels: mapOwnerPendingLabels(ownerForCard.pendingItems),
            dedupeKey: `crm.owner.update:${updated.id}:profile`,
            card: {
              title: `Proprietário ${updatedDisplayName}`,
              lines: [
                ownerForCard.phone ? `Telefone: ${ownerForCard.phone}` : null,
                ownerForCard.email ? `E-mail: ${ownerForCard.email}` : null,
                helpers.resolveOwnerDocumentForDisplay(ownerForCard) ? `Documento: ${helpers.resolveOwnerDocumentForDisplay(ownerForCard)}` : null,
                `Status: ${helpers.formatImobStatusLabel(ownerForCard.status)}`,
                `Pendências: ${helpers.formatImobPendingList(mapOwnerPendingLabels(ownerForCard.pendingItems))}`,
                `Imóveis: ${ownerForCard._count?.properties ?? 0}`,
                `Casos: ${ownerForCard._count?.cases ?? 0}`,
              ].filter(Boolean) as string[],
              ctas: [
                { id: `owner-edit-${owner.id}`, label: "Editar", kind: "secondary" as const, action: "send_suggested_message" as const, nextMessage: `editar proprietário ${updatedDisplayName}` },
                { id: `owner-delete-${owner.id}`, label: "Excluir", kind: "neutral" as const, action: "send_suggested_message" as const, nextMessage: `excluir proprietário ${updatedDisplayName}` },
                { id: `owner-print-${owner.id}`, label: "Imprimir", kind: "neutral" as const, action: "print_card" as const },
              ],
              actionsLayout: "inline",
            },
          },
        };
      }
    }
  }

  const wantsOwnerDocument = context.normalized.includes("documento do proprietario") || context.normalized.includes("documento do proprietário") || context.normalized.includes("cpf do proprietario") || context.normalized.includes("cpf do proprietário");
  const hasExplicitOwnerUpdateFields = Boolean(
    context.ownerExplicitName || context.ownerExplicitPhone || context.ownerExplicitEmail || context.document,
  );
  if (hasExplicitOwnerUpdateFields && (wantsOwnerDocument || context.ownerName || params.caseId)) {
    let owner: OwnerSummary | null = null;
    if (params.caseId) {
      const scopedCase = await params.prisma.imobCase.findFirst({
        where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
        select: { ownerId: true },
      });
      if (scopedCase?.ownerId) {
        owner = await params.prisma.imobOwner.findFirst({ where: { id: scopedCase.ownerId, tenantId: params.tenantId, workspaceId: params.workspaceId } });
      }
    }
    if (!owner && context.ownerName) {
      owner = await params.prisma.imobOwner.findFirst({
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" }, name: context.ownerName },
        orderBy: { updatedAt: "desc" },
      });
    }
    if (owner) {
      const resolvedPendingFlags = {
        ownerName: Boolean(context.ownerExplicitName),
        ownerPhone: Boolean(context.ownerExplicitPhone),
        ownerEmail: Boolean(context.ownerExplicitEmail),
        ownerDocument: Boolean(context.document),
      };
      const currentPending = removeResolvedOwnerPendingItems(owner.pendingItems, resolvedPendingFlags);
      const status = currentPending.length > 0 ? "pending_data" : "ready_for_review";
      const changedFieldsCount = Object.values(resolvedPendingFlags).filter(Boolean).length;
      const updated = await params.prisma.imobOwner.update({
        where: { id: owner.id },
        data: {
          ...(context.ownerExplicitName ? { name: context.ownerExplicitName } : {}),
          ...(context.ownerExplicitPhone ? { phone: context.ownerExplicitPhone } : {}),
          ...(context.ownerExplicitEmail ? { email: context.ownerExplicitEmail } : {}),
          ...(context.document ? { document: context.document } : {}),
          pendingItems: currentPending,
          status,
        },
      });
      return {
        mode: "consult",
        action: "crm.owner.update",
        threadLabel: "Proprietário",
        conversationState: buildOwnerUpdateConversationState(
          params,
          helpers,
          mapOwnerPendingLabels(currentPending),
        ),
        presentation: {
          text: [
            changedFieldsCount === 1 && resolvedPendingFlags.ownerDocument
              ? `Documento do proprietário ${updated.name} atualizado com sucesso.`
              : `Cadastro existente do proprietário ${updated.name} atualizado com sucesso.`,
            `Pendências atuais: ${helpers.formatImobPendingList(mapOwnerPendingLabels(currentPending))}.`,
            currentPending.length > 0 ? helpers.buildOwnerPendingSuggestion({ name: updated.name, pendingItems: currentPending }) : null,
            currentPending.length > 0 ? "Próximo passo: completar as pendências restantes do proprietário." : `Próximo passo: ${currentCaseNextStep}`,
          ].join("\n"),
          owner: "Corretor" as const,
          nextStep: currentPending.length > 0 ? "Completar as pendências restantes do proprietário." : currentCaseNextStep,
          pendingFieldLabels: mapOwnerPendingLabels(currentPending),
          dedupeKey: `crm.owner.update:${updated.id}:document`,
        },
      };
    }
  }

  return null;
}
