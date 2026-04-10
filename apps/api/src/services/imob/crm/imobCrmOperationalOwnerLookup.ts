import {
  buildLookupConditions,
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  mapOwnerPendingLabels,
  OperationalResolution,
  OwnerSummary,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";

export async function findOwnerForOwnerActions(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalConsultContext,
): Promise<OwnerSummary | null> {
  let owner: OwnerSummary | null = null;
  if (context.ownerCrudId) {
    owner = await params.prisma.imobOwner.findFirst({
      where: { id: context.ownerCrudId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
      include: { _count: { select: { properties: true, cases: true } } },
    });
  }
  if (!owner && params.caseId) {
    const scopedCase = await params.prisma.imobCase.findFirst({
      where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
      select: { ownerId: true },
    });
    if (scopedCase?.ownerId) {
      owner = await params.prisma.imobOwner.findFirst({
        where: { id: scopedCase.ownerId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
        include: { _count: { select: { properties: true, cases: true } } },
      });
    }
  }
  if (!owner) {
    const name = helpers.extractOwnerNameFromMessage(params.message);
    const email = helpers.extractLeadEmailFromMessage(params.message);
    const phone = helpers.extractLeadPhoneFromMessage(params.message);
    const document = helpers.extractDocumentFromMessage(params.message);
    const conditions = buildLookupConditions([document ? { document } : null, phone ? { phone } : null, email ? { email } : null, name ? { name } : null]);
    if (conditions.length > 0) {
      owner = await params.prisma.imobOwner.findFirst({
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" }, OR: conditions },
        orderBy: { updatedAt: "desc" },
        include: { _count: { select: { properties: true, cases: true } } },
      });
    }
    if (!owner && name) {
      const ownerIdFromAudit = await helpers.findOwnerIdByAuditName({
        prisma: params.prisma,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        agentId: helpers.auditAgentId,
        name,
      });
      if (ownerIdFromAudit) {
        owner = await params.prisma.imobOwner.findFirst({
          where: { id: ownerIdFromAudit, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
          include: { _count: { select: { properties: true, cases: true } } },
        });
      }
    }
  }
  return owner;
}

export async function resolveImobOwnerLookup(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalConsultContext,
): Promise<OperationalResolution | null> {
  if (!(context.wantsOwner && (context.asksMissing || context.asksShow))) return null;

  const owner = await findOwnerForOwnerActions(params, helpers, context);
  if (!owner) {
    return {
      mode: "consult",
      action: "crm.owner.lookup",
      threadLabel: "Proprietário",
      conversationState: params.threadState ?? helpers.createEmptyThreadState(),
      presentation: {
        text: "Não encontrei esse proprietário no CRM operacional do IMOB.",
        suggestedNextAction: "Cadastre ou atualize o proprietário antes de consultar o histórico dele.",
        card: {
          title: "Proprietário não encontrado",
          lines: ["Use nome, telefone, e-mail ou documento do proprietário para localizar o cadastro operacional."],
        },
      },
    };
  }

  const ownerCases = await params.prisma.imobCase.findMany({
    where: { tenantId: params.tenantId, workspaceId: params.workspaceId, ownerId: owner.id },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true, flow: true, status: true, nextStep: true, ownerResponsible: true, updatedAt: true },
  });
  const latestCase = ownerCases[0] ?? null;
  const ownerDisplayName = await helpers.resolveOwnerDisplayName({
    prisma: params.prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    agentId: helpers.auditAgentId,
    owner,
  });
  return {
    mode: "consult",
    action: "crm.owner.lookup",
    threadLabel: "Proprietário",
    conversationState: params.threadState ?? helpers.createEmptyThreadState(),
    caseContext: latestCase ? helpers.buildCaseContextFromRecord({ ...latestCase, stage: latestCase.status, pendingItems: [], blockers: [] }) : undefined,
    presentation: {
      text: "",
      owner: "Corretor" as const,
      nextStep: "Vincular o proprietário ao próximo imóvel ou etapa documental.",
      pendingFieldLabels: mapOwnerPendingLabels(owner.pendingItems),
      dedupeKey: `crm.owner.lookup:${owner.id}`,
      card: {
        title: `Proprietário ${ownerDisplayName}`,
        lines: [
          owner.phone ? `Telefone: ${owner.phone}` : null,
          owner.email ? `E-mail: ${owner.email}` : null,
          helpers.resolveOwnerDocumentForDisplay(owner) ? `Documento: ${helpers.resolveOwnerDocumentForDisplay(owner)}` : null,
          `Status: ${helpers.formatImobStatusLabel(owner.status)}`,
          `Pendências: ${helpers.formatImobPendingList(mapOwnerPendingLabels(owner.pendingItems))}`,
          `Imóveis: ${owner._count?.properties ?? 0}`,
          `Casos: ${owner._count?.cases ?? 0}`,
        ].filter(Boolean) as string[],
        ctas: [
          { id: `owner-edit-${owner.id}`, label: "Editar", kind: "secondary" as const, action: "send_suggested_message" as const, nextMessage: `editar proprietário ${ownerDisplayName}` },
          { id: `owner-delete-${owner.id}`, label: "Excluir", kind: "neutral" as const, action: "send_suggested_message" as const, nextMessage: `excluir proprietário ${ownerDisplayName}` },
          { id: `owner-print-${owner.id}`, label: "Imprimir", kind: "neutral" as const, action: "print_card" as const },
        ],
        actionsLayout: "inline",
      },
    },
  };
}
