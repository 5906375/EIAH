import { DOCUMENT_ATTACH_ACCEPT } from "@/pages/app/imob/documentAttachForm";
import type { ImobFormState } from "./useImobFormState";
import { normalizeCepValue, type StructuredMessage } from "./types";

type Props = {
  message: StructuredMessage & { form: NonNullable<StructuredMessage["form"]> };
  state: ImobFormState;
  /** Escolha num campo de lista (ex.: imóvel): o formulário traz os dados atuais. */
  onSelectChange: (message: StructuredMessage, fieldName: string, value: string) => void;
  onAction: (message: StructuredMessage, actionId: "cancel" | "submit" | "archive") => unknown;
  onAttachmentClick?: () => void;
};

/** Formulário do IMOB dentro de uma mensagem do chat (mesmo visual nos dois chats). */
export function ImobFormCard({ message, state, onSelectChange, onAction, onAttachmentClick }: Props) {
  const {
    formFilesRef,
    imobOwnerOptions,
    imobPropertyOptions,
    resolveFormFieldOptions,
    resolveFormValuesForMessage,
    updateFormFieldValue,
    applyCepLookupToForm,
  } = state;
  const formValues = resolveFormValuesForMessage(message);
  const formErrors = state.formErrorsByMessageId[message.id] ?? {};
  const formLookupLoading = state.formLookupLoadingByMessageId[message.id] ?? {};
  const formLabel = message.form.label?.trim() ?? "";
  const formDescription = message.form.description?.trim() ?? "";
  return (
    <div className="mt-2.5 space-y-2.5 rounded-xl border border-white/10 bg-surface/50 p-2.5">
      {formLabel || formDescription ? (
        <div className="space-y-0.5">
          {formLabel ? <p className="text-sm font-medium text-foreground">{formLabel}</p> : null}
          {formDescription ? (
            <p className="text-[11px] normal-case tracking-normal text-muted-foreground">{formDescription}</p>
          ) : null}
          {message.form.infoLines?.length ? (
            <div className="mt-1.5 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[11.5px] normal-case tracking-normal text-foreground/90">
              <p className="font-medium">{message.form.infoLines[0]}</p>
              {message.form.infoLines.length > 1 ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {message.form.infoLines.slice(1).map((line, index) => (
                    <li key={`${message.id}-info-${index}`}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-2.5">
        {message.form.fields.map((field) => (
          <div key={`${message.id}-${field.name}`} className="space-y-1">
            <label className="text-[11px] normal-case tracking-normal text-foreground/90">{field.label}</label>
            <div className="flex gap-2">
              {field.type === "file" ? (
                <input
                  type="file"
                  multiple
                  accept={DOCUMENT_ATTACH_ACCEPT}
                  aria-label={field.label}
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    formFilesRef.current[message.id] = files;
                    updateFormFieldValue(message.id, field.name, files.map((file) => file.name).join(", "));
                  }}
                  className="min-h-[34px] w-full rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 text-[12px] normal-case tracking-normal text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-[11px] file:text-foreground"
                />
              ) : field.type === "select" ? (
                <select
                  value={formValues[field.name] ?? ""}
                  onChange={(event) => {
                    updateFormFieldValue(message.id, field.name, event.target.value);
                    onSelectChange(message, field.name, event.target.value);
                  }}
                  className="min-h-[34px] w-full rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 text-[12px] normal-case tracking-normal text-foreground focus:outline-none"
                >
                  <option value="">{field.placeholder ?? ""}</option>
                  {Array.from(new Set(resolveFormFieldOptions(field).map((option) => option.group ?? "")))
                    .map((group) => {
                      const groupedOptions = resolveFormFieldOptions(field).filter((option) => (option.group ?? "") === group);
                      if (!group) {
                        return groupedOptions.map((option) => (
                          <option key={`${message.id}-${field.name}-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ));
                      }
                      return (
                        <optgroup key={`${message.id}-${field.name}-${group}`} label={group}>
                          {groupedOptions.map((option) => (
                            <option key={`${message.id}-${field.name}-${option.value}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                </select>
              ) : (
                <input
                  type={field.type}
                  value={formValues[field.name] ?? ""}
                  inputMode={field.inputMode}
                  maxLength={field.maxLength}
                  onChange={(event) => updateFormFieldValue(
                    message.id,
                    field.name,
                    field.lookup?.kind === "cep" ? normalizeCepValue(event.target.value) : event.target.value,
                  )}
                  onBlur={() => {
                    if (field.lookup?.kind !== "cep") return;
                    void applyCepLookupToForm(message, field.name, formValues[field.name] ?? "");
                  }}
                  placeholder={field.placeholder}
                  className="min-h-[34px] w-full rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 text-[12px] normal-case tracking-normal text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              )}
              {field.allowAttachment ? (
                <button
                  type="button"
                  onClick={() => onAttachmentClick?.()}
                  className="shrink-0 rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] normal-case tracking-normal text-foreground hover:bg-black/30"
                >
                  {field.attachmentLabel ?? "Anexar"}
                </button>
              ) : null}
            </div>
            {field.helperText ? (
              <p className="text-[10px] normal-case tracking-normal text-muted-foreground">{field.helperText}</p>
            ) : null}
            {field.preferredOptionLabel && !formValues[field.name] && field.optionsSource
              && (field.optionsSource === "imob_properties" ? imobPropertyOptions !== null : imobOwnerOptions !== null) ? (
              <p className="text-[10px] normal-case tracking-normal text-amber-200">
                {`Não achei um cadastro único para "${field.preferredOptionLabel}". Escolha na lista${field.optionsSource === "imob_owners" ? " ou cadastre em Proprietários → Cadastrar proprietário" : ""}.`}
              </p>
            ) : null}
            {field.required && field.optionsSource && resolveFormFieldOptions(field).length === 0
              && (field.optionsSource === "imob_properties" ? imobPropertyOptions !== null : imobOwnerOptions !== null) ? (
              <p className="text-[10px] normal-case tracking-normal text-amber-200">
                {field.optionsSource === "imob_properties"
                  ? "Nenhum imóvel cadastrado neste workspace ainda. Use Imóveis → Cadastrar imóvel."
                  : "Nenhum proprietário cadastrado neste workspace ainda. Use Proprietários → Cadastrar proprietário."}
              </p>
            ) : null}
            {formLookupLoading[field.name] ? (
              <p className="text-[10px] normal-case tracking-normal text-muted-foreground">Consultando CEP...</p>
            ) : null}
            {formErrors[field.name] ? (
              <p className="text-[10px] normal-case tracking-normal text-rose-200">{formErrors[field.name]}</p>
            ) : null}
          </div>
        ))}
      </div>
      {formErrors._form ? (
        <p role="alert" className="text-[11px] normal-case tracking-normal text-rose-200">{formErrors._form}</p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {(message.form.actions ?? []).map((action) => (
          <button
            key={`${message.id}-form-${action.id}`}
            type="button"
            onClick={() => void onAction(message, action.id)}
            className={`rounded-full px-3 py-1 text-[11px] normal-case tracking-normal ${action.kind === "primary" ? "bg-accent/15 text-foreground" : "bg-black/25 text-muted-foreground hover:text-foreground"}`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
