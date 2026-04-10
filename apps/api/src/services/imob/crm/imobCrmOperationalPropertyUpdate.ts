import {
  asPendingItems,
  ImobOperationalResolverParams,
  ImobOperationalUpdateContext,
  OperationalResolution,
  PropertySummary,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";

export async function resolveImobPropertyUpdate(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalUpdateContext,
): Promise<OperationalResolution | null> {
  if (context.asksEdit && context.propertyCrudId) {
    const property = await params.prisma.imobProperty.findFirst({
      where: { id: context.propertyCrudId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
      include: { owner: { select: { id: true, name: true } } },
    });
    if (property) {
      const patch: Record<string, unknown> = {};
      if (context.propertyType) patch.propertyType = context.propertyType;
      if (context.propertyGoal) patch.goal = context.propertyGoal;
      if (context.propertyCity) patch.city = context.propertyCity;
      if (context.explicitAddress) patch.address = context.explicitAddress;
      if (Object.keys(patch).length > 0) {
        const updated = await params.prisma.imobProperty.update({
          where: { id: property.id },
          data: patch,
          include: { owner: { select: { id: true, name: true } } },
        });
        const updatedProfile = await params.prisma.imobProperty.findFirst({
          where: { id: property.id, tenantId: params.tenantId, workspaceId: params.workspaceId },
          include: { owner: { select: { id: true, name: true } }, _count: { select: { cases: true } } },
        });
        await helpers.recordImobCrmAuditEvent({
          prisma: params.prisma,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          userId: params.userId ?? null,
          agentId: helpers.auditAgentId,
          subjectType: "property",
          subjectId: property.id,
          action: "updated",
          summary: `Property ${helpers.formatPropertyLookupLabel(updatedProfile ?? updated)} updated from chat`,
          before: property,
          after: updatedProfile ?? updated,
          metadata: { source: "imob-chat" },
        });
        const propertyForCard = updatedProfile ?? updated;
        return {
          mode: "consult",
          action: "crm.property.update",
          threadLabel: "Imóvel",
          conversationState: params.threadState ?? helpers.createEmptyThreadState(),
          presentation: {
            text: "Cadastro atualizado. Como podemos seguir?",
            pendingFieldLabels: asPendingItems(propertyForCard.pendingItems),
            dedupeKey: `crm.property.update:${updated.id}:profile`,
            card: {
              title: helpers.formatPropertyLookupLabel(propertyForCard),
              lines: [
                propertyForCard.propertyType ? `Tipo: ${propertyForCard.propertyType}` : null,
                propertyForCard.goal ? `Finalidade: ${propertyForCard.goal}` : null,
                propertyForCard.city ? `Cidade: ${propertyForCard.city}` : null,
                propertyForCard.neighborhood ? `Bairro: ${propertyForCard.neighborhood}` : null,
                propertyForCard.address ? `Endereço: ${propertyForCard.address}` : null,
                propertyForCard.owner?.name ? `Proprietário: ${propertyForCard.owner.name}` : null,
                typeof propertyForCard.askingPriceCents === "number" ? `Valor: ${helpers.formatBudgetCentsForImob(propertyForCard.askingPriceCents)}` : null,
                `Status: ${helpers.formatImobStatusLabel(propertyForCard.status)}`,
                `Pendências: ${helpers.formatImobPendingList(asPendingItems(propertyForCard.pendingItems))}`,
                `Casos: ${propertyForCard._count?.cases ?? 0}`,
              ].filter(Boolean) as string[],
              ctas: [
                { id: `property-edit-${property.id}`, label: "Editar", kind: "secondary" as const, action: "send_suggested_message" as const, nextMessage: `editar imóvel ${property.id}` },
                { id: `property-delete-${property.id}`, label: "Excluir", kind: "neutral" as const, action: "send_suggested_message" as const, nextMessage: `excluir imóvel ${property.id}` },
                { id: `property-print-${property.id}`, label: "Imprimir", kind: "neutral" as const, action: "print_card" as const },
              ],
              actionsLayout: "inline",
            },
          },
        };
      }
    }
  }

  const wantsPropertyUpdate = context.normalized.includes("imovel") || context.normalized.includes("imóvel") || context.normalized.includes("apartamento") || context.normalized.includes("casa") || context.normalized.includes("sala") || context.normalized.includes("terreno");
  const wantsPriceUpdate = context.normalized.includes("preco") || context.normalized.includes("preço") || context.normalized.includes("valor");
  if (!(wantsPropertyUpdate && wantsPriceUpdate && context.priceCents)) return null;

  let property: PropertySummary | null = null;
  if (params.caseId) {
    const scopedCase = await params.prisma.imobCase.findFirst({
      where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
      select: { propertyId: true },
    });
    if (scopedCase?.propertyId) {
      property = await params.prisma.imobProperty.findFirst({ where: { id: scopedCase.propertyId, tenantId: params.tenantId, workspaceId: params.workspaceId } });
    }
  }
  if (!property && context.propertyRef) {
    property = await params.prisma.imobProperty.findFirst({ where: { id: context.propertyRef, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } } });
  }
  if (!property && context.address) {
    property = await params.prisma.imobProperty.findFirst({
      where: { tenantId: params.tenantId, workspaceId: params.workspaceId, address: { contains: context.address } },
      orderBy: { updatedAt: "desc" },
    });
  }
  if (!property) return null;

  const nextPending = asPendingItems(property.pendingItems).filter((item) => item !== "askingPrice" && item !== "preço do imóvel" && item !== "valor do imóvel" && item !== "propertyPrice");
  const updated = await params.prisma.imobProperty.update({
    where: { id: property.id },
    data: {
      askingPriceCents: context.priceCents,
      pendingItems: nextPending,
      status: nextPending.length > 0 ? "pending_data" : "ready_for_review",
    },
  });
  return {
    mode: "consult",
    action: "crm.property.update",
    threadLabel: "Imóvel",
    conversationState: params.threadState ?? helpers.createEmptyThreadState(),
    presentation: {
      text: [
        `Preço do imóvel ${helpers.formatPropertyLookupLabel(updated)} atualizado com sucesso.`,
        `Pendências atuais: ${helpers.formatImobPendingList(nextPending)}.`,
        nextPending.length > 0 ? helpers.buildPropertyPendingSuggestion({ id: updated.id, address: updated.address, pendingItems: nextPending }) : null,
        nextPending.length > 0 ? "Próximo passo: completar as pendências restantes do imóvel." : "Próximo passo: vincular o imóvel ao próximo lead ou etapa comercial.",
      ].join("\n"),
      owner: "Corretor" as const,
      nextStep: nextPending.length > 0 ? "Completar as pendências restantes do imóvel." : "Vincular o imóvel ao próximo lead ou etapa comercial.",
      pendingFieldLabels: nextPending,
      dedupeKey: `crm.property.update:${updated.id}:price`,
    },
  };
}
