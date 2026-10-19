import React from "react";
import { OraculoDocumentReviewPanel } from "./OraculoDocumentReviewPanel";
import { OraculoEvidencePanel } from "./OraculoEvidencePanel";
import type { OraculoEmptyReturnPreparationV1, OraculoPreparationRecordV1, OraculoOperationReferenceV1 } from "@eiah/contracts";
import { ApiError, apiGetOraculoPreparation, apiListOraculoPreparations, apiSaveOraculoPreparation, apiListOraculoPreparationRevisions } from "@/lib/api";

type Context = OraculoEmptyReturnPreparationV1["context"];
const empty = (): Context => ({ port: { status: "not_informed" }, depot: { status: "not_informed" }, flow: { status: "not_informed" } });
const fields = [["port", "Porto"], ["depot", "Depósito"], ["flow", "Fluxo pretendido"]] as const;
const statuses = { not_informed: "Não informado", to_confirm: "A confirmar", informed: "Informado", not_applicable: "Não se aplica — requer revisão" } as const;

/** Mensagem para a abertura de um caso por referência explícita (`?case=`): o servidor decide; nada é selecionado sem sucesso. */
export function openCaseFailureMessage(error: unknown) {
  const status = error instanceof ApiError ? error.status : null;
  if (status === 404) return "O caso informado não foi encontrado neste workspace.";
  if (status === 401 || status === 403) return "Você não tem permissão para abrir o caso informado neste workspace.";
  if (status === 409) return "O caso informado falhou na verificação de integridade e foi bloqueado.";
  return "Não foi possível abrir o caso informado agora. Tente novamente.";
}

export function OraculoPreparationPanel({ readOnly, initialCaseId = null, onCaseChange }: { readOnly: boolean; initialCaseId?: string | null; onCaseChange?: (caseId: string | null) => void }) {
  const [items, setItems] = React.useState<OraculoPreparationRecordV1[]>([]);
  const [current, setCurrent] = React.useState<OraculoPreparationRecordV1 | null>(null);
  const [context, setContext] = React.useState<Context>(empty);
  const [operationReference, setOperationReference] = React.useState<OraculoOperationReferenceV1>({});
  const [writeAllowed, setWriteAllowed] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [evidenceBusy, setEvidenceBusy] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [history, setHistory] = React.useState<OraculoPreparationRecordV1[] | null>(null);
  const [reload, setReload] = React.useState(0);
  const alive = React.useRef(true);
  const appliedInitialCase = React.useRef<string | null>(null);
  const selection = React.useRef(0);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; selection.current++; }; }, []);
  React.useEffect(() => {
    const controller = new AbortController(); let active = true;
    setLoading(true); setWriteAllowed(false);
    void apiListOraculoPreparations(controller.signal).then((response) => {
      if (!active) return;
      setItems(response.data.items); setWriteAllowed(response.data.writeAllowed);
    }).catch(() => { if (active) { setItems([]); setMessage("Não foi possível consultar as preparações. Atualize para validar o acesso novamente."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [reload]);
  React.useEffect(() => { onCaseChange?.(current?.caseId ?? null); }, [current?.caseId]);
  React.useEffect(() => {
    if (loading || !initialCaseId || appliedInitialCase.current === initialCaseId) return;
    appliedInitialCase.current = initialCaseId;
    const known = items.find((item) => item.caseId === initialCaseId);
    if (known) { select(known); return; }
    const controller = new AbortController(); const selected = selection.current;
    void apiGetOraculoPreparation(initialCaseId, controller.signal).then((response) => {
      if (!alive.current || selected !== selection.current || response.data.caseId !== initialCaseId) return;
      select(response.data);
      setItems((previous) => [response.data, ...previous.filter((item) => item.caseId !== response.data.caseId)].slice(0, 100));
    }).catch((error: unknown) => { if (alive.current && !controller.signal.aborted) setMessage(openCaseFailureMessage(error)); });
    return () => controller.abort();
  }, [loading, initialCaseId]);
  const editable = !readOnly && writeAllowed && !loading && !saving && !evidenceBusy;
  const dirty = JSON.stringify(context) !== JSON.stringify(current?.context) || JSON.stringify(operationReference) !== JSON.stringify(current?.operationReference ?? {});
  function select(item: OraculoPreparationRecordV1 | null) {
    selection.current++; setCurrent(item); setContext(item?.context ?? empty()); setOperationReference(item?.operationReference ?? {}); setHistory(null); setMessage("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!editable) return;
    const selected = selection.current; setSaving(true); setMessage("");
    try {
      const response = await apiSaveOraculoPreparation(context, current ?? undefined, operationReference);
      if (!alive.current || selected !== selection.current) return;
      setCurrent(response.data); setContext(response.data.context); setOperationReference(response.data.operationReference ?? {}); setHistory(null);
      setItems((previous) => [response.data, ...previous.filter((item) => item.caseId !== response.data.caseId)].slice(0, 100));
      setMessage(`Preparação salva. Revisão ${response.data.revision}.`);
    } catch (error) {
      if (!alive.current || selected !== selection.current) return;
      if (error instanceof ApiError && error.status === 409) {
        setMessage("Conflito de revisão ou integridade: sua edição não foi gravada. Atualize a lista e reabra o registro antes de editar novamente.");
        setWriteAllowed(false);
      } else if (error instanceof ApiError && error.status === 400) {
        setMessage("Revise os campos informados e as justificativas: textos vazios ou apenas com espaços não são aceitos.");
      } else if (error instanceof ApiError && [401, 403].includes(error.status)) {
        setWriteAllowed(false); setMessage("Acesso à gravação negado. Consulte a liberação no Front Door.");
      } else { setWriteAllowed(false); setMessage("Não foi possível confirmar a gravação. Atualize a lista antes de tentar novamente."); }
    } finally { if (alive.current) setSaving(false); }
  }
  async function showHistory() {
    if (!current) return;
    const selected = selection.current;
    try {
      const response = await apiListOraculoPreparationRevisions(current.caseId);
      if (alive.current && selected === selection.current) setHistory(response.data.items);
    } catch { if (alive.current && selected === selection.current) setMessage("Não foi possível consultar o histórico."); }
  }
  return <div className="space-y-4">
    <p>Preparações salvas têm histórico de revisões. Salvar não autoriza executar a operação.</p>
    {loading ? <p role="status">Consultando preparações…</p> : <>
      <label className="block">Preparações salvas (até 100 mais recentes)<select className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" disabled={saving || evidenceBusy} value={current?.caseId ?? ""} onChange={(event) => select(items.find((item) => item.caseId === event.target.value) ?? null)}>
        <option value="">Nova preparação</option>{items.map((item) => <option key={item.caseId} value={item.caseId}>{item.caseId.slice(0, 8)} · revisão {item.revision} · {new Date(item.updatedAt).toLocaleString("pt-BR")}</option>)}
      </select></label>
      <button type="button" disabled={saving || evidenceBusy} className="text-accent underline" onClick={() => { select(null); setReload((value) => value + 1); }}>Atualizar lista e descartar edição local</button>
      {!editable && !saving && <p>Consulta disponível. Gravação exige permissão específica e acesso fora do modo somente leitura.</p>}
      <form onSubmit={save} className="space-y-4">
        {fields.map(([key, label]) => { const field = context[key]; return <fieldset key={key} className="space-y-2" disabled={!editable}>
          <legend className="text-lg">{label} (opcional)</legend>
          <label className="block">Situação de {label}<select className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" value={field.status} onChange={(event) => {
            const status = event.target.value as Context[typeof key]["status"];
            setContext((previous) => ({ ...previous, [key]: status === "not_informed" ? { status } : status === "not_applicable" ? { status, justification: "" } : { status, value: "" } }));
          }}>{Object.entries(statuses).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
          {field.status !== "not_informed" && <label className="block">{field.status === "not_applicable" ? `Justificativa — ${label}` : label}<input className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" maxLength={500} required={field.status !== "to_confirm"} value={field.status === "not_applicable" ? field.justification : field.value ?? ""} onChange={(event) => setContext((previous) => ({ ...previous, [key]: field.status === "not_applicable" ? { ...field, justification: event.target.value } : { ...field, value: event.target.value || undefined } }))} /></label>}
        </fieldset>; })}
        <fieldset className="space-y-3" disabled={!editable}>
          <legend className="text-lg">Referência declarada da operação (opcional)</legend>
          <p>Usada para comparar o documento. A correspondência ficará indeterminada se faltar a referência do contêiner.</p>
          <label className="block">Contêiner esperado<input className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" maxLength={500} value={operationReference.containerNumber ?? ""} onChange={(event) => setOperationReference((previous) => { const { containerNumber, ...other } = previous; return event.target.value.trim() ? { ...other, containerNumber: event.target.value } : other; })} /></label>
          <label className="block">Data esperada de devolução (opcional)<input className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" type="date" value={operationReference.returnDate ?? ""} onChange={(event) => setOperationReference((previous) => { const { returnDate, ...other } = previous; return event.target.value ? { ...other, returnDate: event.target.value } : other; })} /></label>
        </fieldset>
        {current && <p>Revisão {current.revision} · Contexto em preparação</p>}
        {!readOnly && <button type="submit" disabled={!editable} className="rounded-lg bg-accent/20 px-4 py-3 disabled:opacity-50">{saving ? "Salvando…" : "Salvar preparação"}</button>}
      </form>
      {current && <>
        {dirty && <p>Salve a edição do contexto antes de vincular documentos.</p>}
        <OraculoEvidencePanel key={current.caseId} current={current} blocked={evidenceBusy} editable={!readOnly && writeAllowed && !loading && !saving && !dirty} onBusyChange={setEvidenceBusy} onLinked={(value) => {
          setCurrent(value); setHistory(null); setItems((previous) => [value, ...previous.filter((item) => item.caseId !== value.caseId)].slice(0, 100));
        }} />
        <OraculoDocumentReviewPanel key={`review-${current.caseId}`} current={current} blocked={evidenceBusy} editable={!readOnly && writeAllowed && !loading && !saving && !dirty} onBusyChange={setEvidenceBusy} onReviewed={(value) => {
          selection.current++; setCurrent(value); setHistory(null); setItems((previous) => [value, ...previous.filter((item) => item.caseId !== value.caseId)].slice(0, 100));
        }} />
      </>}
      {!current && <p>Salve a preparação para vincular documentos a este caso.</p>}
      {current && <button type="button" className="text-accent underline" onClick={showHistory}>Consultar histórico</button>}
      {history && <ol className="space-y-3" aria-label="Histórico da preparação">{history.map((item) => <li key={item.revision} className="rounded-lg border border-white/15 p-3"><p>Revisão {item.revision} · {new Date(item.updatedAt).toLocaleString("pt-BR")}</p>{fields.map(([key, label]) => { const field = item.context[key]; return <p key={key} className="break-words">{label}: {statuses[field.status]}{field.status === "not_applicable" ? ` · ${field.justification}` : "value" in field && field.value ? ` · ${field.value}` : ""}</p>; })}<p>Documentos vinculados nesta revisão: {item.evidences?.length ?? 0}</p><p>Conferências documentais nesta revisão: {item.contentReviews?.length ?? 0}</p></li>)}</ol>}
    </>}
    {message && <p role="status">{message}</p>}
  </div>;
}
