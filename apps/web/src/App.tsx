import React from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import AgentsPage from "./pages/app/agents";
import BillingPage from "./pages/app/billing";
import RunsPage from "./pages/app/runs";
import MarketplacePage from "./pages/app/marketplace";
import ImobMarketplacePage from "./pages/app/marketplace/imob";
import ImobChatPage from "./pages/app/imob/chat";
import ImobDashboardPage from "./pages/app/imob/dashboard";
import SelfServiceIndexPage from "./pages/self-service";
import SelfServiceRouter from "./pages/self-service/router";
import SignupPage from "./pages/signup";
import ProfilePage from "./pages/profile";
import AccessPage from "./pages/access";
import PreDuimpPage from "./pages/app/logistica/pre-duimp";
import { EiahBrandMark } from "./components/brand/EiahBrandMark";
import {
  getPreDuimpDirectAccessRedirect,
  isPreDuimpFrontendEnabled,
} from "./features/logistica/preDuimp";
import { updateSession, useSession, type ImobAccessGateState } from "./state/sessionStore";
import { ApiError, apiGetSessionContext, apiPostExperienceAudit } from "./lib/api";
import { isImobInstalled } from "./lib/entitlements";

function NavigationLink({ to, label }: { to: string; label: string }) {
  const location = useLocation();
  let active: boolean;
  if (to.includes("?")) {
    const [toPath, toSearch] = to.split("?", 2);
    active = location.pathname === toPath && location.search.includes(toSearch);
  } else {
    active = location.pathname === to || location.pathname.startsWith(`${to}/`);
  }

  return (
    <Link
      to={to}
      className={`relative px-4 py-2 text-sm font-medium transition ${
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
      aria-current={active ? "page" : undefined}
      aria-label={label}
    >
      <span className="relative z-10">{label}</span>
      {active && (
        <span className="absolute inset-0 -z-0 rounded-full bg-accent/10 blur-sm" />
      )}
    </Link>
  );
}

type ShellNavItem = {
  to: string;
  label: string;
  hiddenForRoles?: Array<
    "workspace_member" | "workspace_admin" | "tenant_admin" | "founder_global" | "service_operator"
  >;
  requiresImob?: boolean;
  requiresPreDuimp?: boolean;
};

const SHELL_NAV_ITEMS: ShellNavItem[] = [
  { to: "/app/runs", label: "Runs" },
  { to: "/app/chat", label: "Chat" },
  { to: "/app/billing", label: "Billing", hiddenForRoles: ["workspace_member"] },
  { to: "/app/marketplace", label: "Marketplace" },
  { to: "/app/imob/chat", label: "IMOB", requiresImob: true },
  { to: "/app/logistica/pre-duimp", label: "Pré-DUIMP", requiresPreDuimp: true },
  { to: "/self-service", label: "Self-service" },
  { to: "/profile", label: "Perfil" },
];

const PRE_DUIMP_FRONTEND_ENABLED = isPreDuimpFrontendEnabled();
const PRE_DUIMP_DIRECT_ACCESS_REDIRECT = getPreDuimpDirectAccessRedirect(
  PRE_DUIMP_FRONTEND_ENABLED,
);

export function getPreDuimpNavigationItems(enabled: boolean): ShellNavItem[] {
  return SHELL_NAV_ITEMS.filter((item) => !item.requiresPreDuimp || enabled);
}

function Layout({
  children,
  showNavigation = true,
  showWorkspaceLabel = true,
}: {
  children: React.ReactNode;
  showNavigation?: boolean;
  showWorkspaceLabel?: boolean;
}) {
  const session = useSession();
  const location = useLocation();
  const imobInstalled = isImobInstalled(session);
  const brandName = session.branding?.brandName?.trim() || "EIAH";
  const logoUrl = session.branding?.logoUrl?.trim() || "";
  const workspaceLabel = session.branding?.workspaceLabel?.trim() || session.workspaceId;
  const brandPrimary = session.branding?.primaryColor?.trim() || "#22d3ee";
  const isImobSurface =
    location.pathname.startsWith("/app/imob") ||
    location.pathname.startsWith("/app/marketplace/imob");
  const isImobChatRoute = location.pathname === "/app/imob/chat";
  const subtitle = isImobSurface ? "Imobiliaria Digital Command Center" : "Agent Operations Console";
  const roleProfile = session.experience?.roleProfile;
  const visibleNavItems = getPreDuimpNavigationItems(PRE_DUIMP_FRONTEND_ENABLED).filter((item) => {
    if (item.requiresImob && !imobInstalled) return false;
    if (item.hiddenForRoles?.includes(roleProfile ?? "workspace_member")) return false;
    return true;
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-background" style={{ ["--brand-primary" as string]: brandPrimary }}>
      {!isImobChatRoute ? <div className="pointer-events-none absolute inset-0 bg-hero-grid" /> : null}
      {!isImobChatRoute ? <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-accent/30 blur-3xl" /> : null}
      {!isImobChatRoute ? <div className="pointer-events-none absolute right-0 top-60 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" /> : null}
      {isImobChatRoute ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#07111f_0%,#0a1730_28%,#081120_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-hero-grid opacity-80" />
          <div className="pointer-events-none absolute -left-24 top-20 h-[32rem] w-[32rem] rounded-full bg-accent/20 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-32 h-[26rem] w-[26rem] rounded-full bg-accent-strong/15 blur-3xl" />
        </>
      ) : null}

      <div className={isImobChatRoute ? "relative z-10 flex h-screen min-h-screen flex-col overflow-hidden" : "relative z-10 flex min-h-screen flex-col"}>
        {!isImobChatRoute ? (
          <header className="sticky top-0 z-20 border-b border-white/10 bg-gradient-to-r from-surface-strong/80 via-surface/70 to-surface-strong/80 backdrop-blur-2xl">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-white/10 shadow-[0_6px_18px_rgba(15,23,42,0.45)]">
                  <EiahBrandMark
                    brandName={brandName}
                    logoUrl={logoUrl}
                    visibleName
                    className="h-full w-full"
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">{brandName}</p>
                  <p className="text-sm font-medium text-muted-foreground">{subtitle}</p>
                  {showWorkspaceLabel ? (
                    <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/80">{workspaceLabel}</p>
                  ) : null}
                </div>
              </div>
              {showNavigation ? (
                <nav className="flex max-w-[80vw] items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/5 px-2 py-1 no-scrollbar sm:max-w-none">
                  {visibleNavItems.map((item) => (
                    <NavigationLink
                      key={item.to}
                      to={item.to}
                      label={item.label}
                    />
                  ))}
                </nav>
              ) : null}
            </div>
          </header>
        ) : null}

        <main className={isImobChatRoute ? "flex w-full min-h-0 flex-1 flex-col overflow-hidden p-0" : "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6"}>
          {children}
        </main>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const location = useLocation();
  React.useEffect(() => {
    if (!session.token) return;
    const targetDomain =
      location.search.includes("domain=imob") || location.pathname.startsWith("/app/imob")
        ? "imob"
        : session.activeDomain === "imob"
          ? "imob"
          : undefined;
    void apiGetSessionContext(targetDomain)
      .then((ctx) => {
        if (!ctx.ok || !ctx.data) return;
        updateSession({
          tenantId: ctx.data.tenantId,
          workspaceId: ctx.data.workspaceId,
          userId: ctx.data.userId ?? undefined,
          activeDomain: ctx.data.activeDomain,
          availableDomains: ctx.data.availableDomains,
          entitlements: ctx.data.entitlements,
          installedProducts: (ctx.data.productInstallations ?? []).map((entry) => entry.product),
          verticals: ctx.data.verticals,
          roles: ctx.data.roles,
          experience: ctx.data.experience,
          branding: {
            brandName: ctx.data.branding.brandName,
            logoUrl: ctx.data.branding.logoUrl,
            primaryColor: ctx.data.branding.primaryColor,
            workspaceLabel: ctx.data.branding.workspaceLabel,
          },
          accessGate: null,
        });
      })
      .catch((error) => {
        if (
          targetDomain === "imob" &&
          error instanceof ApiError &&
          error.status === 403 &&
          error.body &&
          typeof error.body === "object"
        ) {
          const payload = error.body as {
            error?: ImobAccessGateState;
          };
          updateSession({
            accessGate: payload.error ?? {
              code: "ENTITLEMENT_MISSING",
              reasonCode: "IMOB_ENTITLEMENT_MISSING",
              message: "IMOB não está habilitado neste workspace.",
              product: "IMOB",
              capability: "CENTRAL_OPERACIONAL",
            },
          });
          return;
        }
      });
  }, [session.token, session.activeDomain, location.pathname, location.search]);

  if (!session.token) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/access?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

function RequireImobInstall({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const installed = isImobInstalled(session);

  if (!installed) {
    return <Navigate to="/app/marketplace/imob" replace />;
  }
  return <>{children}</>;
}

function DefaultLanding() {
  const session = useSession();
  const hasTrackedAlignmentRef = React.useRef(false);

  React.useEffect(() => {
    if (!session.token || hasTrackedAlignmentRef.current) return;
    const experience = session.experience;
    const primaryAction = experience?.recommendedActions?.[0];
    if (!experience || !primaryAction) return;

    hasTrackedAlignmentRef.current = true;
    void apiPostExperienceAudit(
      {
        auditType: "landing_action_alignment",
        surfaceId: experience.landingSurface,
        action: primaryAction.path === experience.landingPath ? "aligned" : "diverged",
        landingPath: experience.landingPath,
        primaryActionId: primaryAction.actionId,
        primaryActionPath: primaryAction.path,
        reasonCodes: [
          primaryAction.path === experience.landingPath
            ? "LANDING_MATCHES_PRIMARY_ACTION"
            : "LANDING_DIFFERS_FROM_PRIMARY_ACTION",
        ],
        metadata: {
          source: "default_landing",
        },
      },
      session.activeDomain
    ).catch(() => undefined);
  }, [session.token, session.activeDomain, session.experience]);

  if (!session.token) {
    return <Navigate to="/access" replace />;
  }

  return <Navigate to={session.experience?.landingPath || "/app/runs"} replace />;
}

function LegacyAgentsRedirect() {
  const location = useLocation();
  return <Navigate to={`/app/chat${location.search}${location.hash}`} replace />;
}

function RunsRoute() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isLegacyImobEntry = searchParams.get("domain") === "imob" && !searchParams.get("runId");

  if (isLegacyImobEntry) {
    const nextParams = new URLSearchParams();
    const section = (searchParams.get("section") || "").trim();
    nextParams.set("section", section || "processos");
    nextParams.set("cc", "open");
    for (const key of ["conversationId", "threadId", "caseId"]) {
      const value = (searchParams.get(key) || "").trim();
      if (value) nextParams.set(key, value);
    }
    const nextQuery = nextParams.toString();
    return <Navigate to={`/app/imob/dashboard${nextQuery ? `?${nextQuery}` : ""}#command-center`} replace />;
  }

  return (
    <Layout>
      <RequireAuth>
        <RunsPage />
      </RequireAuth>
    </Layout>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DefaultLanding />} />
      <Route path="/app/runs" element={<RunsRoute />} />
      <Route
        path="/app/chat"
        element={
          <Layout>
            <RequireAuth>
              <AgentsPage />
            </RequireAuth>
          </Layout>
        }
      />
      <Route path="/app/agents" element={<LegacyAgentsRedirect />} />
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
        path="/app/economy"
        element={<Navigate to="/app/billing?tab=economy" replace />}
      />
      <Route
        path="/app/marketplace"
        element={
          <Layout>
            <RequireAuth>
              <MarketplacePage />
            </RequireAuth>
          </Layout>
        }
      />
      <Route
        path="/app/marketplace/imob"
        element={
          <Layout>
            <RequireAuth>
              <ImobMarketplacePage />
            </RequireAuth>
          </Layout>
        }
      />
      <Route
        path="/app/imob/dashboard"
        element={
          <Layout>
            <RequireAuth>
              <RequireImobInstall>
                <ImobDashboardPage />
              </RequireImobInstall>
            </RequireAuth>
          </Layout>
        }
      />
      <Route
        path="/app/imob/chat"
        element={
          <Layout>
            <RequireAuth>
              <RequireImobInstall>
                <ImobChatPage />
              </RequireImobInstall>
            </RequireAuth>
          </Layout>
        }
      />
      <Route
        path="/app/logistica/pre-duimp"
        element={
          PRE_DUIMP_DIRECT_ACCESS_REDIRECT ? (
            <Navigate to={PRE_DUIMP_DIRECT_ACCESS_REDIRECT} replace />
          ) : (
            <Layout>
              <RequireAuth>
                <PreDuimpPage />
              </RequireAuth>
            </Layout>
          )
        }
      />
      <Route
        path="/app/imob/properties"
        element={
          <Navigate to="/app/imob/dashboard?section=imoveis&cc=open#command-center" replace />
        }
      />
      <Route
        path="/app/imob/processes"
        element={
          <Navigate to="/app/imob/dashboard?section=processos&cc=open#command-center" replace />
        }
      />
      <Route
        path="/app/imob/partners"
        element={
          <Navigate to="/app/imob/dashboard?section=parceiros&cc=open#command-center" replace />
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
          <Layout showNavigation={false} showWorkspaceLabel={false}>
            <SignupPage />
          </Layout>
        }
      />
      <Route
        path="/access"
        element={
          <Layout showNavigation={false} showWorkspaceLabel={false}>
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
  React.useEffect(() => {
    document.documentElement.classList.add("compact-ui");
    return () => {
      document.documentElement.classList.remove("compact-ui");
    };
  }, []);

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
