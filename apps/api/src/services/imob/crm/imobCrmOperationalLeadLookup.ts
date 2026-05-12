import {
  asPendingItems,
  buildLookupConditions,
  filterResolvedLeadPendingItems,
  hasStringId,
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  LeadSummary,
  OperationalResolution,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";

export async function resolveImobLeadLookup(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalConsultContext,
): Promise<OperationalResolution | null> {
  if (!(context.wantsLead && (context.asksLeadCases || context.asksMissing || context.asksShow))) return null;

  let lead: LeadSummary | null = null;
  if (params.caseId) {
    const scopedCase = await params.prisma.imobCase.findFirst({
      where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
      include: { lead: true },
    });
    lead = hasStringId(scopedCase?.lead) ? scopedCase.lead : null;
  }
  if (!lead) {
    const name = helpers.extractLeadNameFromMessage(params.message);
    const email = helpers.extractLeadEmailFromMessage(params.message);
    const phone = helpers.extractLeadPhoneFromMessage(params.message);
    const conditions = buildLookupConditions([phone ? { phone } : null, email ? { email } : null, name ? { name } : null]);
    if (conditions.length > 0) {
      lead = await params.prisma.imobLead.findFirst({
        where: { tenantId: params.tenantId, workspaceId: params.workspaceId, OR: conditions },
        orderBy: { updatedAt: "desc" },
      });
    }
  }
  if (!lead) {
    return {
      mode: "consult",
      action: "crm.lead.lookup",
      threadLabel: "Lead",
      conversationState: params.threadState ?? helpers.createEmptyThreadState(),
      presentation: {
        text: "Não encontrei esse lead no CRM operacional do IMOB.",
        suggestedNextAction: "Cadastre ou qualifique o lead antes de consultar o histórico dele.",
        card: {
          title: "Lead não encontrado",
          lines: ["Use nome, telefone ou e-mail do lead para localizar o cadastro operacional."],
        },
      },
    };
  }

  const leadCases = await params.prisma.imobCase.findMany({
    where: { tenantId: params.tenantId, workspaceId: params.workspaceId, leadId: lead.id },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true, flow: true, stage: true, status: true, nextStep: true, pendingItems: true, ownerResponsible: true, updatedAt: true },
  });
  const latestCase = leadCases[0] ?? null;

  if (context.asksLeadCases) {
    return {
      mode: "consult",
      action: "crm.lead.lookup",
      threadLabel: "Lead",
      conversationState: params.threadState ?? helpers.createEmptyThreadState(),
      caseContext: latestCase ? helpers.buildCaseContextFromRecord(latestCase) : undefined,
      presentation: {
        text: [
          `Lead ${lead.name} possui ${leadCases.length} caso(s) no CRM operacional.`,
          leadCases.length > 0 ? `Casos atuais: ${leadCases.map((item) => `${helpers.formatImobCaseFlowLabel(item.flow)} (${helpers.formatImobStatusLabel(item.status)})`).join(" | ")}.` : "Casos atuais: nenhum caso vinculado.",
          latestCase?.nextStep ? `Próximo passo mais recente: ${latestCase.nextStep}` : null,
        ].filter(Boolean).join("\n"),
        owner: latestCase?.ownerResponsible ?? "Corretor",
        nextStep: latestCase?.nextStep ?? "Vincular o lead a um imóvel ou avançar para visita.",
        pendingFieldLabels: filterResolvedLeadPendingItems(lead),
        dedupeKey: `crm.lead.lookup:${lead.id}:cases`,
        card: {
          title: `Casos do lead ${lead.name}`,
          lines: leadCases.length > 0 ? leadCases.map((item) => `${helpers.formatImobCaseFlowLabel(item.flow)} | ${helpers.formatImobStatusLabel(item.status)} | ${item.nextStep ?? "Sem próximo passo definido"}`) : ["Nenhum caso vinculado a este lead."],
        },
      },
    };
  }

  return {
    mode: "consult",
    action: "crm.lead.lookup",
    threadLabel: "Lead",
    conversationState: params.threadState ?? helpers.createEmptyThreadState(),
    caseContext: latestCase ? helpers.buildCaseContextFromRecord(latestCase) : undefined,
    presentation: {
      text: [
        `Lead ${lead.name ?? "lead"} localizado no CRM operacional.`,
        `Pendências atuais: ${helpers.formatImobPendingList(filterResolvedLeadPendingItems(lead))}.`,
        helpers.buildLeadPendingSuggestion({ name: lead.name ?? "lead", pendingItems: filterResolvedLeadPendingItems(lead) }),
        "Próximo passo: vincular o lead a um imóvel ou avançar para visita.",
      ].filter(Boolean).join("\n"),
      owner: "Corretor" as const,
      nextStep: "Vincular o lead a um imóvel ou avançar para visita.",
      pendingFieldLabels: asPendingItems(lead.pendingItems),
      dedupeKey: `crm.lead.lookup:${lead.id}`,
      card: {
        title: `Lead ${lead.name}`,
        lines: [
          lead.phone ? `Telefone: ${lead.phone}` : null,
          lead.email ? `E-mail: ${lead.email}` : null,
          lead.goal ? `Objetivo: ${lead.goal}` : null,
          lead.targetCity ? `Cidade: ${lead.targetCity}` : null,
          lead.budgetMaxCents ? `Orçamento: ${helpers.formatBudgetCentsForImob(lead.budgetMaxCents)}` : null,
          `Stage: ${lead.stage ?? "novo"}`,
          `Temperatura: ${lead.temperature ?? "n/a"}`,
          `Pendências: ${helpers.formatImobPendingList(filterResolvedLeadPendingItems(lead))}`,
          leadCases.length > 0 ? `Casos: ${leadCases.length}` : "Casos: nenhum caso vinculado",
        ].filter(Boolean) as string[],
      },
    },
  };
}
