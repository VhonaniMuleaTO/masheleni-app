import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { BudgetItemsScreen, CategoriesScreen } from "./components/CrudScreens";
import { AnalyticsScreen } from "./components/AnalyticsScreen";
import { AuthScreen } from "./components/AuthScreen";
import { OverviewScreen } from "./components/OverviewScreen";
import { supabase } from "./lib/supabase";

const navItems = ["Overview", "Budget items", "Categories", "Insights"];
const logoUrl = `${import.meta.env.BASE_URL}1.png?v=2`;

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [activeNav, setActiveNav] = useState("Overview");
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(
    () => window.localStorage.getItem("masheleni-dark-mode") === "true",
  );
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setIsLoadingSession(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setIsLoadingSession(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    window.localStorage.setItem("masheleni-dark-mode", String(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      )
        setIsProfileMenuOpen(false);
    }
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  if (isLoadingSession)
    return (
      <main className="grid min-h-screen place-items-center bg-canvas text-sm text-muted">
        Loading your workspace...
      </main>
    );
  if (!session) return <AuthScreen />;

  const email = session.user.email ?? "Signed-in user";
  const metadata = session.user.user_metadata ?? {};
  const fullName =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : "";
  const firstName =
    typeof metadata.given_name === "string" && metadata.given_name.trim()
      ? metadata.given_name.trim()
      : fullName.split(" ")[0] || email.split("@")[0] || "there";
  const initials = (firstName.slice(0, 2) || email.slice(0, 2)).toUpperCase();
  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-ink/8 bg-surface px-5 py-6 lg:flex">
        <div className="flex justify-center">
          <img
            src={logoUrl}
            alt="Masheleni"
            className="h-32 w-32 object-contain"
          />
        </div>
        <p className="mt-12 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
          Workspace
        </p>
        <nav className="mt-3 space-y-1">
          {navItems.map((item, index) => (
            <button
              key={item}
              onClick={() => setActiveNav(item)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors ${activeNav === item ? "bg-amber/18 text-ink" : "text-muted hover:bg-ink/5 hover:text-ink"}`}
            >
              <span
                className={`grid size-7 place-items-center rounded-lg text-xs ${activeNav === item ? "bg-amber text-ink" : "bg-ink/6"}`}
              >
                {["⌂", "▦", "◌", "↗"][index]}
              </span>
              {item}
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-ink/8 pt-4">
          <div className="flex items-center gap-3 px-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-mint text-xs font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{email}</p>
              <p className="text-xs text-muted">Personal workspace</p>
            </div>
          </div>
        </div>
      </aside>
      <main className="pb-24 lg:ml-64 lg:pb-8">
        <header className="flex items-center justify-between border-b border-ink/8 bg-surface/75 px-5 py-4 backdrop-blur-md sm:px-8 lg:px-10">
          <div className="lg:hidden">
            <img
              src={logoUrl}
              alt="Masheleni"
              className="h-16 w-16 object-contain"
            />
          </div>
          <div className="hidden lg:block">
            <p className="text-xs font-semibold text-muted">
              Tuesday, 22 September 2026
            </p>
            <p className="font-display text-xl font-semibold tracking-[-0.04em]">
              Good morning, {firstName}
            </p>
          </div>
          <div ref={profileMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsProfileMenuOpen((open) => !open)}
              className="grid size-10 place-items-center rounded-full bg-mint text-xs font-bold text-white"
              title="Open account menu"
              aria-expanded={isProfileMenuOpen}
            >
              {initials}
            </button>
            {isProfileMenuOpen && (
              <div className="absolute right-0 top-12 z-30 w-56 rounded-2xl border border-ink/10 bg-surface p-2 shadow-xl">
                <p className="truncate px-3 py-2 text-xs text-muted">{email}</p>
                <button
                  type="button"
                  onClick={() => setIsProfileMenuOpen(false)}
                  className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold hover:bg-ink/5"
                >
                  Help
                </button>
                <p className="px-3 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                  Settings
                </p>
                <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-semibold">
                  <span>Dark mode</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isDarkMode}
                    aria-label="Toggle dark mode"
                    onClick={() => setIsDarkMode((enabled) => !enabled)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${isDarkMode ? "bg-mint" : "bg-ink/15"}`}
                  >
                    <span
                      className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${isDarkMode ? "left-6" : "left-1"}`}
                    />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-coral-dark hover:bg-coral/6"
                >
                  Sign out
                </button>
                <div className="mt-2 flex items-center gap-2 border-t border-ink/8 px-3 pt-3 text-xs font-semibold text-mint-dark">
                  <span className="size-2 rounded-full bg-mint" />
                  Healthy
                </div>
              </div>
            )}
          </div>
        </header>
        {activeNav === "Categories" ? (
          <CategoriesScreen />
        ) : activeNav === "Budget items" ? (
          <BudgetItemsScreen />
        ) : activeNav === "Insights" ? (
          <AnalyticsScreen />
        ) : (
          <OverviewScreen />
        )}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-ink/8 bg-surface/95 px-3 py-2 backdrop-blur-xl lg:hidden">
        {navItems.map((item, index) => (
          <button
            key={item}
            onClick={() => setActiveNav(item)}
            className={`flex min-w-16 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold ${activeNav === item ? "text-ink" : "text-muted"}`}
          >
            <span
              className={`grid size-7 place-items-center rounded-lg text-sm ${activeNav === item ? "bg-amber" : ""}`}
            >
              {["⌂", "▦", "◌", "↗"][index]}
            </span>
            {item}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
