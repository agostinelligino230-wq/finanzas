import { useMemo, useState } from "react";
import { Download, Search, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthGate";
import { CategoryIcon, Card, ErrorBox, MonthPicker, Tabs } from "./ui";
import MovementDetail from "./MovementDetail";
import { ProviderIcon } from "./sheets";
import { findCategory, useCategories, type Category } from "../lib/categories";
import { dayLabel, money, timeLabel, usd } from "../lib/format";
import { currentCycle, cycleText, inCycle } from "../../shared/cobro";
import { counts, hasDetail, useMovements, type Movement } from "../lib/movements";
import { findPayee, usePayees } from "../lib/payees";
import { findProvider } from "../lib/providers";
import { Origin, RereadButton, ReviewCard } from "./ReviewCard";

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
  const { user, cobro } = useAuth();
  const data = useMovements(user.id);
  const { all, listed, toReview, error, confirm, reread, remove } = data;
  const payees = usePayees(user.id);
  const [detail, setDetail] = useState<string | null>(null);
  const open = all.find((item) => item.id === detail) ?? null;
  const { categories } = useCategories(user.id);
  const [month, setMonth] = useState(() => currentCycle(cobro));
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return listed.filter((item) => {
      if (!inCycle(item.date, month, cobro)) return false;
      if (filter !== "todos" && item.type !== filter) return false;
      if (!text) return true;
      const category = findCategory(categories, item.type, item.category);
      return item.description.toLowerCase().includes(text) || category.name.toLowerCase().includes(text) || (item.note ?? "").toLowerCase().includes(text) || (item.place.name ?? "").toLowerCase().includes(text);
    });
  }, [listed, month, filter, query, categories, cobro]);

  const byDay = useMemo(() => {
    const map = new Map<string, Movement[]>();
    visible.forEach((item) => map.set(item.date, [...(map.get(item.date) ?? []), item]));
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [visible]);

  const income = visible.filter((item) => counts(item) && item.type === "ingreso").reduce((sum, item) => sum + item.amount, 0);
  const expense = visible.filter((item) => counts(item) && item.type === "gasto").reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ErrorBox message={error} />
      <ReviewCard items={toReview} onConfirm={confirm} onRemove={remove} onReread={reread} onOpen={(item) => setDetail(item.id)} />
      <MonthPicker month={month} detail={cycleText(month, cobro)} onChange={setMonth} />
      <Tabs value={filter} onChange={setFilter} options={[{ value: "todos", label: "Todos" }, { value: "gasto", label: "Gastos" }, { value: "ingreso", label: "Ingresos" }]} />
      <div className="flex gap-2">
        <label className="flex h-12 flex-1 items-center gap-2 rounded-2xl bg-[var(--surface)] px-4">
          <Search size={18} className="text-[var(--muted)]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por categoría o detalle" className="w-full bg-transparent text-base outline-none" />
        </label>
        <Link to="/importar" className="flex h-12 items-center gap-2 rounded-2xl bg-[var(--surface)] px-4 font-semibold" title="Importar el archivo de movimientos de tu banco o billetera"><Upload size={18} /><span className="hidden sm:inline">Importar</span></Link>
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
              const payee = findPayee(payees.payees, item);
              const provider = item.category === "transferencias" ? findProvider(item.source) : null;
              return (
                <div key={item.id} className={"flex items-center gap-3 p-3 sm:p-4 " + (item.excluded ? "opacity-60" : "")}>
                  <button type="button" onClick={() => setDetail(item.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={"Ver el detalle de " + (item.description || category.name)}>
                    {payee?.icon ? <CategoryIcon category={{ icon: payee.icon, color: payee.color ?? category.color }} /> : provider ? <ProviderIcon name={provider.name} color={provider.color} provider={provider.id} /> : <CategoryIcon category={category} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold"><span style={{ color: category.color }}>{category.name}</span>{hasDetail(item, category.name) && <span> ({item.description})</span>}</span>
                      <span className="block text-xs text-[var(--muted)]">{timeLabel(item.createdAt)} hs{item.excluded && " · no es un gasto"}{item.place.name && " · " + item.place.name}{item.type === "gasto" && !item.paid && " · pendiente de pago"}{item.currency === "USD" && item.original !== null && <> · {usd(item.original)} a {money(item.rate ?? 0)}</>}<Origin item={item} /></span>
                    </span>
                    <span className={"shrink-0 font-bold tabular-nums " + (item.excluded ? "line-through" : "")} style={{ color: item.type === "ingreso" ? "var(--income)" : "var(--text)" }}>{item.type === "ingreso" ? "+" : "−"}{money(item.amount)}</span>
                  </button>
                  <RereadButton item={item} onReread={reread} />
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {open && <MovementDetail key={open.id} item={open} categories={categories} data={data} payees={payees} onClose={() => setDetail(null)} />}
    </div>
  );
}
