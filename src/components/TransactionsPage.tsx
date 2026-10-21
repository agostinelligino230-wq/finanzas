import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { useAuth } from "./AuthGate";
import { CategoryIcon, Card, ErrorBox, MonthPicker, Tabs } from "./ui";
import { findCategory, useCategories, type Category } from "../lib/categories";
import { currentMonthISO, dayLabel, money, timeLabel, usd } from "../lib/format";
import { hasDetail, useMovements, type Movement } from "../lib/movements";
import { Origin, ReviewCard } from "./ReviewCard";

type Filter = "todos" | "gasto" | "ingreso";

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[;"\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
};

function downloadCsv(rows: Movement[], categories: Category[], fileName: string) {
  const header = ["Fecha", "Hora", "Tipo", "Categoría", "Detalle", "Monto (pesos)", "Estado", "Moneda original", "Monto original", "Cotización"];
  const lines = rows.map((item) => {
    const category = findCategory(categories, item.type, item.category);
    return [item.date, timeLabel(item.createdAt), item.type === "gasto" ? "Gasto" : "Ingreso", category.name, item.description, item.type === "gasto" ? -item.amount : item.amount, item.type === "gasto" ? (item.paid ? "Pagado" : "Pendiente") : "Cobrado", item.currency, item.original ?? "", item.rate ?? ""].map(csvCell).join(";");
  });
  const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TransactionsPage() {
  const { user } = useAuth();
  const { movements, toReview, error, confirm, remove } = useMovements(user.id);
  const { categories } = useCategories(user.id);
  const [month, setMonth] = useState(currentMonthISO());
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return movements.filter((item) => {
      if (!item.date.startsWith(month)) return false;
      if (filter !== "todos" && item.type !== filter) return false;
      if (!text) return true;
      const category = findCategory(categories, item.type, item.category);
      return item.description.toLowerCase().includes(text) || category.name.toLowerCase().includes(text);
    });
  }, [movements, month, filter, query, categories]);

  const byDay = useMemo(() => {
    const map = new Map<string, Movement[]>();
    visible.forEach((item) => map.set(item.date, [...(map.get(item.date) ?? []), item]));
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [visible]);

  const income = visible.filter((item) => item.type === "ingreso").reduce((sum, item) => sum + item.amount, 0);
  const expense = visible.filter((item) => item.type === "gasto").reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ErrorBox message={error} />
      <ReviewCard items={toReview} onConfirm={confirm} onRemove={remove} />
      <MonthPicker month={month} onChange={setMonth} />
      <Tabs value={filter} onChange={setFilter} options={[{ value: "todos", label: "Todos" }, { value: "gasto", label: "Gastos" }, { value: "ingreso", label: "Ingresos" }]} />
      <div className="flex gap-2">
        <label className="flex h-12 flex-1 items-center gap-2 rounded-2xl bg-[var(--surface)] px-4">
          <Search size={18} className="text-[var(--muted)]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por categoría o detalle" className="w-full bg-transparent text-base outline-none" />
        </label>
        <button type="button" onClick={() => downloadCsv(visible, categories, "movimientos-" + month + ".csv")} disabled={visible.length === 0} className="flex h-12 items-center gap-2 rounded-2xl bg-[var(--surface)] px-4 font-semibold disabled:opacity-50" title="Descargar en Excel / CSV"><Download size={18} /><span className="hidden sm:inline">Descargar</span></button>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-[var(--muted)]">{visible.length} movimientos</span>
        <span className="flex gap-4 font-semibold tabular-nums"><span className="text-[var(--income)]">+{money(income)}</span><span className="text-[var(--expense)]">−{money(expense)}</span></span>
      </Card>

      {byDay.length === 0 ? (
        <Card className="py-10 text-center text-[var(--muted)]">No hay movimientos para mostrar.</Card>
      ) : byDay.map(([day, items]) => (
        <section key={day}>
          <h2 className="mb-2 px-2 text-sm font-semibold text-[var(--muted)]">{dayLabel(day)}</h2>
          <div className="divide-y divide-[var(--border)] overflow-hidden rounded-3xl bg-[var(--surface)]">
            {items.map((item) => {
              const category = findCategory(categories, item.type, item.category);
              return (
                <div key={item.id} className="flex items-center gap-3 p-3 sm:p-4">
                  <CategoryIcon category={category} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold"><span style={{ color: category.color }}>{category.name}</span>{hasDetail(item, category.name) && <span> ({item.description})</span>}</p>
                    <p className="text-xs text-[var(--muted)]">{timeLabel(item.createdAt)} hs{item.type === "gasto" && !item.paid && " · pendiente de pago"}{item.currency === "USD" && item.original !== null && <> · {usd(item.original)} a {money(item.rate ?? 0)}</>}<Origin item={item} /></p>
                  </div>
                  <span className="shrink-0 font-bold tabular-nums" style={{ color: item.type === "ingreso" ? "var(--income)" : "var(--text)" }}>{item.type === "ingreso" ? "+" : "−"}{money(item.amount)}</span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
