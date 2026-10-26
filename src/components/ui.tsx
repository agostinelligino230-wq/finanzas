import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Tag, X } from "lucide-react";
import { ICONS, type Category } from "../lib/categories";
import { monthLabel, shiftMonth } from "../lib/format";

export function CategoryIcon({ category, size = 40 }: { category: Pick<Category, "icon" | "color">; size?: number }) {
  const Icon = ICONS[category.icon] ?? Tag;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: category.color, width: size, height: size }}>
      <Icon size={Math.round(size * 0.48)} strokeWidth={2} />
    </span>
  );
}

// detail: debajo del mes, por ejemplo «del 5/10 al 4/11» cuando el mes va de un cobro al siguiente.
export function MonthPicker({ month, onChange, detail }: { month: string; onChange: (month: string) => void; detail?: string }) {
  const button = "flex h-10 w-10 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]";
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--surface)] p-1.5">
      <button type="button" className={button} onClick={() => onChange(shiftMonth(month, -1))} aria-label="Mes anterior"><ChevronLeft size={20} /></button>
      <span className="text-center"><span className="block text-base font-semibold">{monthLabel(month)}</span>{detail && <span className="block text-xs text-[var(--muted)]">{detail}</span>}</span>
      <button type="button" className={button} onClick={() => onChange(shiftMonth(month, 1))} aria-label="Mes siguiente"><ChevronRight size={20} /></button>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-2xl bg-[var(--surface)] p-1">
      {options.map((option) => (
        <button key={option.value} type="button" onClick={() => onChange(option.value)} className={"min-h-10 flex-1 rounded-xl text-sm font-semibold uppercase tracking-wide transition " + (value === option.value ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]")}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={"rounded-3xl bg-[var(--surface)] p-4 sm:p-5 " + className}>{children}</div>;
}

export function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-2xl bg-[var(--expense-soft)] px-4 py-3 text-sm text-[var(--expense)]">{message}</p>;
}

export function StackedBar({ parts }: { parts: { key: string; value: number; color: string }[] }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
      {total > 0 && parts.map((part) => <span key={part.key} style={{ width: (part.value / total) * 100 + "%", backgroundColor: part.color }} />)}
    </div>
  );
}

export const sheetField = "h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 text-base outline-none focus:border-[var(--primary)]";
export const sheetLabel = "mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]";

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-[var(--surface)] p-5 pb-8 text-[var(--text)] shadow-2xl sm:rounded-[28px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--surface-2)]" aria-label="Cerrar"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
