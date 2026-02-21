import React from "react";
import { createPortal } from "react-dom";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import AgentsPage from "./pages/app/agents";
import BillingPage from "./pages/app/billing";
import RunsPage from "./pages/app/runs";
import GovernancePage from "./pages/app/governance";
import SelfServiceIndexPage from "./pages/self-service";
import SelfServiceRouter from "./pages/self-service/router";
import SignupPage from "./pages/signup";
import ProfilePage from "./pages/profile";
import eiahLogo from "./assets/Eiah_logo.png";
import { clearSession, syncSessionWithProfile } from "./state/sessionStore";
import { AuthGate } from "./components/auth/AuthGate";
import { apiAuthLogout, apiDeleteProfile } from "./lib/api";

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

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [profileName, setProfileName] = React.useState("");
  const [profileMenuOpen, setProfileMenuOpen] = React.useState(false);
  const [profileMenuPosition, setProfileMenuPosition] = React.useState<{
    top: number;
    right: number;
    width: number;
  } | null>(null);
  const profileMenuRef = React.useRef<HTMLDivElement | null>(null);
  const profileButtonRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    void syncSessionWithProfile();
    try {
      const saved = window.localStorage.getItem("eiah_profile_active_name");
      if (saved && saved.trim()) {
        setProfileName(saved.trim());
        return;
      }
      const legacy = window.localStorage.getItem("eiah_profile");
      if (!legacy) {
        setProfileName("");
        return;
      }
      const parsed = JSON.parse(legacy) as { fullName?: string };
      const name = parsed.fullName?.trim() ?? "";
      setProfileName(name);
    } catch {
      setProfileName("");
    }
  }, [location.pathname]);

  React.useEffect(() => {
    if (!profileMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || !profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(target)) {
        setProfileMenuOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleEsc);
    const handleScroll = () => setProfileMenuOpen(false);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleEsc);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [profileMenuOpen]);

  const handleProfileEdit = () => {
    setProfileMenuOpen(false);
    navigate("/profile");
  };

  const handleProfileDelete = async () => {
    const activeId =
      typeof window !== "undefined" ? window.localStorage.getItem("eiah_profile_active_id") : null;
    if (!activeId) {
      setProfileMenuOpen(false);
      navigate("/profile");
      return;
    }
    const confirmed = typeof window !== "undefined" ? window.confirm("Excluir o perfil ativo?") : false;
    if (!confirmed) return;
    try {
      await apiDeleteProfile(activeId);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("eiah_profile_active_id");
        window.localStorage.setItem("eiah_profile_active_name", "");
        window.localStorage.setItem("eiah_profile_active_role", "");
      }
      setProfileName("");
      setProfileMenuOpen(false);
      navigate("/profile");
    } catch {
      setProfileMenuOpen(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiAuthLogout();
    } catch {
      // ignore logout errors
    } finally {
      clearSession();
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("eiah_profile_active_id");
        window.localStorage.setItem("eiah_profile_active_name", "");
        window.localStorage.setItem("eiah_profile_active_role", "");
      }
      setProfileName("");
      setProfileMenuOpen(false);
      navigate("/login");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-hero-grid" />
      <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-60 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-50 border-b border-white/10 bg-gradient-to-r from-surface-strong/80 via-surface/70 to-surface-strong/80 backdrop-blur-2xl pointer-events-auto">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 pointer-events-auto">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-white/10 shadow-[0_6px_18px_rgba(15,23,42,0.45)]">
                <img src={eiahLogo} alt="EIAH logo" className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">EIAH</p>
                <p className="text-sm font-medium text-muted-foreground">Agent Operations Console</p>
              </div>
            </div>
            <nav className="relative z-30 max-w-[80vw] rounded-full border border-white/10 bg-white/5 pointer-events-auto sm:max-w-none">
              <div
                className="flex items-center gap-1 overflow-x-auto overflow-y-visible px-2 py-1 no-scrollbar pointer-events-auto"
              >
                <NavigationLink to="/app/runs" label="Runs" />
                <NavigationLink to="/app/agents" label="Agentes" />
                <NavigationLink to="/app/billing" label="Billing" />
                <NavigationLink to="/app/governance" label="Governança" />
                <NavigationLink to="/self-service" label="Self-service" />
                <div className="relative" ref={profileMenuRef}>
                  <button
                    type="button"
                    ref={profileButtonRef}
                    onClick={() => {
                      const button = profileButtonRef.current;
                      if (!button) {
                        setProfileMenuOpen((prev) => !prev);
                        return;
                      }
                      const rect = button.getBoundingClientRect();
                      const next = {
                        top: rect.bottom + 8,
                        right: Math.max(12, window.innerWidth - rect.right),
                        width: Math.max(176, rect.width),
                      };
                      setProfileMenuPosition(next);
                      setProfileMenuOpen((prev) => !prev);
                    }}
                    className={`relative z-30 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition pointer-events-auto ${
                      location.pathname === "/profile" || location.pathname.startsWith("/profile/")
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    aria-haspopup="menu"
                    aria-expanded={profileMenuOpen}
                  >
                    <span className="relative z-10">
                      {profileName ? `Perfil — ${profileName}` : "Perfil"}
                    </span>
                    <span className="text-xs text-muted-foreground">▾</span>
                    {(location.pathname === "/profile" || location.pathname.startsWith("/profile/")) && (
                      <span className="absolute inset-0 -z-0 rounded-full bg-accent/10 blur-sm" />
                    )}
                  </button>
                </div>
              </div>
            </nav>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6">
          {children}
        </main>
      </div>
      {profileMenuOpen && profileMenuPosition
        ? createPortal(
            <div
              role="menu"
              className="fixed z-[999] rounded-2xl border border-white/10 bg-surface/95 p-2 text-sm text-foreground shadow-[0_18px_40px_rgba(15,23,42,0.35)] backdrop-blur"
              style={{
                top: profileMenuPosition.top,
                right: profileMenuPosition.right,
                width: profileMenuPosition.width,
              }}
              ref={profileMenuRef}
            >
              <button
                role="menuitem"
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-foreground hover:bg-white/5"
                onClick={handleProfileEdit}
              >
                Editar
              </button>
              <button
                role="menuitem"
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-rose-200 hover:bg-white/5"
                onClick={handleProfileDelete}
              >
                Excluir
              </button>
              <div className="my-1 h-px bg-white/10" />
              <button
                role="menuitem"
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-muted-foreground hover:bg-white/5"
                onClick={handleLogout}
              >
                Sair
              </button>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/runs" replace />} />
      <Route
        path="/login"
        element={
          <AuthGate>
            <Navigate to="/app/runs" replace />
          </AuthGate>
        }
      />
      <Route
        path="/app/runs"
        element={
          <AuthGate>
            <Layout>
              <RunsPage />
            </Layout>
          </AuthGate>
        }
      />
      <Route
        path="/app/governance"
        element={
          <AuthGate>
            <Layout>
              <GovernancePage />
            </Layout>
          </AuthGate>
        }
      />
      <Route
        path="/app/agents"
        element={
          <AuthGate>
            <Layout>
              <AgentsPage />
            </Layout>
          </AuthGate>
        }
      />
      <Route
        path="/app/billing"
        element={
          <AuthGate>
            <Layout>
              <BillingPage />
            </Layout>
          </AuthGate>
        }
      />
      <Route
        path="/self-service"
        element={
          <AuthGate>
            <Layout>
              <SelfServiceIndexPage />
            </Layout>
          </AuthGate>
        }
      />
      <Route
        path="/app/self-service"
        element={
          <AuthGate>
            <Layout>
              <SelfServiceIndexPage />
            </Layout>
          </AuthGate>
        }
      />
      <Route
        path="/self-service/:slug"
        element={
          <AuthGate>
            <Layout>
              <SelfServiceRouter />
            </Layout>
          </AuthGate>
        }
      />
      <Route
        path="/signup"
        element={
          <Layout>
            <SignupPage />
          </Layout>
        }
      />
      <Route
        path="/profile"
        element={
          <AuthGate>
            <Layout>
              <ProfilePage />
            </Layout>
          </AuthGate>
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
