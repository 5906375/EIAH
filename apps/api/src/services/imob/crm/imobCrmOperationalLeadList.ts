import {
  filterResolvedLeadPendingItems,
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  OperationalResolution,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";

export async function resolveImobLeadList(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalConsultContext,
): Promise<OperationalResolution | null> {
  if (!context.asksLeadList) return null;

  const allLeads = await params.prisma.imobLead.findMany({
    where: { tenantId: params.tenantId, workspaceId: params.workspaceId },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  const leads = allLeads
    .filter((item) => !context.asksPendingOnly || filterResolvedLeadPendingItems(item).length > 0)
    .filter((item) => !context.asksQualifiedOnly || item.stage === "qualified")
    .filter((item) => {
      if (context.asksGoalRent) return item.goal === "locacao";
      if (context.asksGoalSale) return item.goal === "venda" || item.goal === "compra";
      return true;
    })
    .slice(0, 8);
  const listTitle = context.asksPendingOnly ? "Leads com pendências" : context.asksQualifiedOnly ? "Leads qualificados" : context.asksGoalRent ? "Leads de locação" : context.asksGoalSale ? "Leads de compra e venda" : "Leads cadastrados";
  return {
    mode: "consult",
    action: "crm.lead.list",
    threadLabel: "Lead",
    conversationState: params.threadState ?? helpers.createEmptyThreadState(),
    presentation: {
      text: [
        leads.length > 0 ? `Encontrei ${leads.length} lead(s) no CRM operacional do IMOB.` : context.asksPendingOnly ? "Não encontrei leads com pendências no CRM operacional do IMOB." : context.asksQualifiedOnly ? "Não encontrei leads qualificados no CRM operacional do IMOB." : context.asksGoalRent ? "Não encontrei leads de locação no CRM operacional do IMOB." : context.asksGoalSale ? "Não encontrei leads de compra e venda no CRM operacional do IMOB." : "Não encontrei leads cadastrados no CRM operacional do IMOB.",
        leads.length > 0 ? `Resumo atual: ${leads.map((item) => `${item.name} (${helpers.formatImobStatusLabel(item.stage)})`).join(" | ")}.` : null,
        leads.length > 0 ? "Próximo passo: abrir um lead para revisar pendências, qualificação e próximos vínculos comerciais." : null,
      ].filter(Boolean).join("\n"),
      owner: "Corretor" as const,
      nextStep: leads.length > 0 ? "Abrir um lead para revisar pendências, qualificação e próximos vínculos comerciais." : "Cadastrar o primeiro lead para iniciar a qualificação comercial.",
      dedupeKey: `crm.lead.list:${context.asksPendingOnly ? "pending" : context.asksQualifiedOnly ? "qualified" : context.asksGoalRent ? "rent" : context.asksGoalSale ? "sale" : "all"}`,
      card: {
        title: listTitle,
        lines: leads.length > 0 ? leads.map((item) => `${item.name} | ${helpers.formatImobStatusLabel(item.stage)} | Objetivo: ${item.goal ?? "não informado"} | Pendências: ${helpers.formatImobPendingList(filterResolvedLeadPendingItems(item))}`) : [context.asksPendingOnly ? "Nenhum lead com pendências no momento." : context.asksQualifiedOnly ? "Nenhum lead qualificado no momento." : "Nenhum lead cadastrado até o momento."],
      },
    },
  };
}
