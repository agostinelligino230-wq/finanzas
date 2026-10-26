import { useState } from "react";
import { supabase } from "../lib/supabase";
import { cobroToRow, cycleText, currentCycle, type Cobro } from "../../shared/cobro";

type Choice = "dia" | "ultimo" | "ninguno";
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
const choiceOf = (cobro: Cobro | null): Choice => (!cobro ? "dia" : cobro.ultimoHabil ? "ultimo" : cobro.dia ? "dia" : "ninguno");

// Pregunta el día de cobro: al entrar por primera vez y cuando se quiere cambiar (en Conectar cuentas).
export default function CobroForm({ userId, current, onSaved }: { userId: string; current: Cobro | null; onSaved: (cobro: Cobro) => void }) {
  const [choice, setChoice] = useState<Choice>(choiceOf(current));
  const [day, setDay] = useState(current?.dia ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cobro: Cobro = choice === "dia" ? { dia: day, ultimoHabil: false } : { dia: null, ultimoHabil: choice === "ultimo" };
  const preview = cycleText(currentCycle(cobro), cobro);

  const save = async () => {
    if (!supabase) return;
    setBusy(true);
    const { error: saveError } = await supabase.from("user_settings").upsert({ user_id: userId, ...cobroToRow(cobro), updated_at: new Date().toISOString() });
    setBusy(false);
    if (saveError) { setError("No se pudo guardar. Probá de nuevo."); return; }
    setError("");
    onSaved(cobro);
  };

  const option = (value: Choice, text: string) => (
    <label className={"flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-base " + (choice === value ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)]")}>
      <input type="radio" name="cobro" checked={choice === value} onChange={() => setChoice(value)} className="h-4 w-4 accent-[var(--primary)]" />
      {text}
    </label>
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-lg font-semibold">¿Qué día cobrás?</p>
        <p className="mt-1 text-sm text-[var(--muted)]">Así «tu mes» va de un cobro al siguiente: el sueldo y lo que gastás con él quedan juntos.</p>
      </div>
      <div className="space-y-2">
        {option("dia", "Un día fijo")}
        {choice === "dia" && (
          <label className="block pl-1">
            <span className="mb-1.5 block text-sm font-medium">Día del mes</span>
            <select value={day} onChange={(event) => setDay(Number(event.target.value))} className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-base">
              {DAYS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        )}
        {option("ultimo", "El último día hábil del mes")}
        {option("ninguno", "No tengo día fijo")}
      </div>
      <p className="text-sm text-[var(--muted)]">
        {preview ? "Tu mes de ahora va " + preview + ". Si el día cae sábado o domingo, tomamos el viernes anterior." : "Vas a ver cada mes del 1 al último día, como en el calendario."}
      </p>
      {!current && <p className="text-sm text-[var(--muted)]">Después, en «Conectar cuentas», conectá tu Gmail: traemos tus movimientos de los últimos 60 días, así tu mes arranca completo desde el día de cobro.</p>}
      {error && <p role="alert" className="rounded-xl bg-[var(--expense-soft)] px-3 py-2 text-sm text-[var(--expense)]">{error}</p>}
      <button type="button" onClick={save} disabled={busy} className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[var(--primary)] text-base font-semibold text-white hover:bg-[var(--primary-strong)] disabled:opacity-60">{busy ? "Guardando…" : "Guardar"}</button>
    </div>
  );
}
