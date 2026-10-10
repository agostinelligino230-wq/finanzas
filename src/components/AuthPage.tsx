import { FormEvent, useState } from "react";
import { LockKeyhole, Mail, UserPlus, LogIn, AlertCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

type Mode = "login" | "register";

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!supabase) {
      setError("Conectá el backend desde el panel Backend para habilitar el inicio de sesión.");
      return;
    }

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setPending(true);
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password });
    setPending(false);

    if (result.error) {
      setError(mode === "login"
        ? "No se pudo iniciar sesión. Revisá tu email y contraseña."
        : "No se pudo crear la cuenta. Revisá los datos e intentá nuevamente.");
      return;
    }

    if (mode === "register" && !result.data.session) {
      setMessage("Cuenta creada. Revisá tu email para confirmar la cuenta y después ingresá.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f0eb] px-4 py-8 text-[#403b38] dark:bg-[#1d1b1a] dark:text-[#eee9e3]">
      <section className="w-full max-w-md rounded-3xl border border-[#ded8d0] bg-[#f8f6f2] p-6 shadow-sm dark:border-[#3a3532] dark:bg-[#252220] sm:p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#d8cceb] text-[#51465d]">
            <LockKeyhole size={26} />
          </div>
          <h1 className="mt-5 text-2xl font-bold">{mode === "login" ? "Ingresá a Finanzas" : "Creá tu cuenta"}</h1>
          <p className="mt-2 text-base leading-6 text-[#776f68] dark:text-[#c7beb7]">
            {mode === "login" ? "Tus datos se guardan de forma segura en tu cuenta." : "Guardá tus movimientos y metas para no perderlos al recargar."}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Email</span>
            <span className="relative block">
              <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8b837c]" size={18} />
              <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 w-full rounded-xl border border-[#d8d1c8] bg-[#fffdfa] pl-10 pr-3 text-base dark:border-[#4a433e] dark:bg-[#302c29]" />
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Contraseña</span>
            <input required minLength={6} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full rounded-xl border border-[#d8d1c8] bg-[#fffdfa] px-3 text-base dark:border-[#4a433e] dark:bg-[#302c29]" />
          </label>

          {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-[#f0dfe0] px-3 py-3 text-sm leading-5 text-[#7d3f4a]"><AlertCircle className="mt-0.5 shrink-0" size={18} />{error}</p>}
          {message && <p role="status" className="rounded-xl bg-[#dbe9df] px-3 py-3 text-sm leading-5 text-[#356247]">{message}</p>}

          <button disabled={pending} type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#6e607c] text-base font-semibold text-white transition hover:bg-[#5d506a] disabled:cursor-not-allowed disabled:opacity-60">
            {mode === "login" ? <LogIn size={19} /> : <UserPlus size={19} />}
            {pending ? "Procesando…" : mode === "login" ? "Ingresar" : "Registrarme"}
          </button>
        </form>

        <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setMessage(""); }} className="mt-6 min-h-11 w-full rounded-xl px-3 text-base font-medium text-[#6e607c] transition hover:bg-[#eee9e3] dark:hover:bg-[#322e2b]">
          {mode === "login" ? "¿No tenés cuenta? Registrate" : "¿Ya tenés cuenta? Ingresá"}
        </button>
      </section>
    </main>
  );
}
