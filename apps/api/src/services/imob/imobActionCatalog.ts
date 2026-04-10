export type ImobCategory =
  | "cadastros"
  | "usuarios"
  | "comercial"
  | "transacoes"
  | "agenda"
  | "documentos"
  | "marketing"
  | "financeiro"
  | "gestao";

export type ImobActionMeta = {
  label: string;
  icon: string;
  dangerous: boolean;
  requiresConfirmation: boolean;
};

export type ImobActionKey =
  | "create"
  | "edit"
  | "delete"
  | "list"
  | "get"
  | "update"
  | "configure"
  | "status"
  | "sendDocuments"
  | "history"
  | "publish"
  | "unpublish"
  | "convert"
  | "assign"
  | "approve"
  | "reject"
  | "send"
  | "sendForSignature"
  | "confirm"
  | "reschedule"
  | "validate"
  | "pause"
  | "sendReceipt"
  | "view"
  | "indicators"
  | "reports"
  | "export";

export type ImobEntityKey =
  | "proprietario"
  | "imovel"
  | "comprador"
  | "vendedor"
  | "locador"
  | "locatario"
  | "corretor"
  | "lead"
  | "proposta"
  | "contrato"
  | "visita"
  | "agenda"
  | "documento"
  | "anuncio"
  | "pagamento"
  | "dashboard";

export type ImobEntityConfig = {
  category: ImobCategory;
  actions: Partial<Record<ImobActionKey, ImobActionMeta>>;
  aliases?: string[];
  createPrompt?: string;
  createChoiceLabel?: string;
  enabled?: boolean;
};

export type ImobActionCatalog = Record<ImobEntityKey, ImobEntityConfig>;

const defaultAction = (
  label: string,
  icon: string,
  dangerous = false,
  requiresConfirmation = false,
): ImobActionMeta => ({
  label,
  icon,
  dangerous,
  requiresConfirmation,
});

export const IMOB_ACTION_CATALOG: ImobActionCatalog = {
  proprietario: {
    category: "cadastros",
    aliases: ["proprietario", "proprietária", "dono", "vendedor", "locador"],
    createPrompt: "quero incluir proprietário",
    createChoiceLabel: "Proprietário",
    actions: {
      create: defaultAction("Cadastrar proprietário", "user-plus"),
      edit: defaultAction("Editar proprietário", "user-pen"),
      delete: defaultAction("Excluir proprietário", "user-x", true, true),
      list: defaultAction("Listar proprietários", "users"),
      get: defaultAction("Consultar proprietário", "search"),
      update: defaultAction("Atualizar dados do proprietário", "file-pen"),
      status: defaultAction("Atualizar status do proprietário", "badge-check"),
      sendDocuments: defaultAction("Enviar documentos do proprietário", "file-up"),
      history: defaultAction("Ver histórico do proprietário", "history"),
    },
  },
  imovel: {
    category: "cadastros",
    aliases: ["imovel", "imóvel", "apartamento", "casa", "terreno"],
    createPrompt: "quero incluir imóvel",
    createChoiceLabel: "Imóvel",
    actions: {
      create: defaultAction("Cadastrar imóvel", "house-plus"),
      edit: defaultAction("Editar imóvel", "square-pen"),
      delete: defaultAction("Excluir imóvel", "trash", true, true),
      list: defaultAction("Listar imóveis", "building-2"),
      get: defaultAction("Consultar imóvel", "search"),
      update: defaultAction("Atualizar dados do imóvel", "file-pen"),
      configure: defaultAction("Configurar regras do imóvel", "sliders-horizontal", false, true),
      status: defaultAction("Atualizar status do imóvel", "badge-check"),
      sendDocuments: defaultAction("Enviar documentos do imóvel", "file-up"),
      history: defaultAction("Ver histórico do imóvel", "history"),
      publish: defaultAction("Publicar imóvel", "send", false, true),
      unpublish: defaultAction("Retirar imóvel de publicação", "circle-off", false, true),
    },
  },
  comprador: {
    category: "cadastros",
    aliases: ["comprador", "compradora", "cliente comprador"],
    createPrompt: "quero cadastrar comprador como lead",
    createChoiceLabel: "Comprador",
    actions: {
      create: defaultAction("Cadastrar comprador", "user-plus"),
      edit: defaultAction("Editar comprador", "user-pen"),
      delete: defaultAction("Excluir comprador", "user-x", true, true),
      list: defaultAction("Listar compradores", "users"),
      get: defaultAction("Consultar comprador", "search"),
      update: defaultAction("Atualizar dados do comprador", "file-pen"),
      status: defaultAction("Atualizar status do comprador", "badge-check"),
      sendDocuments: defaultAction("Enviar documentos do comprador", "file-up"),
      history: defaultAction("Ver histórico do comprador", "history"),
    },
  },
  vendedor: {
    category: "cadastros",
    aliases: ["vendedor", "vendedora"],
    createPrompt: "quero incluir vendedor como proprietário",
    createChoiceLabel: "Vendedor",
    actions: {
      create: defaultAction("Cadastrar vendedor", "user-plus"),
      edit: defaultAction("Editar vendedor", "user-pen"),
      delete: defaultAction("Excluir vendedor", "user-x", true, true),
      list: defaultAction("Listar vendedores", "users"),
      get: defaultAction("Consultar vendedor", "search"),
      update: defaultAction("Atualizar dados do vendedor", "file-pen"),
      status: defaultAction("Atualizar status do vendedor", "badge-check"),
      sendDocuments: defaultAction("Enviar documentos do vendedor", "file-up"),
      history: defaultAction("Ver histórico do vendedor", "history"),
    },
  },
  locador: {
    category: "cadastros",
    aliases: ["locador", "locadora"],
    createPrompt: "quero incluir locador como proprietário",
    createChoiceLabel: "Locador",
    actions: {
      create: defaultAction("Cadastrar locador", "user-plus"),
      edit: defaultAction("Editar locador", "user-pen"),
      delete: defaultAction("Excluir locador", "user-x", true, true),
      list: defaultAction("Listar locadores", "users"),
      get: defaultAction("Consultar locador", "search"),
      update: defaultAction("Atualizar dados do locador", "file-pen"),
      status: defaultAction("Atualizar status do locador", "badge-check"),
      sendDocuments: defaultAction("Enviar documentos do locador", "file-up"),
      history: defaultAction("Ver histórico do locador", "history"),
    },
  },
  locatario: {
    category: "cadastros",
    aliases: ["locatario", "locatário", "inquilino", "inquilina"],
    createPrompt: "quero cadastrar locatário como lead",
    createChoiceLabel: "Locatário",
    actions: {
      create: defaultAction("Cadastrar locatário", "user-plus"),
      edit: defaultAction("Editar locatário", "user-pen"),
      delete: defaultAction("Excluir locatário", "user-x", true, true),
      list: defaultAction("Listar locatários", "users"),
      get: defaultAction("Consultar locatário", "search"),
      update: defaultAction("Atualizar dados do locatário", "file-pen"),
      status: defaultAction("Atualizar status do locatário", "badge-check"),
    },
  },
  corretor: {
    category: "usuarios",
    actions: {
      create: defaultAction("Cadastrar corretor", "user-plus"),
      edit: defaultAction("Editar corretor", "user-pen"),
      delete: defaultAction("Excluir corretor", "user-x", true, true),
      list: defaultAction("Listar corretores", "users"),
      get: defaultAction("Consultar corretor", "search"),
      update: defaultAction("Atualizar dados do corretor", "file-pen"),
      status: defaultAction("Atualizar status do corretor", "badge-check"),
    },
  },
  lead: {
    category: "comercial",
    aliases: ["lead", "leads", "contato", "contatos"],
    createPrompt: "cadastrar lead",
    createChoiceLabel: "Lead",
    actions: {
      create: defaultAction("Cadastrar lead", "user-plus"),
      edit: defaultAction("Editar lead", "user-pen"),
      delete: defaultAction("Excluir lead", "user-x", true, true),
      list: defaultAction("Listar leads", "list"),
      get: defaultAction("Consultar lead", "search"),
      update: defaultAction("Atualizar dados do lead", "file-pen"),
      status: defaultAction("Atualizar status do lead", "badge-check"),
      convert: defaultAction("Converter lead em comprador", "shuffle", false, true),
      assign: defaultAction("Distribuir lead para corretor", "send", false, true),
    },
  },
  proposta: {
    category: "transacoes",
    actions: {
      create: defaultAction("Criar proposta", "file-plus"),
      edit: defaultAction("Editar proposta", "file-pen"),
      delete: defaultAction("Excluir proposta", "trash", true, true),
      list: defaultAction("Listar propostas", "list"),
      get: defaultAction("Consultar proposta", "search"),
      status: defaultAction("Atualizar status da proposta", "badge-check"),
      approve: defaultAction("Aprovar proposta", "check-check", false, true),
      reject: defaultAction("Reprovar proposta", "x-circle", false, true),
      send: defaultAction("Enviar proposta", "send", false, true),
      history: defaultAction("Ver histórico da proposta", "history"),
    },
  },
  contrato: {
    category: "transacoes",
    actions: {
      create: defaultAction("Criar contrato", "file-plus"),
      edit: defaultAction("Editar contrato", "file-pen"),
      delete: defaultAction("Excluir contrato", "trash", true, true),
      list: defaultAction("Listar contratos", "list"),
      get: defaultAction("Consultar contrato", "search"),
      status: defaultAction("Atualizar status do contrato", "badge-check"),
      approve: defaultAction("Aprovar contrato", "check-check", false, true),
      sendForSignature: defaultAction("Enviar contrato para assinatura", "pen-square", false, true),
      history: defaultAction("Ver histórico do contrato", "history"),
    },
  },
  visita: {
    category: "agenda",
    actions: {
      create: defaultAction("Agendar visita", "calendar-plus"),
      edit: defaultAction("Editar visita", "calendar-pen"),
      delete: defaultAction("Cancelar visita", "calendar-x", false, true),
      list: defaultAction("Listar visitas", "calendar-days"),
      get: defaultAction("Consultar visita", "search"),
      status: defaultAction("Atualizar status da visita", "badge-check"),
      confirm: defaultAction("Confirmar visita", "check", false, true),
      reschedule: defaultAction("Reagendar visita", "calendar-sync", false, true),
    },
  },
  agenda: {
    category: "agenda",
    actions: {
      create: defaultAction("Criar compromisso", "calendar-plus"),
      edit: defaultAction("Editar compromisso", "calendar-pen"),
      delete: defaultAction("Cancelar compromisso", "calendar-x", false, true),
      list: defaultAction("Ver agenda", "calendar-days"),
      get: defaultAction("Consultar compromisso", "search"),
    },
  },
  documento: {
    category: "documentos",
    actions: {
      create: defaultAction("Cadastrar documento", "file-plus"),
      edit: defaultAction("Editar documento", "file-pen"),
      delete: defaultAction("Excluir documento", "trash", true, true),
      list: defaultAction("Listar documentos", "files"),
      get: defaultAction("Consultar documento", "search"),
      send: defaultAction("Enviar documento", "file-up"),
      validate: defaultAction("Validar documento", "badge-check", false, true),
    },
  },
  anuncio: {
    category: "marketing",
    actions: {
      create: defaultAction("Criar anúncio", "megaphone"),
      edit: defaultAction("Editar anúncio", "square-pen"),
      delete: defaultAction("Excluir anúncio", "trash", true, true),
      list: defaultAction("Listar anúncios", "list"),
      get: defaultAction("Consultar anúncio", "search"),
      publish: defaultAction("Publicar anúncio", "send", false, true),
      pause: defaultAction("Pausar anúncio", "pause-circle", false, true),
    },
  },
  pagamento: {
    category: "financeiro",
    actions: {
      create: defaultAction("Registrar pagamento", "wallet"),
      edit: defaultAction("Editar pagamento", "file-pen"),
      delete: defaultAction("Excluir pagamento", "trash", true, true),
      list: defaultAction("Listar pagamentos", "list"),
      get: defaultAction("Consultar pagamento", "search"),
      status: defaultAction("Atualizar status do pagamento", "badge-check"),
      sendReceipt: defaultAction("Enviar comprovante de pagamento", "receipt"),
    },
  },
  dashboard: {
    category: "gestao",
    actions: {
      view: defaultAction("Ver dashboard", "layout-dashboard"),
      indicators: defaultAction("Ver indicadores", "bar-chart-3"),
      reports: defaultAction("Ver relatórios", "file-bar-chart"),
      export: defaultAction("Exportar relatório", "download", false, true),
    },
  },
} satisfies ImobActionCatalog;

export function getImobEntity(entity: ImobEntityKey): ImobEntityConfig {
  return IMOB_ACTION_CATALOG[entity];
}

export function getImobAction(entity: ImobEntityKey, action: ImobActionKey): ImobActionMeta | null {
  return IMOB_ACTION_CATALOG[entity].actions[action] ?? null;
}

export function listImobEntities(): ImobEntityKey[] {
  return Object.keys(IMOB_ACTION_CATALOG) as ImobEntityKey[];
}

export function listImobActions(entity: ImobEntityKey): ImobActionKey[] {
  return Object.keys(IMOB_ACTION_CATALOG[entity].actions) as ImobActionKey[];
}

export function isDangerousImobAction(entity: ImobEntityKey, action: ImobActionKey): boolean {
  return IMOB_ACTION_CATALOG[entity].actions[action]?.dangerous ?? false;
}

export function requiresConfirmationForImobAction(entity: ImobEntityKey, action: ImobActionKey): boolean {
  return IMOB_ACTION_CATALOG[entity].actions[action]?.requiresConfirmation ?? false;
}

export type ImobCadastroChoice = {
  entity: ImobEntityKey;
  label: string;
  nextMessage: string;
};

const CADASTRO_CHOICE_ORDER: ImobEntityKey[] = [
  "proprietario",
  "imovel",
  "comprador",
  "vendedor",
  "locador",
  "locatario",
];

export function listImobCadastroChoices(): ImobCadastroChoice[] {
  return CADASTRO_CHOICE_ORDER.flatMap((entity) => {
    const config = IMOB_ACTION_CATALOG[entity];
    if (!config.actions.create || !config.createPrompt || !config.createChoiceLabel) {
      return [];
    }
    return [{ entity, label: config.createChoiceLabel, nextMessage: config.createPrompt }];
  });
}
