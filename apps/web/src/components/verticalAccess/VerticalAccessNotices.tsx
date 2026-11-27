import React from "react";
import { apiListVerticalAccessNotices, apiMarkVerticalAccessNoticeRead, type VerticalAccessNotice } from "@/lib/api";

/**
 * ADR-011 §2.4: avisos da liberação de verticais pela EIAH, mostrados no app. Só o estado da
 * liberação (sem score nem billing); "Entendi" marca como lido só para quem clicou.
 * Se a leitura falhar, nada aparece e a página segue normalmente.
 */
export const VerticalAccessNotices: React.FC<{ className?: string }> = ({ className }) => {
  const [notices, setNotices] = React.useState<VerticalAccessNotice[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    apiListVerticalAccessNotices()
      .then((response) => {
        if (active) setNotices(response.data.notices);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const dismiss = async (noticeId: string) => {
    setBusy(noticeId);
    try {
      await apiMarkVerticalAccessNoticeRead(noticeId);
      setNotices((current) => current.filter((notice) => notice.id !== noticeId));
    } catch {
      // Mantém o aviso visível; a próxima tentativa marca de novo.
    } finally {
      setBusy(null);
    }
  };

  if (notices.length === 0) return null;
  return (
    <section className={`space-y-2 ${className ?? ""}`} aria-label="Avisos da EIAH">
      {notices.map((notice) => (
        <div
          key={notice.id}
          data-notice-kind={notice.kind}
          className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-foreground"
        >
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-accent">Aviso da EIAH</p>
            <p className="mt-1">{notice.message}</p>
            <p className="mt-1 text-xs text-muted-foreground">{new Date(notice.createdAt).toLocaleString("pt-BR")}</p>
          </div>
          <button
            type="button"
            disabled={busy === notice.id}
            onClick={() => void dismiss(notice.id)}
            className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs text-foreground transition hover:border-accent/40 disabled:opacity-60"
          >
            Entendi
          </button>
        </div>
      ))}
    </section>
  );
};

export default VerticalAccessNotices;
