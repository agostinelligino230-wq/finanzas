import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { CircleDollarSign } from "lucide-react";
import { supabase } from "../lib/supabase";

type AuthValue = { user: User; signOut: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthGate");
  return value;
}

function applyTheme() {
  try {
    document.documentElement.dataset.theme = localStorage.getItem("finanzas-theme") === "dark" ? "dark" : "light";
  } catch {
    document.documentElement.dataset.theme = "light";
  }
}

function Screen({ children }: { children: ReactNode }) {
  useEffect(applyTheme, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f0eb] p-4 text-[#3f3b39] dark:bg-[#1d1b1a] dark:text-[#eee9e3]">
      <div className="w-full max-w-sm rounded-3xl border border-[#ded8d0] bg-[#f8f6f2] p-6 dark:border-[#3a3532] dark:bg-[#252220]">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#d8cceb] text-[#51465d]"><CircleDollarSign size={21} /></span>
          <div><p className="font-semibold">Finanzas</p><p className="text-sm text-[#8b837c] dark:text-[#b5aca5]">tu mes, más claro</p></div>
        </div>
        {children}
      </div>
    </div>
  );
}

function LoginForm() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setError("");
    setMessage("");
    if (!email.trim() || password.length < 6) {
      setError("Ingresá un email y una contraseña de al menos 6 caracteres.");
      return;
    }
    setBusy(true);
    if (mode === "login") {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) setError(authError.message.toLowerCase().includes("confirm") ? "Tenés que confirmar tu email antes de ingresar." : "Email o contraseña incorrectos.");
    } else {
      const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } });
      if (authError) setError(authError.message.toLowerCase().includes("registered") ? "Ese email ya tiene una cuenta. Ingresá con tu contraseña." : "No se pudo crear la cuenta. Probá de nuevo.");
      else if (!data.session) setMessage("Te mandamos un email para confirmar la cuenta. Abrí el link y después ingresá.");
    }
    setBusy(false);
  };

  const inputClass = "h-11 w-full rounded-xl border border-[#d8d1c8] bg-[#fffdfa] px-3 text-base dark:border-[#4a433e] dark:bg-[#302c29]";

  return (
    <Screen>
      <h1 className="text-2xl font-bold tracking-tight">{mode === "login" ? "Ingresá a tu cuenta" : "Creá tu cuenta"}</h1>
      <p className="mt-1 text-sm text-[#8b837c] dark:text-[#b5aca5]">Tus movimientos quedan guardados y separados por mes.</p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <label className="block"><span className="mb-1 block text-sm font-medium">Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium">Contraseña</span><input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} /></label>
        {error && <p role="alert" className="rounded-xl bg-[#f8e7ea] px-3 py-2 text-sm text-[#8a2c3d]">{error}</p>}
        {message && <p className="rounded-xl bg-[#dbe9df] px-3 py-2 text-sm text-[#2f5d3f]">{message}</p>}
        <button type="submit" disabled={busy} className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#6e607c] text-base font-semibold text-white hover:bg-[#5d506a] disabled:opacity-60">{busy ? "Un momento…" : mode === "login" ? "Ingresar" : "Crear cuenta"}</button>
      </form>
      <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setMessage(""); }} className="mt-4 w-full text-center text-sm font-medium text-[#6e607c] hover:text-[#51465d] dark:text-[#c9b7d8]">
        {mode === "login" ? "¿No tenés cuenta? Creá una" : "¿Ya tenés cuenta? Ingresá"}
      </button>
    </Screen>
  );
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) return <Screen><p className="text-base">Falta configurar la conexión con Supabase (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).</p></Screen>;
  if (loading) return <Screen><p className="text-base">Cargando…</p></Screen>;
  if (!session) return <LoginForm />;

  const signOut = async () => {
    await supabase?.auth.signOut();
  };

  return <AuthContext.Provider value={{ user: session.user, signOut }}>{children}</AuthContext.Provider>;
}
