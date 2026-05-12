import {
  asPendingItems,
  buildLookupConditions,
  ImobOperationalResolverParams,
  ImobOperationalUpdateContext,
  LeadSummary,
  OperationalResolution,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";

export async function resolveImobLeadUpdate(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalUpdateContext,
): Promise<OperationalResolution | null> {
  const wantsLeadUpdate = context.normalized.includes("lead") || context.normalized.includes("cliente") || context.normalized.includes("comprador") || context.normalized.includes("locatario") || context.normalized.includes("locatário");
  if (!(wantsLeadUpdate && (context.targetCity || context.budgetCents !== null || context.leadPhone || context.leadEmail || context.leadGoal))) return null;

  let lead: LeadSummary | null = null;
  if (params.caseId) {
    const scopedCase = await params.prisma.imobCase.findFirst({
      where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
      select: { leadId: true },
    });
    if (scopedCase?.leadId) {
      lead = await params.prisma.imobLead.findFirst({ where: { id: scopedCase.leadId, tenantId: params.tenantId, workspaceId: params.workspaceId } });
    }
  }
  if (!lead) {
    const conditions = buildLookupConditions([context.leadPhone ? { phone: context.leadPhone } : null, context.leadEmail ? { email: context.leadEmail } : null, context.leadName ? { name: context.leadName } : null]);
    if (conditions.length > 0) {
      lead = await params.prisma.imobLead.findFirst({
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId, OR: conditions },
        orderBy: { updatedAt: "desc" },
      });
    }
  }
  if (!lead) return null;

  const leadDisplayName = lead.name ?? "lead";
  const nextPending = asPendingItems(lead.pendingItems)
    .filter((item) => !(item === "cidade de interesse" && context.targetCity))
    .filter((item) => !(item === "faixa de orçamento" && context.budgetCents !== null))
    .filter((item) => !(item === "budgetMax" && context.budgetCents !== null))
    .filter((item) => !(item === "telefone do lead" && context.leadPhone))
    .filter((item) => !(item === "leadPhone" && context.leadPhone))
    .filter((item) => !(item === "objetivo do lead" && context.leadGoal))
    .filter((item) => !(item === "desiredGoal" && context.leadGoal));
  const updated = await params.prisma.imobLead.update({
    where: { id: lead.id },
    data: {
      goal: context.leadGoal ?? lead.goal,
      targetCity: context.targetCity ?? lead.targetCity,
      budgetMaxCents: context.budgetCents ?? lead.budgetMaxCents,
      phone: context.leadPhone ?? lead.phone,
      email: context.leadEmail ?? lead.email,
      pendingItems: nextPending,
      stage: nextPending.length > 0 ? (lead.stage ?? "pending_data") : "qualified",
    },
  });
  return {
    mode: "consult",
    action: "crm.lead.update",
    threadLabel: "Lead",
    conversationState: params.threadState ?? helpers.createEmptyThreadState(),
    presentation: {
      text: [
        `Cadastro do lead ${leadDisplayName} atualizado com sucesso.`,
        `Pendências atuais: ${helpers.formatImobPendingList(nextPending)}.`,
        nextPending.length > 0 ? helpers.buildLeadPendingSuggestion({ name: leadDisplayName, pendingItems: nextPending }) : null,
        nextPending.length > 0 ? "Próximo passo: completar as pendências restantes do lead." : "Próximo passo: vincular o lead a um imóvel ou avançar para visita.",
      ].join("\n"),
      owner: "Corretor" as const,
      nextStep: nextPending.length > 0 ? "Completar as pendências restantes do lead." : "Vincular o lead a um imóvel ou avançar para visita.",
      pendingFieldLabels: nextPending,
      dedupeKey: `crm.lead.update:${updated.id}`,
    },
  };
}
