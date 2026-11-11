import {
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  OperationalResolution,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";

const LIST_LIMIT = 50;
const LIST_DISPLAY_LIMIT = 8;

/** Data do arquivamento (UTC) registrada em `metadata.archivedAt` pelo arquivamento individual/múltiplo. */
function archivedOn(metadata: unknown) {
  const raw = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).archivedAt : null;
  const match = typeof raw === "string" ? /^(\d{4})-(\d{2})-(\d{2})/.exec(raw) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

export async function resolveImobPropertyList(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalConsultContext,
): Promise<OperationalResolution | null> {
  if (!context.asksPropertyList) return null;

  // Mesma consulta, mesmo escopo tenant/workspace e mesmo gate de etapa (prisma já escopado pelo chamador); só o filtro de status muda.
  const archived = Boolean(context.asksArchived);
  const allProperties = await params.prisma.imobProperty.findMany({
    where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: archived ? "archived" : { not: "archived" } },
    orderBy: { updatedAt: "desc" },
    take: LIST_LIMIT,
    include: { owner: { select: { name: true } }, _count: { select: { cases: true } } },
  });
  const matching = allProperties
    .filter((item) => archived || !context.asksReadyForReview || item.status === "ready_for_review")
    .filter((item) => !context.listCityFilter || helpers.normalizeImobRouteText(item.city ?? "") === context.listCityFilter);
  const properties = matching.slice(0, LIST_DISPLAY_LIMIT);

  if (archived) {
    // Leitura pura: sem CTAs (nada de restaurar/editar), proprietário só pelo vínculo e histórico preservado.
    const city = context.listCityFilter ? helpers.titleCaseRouteWords(context.listCityFilter) : null;
    const labelOf = (item: (typeof properties)[number]) => helpers.formatPropertyLookupLabel(item);
    const since = (item: (typeof properties)[number]) => {
      const date = archivedOn(item.metadata);
      return date ? `arquivado em ${date}` : "arquivado";
    };
    const more = allProperties.length >= LIST_LIMIT ? "+" : "";
    return {
      mode: "consult",
      action: "crm.property.list",
      threadLabel: "Imóvel",
      conversationState: params.threadState ?? helpers.createEmptyThreadState(),
      presentation: {
        text: [
          properties.length > 0
            ? `Encontrei ${matching.length}${more} imóvel(is) arquivado(s) neste workspace${matching.length > properties.length ? `; mostrando os ${properties.length} mais recentes` : ""}.`
            : city ? `Não encontrei imóveis arquivados em ${city}.` : "Não encontrei imóveis arquivados neste workspace.",
          properties.length > 0 ? `Resumo: ${properties.map((item) => `${labelOf(item)} (${since(item)})`).join(" | ")}.` : null,
          "Consulta somente leitura: imóveis arquivados saem das listas ativas e o histórico fica guardado.",
        ].filter(Boolean).join("\n"),
        owner: "Corretor" as const,
        nextStep: "Consulta somente leitura; nenhum imóvel foi alterado.",
        dedupeKey: city ? `crm.property.list:archived:${context.listCityFilter}` : "crm.property.list:archived",
        card: {
          title: city ? `Imóveis arquivados em ${city}` : "Imóveis arquivados",
          lines: properties.length > 0
            ? properties.map((item) => `${labelOf(item)} | ${item.goal ?? "sem finalidade"} | ${item.city ?? "sem cidade"} | ${since(item)} | Proprietário: ${item.owner?.name ?? "Sem proprietário vinculado"}`)
            : [city ? `Nenhum imóvel arquivado em ${city}.` : "Nenhum imóvel arquivado até o momento."],
          ctas: [],
        },
      },
    };
  }

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
