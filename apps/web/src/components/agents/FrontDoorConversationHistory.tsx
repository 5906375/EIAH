import React, { useEffect, useRef, useState } from "react";
import { apiListImobChatConversations, apiRenameImobChatConversation, apiDeleteImobChatConversation, type ImobChatConversation } from "@/lib/api";

type Props = {
  currentId: string | null;
  onOpen: (id: string) => Promise<unknown>;
  onDeletedCurrent: () => void;
};

/** Owner-scoped history. Server authorization is required for every read and mutation. */
export default function FrontDoorConversationHistory({ currentId, onOpen, onDeletedCurrent }: Props) {
  const [items, setItems] = useState<ImobChatConversation[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ImobChatConversation | null>(null);
  const [title, setTitle] = useState("");
  const [deleting, setDeleting] = useState<ImobChatConversation | null>(null);
  const [capabilities, setCapabilities] = useState({ rename: false, delete: false });
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const actionGeneration = useRef(0);
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;
  useEffect(() => () => { generation.current++; actionGeneration.current++; }, []);
  useEffect(() => {
    const epoch = ++generation.current;
    setLoading(true); setError(null);
    const timer = setTimeout(() => {
      apiListImobChatConversations({ limit: 100, q: query }).then((result) => {
        if (generation.current === epoch) {
          const normalized = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
          const search = normalized(query.trim());
          setItems(result.items.filter((item) => !search || normalized(`${item.title} ${item.lastMessagePreview ?? ""}`).includes(search)));
          setCapabilities({ rename: result.capabilities?.rename === true, delete: result.capabilities?.delete === true });
        }
      }).catch(() => {
        if (generation.current === epoch) { setItems([]); setCapabilities({ rename: false, delete: false }); setError("Não foi possível carregar suas conversas."); }
      }).finally(() => { if (generation.current === epoch) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); generation.current++; };
  }, [query, currentId, revision]);
  async function act(task: () => Promise<unknown>, success: () => void) {
    if (busy) return;
    const epoch = actionGeneration.current;
    setBusy(true); setError(null);
    try { await task(); if (actionGeneration.current === epoch) success(); }
    catch { if (actionGeneration.current === epoch) setError("Não foi possível concluir a ação. Tente novamente."); }
    finally { if (actionGeneration.current === epoch) setBusy(false); }
  }
  return <section aria-label="Conversas salvas" className="front-door-conversation-history space-y-2">
    <div className="flex items-center justify-between"><h4 className="px-2 text-xs font-semibold text-muted-foreground">Conversas IMOB</h4>
      <button type="button" onClick={() => setRevision((value) => value + 1)} disabled={busy}>Atualizar</button></div>
    <label className="sr-only" htmlFor="front-door-history-search">Buscar conversas</label>
    <input id="front-door-history-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conversas" disabled={busy} className="min-h-[44px] w-full min-w-0 rounded-lg border border-white/10 bg-black/30 px-2 text-sm" />
    {error ? <p role="alert" className="px-2 text-xs text-rose-200">{error}</p> : null}
    {loading ? <p role="status" className="px-2 text-xs text-muted-foreground">Carregando conversas…</p> : null}
    {!loading && !items.length && !error ? <p className="px-2 text-xs text-muted-foreground">Nenhuma conversa encontrada.</p> : null}
    {!loading && !error && (!capabilities.rename || !capabilities.delete) ? <p role="status" className="px-2 text-xs text-muted-foreground">Renomear e excluir estão indisponíveis no momento.</p> : null}
    <ul className="space-y-1">{items.map((item) => <li key={item.conversationId} className="min-w-0">
      <button type="button" data-sidebar-navigation="true" aria-current={item.conversationId === currentId ? "page" : undefined} disabled={busy}
        onClick={() => void act(() => onOpen(item.conversationId), () => undefined)} className="line-clamp-2" title={item.title}>{item.title}</button>
      <div className="flex gap-1">
        <button type="button" aria-label={`Renomear ${item.title}`} disabled={busy || !capabilities.rename} onClick={() => { setEditing(item); setTitle(item.title); setDeleting(null); }}>Renomear</button>
        <button type="button" aria-label={`Excluir ${item.title}`} disabled={busy || !capabilities.delete} onClick={() => { setDeleting(item); setEditing(null); }}>Excluir</button>
      </div>
    {editing && editing.conversationId === item.conversationId ? <form aria-label="Renomear conversa" onSubmit={(event) => { event.preventDefault(); if (!capabilities.rename) return; void act(() => apiRenameImobChatConversation(editing.conversationId, title.trim()), () => { setEditing(null); setRevision((value) => value + 1); }); }} className="space-y-2">
      <label className="block text-xs">Título da conversa<input aria-label="Título da conversa" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} autoFocus required disabled={busy} className="mt-1 min-h-[44px] w-full rounded-lg border border-white/10 bg-black/30 px-2 text-sm" /></label>
      <button type="submit" disabled={busy || !title.trim() || !capabilities.rename}>Salvar título</button>
      <button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button>
    </form> : null}

    {deleting && deleting.conversationId === item.conversationId ? <div role="group" aria-label="Confirmar exclusão da conversa" className="space-y-2 text-xs">
      <p>Excluir “{deleting.title}” do histórico? Ela não poderá ser reaberta. Registros de auditoria das operações serão preservados.</p>
      <button type="button" disabled={busy || !capabilities.delete} onClick={() => void act(() => apiDeleteImobChatConversation(deleting.conversationId), () => {
        if (deleting.conversationId === currentIdRef.current) onDeletedCurrent();
        setDeleting(null); setRevision((value) => value + 1);
      })}>Confirmar exclusão</button>
      <button type="button" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</button>
    </div> : null}
    </li>)}</ul>

  </section>;
}
