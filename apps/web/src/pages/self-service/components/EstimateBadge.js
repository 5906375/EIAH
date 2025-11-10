import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function EstimateBadge({ status, cents, }) {
    let label = "Informe os dados para estimar";
    if (status === "loading")
        label = "Estimando...";
    if (status === "error")
        label = "Falha ao estimar";
    if (status === "ready" && typeof cents === "number") {
        label = `Custo estimado: R$ ${(cents / 100).toFixed(2)}`;
    }
    return (_jsxs("span", { className: "inline-flex items-center gap-2 rounded-full border border-white/10 bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent whitespace-nowrap sm:text-sm", children: [_jsx("span", { className: "h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_rgba(56,189,248,0.8)]" }), label] }));
}
