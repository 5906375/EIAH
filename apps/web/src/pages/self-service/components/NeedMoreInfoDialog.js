import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
function normalizeInitialValue(key, request, currentValues) {
    if (!request)
        return "";
    const fromCurrent = currentValues[key];
    if (typeof fromCurrent === "string" && fromCurrent.length > 0) {
        return fromCurrent;
    }
    const field = request.fields.find((item) => item.key === key);
    if (!field)
        return "";
    const placeholder = field.placeholder ?? "";
    if (typeof placeholder === "string" && placeholder.startsWith("ex:")) {
        return "";
    }
    return "";
}
export default function NeedMoreInfoDialog({ open, request, currentValues, isSubmitting, onCancel, onSubmit, }) {
    const [localValues, setLocalValues] = useState({});
    const [errors, setErrors] = useState({});
    useEffect(() => {
        if (!open || !request) {
            setLocalValues({});
            setErrors({});
            return;
        }
        const initialEntries = request.fields.map((field) => {
            const initial = normalizeInitialValue(field.key, request, currentValues);
            return [field.key, initial];
        });
        setLocalValues(Object.fromEntries(initialEntries));
        setErrors({});
    }, [open, request, currentValues]);
    const hasFields = request?.fields?.length > 0;
    const dialogTitle = request?.title ?? "Informações adicionais necessárias";
    const dialogMessage = request?.message ?? "Preencha os dados abaixo para que o agente prossiga.";
    const actionDisabled = useMemo(() => {
        if (!request || isSubmitting)
            return true;
        if (!hasFields)
            return false;
        return request.fields.some((field) => {
            const required = field.required ?? true;
            if (!required)
                return false;
            const value = localValues[field.key];
            return !value || value.trim().length === 0;
        });
    }, [request, localValues, hasFields, isSubmitting]);
    const handleChange = (key, value) => {
        setLocalValues((prev) => ({ ...prev, [key]: value }));
        if (errors[key]) {
            setErrors((prev) => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
        }
    };
    const handleSubmit = () => {
        if (!request)
            return;
        const nextErrors = {};
        request.fields.forEach((field) => {
            const required = field.required ?? true;
            if (!required)
                return;
            const value = localValues[field.key];
            if (!value || value.trim().length === 0) {
                nextErrors[field.key] = "Campo obrigatório.";
            }
        });
        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            return;
        }
        onSubmit(localValues);
    };
    if (!open || !request)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm", children: _jsxs("div", { className: "w-full max-w-2xl rounded-3xl border border-white/10 bg-surface/95 p-6 shadow-2xl shadow-black/50", children: [_jsxs("header", { className: "space-y-2", children: [_jsx("p", { className: "text-xs uppercase tracking-[0.3em] text-accent/80", children: "Etapa complementar" }), _jsx("h2", { className: "text-xl font-semibold text-foreground", children: dialogTitle }), _jsx("p", { className: "text-sm text-muted-foreground", children: dialogMessage })] }), hasFields ? (_jsx("div", { className: "mt-5 space-y-4", children: request.fields.map((field) => {
                        const value = localValues[field.key] ?? "";
                        const fieldError = errors[field.key];
                        const helperText = fieldError ?? field.helper;
                        if (field.type === "select" && field.options && field.options.length > 0) {
                            return (_jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: [field.label, _jsxs("select", { value: value, onChange: (event) => handleChange(field.key, event.target.value), className: "rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none", children: [_jsx("option", { value: "", children: field.placeholder ?? "Selecione uma opção" }), field.options.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value)))] }), helperText ? (_jsx("span", { className: `text-xs ${fieldError ? "text-rose-300" : "text-muted-foreground"}`, children: helperText })) : null] }, field.key));
                        }
                        if (field.type === "textarea") {
                            return (_jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: [field.label, _jsx("textarea", { value: value, onChange: (event) => handleChange(field.key, event.target.value), placeholder: field.placeholder, rows: field.rows ?? 4, className: "rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none" }), helperText ? (_jsx("span", { className: `text-xs ${fieldError ? "text-rose-300" : "text-muted-foreground"}`, children: helperText })) : null] }, field.key));
                        }
                        return (_jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: [field.label, _jsx("input", { type: "text", value: value, onChange: (event) => handleChange(field.key, event.target.value), placeholder: field.placeholder, className: "rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none" }), helperText ? (_jsx("span", { className: `text-xs ${fieldError ? "text-rose-300" : "text-muted-foreground"}`, children: helperText })) : null] }, field.key));
                    }) })) : (_jsx("div", { className: "mt-5 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-muted-foreground", children: "Nenhum campo adicional foi solicitado. Confirme para reenviar ao agente." })), _jsxs("footer", { className: "mt-6 flex flex-wrap items-center justify-end gap-3", children: [_jsx("button", { type: "button", onClick: onCancel, className: "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-foreground transition hover:border-accent/40 hover:text-accent", disabled: isSubmitting, children: "Cancelar" }), _jsx("button", { type: "button", onClick: handleSubmit, className: "rounded-full border border-accent/70 bg-accent/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-60", disabled: actionDisabled, children: isSubmitting ? "Reenviando..." : "Reenviar ao agente" })] })] }) }));
}
