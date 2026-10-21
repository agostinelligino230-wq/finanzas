import { useState } from "react";
import { Check, ChevronDown, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { Card } from "./ui";
import { dayLabel, money, timeLabel } from "../lib/format";
import { originLabel, type Movement } from "../lib/movements";

// Movimientos que llegaron sin un aviso verificado del banco (mail sin firma, texto que no reconocimos…).
// No suman hasta que los confirmes; si no son tuyos o están mal, los borrás.
export function ReviewCard({ items, onConfirm, onRemove }: { items: Movement[]; onConfirm: (item: Movement) => void; onRemove: (item: Movement) => void }) {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;
  return (
    <Card>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-2 text-left">
        <ShieldAlert size={18} className="shrink-0 text-[var(--expense)]" />
        <span className="flex-1 font-semibold">Para revisar ({items.length})</span>
        <ChevronDown size={18} className={"shrink-0 text-[var(--muted)] transition " + (open ? "rotate-180" : "")} />
      </button>
      {open && (
        <>
          <p className="mt-1 text-sm text-[var(--muted)]">Llegaron sin un aviso verificado del banco. No suman hasta que los confirmes.</p>
          <div className="mt-2 divide-y divide-[var(--border)]">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.description}</p>
                  <p className="text-xs text-[var(--muted)]">{dayLabel(item.date)} · {timeLabel(item.createdAt)}{originLabel(item) && " · " + originLabel(item)}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: item.type === "ingreso" ? "var(--income)" : undefined }}>{item.type === "ingreso" ? "+" : "−"}{money(item.amount)}</span>
                <button type="button" onClick={() => onConfirm(item)} className="flex h-11 shrink-0 items-center gap-1 rounded-full bg-[var(--primary-soft)] px-4 text-sm font-semibold text-[var(--primary-text)]" aria-label={"Confirmar " + item.description}><Check size={15} />Es mío</button>
                <button type="button" onClick={() => { if (window.confirm("¿Borrar «" + item.description + "»? Si no era tuyo, no suma en ningún lado.")) onRemove(item); }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--expense-soft)] hover:text-[var(--expense)]" aria-label={"Borrar " + item.description}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// Detalle de dónde vino un movimiento automático, con el sello si está verificado.
export function Origin({ item }: { item: Movement }) {
  const label = originLabel(item);
  if (!label) return null;
  return <> · {item.trust === "verified" && <ShieldCheck size={12} className="inline -mt-0.5 text-[var(--income)]" aria-hidden />}{label}</>;
}
