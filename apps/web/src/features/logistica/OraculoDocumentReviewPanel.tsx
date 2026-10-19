import React from "react";
import type { OraculoDocumentReviewRequestV1, OraculoDocumentReviewStateV1, OraculoPreparationRecordV1 } from "@eiah/contracts";
import { ApiError, apiListOraculoDocumentReviews, apiReviewOraculoDocument } from "@/lib/api";
type Observations = OraculoDocumentReviewRequestV1["observations"];
const outcomeLabels = { consistent_in_checked_fields: "Coerente nos campos conferidos", divergent: "Divergência encontrada", indeterminate: "Correspondência indeterminada" };
const stateLabels = { current: "Referência atual", context_changed: "Contexto alterado — conferir novamente", file_unavailable: "Arquivo indisponível ou divergente", superseded: "Conferência anterior" };
const checkLabels = { matches: "Coincide", diverges: "Diverge", reference_missing: "Falta referência da operação", reference_unconfirmed: "Referência ainda precisa de confirmação", not_observed: "Dado não identificado no documento", not_assessed: "Sem referência para comparar este campo" };
const displayValue = (value: string | undefined) => value === "empty_return" ? "Devolução de contêiner vazio" : value === "other" ? "Outro movimento" : value === "not_identified" ? "Não identificado" : value;
const fields = { containerNumber: "Contêiner", port: "Porto", depot: "Depósito", returnDate: "Data da devolução", movement: "Movimento" };
export function OraculoDocumentReviewPanel({ current, editable, blocked, onReviewed, onBusyChange }: {
  current: OraculoPreparationRecordV1; editable: boolean; blocked: boolean;
  onReviewed: (value: OraculoPreparationRecordV1) => void; onBusyChange: (value: boolean) => void;
}) {
  const [items, setItems] = React.useState<OraculoDocumentReviewStateV1[]>([]);
  const [allowed, setAllowed] = React.useState(false);
  const [verifiedRevision, setVerifiedRevision] = React.useState<number | null>(null);
  const [documentId, setDocumentId] = React.useState(current.evidences?.[0]?.documentId ?? "");
  const [observations, setObservations] = React.useState<Observations>({ movement: "not_identified" });
  const [locator, setLocator] = React.useState(""); const [notes, setNotes] = React.useState("");
  const [read, setRead] = React.useState(false); const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState(""); const [refresh, setRefresh] = React.useState(0);
  const alive = React.useRef(true);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  React.useEffect(() => {
    const controller = new AbortController(); let active = true;
    setAllowed(false); setVerifiedRevision(null); setItems([]);
    void apiListOraculoDocumentReviews(current.caseId, controller.signal).then((response) => {
      if (!active) return;
      if (response.data.revision !== current.revision) { setMessage("O caso mudou. Atualize e reabra a preparação antes de registrar a conferência."); return; }
      setItems(response.data.items); setAllowed(response.data.reviewAllowed); setVerifiedRevision(response.data.revision);
    }).catch(() => { if (active) setMessage("Não foi possível consultar as conferências. Tente atualizar a consulta."); });
    return () => { active = false; controller.abort(); };
  }, [current.caseId, current.revision, refresh]);
  React.useEffect(() => { if (!documentId && current.evidences?.length) setDocumentId(current.evidences[0].documentId); }, [current.evidences, documentId]);
  const canReview = editable && allowed && !blocked && !busy && verifiedRevision === current.revision;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!canReview || !read || !documentId) return;
    setBusy(true); onBusyChange(true); setMessage("");
    try {
      const response = await apiReviewOraculoDocument(current.caseId, { documentId, expectedRevision: current.revision, acknowledgedDocumentRead: true, observations, locator, notes });
      if (!alive.current) return;
      onReviewed(response.data); setRead(false); setLocator(""); setNotes(""); setObservations({ movement: "not_identified" });
      setMessage("Conferência documental registrada. Aceite operacional, responsabilidade e custos continuam pendentes.");
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof ApiError && error.status === 400) setMessage("Revise a localização, as observações e as datas informadas.");
      else { setAllowed(false); setVerifiedRevision(null); setMessage("Conferência não confirmada: confira o acesso, a integridade do arquivo e a revisão atual do caso antes de repetir."); }
    } finally { if (alive.current) { setBusy(false); onBusyChange(false); } }
  }
  return <section aria-label="Conferência documental assistida" className="space-y-4 rounded-xl border border-white/15 p-4">
    <h3 className="text-xl font-semibold">Conferência documental assistida</h3>
    <p>Leia o documento usando o download acima e registre os dados que encontrou. A comparação usa a referência declarada e salva no caso.</p>
    <p>Coincidência textual não comprova autenticidade do emissor, aceite da devolução ou encerramento de responsabilidade e cobranças.</p>
    <button type="button" className="text-accent underline" disabled={busy || blocked} onClick={() => { setMessage(""); setRefresh((value) => value + 1); }}>Atualizar conferências</button>
    {verifiedRevision === null ? <p role="status">Conferências ainda não verificadas nesta consulta.</p> : !items.length ? <p>Nenhuma conferência registrada.</p> : <div className="space-y-3">{items.map(({ review, state }) => <details key={review.id} className="rounded-lg border border-white/15 p-3" open={state !== "superseded"}>
      <summary><span className="break-words">{current.evidences?.find((item) => item.documentId === review.documentId)?.fileName ?? review.documentId}</span> · {stateLabels[state]} · {outcomeLabels[review.outcome]}</summary>
      <p className="break-all">Revisor: {review.reviewedBy} · {new Date(review.reviewedAt).toLocaleString("pt-BR")}</p>
      <p className="break-words">Localização no documento: {review.locator}</p><p className="break-words">Observações: {review.notes}</p>
      <dl className="space-y-3">{review.checks.map((check) => <div key={check.field}><dt>{fields[check.field]}: {checkLabels[check.status]}</dt><dd className="break-all">Referência: {displayValue(check.expected) ?? "Não informada"} · Observado: {displayValue(check.observed) ?? "Não identificado"}</dd></div>)}</dl>
      <p>Leitura declarada pelo revisor. Sem autorização operacional ou encerramento de custos.</p>
    </details>)}</div>}
    {!allowed && verifiedRevision !== null && <p>Registrar conferência exige liberação específica de revisão no workspace.</p>}
    {allowed && current.evidences?.length ? <form onSubmit={submit} className="space-y-3"><fieldset disabled={!canReview} className="space-y-3">
      <legend className="text-lg">Registrar leitura do documento</legend>
      <label className="block">Documento conferido<select className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" value={documentId} onChange={(event) => { setDocumentId(event.target.value); setRead(false); setObservations({ movement: "not_identified" }); setLocator(""); setNotes(""); }}>{current.evidences.map((item) => <option key={item.documentId} value={item.documentId}>{item.fileName}</option>)}</select></label>
      {(["containerNumber", "port", "depot", "returnDate"] as const).map((key) => <label className="block" key={key}>{fields[key]} {key === "returnDate" ? "observada" : "observado"} no documento<input className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" maxLength={500} type={key === "returnDate" ? "date" : "text"} value={observations[key] ?? ""} onChange={(event) => setObservations((previous) => { const { [key]: old, ...other } = previous; return event.target.value.trim() ? { ...other, [key]: event.target.value } : other; })} /></label>)}
      <label className="block">Movimento observado<select className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" value={observations.movement} onChange={(event) => setObservations((previous) => ({ ...previous, movement: event.target.value as Observations["movement"] }))}><option value="not_identified">Não identificado</option><option value="empty_return">Devolução de contêiner vazio</option><option value="other">Outro movimento</option></select></label>
      <label className="block">Localização dos dados no documento<input className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" required maxLength={500} value={locator} onChange={(event) => setLocator(event.target.value)} placeholder="Página, campo ou trecho consultado" /></label>
      <label className="block">Observações da conferência<textarea className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" required maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      <label className="flex items-start gap-3"><input className="mt-1" type="checkbox" checked={read} required onChange={(event) => setRead(event.target.checked)} />Li o documento e registrei os dados observados.</label>
      <button className="rounded-lg bg-accent/20 px-4 py-3 disabled:opacity-50" type="submit" disabled={!canReview || !read || !documentId}>{busy ? "Registrando…" : "Registrar conferência"}</button>
    </fieldset></form> : null}
    {message && <p role="status">{message}</p>}
  </section>;
}
