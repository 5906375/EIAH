import {
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  OperationalResolution,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";

export async function resolveImobPropertyList(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalConsultContext,
): Promise<OperationalResolution | null> {
  if (!context.asksPropertyList) return null;

  const allProperties = await params.prisma.imobProperty.findMany({
    where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: { owner: { select: { name: true } }, _count: { select: { cases: true } } },
  });
  const properties = allProperties
    .filter((item) => !context.asksReadyForReview || item.status === "ready_for_review")
    .filter((item) => !context.listCityFilter || helpers.normalizeImobRouteText(item.city ?? "") === context.listCityFilter)
    .slice(0, 8);
  return {
    mode: "consult",
    action: "crm.property.list",
    threadLabel: "Imóvel",
    conversationState: params.threadState ?? helpers.createEmptyThreadState(),
    presentation: {
      text: [
        properties.length > 0 ? `Encontrei ${properties.length} imóvel(is) no CRM operacional do IMOB.` : context.asksReadyForReview ? "Não encontrei imóveis prontos para revisão no CRM operacional do IMOB." : context.listCityFilter ? `Não encontrei imóveis cadastrados em ${helpers.titleCaseRouteWords(context.listCityFilter)} no CRM operacional do IMOB.` : "Não encontrei imóveis cadastrados no CRM operacional do IMOB.",
        properties.length > 0 ? `Resumo atual: ${properties.map((item) => `${helpers.formatPropertyLookupLabel(item)} (${helpers.formatImobStatusLabel(item.status)})`).join(" | ")}.` : null,
        properties.length > 0 ? "Próximo passo: abrir um imóvel para revisar pendências, proprietário e próximos vínculos comerciais." : null,
      ].filter(Boolean).join("\n"),
      owner: "Corretor" as const,
      nextStep: properties.length > 0 ? "Abrir um imóvel para revisar pendências, proprietário e próximos vínculos comerciais." : "Cadastrar o primeiro imóvel para iniciar a operação comercial.",
      dedupeKey: context.asksReadyForReview ? "crm.property.list:review" : context.listCityFilter ? `crm.property.list:${context.listCityFilter}` : "crm.property.list",
      card: {
        title: context.asksReadyForReview ? "Imóveis prontos para revisão" : context.listCityFilter ? `Imóveis em ${helpers.titleCaseRouteWords(context.listCityFilter)}` : "Imóveis cadastrados",
        lines: properties.length > 0 ? properties.map((item) => `${helpers.formatPropertyLookupLabel(item)} | ${item.goal ?? "sem finalidade"} | ${item.city ?? "sem cidade"} | ${helpers.formatImobStatusLabel(item.status)} | Proprietário: ${item.owner?.name ?? "não vinculado"}`) : [context.asksReadyForReview ? "Nenhum imóvel pronto para revisão no momento." : context.listCityFilter ? `Nenhum imóvel cadastrado em ${helpers.titleCaseRouteWords(context.listCityFilter)}.` : "Nenhum imóvel cadastrado até o momento."],
        ctas: properties.slice(0, 3).map((item) => ({
          id: `property-open-${item.id}`,
          label: `Consultar ${helpers.formatPropertyLookupLabel(item)}`,
          kind: "secondary" as const,
          action: "send_suggested_message" as const,
          nextMessage: `consultar imóvel ${item.id}`,
        })),
      },
    },
  };
}
