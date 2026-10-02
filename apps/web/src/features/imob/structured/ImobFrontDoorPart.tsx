import { ImobFormCard } from "./ImobFormCard";
import type { ImobFrontDoorForms } from "./useImobFrontDoorForms";
import type { StructuredMessage } from "./types";

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
  return (
    <div className="flex w-full flex-col gap-3 text-sm text-foreground">
      {message.text ? <p className="whitespace-pre-line leading-relaxed">{message.text}</p> : null}
      {message.card ? (
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
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
      {message.form ? (
        <ImobFormCard
          message={{ ...message, form: message.form }}
          state={imobForms}
          onSelectChange={structuredForms.handleSelectChange}
          onAction={(target, actionId) => structuredForms.handleStructuredFormAction(target, actionId)}
        />
      ) : null}
      {isLast && message.quickReplies?.length ? (
        <div className="flex flex-col items-start gap-1.5" role="group" aria-label="Próximos passos">
          {message.quickReplies.map((option) => (
            <button
              key={`${message.id}-reply-${option.id}`}
              type="button"
              onClick={() => option.onSelect?.()}
              className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-left text-[13px] text-foreground transition hover:border-accent/60 hover:bg-accent/20"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
