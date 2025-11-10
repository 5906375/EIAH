import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import AgentFormShell from "./components/AgentFormShell";
import SelfServiceNav from "./components/SelfServiceNav";
export default function GenericAgentFormPage({ config }) {
    const initialValues = useMemo(() => {
        const entries = config.fields.map((field) => [field.key, ""]);
        return Object.fromEntries(entries);
    }, [config.fields]);
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(SelfServiceNav, { currentSlug: config.slug }), _jsx(AgentFormShell, { agentId: config.agentId, title: config.title, description: config.description, initialValues: initialValues, buildRequest: (vals) => config.buildPrompt(vals), children: ({ values: formValues, setValue }) => (_jsx("div", { className: "space-y-4", children: config.fields.map((field) => {
                        const type = field.type ?? "textarea";
                        const value = formValues[field.key] ?? "";
                        if (type === "text") {
                            return (_jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: [field.label, _jsx("input", { type: "text", value: value, onChange: (e) => setValue(field.key, e.target.value), placeholder: field.placeholder, className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none" }), field.helper && _jsx("span", { className: "text-xs text-muted-foreground", children: field.helper })] }, field.key));
                        }
                        return (_jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: [field.label, _jsx("textarea", { value: value, onChange: (e) => setValue(field.key, e.target.value), placeholder: field.placeholder, rows: field.rows ?? 3, className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none" }), field.helper && _jsx("span", { className: "text-xs text-muted-foreground", children: field.helper })] }, field.key));
                    }) })) })] }));
}
