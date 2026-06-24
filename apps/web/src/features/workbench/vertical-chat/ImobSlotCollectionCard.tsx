import React from "react";

// ---------------------------------------------------------------------------
// Field metadata — mapeia field key para label PT-BR, tipo de input e opções
// Mantido em sincronia com formatOperationalPendingField em chat.tsx
// ---------------------------------------------------------------------------

type FieldMeta = {
  label: string;
  type: "text" | "tel" | "email" | "number" | "date" | "select";
  placeholder?: string;
  options?: { value: string; label: string }[];
};

const FIELD_META: Record<string, FieldMeta> = {
  // Lead
  leadName:     { label: "Nome do lead",       type: "text",   placeholder: "Nome completo" },
  leadPhone:    { label: "Telefone do lead",    type: "tel",    placeholder: "47 99999-0000" },
  leadEmail:    { label: "E-mail do lead",      type: "email",  placeholder: "email@exemplo.com" },
  desiredGoal:  { label: "Objetivo",            type: "select", options: [{ value: "compra", label: "Compra" }, { value: "locacao", label: "Locação" }, { value: "aluguel_por_temporada", label: "Temporada" }] },
  desiredCity:  { label: "Cidade de interesse", type: "text",   placeholder: "Ex: Itapema" },
  budgetMax:    { label: "Orçamento máximo",    type: "number", placeholder: "Ex: 500000" },
  // Proprietário
  ownerName:    { label: "Nome do proprietário",     type: "text",  placeholder: "Nome completo" },
  ownerPhone:   { label: "Telefone do proprietário", type: "tel",   placeholder: "47 99999-0000" },
  ownerEmail:   { label: "E-mail do proprietário",   type: "email", placeholder: "email@exemplo.com" },
  ownerDocument:{ label: "CPF/CNPJ",                type: "text",  placeholder: "000.000.000-00" },
  // Visita
  propertyId:   { label: "Imóvel",              type: "text",   placeholder: "Referência do imóvel" },
  visitorName:  { label: "Nome do visitante",   type: "text",   placeholder: "Nome completo" },
  visitorPhone: { label: "Telefone do visitante",type: "tel",   placeholder: "47 99999-0000" },
  preferredDate:{ label: "Data da visita",      type: "date" },
  preferredWindow:{ label: "Turno",             type: "select", options: [{ value: "manha", label: "Manhã" }, { value: "tarde", label: "Tarde" }, { value: "noite", label: "Noite" }] },
  // Proposta
  buyerName:    { label: "Nome do comprador",   type: "text",   placeholder: "Nome completo" },
  buyerPhone:   { label: "Telefone do comprador",type: "tel",   placeholder: "47 99999-0000" },
  buyerEmail:   { label: "E-mail do comprador", type: "email",  placeholder: "email@exemplo.com" },
  offerAmount:  { label: "Valor da proposta",   type: "number", placeholder: "Ex: 450000" },
  contractType: { label: "Tipo de contrato",    type: "select", options: [{ value: "sale", label: "Venda" }, { value: "rent", label: "Locação" }, { value: "management", label: "Administração" }] },
  // Comissão
  dealId:       { label: "Negócio",             type: "text",   placeholder: "Referência do negócio" },
  amountCents:  { label: "Valor da comissão",   type: "number", placeholder: "Ex: 15000" },
  payoutChannel:{ label: "Canal de repasse",    type: "text",   placeholder: "PIX, TED..." },
  // Imóvel
  listingTitle: { label: "Título do anúncio",   type: "text",   placeholder: "Título da publicação" },
  publicationGoal:{ label: "Finalidade",        type: "select", options: [{ value: "venda", label: "Venda" }, { value: "locacao", label: "Locação" }] },
};

function getFieldMeta(field: string): FieldMeta {
  return FIELD_META[field] ?? { label: field, type: "text", placeholder: field };
}

// ---------------------------------------------------------------------------
// Formata valor para a mensagem estruturada que o engine já parseia
// Formato: "Nome do lead: João | Telefone do lead: 47 9..."
// ---------------------------------------------------------------------------
function formatSubmitMessage(values: Record<string, string>, fields: string[]): string {
  return fields
    .map((field) => {
      const meta = getFieldMeta(field);
      const raw = (values[field] ?? "").trim();
      if (!raw) return null;
      // Orçamento e valores: adiciona "R$" se não tiver
      if ((meta.type === "number") && raw && !/R\$/.test(raw)) {
        const num = Number(raw.replace(/\D/g, ""));
        if (!Number.isNaN(num)) {
          return `${meta.label}: R$ ${num.toLocaleString("pt-BR")}`;
        }
      }
      return `${meta.label}: ${raw}`;
    })
    .filter(Boolean)
    .join(" | ");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  pendingFields: string[];
  flow?: string | null;
  /** Valores já conhecidos pelo engine — pré-preenchem o card; sem decisão cognitiva no frontend. */
  prefilled?: Record<string, string>;
  onSubmit: (structuredText: string) => void;
  onCancel: () => void;
  disabled?: boolean;
};

export function ImobSlotCollectionCard({ pendingFields, prefilled, onSubmit, onCancel, disabled }: Props) {
  const [values, setValues] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(pendingFields.map((f) => [f, prefilled?.[f] ?? ""]))
  );
  const [submitted, setSubmitted] = React.useState(false);

  const allFilled = pendingFields.every((f) => (values[f] ?? "").trim().length > 0);

  function handleChange(field: string, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allFilled || submitted || disabled) return;
    const msg = formatSubmitMessage(values, pendingFields);
    if (!msg) return;
    setSubmitted(true);
    onSubmit(msg);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-1.5 rounded-[14px] border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm"
    >
      <div className="mb-2.5 flex items-center gap-1.5">
        <span className="h-1 w-1 rounded-full bg-accent/70" />
        <p className="text-[9px] uppercase tracking-[0.18em] text-accent/80">Preencher dados</p>
      </div>

      <div className="space-y-2">
        {pendingFields.map((field) => {
          const meta = getFieldMeta(field);
          return (
            <div key={field} className="flex flex-col gap-0.5">
              <label className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                {meta.label}
              </label>
              {meta.type === "select" && meta.options ? (
                <select
                  value={values[field] ?? ""}
                  onChange={(e) => handleChange(field, e.target.value)}
                  disabled={disabled || submitted}
                  className="rounded-[8px] border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 disabled:opacity-50"
                >
                  <option value="" disabled>Selecionar...</option>
                  {meta.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={meta.type}
                  value={values[field] ?? ""}
                  onChange={(e) => handleChange(field, e.target.value)}
                  placeholder={meta.placeholder}
                  disabled={disabled || submitted}
                  className="rounded-[8px] border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20 disabled:opacity-50"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={!allFilled || submitted || disabled}
          className="rounded-full border border-accent/30 bg-accent/12 px-3.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitted ? "Enviando..." : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitted || disabled}
          className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition hover:bg-white/[0.08] disabled:opacity-40"
        >
          Cancelar
        </button>
        {!allFilled && (
          <span className="ml-auto text-[9px] text-muted-foreground/60">
            {pendingFields.filter((f) => !(values[f] ?? "").trim()).length} campo(s) pendente(s)
          </span>
        )}
      </div>
    </form>
  );
}
