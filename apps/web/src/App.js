import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import AgentsPage from "./pages/app/agents";
import BillingPage from "./pages/app/billing";
import RunsPage from "./pages/app/runs";
import SelfServiceIndexPage from "./pages/self-service";
import SelfServiceRouter from "./pages/self-service/router";
import eiahLogo from "./assets/Eiah_logo.png";
function NavigationLink({ to, label }) {
    const location = useLocation();
    const active = location.pathname === to || location.pathname.startsWith(`${to}/`);
    return (_jsxs(Link, { to: to, className: `relative px-4 py-2 text-sm font-medium transition ${active
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground"}`, children: [_jsx("span", { className: "relative z-10", children: label }), active && (_jsx("span", { className: "absolute inset-0 -z-0 rounded-full bg-accent/10 blur-sm" }))] }));
}
function Layout({ children }) {
    return (_jsxs("div", { className: "relative min-h-screen overflow-hidden bg-background", children: [_jsx("div", { className: "pointer-events-none absolute inset-0 bg-hero-grid" }), _jsx("div", { className: "pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-accent/30 blur-3xl" }), _jsx("div", { className: "pointer-events-none absolute right-0 top-60 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" }), _jsxs("div", { className: "relative z-10 flex min-h-screen flex-col", children: [_jsx("header", { className: "sticky top-0 z-20 border-b border-white/10 bg-gradient-to-r from-surface-strong/80 via-surface/70 to-surface-strong/80 backdrop-blur-2xl", children: _jsxs("div", { className: "mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-white/10 shadow-[0_6px_18px_rgba(15,23,42,0.45)]", children: _jsx("img", { src: eiahLogo, alt: "EIAH logo", className: "h-full w-full object-cover" }) }), _jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.35em] text-accent", children: "EIAH" }), _jsx("p", { className: "text-sm font-medium text-muted-foreground", children: "Agent Operations Console" })] })] }), _jsxs("nav", { className: "flex max-w-[80vw] items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/5 px-2 py-1 no-scrollbar sm:max-w-none", children: [_jsx(NavigationLink, { to: "/app/runs", label: "Runs" }), _jsx(NavigationLink, { to: "/app/agents", label: "Agentes" }), _jsx(NavigationLink, { to: "/app/billing", label: "Billing" }), _jsx(NavigationLink, { to: "/self-service", label: "Self-service" })] })] }) }), _jsx("main", { className: "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6", children: children })] })] }));
}
function AppRoutes() {
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/app/runs", replace: true }) }), _jsx(Route, { path: "/app/runs", element: _jsx(Layout, { children: _jsx(RunsPage, {}) }) }), _jsx(Route, { path: "/app/agents", element: _jsx(Layout, { children: _jsx(AgentsPage, {}) }) }), _jsx(Route, { path: "/app/billing", element: _jsx(Layout, { children: _jsx(BillingPage, {}) }) }), _jsx(Route, { path: "/self-service", element: _jsx(Layout, { children: _jsx(SelfServiceIndexPage, {}) }) }), _jsx(Route, { path: "/self-service/:slug", element: _jsx(Layout, { children: _jsx(SelfServiceRouter, {}) }) })] }));
}
export default function App() {
    return (_jsx(BrowserRouter, { children: _jsx(AppRoutes, {}) }));
}
