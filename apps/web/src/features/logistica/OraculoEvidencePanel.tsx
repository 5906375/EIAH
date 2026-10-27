import React from "react";
import type { OraculoEvidenceCheckV1, OraculoEvidenceLinkV1, OraculoPreparationRecordV1 } from "@eiah/contracts";
import { ApiError, apiFetchUploadBlob, apiLinkOraculoEvidence, apiListOraculoEvidence, apiUploadDocuments, type UploadedDocumentInfo } from "@/lib/api";

export const ORACULO_EVIDENCE_LABELS: Record<OraculoEvidenceLinkV1["kind"], string> = {
  return_instruction: "Instrução de devolução", appointment: "Agendamento", inspection: "Vistoria ou foto", receipt: "Comprovante de recebimento / EIR", communication: "Comunicação", other: "Outro documento",
};
const integrityLabels: Record<OraculoEvidenceCheckV1["integrity"], string> = {
  available: "Arquivo disponível e íntegro", document_not_found: "Registro do arquivo não encontrado", file_unavailable: "Arquivo indisponível", integrity_mismatch: "Integridade divergente — download bloqueado",
};
export function OraculoEvidencePanel({ current, editable, blocked = false, onLinked, onBusyChange }: {
  current: OraculoPreparationRecordV1; editable: boolean; blocked?: boolean;
  onLinked: (value: OraculoPreparationRecordV1) => void; onBusyChange: (value: boolean) => void;
}) {
  const [checks, setChecks] = React.useState<OraculoEvidenceCheckV1[]>([]);
  const [verifiedRevision, setVerifiedRevision] = React.useState<number | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [uploaded, setUploaded] = React.useState<UploadedDocumentInfo | null>(null);
  const [kind, setKind] = React.useState<OraculoEvidenceLinkV1["kind"]>("return_instruction");
  const [source, setSource] = React.useState("");
  const [documentDate, setDocumentDate] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);
  const mounted = React.useRef(true);
  const fileInput = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  React.useEffect(() => {
    const controller = new AbortController(); let active = true;
    setVerifiedRevision(null); setChecks([]);
    void apiListOraculoEvidence(current.caseId, controller.signal).then((response) => {
      if (!active) return;
      if (response.data.revision !== current.revision) { setMessage("O caso mudou. Atualize a lista de preparações e reabra o caso antes de vincular outro documento."); return; }
      setChecks(response.data.items); setVerifiedRevision(response.data.revision);
    }).catch(() => { if (active) setMessage("Não foi possível verificar os documentos. Atualize a consulta antes de continuar."); });
    return () => { active = false; controller.abort(); };
  }, [current.caseId, current.revision, refresh]);
  const canLink = editable && !busy && !blocked && verifiedRevision === current.revision;
  async function link(event: React.FormEvent) {
    event.preventDefault(); if (!canLink || (!file && !uploaded)) return;
    setBusy(true); onBusyChange(true); setMessage("");
    try {
      let document = uploaded;
      if (!document) {
        const form = new FormData(); form.append("files", file!);
        const response = await apiUploadDocuments(form, "oraculo-sc");
        document = response.data[0];
        if (!document) throw new Error("Upload not confirmed");
        if (!mounted.current) return;
        setUploaded(document);
      }
      const response = await apiLinkOraculoEvidence(current.caseId, { documentId: document.id, expectedRevision: current.revision, kind, sourceDescription: source.trim(), ...(documentDate ? { documentDate } : {}) });
      if (!mounted.current) return;
      onLinked(response.data); setUploaded(null); setFile(null); setSource(""); setDocumentDate("");
      if (fileInput.current) fileInput.current.value = "";
      setMessage("Documento vinculado ao caso. Conteúdo ainda não revisado.");
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiError && error.status === 409) {
        setVerifiedRevision(null); setMessage("Vínculo não confirmado: há conflito de revisão ou divergência no arquivo. Atualize a lista de preparações e reabra o caso.");
      } else if (error instanceof ApiError && [401, 403].includes(error.status)) {
        setVerifiedRevision(null); setMessage("Acesso negado. Consulte sua liberação no Front Door.");
      } else if (error instanceof ApiError && [400, 413, 415].includes(error.status)) {
        setMessage("Revise a origem, a data e o formato/tamanho do arquivo. O envio ou vínculo foi recusado.");
      } else { setVerifiedRevision(null); setMessage("Não foi possível confirmar o vínculo. Atualize e confira os documentos do caso antes de repetir o envio."); }
    } finally { if (mounted.current) { setBusy(false); onBusyChange(false); } }
  }
  async function download(check: OraculoEvidenceCheckV1) {
    try {
      const response = await apiFetchUploadBlob(`/api/logistica/oraculo/preparations/${encodeURIComponent(current.caseId)}/evidence/${encodeURIComponent(check.evidence.documentId)}/file`);
      if (!mounted.current) return;
      const url = URL.createObjectURL(response.blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = check.evidence.fileName; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { if (mounted.current) { setMessage("Download bloqueado ou indisponível. Verifique novamente a integridade e o acesso."); setRefresh((value) => value + 1); } }
  }
  return <section aria-label="Documentos e evidências do caso" className="space-y-4 rounded-xl border border-white/15 p-4">
    <h3 className="text-xl font-semibold">Documentos e evidências</h3>
    <p>O arquivo é associado a este caso com histórico. Integridade do arquivo não comprova validade, aceite da devolução ou encerramento de cobranças.</p>
    <p>{current.contentReviews?.length ? "Há conferências registradas. Consulte sua situação abaixo; a validação operacional permanece pendente." : "Revisão do conteúdo e validação operacional: ainda não realizadas."}</p>
    <button type="button" className="inline-flex min-h-[36px] items-center text-accent underline" disabled={busy} onClick={() => { setMessage(""); setRefresh((value) => value + 1); }}>Verificar documentos novamente</button>
    {verifiedRevision === null ? <p role="status">Documentos ainda não verificados nesta consulta.</p> : checks.length === 0 ? <p>Nenhum documento vinculado.</p> : <ul className="space-y-4" aria-label="Documentos vinculados">{checks.map((check) => <li key={check.evidence.documentId} className="space-y-2 border-t border-white/15 pt-3">
      <p className="break-words font-semibold">{check.evidence.fileName}</p>
      <p>{ORACULO_EVIDENCE_LABELS[check.evidence.kind]} · {current.contentReviews?.some((review) => review.documentId === check.evidence.documentId) ? "Há conferência registrada — consultar abaixo" : "Conteúdo não revisado"}</p>
      <p>{integrityLabels[check.integrity]}</p>
      <p className="break-words">Origem declarada: {check.evidence.sourceDescription}</p>
      {check.evidence.documentDate && <p>Data declarada do documento: {check.evidence.documentDate}</p>}
      <details><summary>Registro do vínculo</summary><p className="break-all">Responsável: {check.evidence.linkedBy}</p><p>Vinculado em: {new Date(check.evidence.linkedAt).toLocaleString("pt-BR")}</p><p className="break-all">SHA-256: {check.evidence.sha256}</p></details>
      <button type="button" className="text-accent underline disabled:opacity-50" disabled={check.integrity !== "available"} onClick={() => void download(check)}>Baixar {check.evidence.fileName}</button>
    </li>)}</ul>}
    {editable && <form onSubmit={link} className="space-y-3">
      <fieldset disabled={!canLink} className="space-y-3">
        <legend className="text-lg">Vincular documento</legend>
        <label className="block">Tipo do documento<select className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" value={kind} onChange={(event) => setKind(event.target.value as OraculoEvidenceLinkV1["kind"])}>{Object.entries(ORACULO_EVIDENCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="block">Origem declarada<input className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" value={source} onChange={(event) => setSource(event.target.value)} required maxLength={500} placeholder="Quem forneceu e por qual canal" /></label>
        <label className="block">Data do documento (opcional)<input className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} /></label>
        <label className="block">Arquivo<input className="mt-1 block w-full min-w-0 text-base" type="file" ref={fileInput} disabled={!!uploaded} required={!uploaded} accept=".pdf,.png,.jpg,.jpeg,.txt,.doc,.docx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
        {uploaded && <p className="break-words">Arquivo enviado: {uploaded.name}. Vínculo pendente; repetir usa este mesmo upload.</p>}
        <button type="submit" className="rounded-lg bg-accent/20 px-4 py-3 disabled:opacity-50" disabled={!canLink || (!file && !uploaded)}>{busy ? "Vinculando…" : "Enviar e vincular documento"}</button>
      </fieldset>
    </form>}
    {message && <p role="status">{message}</p>}
  </section>;
}
