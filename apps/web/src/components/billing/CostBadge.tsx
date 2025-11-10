import { useEffect, useState } from "react";
import { apiEstimateCost } from "@/lib/api";

export default function CostBadge({
  agent,
  inputBytes,
  tools,
  workspaceId,
}: {
  agent?: string;
  inputBytes: number;
  tools?: string[];
  workspaceId: string;
}) {
  const [cents, setCents] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  useEffect(() => {
    if (!agent || !inputBytes || !workspaceId) {
      setCents(null);
      setStatus("idle");
      return;
    }

    setStatus("loading");
    apiEstimateCost({
      agent,
      inputBytes,
      tools: tools ?? [],
      workspaceId,
    })
      .then((data) => {
        const estimate = data?.data?.estimateCents;
        if (typeof estimate === "number") {
          setCents(estimate);
          setStatus("done");
        } else {
          setCents(null);
          setStatus("error");
        }
      })
      .catch((err) => {
        console.error("Failed to estimate cost", err);
        setCents(null);
        setStatus("error");
      });
  }, [agent, inputBytes, tools, workspaceId]);

  let label = "Estimando...";
  if (status === "idle") label = "Selecione um agente para estimar";
  if (status === "error") label = "Falha ao estimar";
  if (status === "done" && cents !== null) {
    label = `Custo estimado: R$ ${(cents / 100).toFixed(2)}`;
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent whitespace-nowrap sm:text-sm">
      <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_rgba(56,189,248,0.8)]" />
      {label}
    </span>
  );
}
