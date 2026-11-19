import { visiblePropertyCaptureForm } from "@/pages/app/imob/propertyCreateForm";
import React from "react";
import { ImobFormCard } from "./ImobFormCard";
import type { ImobFrontDoorForms } from "./useImobFrontDoorForms";
import type { StructuredMessage } from "./types";
import { ImobChatWidgets } from "@/features/imob/ImobChatWidgets";

/**
 * Parte do IMOB numa mensagem do front door: texto, formulário, card de
 * confirmação (com links de documentos) e próximos passos. Só apresentação.
 */
export function ImobFrontDoorPart({
  message,
  frontDoor,
  isLast,
}: {
  message: StructuredMessage;
  frontDoor: ImobFrontDoorForms;
  isLast: boolean;
}) {
  const { imobForms, structuredForms } = frontDoor;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const visibleForm = visiblePropertyCaptureForm(message);
  // Guided opening: the server's replies for this state ("Continuar sem IA", "Revisar cadastro", "Cancelar…") become real controls. The full form
  // stays hidden until the user chooses to review; each reply is the same canonical command as typing it.
  const guided = message.propertyGuided;
  const openingReplies: NonNullable<StructuredMessage["quickReplies"]> = isLast && message.form && guided?.status === "active" && guided.phase === "start" && !message.propertyCaptureProposal
    ? guided.quickReplies.map((reply) => ({ id: `guided-${reply}`, label: reply, onSelect: () => { void structuredForms.selectGuidedReply(message, reply); } })) : [];
  const quickReplies = message.quickReplies?.length ? message.quickReplies : openingReplies;
  React.useEffect(() => {
    if (message.form && message.propertyGuided?.showFullForm) rootRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [message.propertyGuided?.showFullForm]);
  // O launcher só rola quando ele mesmo empilha a mensagem; a resposta da vertical chega depois (assíncrona). Quando a última
  // mensagem traz um cartão de vertical, ela entra na área visível ao aparecer (inclusive ao restaurar a conversa).
  React.useEffect(() => {
    if (isLast && message.widget) rootRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={rootRef} className="flex w-full flex-col gap-3 text-sm text-foreground">
      {message.text ? <p className="whitespace-pre-line leading-relaxed">{message.text}</p> : null}
      {message.widget ? <ImobChatWidgets widget={message.widget} onAction={() => undefined} /> : null}
      {message.card ? (
        <div className="px-3 py-2 text-xs">
          <p className="font-semibold uppercase tracking-[0.18em] text-muted-foreground">{message.card.title}</p>
          <ul className="mt-1 space-y-0.5">
            {message.card.lines.map((line, index) => (
              <li key={`${message.id}-line-${index}`}>{line}</li>
            ))}
          </ul>
          {message.card.ctas?.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {message.card.ctas.map((cta) =>
                cta.href ? (
                  <a key={cta.id} href={cta.href} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                    {cta.label}
                  </a>
                ) : null,
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      {visibleForm ? (
        <ImobFormCard
          message={{ ...message, form: visibleForm }}
          state={imobForms}
          onSelectChange={structuredForms.handleSelectChange}
          onAction={(target, actionId) => structuredForms.handleStructuredFormAction(target, actionId)}
          onBulkArchive={structuredForms.handlePropertyBulkArchiveEvent}
        />
      ) : null}
      {message.form && message.propertyGuided?.status === "active" ? (
        <label className="text-xs text-muted-foreground">Corrigir ou retomar campo
          <select aria-label="Corrigir ou retomar campo" value="" className="ml-2 rounded border border-white/10 bg-surface p-2"
            onChange={(event) => { if (event.target.value) void structuredForms.focusPropertyField(message, event.target.value); }}>
            <option value="">Selecione um campo</option>
            {message.form.fields.filter((field) => field.type !== "file" && !field.allowAttachment && !field.name.startsWith("document")).map((field) => (
              <option key={field.name} value={field.name}>{field.label}{message.propertyGuided!.skipped.includes(field.name) ? " (pulado)" : ""}</option>
            ))}
          </select>
        </label>
      ) : null}
      {isLast && quickReplies.length ? (
        <div className="flex flex-col items-start gap-1.5" role="group" aria-label="Próximos passos">
          {quickReplies.map((option) => (
            <button
              key={`${message.id}-reply-${option.id}`}
              type="button"
              onClick={() => option.onSelect?.()}
              className="min-h-[44px] px-3 py-1.5 text-left text-[13px] text-accent transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
