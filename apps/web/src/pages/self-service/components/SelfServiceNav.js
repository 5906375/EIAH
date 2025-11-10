import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { Link } from "react-router-dom";
import { selfServiceConfigs } from "../config";
export default function SelfServiceNav({ currentSlug }) {
        return (_jsxs("nav", { className: "flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.3em] text-muted-foreground", children: [_jsx("span", { children: "Self-service" }), _jsx("span", { className: "text-accent", children: "/" }), selfServiceConfigs.map((item, index) => {
                const isCurrent = item.slug === currentSlug;
                const label = ((item.label === null || item.label === void 0 ? void 0 : item.label.trim()) || item.title || item.agentId).trim();
                const separator = index === selfServiceConfigs.length - 1 ? null : (_jsx("span", { className: "text-accent", children: "/" }, `${item.slug}-sep`));
                return (_jsxs(React.Fragment, { children: [isCurrent ? (_jsx("span", { className: "text-accent", children: label })) : (_jsx(Link, { to: `/self-service/${item.slug}`, className: "hover:text-foreground", children: label })), separator] }, item.slug));
            })] }));
}
