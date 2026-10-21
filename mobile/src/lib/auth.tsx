import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { apagarAvisos } from "./avisos";
import { supabase, WEB_URL } from "./supabase";

type AuthValue = {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  resetPassword: (email: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth va dentro de AuthProvider");
  return value;
}

// Los mismos mensajes claros que la web.
export function explain(error: { message?: string; status?: number } | null | undefined): string {
  const message = (error?.message ?? "").toLowerCase();
  if (message.includes("invalid login")) return "Email o contraseña incorrectos. Revisá que el email esté bien escrito y tocá el ojito para ver la contraseña.";
  if (message.includes("not confirmed")) return "Tenés que confirmar tu email antes de ingresar.";
  if (message.includes("already registered") || message.includes("already been registered")) return "Ese email ya tiene una cuenta. Ingresá con tu contraseña o recuperala.";
  if (error?.status === 429 || message.includes("rate limit") || message.includes("security purposes")) return "Hubo demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.";
  if (message.includes("network") || message.includes("fetch")) return "No hay conexión con el servidor. Revisá tu internet y probá de nuevo.";
  if (message.includes("password")) return "La contraseña tiene que tener al menos 6 caracteres.";
  if (message.includes("email")) return "Ese email no es válido. Revisá cómo está escrito.";
  return "No se pudo completar. Detalle: " + (error?.message || "error desconocido");
}

// La vuelta de Google trae un código que se cambia por la sesión una sola vez
// (en Android llega por el navegador y, además, como enlace a la app).
const exchanged = new Map<string, Promise<string | null>>();
export function exchangeCode(code: string) {
  if (!supabase) return Promise.resolve("Falta configurar Supabase.");
  if (!exchanged.has(code)) exchanged.set(code, supabase.auth.exchangeCodeForSession(code).then(({ error }) => (error ? explain(error) : null)));
  return exchanged.get(code)!;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    // Si la sesión guardada no se puede leer, se entra como sin sesión (nunca queda cargando).
    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const value: AuthValue = {
    session,
    loading,
    async signIn(email, password) {
      if (!supabase) return "Falta configurar Supabase.";
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      return error ? explain(error) : null;
    },
    async signUp(email, password) {
      if (!supabase) return { error: "Falta configurar Supabase.", needsConfirmation: false };
      const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { emailRedirectTo: WEB_URL } });
      return { error: error ? explain(error) : null, needsConfirmation: !error && !data.session };
    },
    async resetPassword(email) {
      if (!supabase) return "Falta configurar Supabase.";
      // La contraseña nueva se elige en la web (el link del mail abre ahí).
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: WEB_URL });
      return error ? explain(error) : null;
    },
    async signInWithGoogle() {
      if (!supabase) return "Falta configurar Supabase.";
      const redirectTo = Linking.createURL("auth");
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, skipBrowserRedirect: true } });
      if (error || !data.url) return explain(error);
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== "success") return null; // Canceló: no es un error.
      const code = new URL(result.url).searchParams.get("code");
      return code ? exchangeCode(code) : "Google no devolvió el permiso. Probá de nuevo.";
    },
    async signOut() {
      await apagarAvisos().catch(() => false); // Que a este celular no le lleguen avisos de la cuenta que se va.
      await supabase?.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
