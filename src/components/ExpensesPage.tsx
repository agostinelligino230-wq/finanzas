import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useAuth } from "./AuthGate";
import AddMovementSheet from "./AddMovementSheet";
import { CategoryIcon, Card, ErrorBox, MonthPicker, StackedBar, Tabs } from "./ui";
import { findCategory, useCategories } from "../lib/categories";
import { currentMonthISO, dayLabel, monthLabel, money, timeLabel } from "../lib/format";
import { hasDetail, useMovements, type MovementType } from "../lib/movements";

export default function ExpensesPage() {
  const { user } = useAuth();
  const { movements, error, add, togglePaid, remove } = useMovements(user.id);
  const { categories, addCategory } = useCategories(user.id);
  const [month, setMonth] = useState(currentMonthISO());
  const [tab, setTab] = useState<MovementType>("gasto");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const monthItems = useMemo(() => movements.filter((item) => item.date.startsWith(month)), [movements, month]);
  const income = monthItems.filter((item) => item.type === "ingreso").reduce((sum, item) => sum + item.amount, 0);
  const expense = monthItems.filter((item) => item.type === "gasto").reduce((sum, item) => sum + item.amount, 0);
  const available = income - expense;
  const accumulated = movements.reduce((sum, item) => sum + (item.type === "ingreso" ? item.amount : -item.amount), 0);
  const pending = monthItems.filter((item) => item.type === "gasto" && !item.paid).reduce((sum, item) => sum + item.amount, 0);

  const tabItems = monthItems.filter((item) => item.type === tab);
  const tabTotal = tabItems.reduce((sum, item) => sum + item.amount, 0);
  const groups = useMemo(() => {
    const map = new Map<string, typeof tabItems>();
    tabItems.forEach((item) => map.set(item.category, [...(map.get(item.category) ?? []), item]));
    return [...map.entries()]
      .map(([id, items]) => {
        const category = findCategory(categories, tab, id);
        const details = new Map<string, number>();
        items.filter((item) => hasDetail(item, category.name)).forEach((item) => { const key = item.description.trim(); details.set(key, (details.get(key) ?? 0) + item.amount); });
        return { category, items, total: items.reduce((sum, item) => sum + item.amount, 0), details: [...details.entries()] };
      })
      .sort((a, b) => b.total - a.total);
  }, [tabItems, categories, tab]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-[28px] bg-[var(--hero)] p-5 text-[var(--hero-text)] sm:p-6">
        <p className="text-sm opacity-80">Disponible en {monthLabel(month)}</p>
        <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl" style={{ color: available < 0 ? "#ffb3c0" : undefined }}>{money(available)}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="flex items-center gap-1.5 text-xs opacity-80"><ArrowDownLeft size={14} />Ingresos</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{money(income)}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="flex items-center gap-1.5 text-xs opacity-80"><ArrowUpRight size={14} />Gastos</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{money(expense)}</p>
          </div>
        </div>
        <p className="mt-4 text-xs opacity-75">Saldo acumulado de todos los meses: <strong className="tabular-nums">{money(accumulated)}</strong>{pending > 0 && <> · Falta pagar este mes: <strong className="tabular-nums">{money(pending)}</strong></>}</p>
      </section>

      <ErrorBox message={error} />
      <MonthPicker month={month} onChange={(value) => { setMonth(value); setOpen(null); }} />
      <Tabs value={tab} onChange={(value) => { setTab(value); setOpen(null); }} options={[{ value: "gasto", label: "Gastos" }, { value: "ingreso", label: "Ingresos" }]} />

      <Card>
        <StackedBar parts={groups.map((group) => ({ key: group.category.id, value: group.total, color: group.category.color }))} />
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-sm text-[var(--muted)]">{tab === "gasto" ? "Total gastado" : "Total cobrado"}</span>
          <span className="text-2xl font-bold tabular-nums">{money(tabTotal)}</span>
        </div>
      </Card>

      {groups.length === 0 ? (
        <Card className="py-10 text-center">
          <p className="text-base font-semibold">{tab === "gasto" ? "Todavía no cargaste gastos este mes" : "Todavía no cargaste ingresos este mes"}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Tocá el botón + para agregar el primero.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map(({ category, items, total, details }) => {
            const expanded = open === category.id;
            const percent = tabTotal > 0 ? Math.round((total / tabTotal) * 100) : 0;
            return (
              <div key={category.id} className="overflow-hidden rounded-3xl bg-[var(--surface)]">
                <button type="button" onClick={() => setOpen(expanded ? null : category.id)} className="flex w-full items-center gap-3 p-3 text-left sm:p-4">
                  <CategoryIcon category={category} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{category.name}</span>
                    {details.length > 0 && <span className="block truncate text-xs text-[var(--muted)]">{details.map(([name]) => name).join(", ")}</span>}
                  </span>
                  <span className="w-11 text-right text-sm text-[var(--muted)] tabular-nums">{percent}%</span>
                  <span className="min-w-24 text-right font-bold tabular-nums">{money(total)}</span>
                  <ChevronDown size={18} className={"shrink-0 text-[var(--muted)] transition " + (expanded ? "rotate-180" : "")} />
                </button>
                {expanded && (
                  <div className="space-y-1 border-t border-[var(--border)] px-3 pb-3 pt-2 sm:px-4">
                    {details.length > 0 && (
                      <ul className="mb-2 space-y-1 border-l-2 pl-3" style={{ borderColor: category.color }}>
                        {details.map(([name, value]) => <li key={name} className="flex justify-between gap-3 text-sm"><span className="truncate"><span style={{ color: category.color }} className="font-semibold">{category.name}</span> ({name})</span><span className="shrink-0 tabular-nums">{money(value)}</span></li>)}
                      </ul>
                    )}
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 rounded-2xl px-1 py-1.5">
                        {item.type === "gasto" ? (
                          <button type="button" onClick={() => togglePaid(item)} className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 " + (item.paid ? "border-[var(--income)] bg-[var(--income)] text-white" : "border-[var(--border)] text-transparent")} aria-label={item.paid ? "Marcar como pendiente" : "Marcar como pagado"}><Check size={16} /></button>
                        ) : <span className="w-8" />}
                        <div className="min-w-0 flex-1">
                          <p className={"truncate text-sm font-medium " + (item.type === "gasto" && !item.paid ? "text-[var(--muted)]" : "")}>{hasDetail(item, category.name) ? item.description : category.name}{item.type === "gasto" && !item.paid && " · pendiente"}</p>
                          <p className="text-xs text-[var(--muted)]">{dayLabel(item.date)} · {timeLabel(item.createdAt)}</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{money(item.amount)}</span>
                        <button type="button" onClick={() => { if (window.confirm("¿Eliminar este movimiento?")) remove(item); }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--expense-soft)] hover:text-[var(--expense)]" aria-label="Eliminar"><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button type="button" onClick={() => setAdding(true)} className="fixed bottom-24 right-5 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-text)] shadow-xl transition hover:scale-105 lg:bottom-8 lg:right-8" aria-label="Agregar movimiento"><Plus size={30} strokeWidth={2.5} /></button>
      <AddMovementSheet open={adding} initialKind={tab} categories={categories} onAddCategory={addCategory} onSave={add} onClose={() => setAdding(false)} />
    </div>
  );
}
