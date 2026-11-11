import {
  bulkArchiveConfirmLabel,
  bulkArchiveOutcomeLabel,
  candidateTitle,
  describeCandidateOwner,
  filterBulkArchiveCandidates,
  formatBulkArchiveSummary,
  pendingBulkArchiveIds,
  summarizeBulkArchiveOutcomes,
  summarizeBulkArchiveSelection,
  type BulkArchiveCandidate,
  type BulkArchiveEligibility,
  type BulkArchiveEvent,
  type PropertyBulkArchiveState,
} from "@/pages/app/imob/propertyBulkArchive";

type Props = {
  messageId: string;
  state: PropertyBulkArchiveState | undefined;
  onEvent: (event: BulkArchiveEvent) => unknown;
};

const buttonBase = "min-h-[44px] rounded-full px-4 py-1.5 text-[12px] normal-case tracking-normal disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[34px] sm:px-3";
const primaryButton = `${buttonBase} bg-accent/15 text-foreground`;
const secondaryButton = `${buttonBase} bg-black/25 text-muted-foreground hover:text-foreground`;

const ELIGIBILITY_TEXT: Record<BulkArchiveEligibility, string> = {
  unknown: "Elegibilidade não verificada; o servidor confirma ao arquivar.",
  case_linked: "Há caso ou locação ligados; o servidor deve bloquear.",
  no_case_known: "Sem caso ligado conhecido (informativo; o servidor confirma ao arquivar).",
};

function CandidateDetails({ candidate }: { candidate: BulkArchiveCandidate }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block break-words text-[13px] font-medium text-foreground">{candidateTitle(candidate)}</span>
      <span className="block break-words text-[11px] text-muted-foreground">Proprietário: {describeCandidateOwner(candidate)}</span>
      {candidate.address ? <span className="block break-words text-[11px] text-muted-foreground">{candidate.address}</span> : null}
    </span>
  );
}

/** Painel do "Arquivar imóvel(is)". Só apresentação: emite eventos e o runtime decide e executa. */
export function ImobPropertyBulkArchivePanel({ messageId, state, onEvent }: Props) {
  const stage = state?.stage ?? "loading";
  const heading = (
    <div className="space-y-0.5">
      <p className="text-sm font-medium text-foreground">Arquivar imóveis</p>
      <p className="text-[11px] normal-case tracking-normal text-muted-foreground">
        O imóvel sai das listas; o histórico fica guardado. Imóvel com locação ou caso ligado não pode ser arquivado.
      </p>
    </div>
  );
  const notice = state?.notice ? (
    <p role="alert" className="text-[11px] normal-case tracking-normal text-amber-200">{state.notice}</p>
  ) : null;

  let body: React.ReactNode;

  if (!state || stage === "loading") {
    body = <p role="status" className="text-[12px] text-muted-foreground">Carregando imóveis…</p>;
  } else if (stage === "error") {
    body = (
      <>
        {notice}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={primaryButton} data-front-door-primary="true" onClick={() => void onEvent({ type: "reload" })}>Tentar de novo</button>
          <button type="button" className={secondaryButton} onClick={() => void onEvent({ type: "cancel" })}>Cancelar</button>
        </div>
      </>
    );
  } else if (stage === "stale") {
    body = (
      <>
        {notice}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={secondaryButton} onClick={() => void onEvent({ type: "close" })}>Fechar</button>
        </div>
      </>
    );
  } else if (stage === "select") {
    const visible = filterBulkArchiveCandidates(state.candidates, state.query);
    const summary = summarizeBulkArchiveSelection(state);
    const selected = new Set(state.selectedIds);
    body = (
      <>
        {notice}
        {state.truncated ? (
          <p role="note" className="text-[11px] normal-case tracking-normal text-amber-200">
            A lista traz no máximo 200 imóveis; pode haver outros não exibidos. Só os imóveis exibidos podem ser selecionados.
          </p>
        ) : null}
        <div className="space-y-1">
          <label htmlFor={`${messageId}-bulk-archive-search`} className="text-[11px] normal-case tracking-normal text-foreground/90">Buscar imóveis</label>
          <input
            id={`${messageId}-bulk-archive-search`}
            type="search"
            value={state.query}
            onChange={(event) => void onEvent({ type: "query", value: event.target.value })}
            placeholder="Unidade, proprietário ou endereço"
            className="min-h-[44px] w-full rounded-lg border border-white/10 bg-black/25 px-3 py-1.5 text-[12px] normal-case tracking-normal text-foreground placeholder:text-muted-foreground focus:outline-none sm:min-h-[34px]"
          />
        </div>
        <p role="status" aria-live="polite" className="text-[11px] normal-case tracking-normal text-muted-foreground">
          {summary.selected} {summary.selected === 1 ? "selecionado" : "selecionados"}
          {summary.hiddenSelected > 0 ? ` (${summary.hiddenSelected} fora do filtro atual)` : ""}
          {" · "}exibindo {summary.visible} de {state.candidates.length}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={secondaryButton} disabled={visible.length === 0} onClick={() => void onEvent({ type: "select_visible" })}>
            {visible.length === 1 ? "Selecionar o 1 exibido" : `Selecionar os ${visible.length} exibidos`}
          </button>
          <button type="button" className={secondaryButton} disabled={summary.selected === 0} onClick={() => void onEvent({ type: "clear" })}>
            Limpar seleção
          </button>
        </div>
        {state.candidates.length === 0 ? (
          <p className="text-[11px] normal-case tracking-normal text-amber-200">Nenhum imóvel ativo neste workspace. Use Imóveis → Cadastrar imóvel.</p>
        ) : (
          <fieldset className="min-w-0">
            <legend className="sr-only">Imóveis para arquivar</legend>
            <ul className="max-h-[50dvh] space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-1">
              {visible.map((candidate) => (
                <li key={`${messageId}-bulk-${candidate.id}`}>
                  <label className="flex min-h-[44px] cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0"
                      checked={selected.has(candidate.id)}
                      onChange={() => void onEvent({ type: "toggle", propertyId: candidate.id })}
                    />
                    <CandidateDetails candidate={candidate} />
                  </label>
                </li>
              ))}
              {visible.length === 0 ? <li className="px-2 py-2 text-[11px] text-muted-foreground">Nenhum imóvel corresponde à busca.</li> : null}
            </ul>
          </fieldset>
        )}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={secondaryButton} onClick={() => void onEvent({ type: "cancel" })}>Cancelar</button>
          <button type="button" className={primaryButton} data-front-door-primary="true" disabled={summary.selected === 0} onClick={() => void onEvent({ type: "review" })}>
            Revisar arquivamento
          </button>
        </div>
      </>
    );
  } else if (stage === "review") {
    const reviewed = state.reviewedIds
      .map((id) => state.candidates.find((candidate) => candidate.id === id))
      .filter((candidate): candidate is BulkArchiveCandidate => Boolean(candidate));
    body = (
      <>
        <p role="status" className="text-[12px] font-medium text-foreground">
          Revisão: {reviewed.length} {reviewed.length === 1 ? "imóvel será arquivado" : "imóveis serão arquivados"} se você confirmar. Nada foi arquivado ainda.
        </p>
        <p className="text-[11px] normal-case tracking-normal text-muted-foreground">
          Arquivar retira o imóvel das listas ativas e preserva o histórico. Dependências (locação ou caso ligado) podem bloquear itens no momento da execução; os demais seguem.
        </p>
        <ul className="max-h-[50dvh] space-y-1.5 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-2" aria-label="Imóveis a arquivar">
          {reviewed.map((candidate) => (
            <li key={`${messageId}-review-${candidate.id}`} className="flex min-w-0 items-start gap-2">
              <CandidateDetails candidate={candidate} />
            </li>
          ))}
        </ul>
        <ul className="space-y-0.5 text-[10.5px] text-muted-foreground" aria-label="Elegibilidade preliminar">
          {reviewed.map((candidate) => (
            <li key={`${messageId}-eligibility-${candidate.id}`}>
              {candidateTitle(candidate)}: {state.eligibilityChecked || state.eligibility[candidate.id]
                ? ELIGIBILITY_TEXT[state.eligibility[candidate.id] ?? "unknown"]
                : "verificando…"}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={secondaryButton} onClick={() => void onEvent({ type: "back" })}>Voltar à seleção</button>
          <button type="button" className={secondaryButton} onClick={() => void onEvent({ type: "cancel" })}>Cancelar</button>
          <button type="button" className={primaryButton} data-front-door-primary="true" onClick={() => void onEvent({ type: "confirm" })}>
            {bulkArchiveConfirmLabel(reviewed.length)}
          </button>
        </div>
      </>
    );
  } else if (stage === "running") {
    body = (
      <>
        <p role="status" aria-live="polite" className="text-[12px] font-medium text-foreground">Arquivando… um imóvel por vez. Não feche esta janela.</p>
        <ul className="space-y-0.5 text-[11px]" aria-label="Andamento do arquivamento">
          {state.reviewedIds.map((id) => (
            <li key={`${messageId}-run-${id}`}>
              {state.labels[id] ?? "Imóvel"} — {state.outcomes[id] ? bulkArchiveOutcomeLabel(state.outcomes[id]) : "aguardando"}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={secondaryButton} onClick={() => void onEvent({ type: "cancel" })}>Interromper</button>
        </div>
      </>
    );
  } else {
    const ids = Object.keys(state.outcomes);
    const totals = summarizeBulkArchiveOutcomes(state.outcomes, ids);
    const pending = pendingBulkArchiveIds(state);
    body = (
      <>
        {notice}
        <p role="status" className="text-[12px] font-medium text-foreground">{formatBulkArchiveSummary(totals)}</p>
        <ul className="space-y-0.5 text-[11px]" aria-label="Resultado por imóvel">
          {ids.map((id) => (
            <li key={`${messageId}-result-${id}`}>{state.labels[id] ?? "Imóvel"} — {bulkArchiveOutcomeLabel(state.outcomes[id])}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-1.5">
          {pending.length > 0 ? (
            <button type="button" className={primaryButton} data-front-door-primary="true" onClick={() => void onEvent({ type: "retry_pending" })}>
              Tentar de novo {pending.length === 1 ? "o imóvel pendente" : `os ${pending.length} imóveis pendentes`}
            </button>
          ) : null}
          <button type="button" className={secondaryButton} onClick={() => void onEvent({ type: "close" })}>Fechar</button>
        </div>
      </>
    );
  }

  return (
    <section
      aria-label="Arquivar imóveis"
      data-imob-bulk-archive={stage}
      className="imob-structured-form imob-bulk-archive mt-2.5 min-w-0 space-y-2.5 rounded-xl border border-white/10 bg-surface/50 p-2.5"
    >
      {heading}
      {body}
    </section>
  );
}
