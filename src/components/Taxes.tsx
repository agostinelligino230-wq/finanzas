import { useState, useMemo } from "react";
import { Plus, Trash2, Filter, ChevronDown, ChevronUp, Receipt, CreditCard, User } from "lucide-react";
import { clsx } from "clsx";

/* ------------------------------------------------------------------ */
/*  Tipos locales                                                      */
/* ------------------------------------------------------------------ */

type TaxCategory = "tarjeta" | "personal";

interface TaxEntry {
  id: string;
  description: string;
  category: TaxCategory;
  amount: number;
  month: number; // 1‑12
  year: number;
  date: string; // ISO
}

/* ------------------------------------------------------------------ */
/*  Datos demo (sin backend)                                           */
/* ------------------------------------------------------------------ */

const DEMO_TAXES: TaxEntry[] = [
  { id: "1", description: "Monotributo", category: "personal", amount: 12500, month: 1, year: 2025, date: "2025-01-20" },
  { id: "2", description: "IVA servicios digitales", category: "tarjeta", amount: 8400, month: 1, year: 2025, date: "2025-01-15" },
  { id: "3", description: "Ganancias retención", category: "personal", amount: 22000, month: 2, year: 2025, date: "2025-02-10" },
  { id: "4", description: "Percepción AFIP", category: "tarjeta", amount: 5600, month: 2, year: 2025, date: "2025-02-05" },
  { id: "5", description: "Ingresos Brutos", category: "personal", amount: 9800, month: 3, year: 2025, date: "2025-03-18" },
  { id: "6", description: "Débito automático AFIP", category: "tarjeta", amount: 7200, month: 3, year: 2025, date: "2025-03-22" },
];

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const CATEGORY_LABELS: Record<TaxCategory, string> = {
  tarjeta: "Lo que pago en tarjeta",
  personal: "Lo que pago para mi",
};

const CATEGORY_ICONS: Record<TaxCategory, typeof CreditCard> = {
  tarjeta: CreditCard,
  personal: User,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatARS(amount: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/* ------------------------------------------------------------------ */
/*  Componente principal                                               */
/* ------------------------------------------------------------------ */

export default function Taxes() {
  const [entries, setEntries] = useState<TaxEntry[]>(DEMO_TAXES);

  /* Filtros */
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [selectedCategory, setSelectedCategory] = useState<TaxCategory | null>(null);

  /* Formulario de alta */
  const [showForm, setShowForm] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState<TaxCategory>("tarjeta");
  const [newAmount, setNewAmount] = useState("");
  const [newMonth, setNewMonth] = useState(new Date().getMonth() + 1);
  const [newYear, setNewYear] = useState(new Date().getFullYear());

  /* Orden */
  const [sortAsc, setSortAsc] = useState(false);

  /* ------------------------------------------------------------------ */
  /*  Filtrado y total                                                  */
  /* ------------------------------------------------------------------ */

  const filtered = useMemo(() => {
    let result = [...entries];

    if (selectedMonth !== null) {
      result = result.filter((e) => e.month === selectedMonth);
    }
    result = result.filter((e) => e.year === selectedYear);
    if (selectedCategory !== null) {
      result = result.filter((e) => e.category === selectedCategory);
    }

    result.sort((a, b) => {
      const cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [entries, selectedMonth, selectedYear, selectedCategory, sortAsc]);

  const total = useMemo(() => filtered.reduce((sum, e) => sum + e.amount, 0), [filtered]);

  /* ------------------------------------------------------------------ */
  /*  Acciones                                                          */
  /* ------------------------------------------------------------------ */

  function handleAdd() {
    const amount = parseFloat(newAmount);
    if (!newDescription.trim() || isNaN(amount) || amount <= 0) return;

    const entry: TaxEntry = {
      id: generateId(),
      description: newDescription.trim(),
      category: newCategory,
      amount,
      month: newMonth,
      year: newYear,
      date: `${newYear}-${String(newMonth).padStart(2, "0")}-15`,
    };

    setEntries((prev) => [entry, ...prev]);
    setNewDescription("");
    setNewAmount("");
    setShowForm(false);
  }

  function handleDelete(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  /* ------------------------------------------------------------------ */
  /*  Render                                                            */
  /* ------------------------------------------------------------------ */

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800" style={{ fontFamily: "Inter, sans-serif" }}>
            Impuestos
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Lo que pago en tarjeta &middot; Lo que pago para mi
          </p>
        </div>

        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          <Plus size={18} />
          Agregar impuesto
        </button>
      </div>

      {/* Formulario de alta */}
      {showForm && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800" style={{ fontFamily: "Inter, sans-serif" }}>
            Nuevo impuesto
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Descripción */}
            <div className="sm:col-span-2">
              <label htmlFor="tax-desc" className="mb-1 block text-sm font-medium text-slate-700">
                Descripción
              </label>
              <input
                id="tax-desc"
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Ej: Monotributo, IVA, Ganancias…"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </div>

            {/* Categoría */}
            <div>
              <label htmlFor="tax-cat" className="mb-1 block text-sm font-medium text-slate-700">
                Categoría
              </label>
              <select
                id="tax-cat"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as TaxCategory)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
              >
                <option value="tarjeta">Lo que pago en tarjeta</option>
                <option value="personal">Lo que pago para mi</option>
              </select>
            </div>

            {/* Monto */}
            <div>
              <label htmlFor="tax-amount" className="mb-1 block text-sm font-medium text-slate-700">
                Monto (ARS)
              </label>
              <input
                id="tax-amount"
                type="number"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </div>

            {/* Mes */}
            <div>
              <label htmlFor="tax-month" className="mb-1 block text-sm font-medium text-slate-700">
                Mes
              </label>
              <select
                id="tax-month"
                value={newMonth}
                onChange={(e) => setNewMonth(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
              >
                {MONTHS_ES.map((name, i) => (
                  <option key={i} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Año */}
            <div>
              <label htmlFor="tax-year" className="mb-1 block text-sm font-medium text-slate-700">
                Año
              </label>
              <input
                id="tax-year"
                type="number"
                value={newYear}
                onChange={(e) => setNewYear(Number(e.target.value))}
                min={2020}
                max={2100}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleAdd}
              className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              Guardar
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Filter size={18} className="text-sky-500" />

        {/* Mes */}
        <select
          value={selectedMonth ?? ""}
          onChange={(e) => setSelectedMonth(e.target.value ? Number(e.target.value) : null)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          aria-label="Filtrar por mes"
        >
          <option value="">Todos los meses</option>
          {MONTHS_ES.map((name, i) => (
            <option key={i} value={i + 1}>
              {name}
            </option>
          ))}
        </select>

        {/* Año */}
        <input
          type="number"
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          min={2020}
          max={2100}
          className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          aria-label="Filtrar por año"
        />

        {/* Categoría */}
        <select
          value={selectedCategory ?? ""}
          onChange={(e) => setSelectedCategory(e.target.value ? (e.target.value as TaxCategory) : null)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          aria-label="Filtrar por categoría"
        >
          <option value="">Todas las categorías</option>
          <option value="tarjeta">Lo que pago en tarjeta</option>
          <option value="personal">Lo que pago para mi</option>
        </select>

        {/* Orden */}
        <button
          onClick={() => setSortAsc((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-300"
        >
          {sortAsc ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {sortAsc ? "Más antiguo" : "Más reciente"}
        </button>

        {/* Limpiar filtros */}
        {(selectedMonth !== null || selectedCategory !== null) && (
          <button
            onClick={() => {
              setSelectedMonth(null);
              setSelectedCategory(null);
            }}
            className="text-sm font-medium text-sky-600 transition hover:text-sky-700"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Total acumulado */}
      <div className="flex items-center justify-between rounded-xl bg-sky-50 px-6 py-4 shadow-sm">
        <span className="text-sm font-medium text-sky-700">
          Total acumulado{" "}
          {selectedMonth !== null ? `· ${MONTHS_ES[selectedMonth - 1]} ${selectedYear}` : `· ${selectedYear}`}
        </span>
        <span
          className="text-2xl font-bold tabular-nums text-sky-600"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {formatARS(total)}
        </span>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
          <Receipt size={40} className="text-slate-300" />
          <p className="text-sm text-slate-500">
            No hay impuestos registrados para este período.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="text-sm font-medium text-sky-600 transition hover:text-sky-700"
          >
            Agregar el primer impuesto
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => {
            const Icon = CATEGORY_ICONS[entry.category];
            return (
              <div
                key={entry.id}
                className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:shadow-md"
              >
                {/* Icono de categoría */}
                <div
                  className={clsx(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    entry.category === "tarjeta" ? "bg-amber-50 text-amber-500" : "bg-emerald-50 text-emerald-500"
                  )}
                >
                  <Icon size={20} />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800" title={entry.description}>
                    {entry.description}
                  </p>
                  <p className="text-xs text-slate-500">
                    {CATEGORY_LABELS[entry.category]} &middot; {MONTHS_ES[entry.month - 1]} {entry.year}
                  </p>
                </div>

                {/* Monto */}
                <span
                  className="shrink-0 text-base font-semibold tabular-nums text-slate-800"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {formatARS(entry.amount)}
                </span>

                {/* Eliminar */}
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-300"
                  aria-label={`Eliminar ${entry.description}`}
                  title="Eliminar impuesto"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}