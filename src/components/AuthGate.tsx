import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { CircleDollarSign, Eye, EyeOff } from "lucide-react";
import { supabase } from "../lib/supabase";
import { clearCache } from "../lib/cache";

type AuthValue = { user: User; signOut: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth debe usarse dentro de AuthGate");
  return value;
}

function applyTheme() {
  try {
    const stored = localStorage.getItem("finanzas-theme");
    document.documentElement.dataset.theme = (stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  } catch {
    document.documentElement.dataset.theme = "light";
  }
}

// Traduce los errores de Supabase a mensajes claros, para saber qué falló.
function explain(error: { message?: string; status?: number } | null | undefined): string {
  const message = (error?.message ?? "").toLowerCase();
  if (message.includes("invalid login")) return "Email o contraseña incorrectos. Revisá que el email esté bien escrito y tocá el ojito para ver la contraseña que escribiste.";
  if (message.includes("not confirmed")) return "Tenés que confirmar tu email antes de ingresar.";
  if (message.includes("already registered") || message.includes("already been registered")) return "Ese email ya tiene una cuenta. Ingresá con tu contraseña o recuperala.";
  if (error?.status === 429 || message.includes("rate limit") || message.includes("security purposes")) return "Hubo demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.";
  if (message.includes("failed to fetch") || message.includes("network") || message.includes("load failed")) return "No hay conexión con el servidor. Revisá tu internet y probá de nuevo.";
  if (message.includes("should be different")) return "La contraseña nueva tiene que ser distinta de la anterior.";
  if (message.includes("password")) return "La contraseña tiene que tener al menos 6 caracteres.";
  if (message.includes("email")) return "Ese email no es válido. Revisá cómo está escrito.";
  return "No se pudo completar. Detalle: " + (error?.message || "error desconocido");
}

const cleanEmail = (value: string) => value.trim().toLowerCase();
const inputClass = "h-11 w-full rounded-xl border border-[#d8d1c8] bg-[#fffdfa] px-3 text-base dark:border-[#4a433e] dark:bg-[#302c29]";
const primaryButton = "inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#6e607c] text-base font-semibold text-white hover:bg-[#5d506a] disabled:opacity-60";
const linkButton = "text-sm font-medium text-[#6e607c] hover:text-[#51465d] dark:text-[#c9b7d8]";

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

function PasswordInput({ value, onChange, autoComplete }: { value: string; onChange: (value: string) => void; autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input type={visible ? "text" : "password"} autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass + " pr-12"} />
      <button type="button" onClick={() => setVisible(!visible)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[#8b837c]" aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    </div>
  );
}

function Feedback({ error, message }: { error: string; message: string }) {
  return (
    <>
      {error && <p role="alert" className="rounded-xl bg-[#f8e7ea] px-3 py-2 text-sm text-[#8a2c3d]">{error}</p>}
      {message && <p className="rounded-xl bg-[#dbe9df] px-3 py-2 text-sm text-[#2f5d3f]">{message}</p>}
    </>
  );
}

function LoginForm() {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const switchMode = (next: "login" | "register" | "forgot") => { setMode(next); setError(""); setMessage(""); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setError("");
    setMessage("");
    const address = cleanEmail(email);
    if (!address) { setError("Ingresá tu email."); return; }
    if (mode !== "forgot" && password.length < 6) { setError("La contraseña tiene que tener al menos 6 caracteres."); return; }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: address, password });
        if (authError) setError(explain(authError));
      } else if (mode === "register") {
        const { data, error: authError } = await supabase.auth.signUp({ email: address, password, options: { emailRedirectTo: window.location.origin } });
        if (authError) setError(explain(authError));
        else if (!data.session) setMessage("Te mandamos un email para confirmar la cuenta. Abrí el link y después ingresá.");
      } else {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: window.location.origin });
        if (authError) setError(explain(authError));
        else setMessage("Listo. Si ese email tiene una cuenta, te llega un link para crear una contraseña nueva. Revisá también la carpeta de spam.");
      }
    } catch (caught) {
      setError(explain(caught as { message?: string }));
    }
    setBusy(false);
  };

  const title = mode === "login" ? "Ingresá a tu cuenta" : mode === "register" ? "Creá tu cuenta" : "Recuperá tu contraseña";
  const subtitle = mode === "forgot" ? "Te mandamos un link a tu email para crear una contraseña nueva." : "Tus movimientos quedan guardados y separados por mes.";
  const action = mode === "login" ? "Ingresar" : mode === "register" ? "Crear cuenta" : "Enviar link";

  return (
    <Screen>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-[#8b837c] dark:text-[#b5aca5]">{subtitle}</p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <label className="block"><span className="mb-1 block text-sm font-medium">Email</span><input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></label>
        {mode !== "forgot" && <label className="block"><span className="mb-1 block text-sm font-medium">Contraseña</span><PasswordInput value={password} onChange={setPassword} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>}
        {mode === "login" && <div className="text-right"><button type="button" onClick={() => switchMode("forgot")} className={linkButton}>¿Olvidaste tu contraseña?</button></div>}
        <Feedback error={error} message={message} />
        <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Un momento…" : action}</button>
      </form>
      <div className="mt-4 text-center">
        {mode === "login" && <button type="button" onClick={() => switchMode("register")} className={linkButton}>¿No tenés cuenta? Creá una</button>}
        {mode !== "login" && <button type="button" onClick={() => switchMode("login")} className={linkButton}>Volver a ingresar</button>}
      </div>
    </Screen>
  );
}

function NewPasswordForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setError("");
    if (password.length < 6) { setError("La contraseña tiene que tener al menos 6 caracteres."); return; }
    if (password !== repeat) { setError("Las dos contraseñas no coinciden."); return; }
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) setError(explain(authError));
      else onDone();
    } catch (caught) {
      setError(explain(caught as { message?: string }));
    }
    setBusy(false);
  };

  return (
    <Screen>
      <h1 className="text-2xl font-bold tracking-tight">Elegí una contraseña nueva</h1>
      <p className="mt-1 text-sm text-[#8b837c] dark:text-[#b5aca5]">Va a ser la misma en la compu y en el teléfono.</p>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <label className="block"><span className="mb-1 block text-sm font-medium">Contraseña nueva</span><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium">Repetila</span><PasswordInput value={repeat} onChange={setRepeat} autoComplete="new-password" /></label>
        <Feedback error={error} message="" />
        <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Un momento…" : "Guardar contraseña"}</button>
      </form>
    </Screen>
  );
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) return <Screen><p className="text-base">Falta configurar la conexión con Supabase (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).</p></Screen>;
  if (loading) return <Screen><p className="text-base">Cargando…</p></Screen>;
  if (session && recovery) return <NewPasswordForm onDone={() => setRecovery(false)} />;
  if (!session) return <LoginForm />;

  const signOut = async () => {
    clearCache();
    await supabase?.auth.signOut();
  };

  return <AuthContext.Provider value={{ user: session.user, signOut }}>{children}</AuthContext.Provider>;
}
