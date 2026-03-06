import React from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import AgentsPage from "./pages/app/agents";
import BillingPage from "./pages/app/billing";
import RunsPage from "./pages/app/runs";
import SelfServiceIndexPage from "./pages/self-service";
import SelfServiceRouter from "./pages/self-service/router";
import SignupPage from "./pages/signup";
import ProfilePage from "./pages/profile";
import AccessPage from "./pages/access";
import eiahLogo from "./assets/Eiah_logo.png";
import { useSession } from "./state/sessionStore";

function NavigationLink({ to, label }: { to: string; label: string }) {
  const location = useLocation();
  const active = location.pathname === to || location.pathname.startsWith(`${to}/`);

  return (
    <Link
      to={to}
      className={`relative px-4 py-2 text-sm font-medium transition ${
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <span className="relative z-10">{label}</span>
      {active && (
        <span className="absolute inset-0 -z-0 rounded-full bg-accent/10 blur-sm" />
      )}
    </Link>
  );
}

function Layout({
  children,
  showNavigation = true,
}: {
  children: React.ReactNode;
  showNavigation?: boolean;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-hero-grid" />
      <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-60 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-gradient-to-r from-surface-strong/80 via-surface/70 to-surface-strong/80 backdrop-blur-2xl">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-white/10 shadow-[0_6px_18px_rgba(15,23,42,0.45)]">
                <img src={eiahLogo} alt="EIAH logo" className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">EIAH</p>
                <p className="text-sm font-medium text-muted-foreground">Agent Operations Console</p>
              </div>
            </div>
            {showNavigation ? (
              <nav className="flex max-w-[80vw] items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/5 px-2 py-1 no-scrollbar sm:max-w-none">
                <NavigationLink to="/app/runs" label="Runs" />
                <NavigationLink to="/app/agents" label="Agentes" />
                <NavigationLink to="/app/billing" label="Billing" />
                <NavigationLink to="/self-service" label="Self-service" />
                <NavigationLink to="/profile" label="Perfil" />
              </nav>
            ) : null}
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const location = useLocation();
  if (!session.token) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/access?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/runs" replace />} />
      <Route
        path="/app/runs"
        element={
          <Layout>
            <RequireAuth>
              <RunsPage />
            </RequireAuth>
          </Layout>
        }
      />
      <Route
        path="/app/agents"
        element={
          <Layout>
            <RequireAuth>
              <AgentsPage />
            </RequireAuth>
          </Layout>
        }
      />
      <Route
        path="/app/billing"
        element={
          <Layout>
            <RequireAuth>
              <BillingPage />
            </RequireAuth>
          </Layout>
        }
      />
      <Route
        path="/self-service"
        element={
          <Layout>
            <RequireAuth>
              <SelfServiceIndexPage />
            </RequireAuth>
          </Layout>
        }
      />
      <Route
        path="/app/self-service"
        element={
          <Layout>
            <RequireAuth>
              <SelfServiceIndexPage />
            </RequireAuth>
          </Layout>
        }
      />
      <Route
        path="/self-service/:slug"
        element={
          <Layout>
            <RequireAuth>
              <SelfServiceRouter />
            </RequireAuth>
          </Layout>
        }
      />
      <Route
        path="/signup"
        element={
          <Layout showNavigation={false}>
            <SignupPage />
          </Layout>
        }
      />
      <Route
        path="/access"
        element={
          <Layout showNavigation={false}>
            <AccessPage />
          </Layout>
        }
      />
      <Route
        path="/profile"
        element={
          <Layout>
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          </Layout>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
