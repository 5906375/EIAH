/**
 * Menus da barra do chat IMOB, agrupados por assunto. Cada item ou envia um
 * pedido já conhecido do chat (`prompt`) ou abre um formulário local por ação
 * explícita do usuário (`localForm`) — nenhum item interpreta texto livre.
 * Só entram ações que funcionam hoje; as próximas (anexar documento,
 * histórico, editar/encerrar locação) entram quando existirem.
 */

export type ImobLocalFormKind = "owner_edit" | "owner_archive" | "property_edit" | "property_archive";

export type ImobActionMenuItem =
  | { id: string; label: string; kind: "prompt"; prompt: string }
  | { id: string; label: string; kind: "local"; form: ImobLocalFormKind };

export type ImobActionMenu = {
  id: string;
  label: string;
  items: ImobActionMenuItem[];
};

export const IMOB_ACTION_MENUS: ImobActionMenu[] = [
  {
    id: "owners",
    label: "Proprietários",
    items: [
      { id: "owner-create", label: "Cadastrar proprietário", kind: "prompt", prompt: "cadastrar proprietário" },
      { id: "owner-edit", label: "Editar proprietário", kind: "local", form: "owner_edit" },
      { id: "owner-archive", label: "Arquivar proprietário", kind: "local", form: "owner_archive" },
    ],
  },
  {
    id: "properties",
    label: "Imóveis",
    items: [
      { id: "property-create", label: "Cadastrar imóvel", kind: "prompt", prompt: "cadastrar imóvel" },
      { id: "property-edit", label: "Editar imóvel", kind: "local", form: "property_edit" },
      { id: "property-archive", label: "Arquivar imóvel", kind: "local", form: "property_archive" },
      {
        id: "property-capture",
        label: "Captar imóvel",
        kind: "prompt",
        prompt: "Quero iniciar uma captação no IMOB. Me mostre opções de próximos passos no chat.",
      },
    ],
  },
  {
    id: "rentals",
    label: "Locações",
    items: [{ id: "rental-create", label: "Cadastrar locação", kind: "prompt", prompt: "cadastrar locatário" }],
  },
  {
    id: "deals",
    label: "Negócios",
    items: [
      { id: "deal-proposal", label: "Gerar proposta", kind: "prompt", prompt: "Quero gerar uma proposta comercial para um cliente." },
      { id: "deal-contract", label: "Iniciar contrato", kind: "prompt", prompt: "Quero iniciar a coleta de dados para gerar um contrato imobiliário." },
    ],
  },
];

/** Itens que enviam pedido ao chat: o rótulo vira o texto exibido do usuário. */
export function listImobActionMenuPrompts() {
  return IMOB_ACTION_MENUS.flatMap((menu) =>
    menu.items.flatMap((item) => (item.kind === "prompt" ? [{ label: item.label, prompt: item.prompt }] : [])),
  );
}
