import { useState, useMemo } from "react";
import { Plus, Trash2, Heart, GraduationCap, Stethoscope, Users, ShoppingBag, Home, PiggyBank, MoreHorizontal } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/* ------------------------------------------------------------------ */
/*  Tipos locales                                                      */
/* ------------------------------------------------------------------ */

type CategoryId =
  | "ayuda-familiar"
  | "educacion"
  | "salud"
  | "alimentacion"
  | "hogar"
  | "ocio"
  | "ahorro"
  | "otro";

interface CategoryMeta {
  id: CategoryId;
  label: string;
  icon: React.ElementType;
}

interface Expense {
  id: string;
  category: CategoryId;
  description: string;
  amount: number;
  date: string; // ISO
}

/* ------------------------------------------------------------------ */
/*  Catálogo de categorías                                             */
/* ------------------------------------------------------------------ */

const CATEGORIES: CategoryMeta[] = [
  { id: "ayuda-familiar", label: "Ayuda familiar", icon: Users },
  { id: "educacion", label: "Educación", icon: GraduationCap },
  { id: "salud", label: "Salud", icon: Stethoscope },
  { id: "alimentacion", label: "Alimentación", icon: ShoppingBag },
  { id: "hogar", label: "Hogar", icon: Home },
  { id: "ocio", label: "Ocio", icon: Heart },
  { id: "ahorro", label: "Ahorro", icon: PiggyBank },
  { id: "otro", label: "Otro", icon: MoreHorizontal },
];

const CATEGORY_MAP: Record<CategoryId, CategoryMeta> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c])
) as Record<CategoryId, CategoryMeta>;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/* ------------------------------------------------------------------ */
/*  Datos demo (locales, sin backend)                                  */
/* ------------------------------------------------------------------ */

const DEMO_EXPENSES: Expense[] = [
  {
    id: "1",
    category: "ayuda-familiar",
    description: "Mensualidad padres",
    amount: 300,
    date: "2025-06-01",
  },
  {
    id: "2",
    category: "educacion",
    description: "Colegio hijos",
    amount: 450,
    date: "2025-06-05",
  },
  {
    id: "3",
    category: "salud",
    description: "Seguro médico familiar",
    amount: 180,
    date: "2025-06-10",
  },
  {
    id: "4",
    category: "alimentacion",
    description: "Supermercado semanal",
    amount: 520,
    date: "2025-06-15",
  },
];

/* ------------------------------------------------------------------ */
/*  Componente principal                                               */
/* ------------------------------------------------------------------ */

function Family() {
  const [expenses, setExpenses] = useState<Expense[]>(DEMO_EXPENSES);
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | "todas">("todas");

  /* ---- Formulario de nuevo gasto ---- */
  const [newCategory, setNewCategory] = useState<CategoryId>("ayuda-familiar");
  const [newDescription, setNewDescription] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newDate, setNewDate] = useState(todayISO());

  /* ---- Totales ---- */
  const filteredExpenses = useMemo(() => {
    if (categoryFilter === "todas") return expenses;
    return expenses.filter((e) => e.category === categoryFilter);
  }, [expenses, categoryFilter]);

  const totalMensual = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
    [filteredExpenses]
  );

  /* ---- Totales por categoría (para barras de progreso) ---- */
  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      map[e.category] = (map[e.category] ?? 0) + e.amount;
    });
    return map;
  }, [expenses]);

  const maxCategoryTotal = useMemo(
    () => Math.max(...Object.values(categoryTotals), 1),
    [categoryTotals]
  );

  /* ---- Handlers ---- */
  function addExpense() {
    const amount = parseFloat(newAmount);
    if (!newDescription.trim() || isNaN(amount) || amount <= 0) return;

    const expense: Expense = {
      id: generateId(),
      category: newCategory,
      description: newDescription.trim(),
      amount,
      date: newDate,
    };

    setExpenses((prev) => [expense, ...prev]);
    setNewDescription("");
    setNewAmount("");
    setNewDate(todayISO());
  }

  function removeExpense(id: string) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  /* ---- Render ---- */
  return (
    <div className="space-y-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ================================================================ */}
      {/*  Cabecera + total mensual                                        */}
      {/* ================================================================ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            className="text-[24px] font-bold leading-tight"
            style={{ color: "#1E293B" }}
          >
            Familia
          </h2>
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            Gastos para la familia: ayuda familiar, educación, salud, alimentación y más.
          </p>
        </div>

        {/* Total mensual */}
        <div
          className="inline-flex items-center gap-3 rounded-xl px-5 py-3 shadow-sm"
          style={{ backgroundColor: "#FFFFFF" }}
        >
          <span className="text-sm font-medium" style={{ color: "#64748B" }}>
            Total mensual
          </span>
          <span
            className="text-[24px] font-bold"
            style={{ color: "#0EA5E9", fontFamily: "'JetBrains Mono', monospace" }}
          >
            {formatCurrency(totalMensual)}
          </span>
        </div>
      </div>

      {/* ================================================================ */}
      {/*  Tarjetas de categorías con barras de progreso                   */}
      {/* ================================================================ */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {CATEGORIES.map((cat) => {
          const catTotal = categoryTotals[cat.id] ?? 0;
          const pct = maxCategoryTotal > 0 ? (catTotal / maxCategoryTotal) * 100 : 0;
          const isActive = categoryFilter === cat.id;

          return (
            <button
              key={cat.id}
              onClick={() =>
                setCategoryFilter((prev) => (prev === cat.id ? "todas" : cat.id))
              }
              className={twMerge(
                clsx(
                  "flex flex-col gap-3 rounded-xl p-4 text-left shadow-sm transition-all duration-200",
                  "hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2",
                  isActive
                    ? "ring-2 ring-offset-1"
                    : "ring-1 ring-transparent"
                )
              )}
              style={{
                backgroundColor: "#FFFFFF",
                ...(isActive ? { ringColor: "#0EA5E9" } : {}),
              }}
            >
              <div className="flex items-center gap-2">
                <cat.icon size={18} style={{ color: "#0EA5E9" }} />
                <span
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "#64748B" }}
                >
                  {cat.label}
                </span>
              </div>

              <span
                className="text-lg font-bold"
                style={{
                  color: "#1E293B",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {formatCurrency(catTotal)}
              </span>

              {/* Barra de progreso */}
              <div
                className="h-1.5 w-full rounded-full overflow-hidden"
                style={{ backgroundColor: "#E2E8F0" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: "#0EA5E9",
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* ================================================================ */}
      {/*  Formulario: nuevo gasto                                         */}
      {/* ================================================================ */}
      <div
        className="rounded-xl p-5 shadow-sm space-y-4"
        style={{ backgroundColor: "#FFFFFF" }}
      >
        <h3
          className="text-base font-semibold"
          style={{ color: "#1E293B" }}
        >
          Añadir gasto
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Categoría */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "#64748B" }}>
              Categoría
            </span>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as CategoryId)}
              className="rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2"
              style={{
                borderColor: "#CBD5E1",
                color: "#1E293B",
                backgroundColor: "#F8FAFC",
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          {/* Descripción */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "#64748B" }}>
              Descripción
            </span>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Ej. Colegio hijos"
              className="rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2"
              style={{
                borderColor: "#CBD5E1",
                color: "#1E293B",
                backgroundColor: "#F8FAFC",
              }}
            />
          </label>

          {/* Importe */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "#64748B" }}>
              Importe (€)
            </span>
            <input
              type="number"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="0,00"
              min="0"
              step="0.01"
              className="rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2"
              style={{
                borderColor: "#CBD5E1",
                color: "#1E293B",
                backgroundColor: "#F8FAFC",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
          </label>

          {/* Fecha */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "#64748B" }}>
              Fecha
            </span>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2"
              style={{
                borderColor: "#CBD5E1",
                color: "#1E293B",
                backgroundColor: "#F8FAFC",
              }}
            />
          </label>
        </div>

        <button
          onClick={addExpense}
          disabled={!newDescription.trim() || !newAmount}
          className={clsx(
            "inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all duration-200",
            "focus-visible:outline-2 focus-visible:outline-offset-2",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
          style={{
            backgroundColor: "#0EA5E9",
            color: "#FFFFFF",
          }}
        >
          <Plus size={16} />
          Añadir gasto
        </button>
      </div>

      {/* ================================================================ */}
      {/*  Lista de gastos                                                 */}
      {/* ================================================================ */}
      <div className="space-y-3">
        {filteredExpenses.length === 0 ? (
          <div
            className="rounded-xl p-8 text-center shadow-sm"
            style={{ backgroundColor: "#FFFFFF" }}
          >
            <p className="text-sm" style={{ color: "#94A3B8" }}>
              {categoryFilter === "todas"
                ? "No hay gastos registrados todavía. Añade el primer gasto usando el formulario superior."
                : `No hay gastos en la categoría «${CATEGORY_MAP[categoryFilter]?.label ?? categoryFilter}».`}
            </p>
          </div>
        ) : (
          filteredExpenses.map((expense) => {
            const meta = CATEGORY_MAP[expense.category];
            const Icon = meta.icon;

            return (
              <div
                key={expense.id}
                className="flex items-center gap-4 rounded-xl px-5 py-4 shadow-sm transition-shadow hover:shadow-md"
                style={{ backgroundColor: "#FFFFFF" }}
              >
                {/* Icono de categoría */}
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "#F0F9FF" }}
                >
                  <Icon size={18} style={{ color: "#0EA5E9" }} />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-semibold"
                    style={{ color: "#1E293B" }}
                    title={expense.description}
                  >
                    {expense.description}
                  </p>
                  <p className="text-xs" style={{ color: "#94A3B8" }}>
                    {meta.label} &middot;{" "}
                    {new Intl.DateTimeFormat("es-ES", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }).format(new Date(expense.date))}
                  </p>
                </div>

                {/* Importe */}
                <span
                  className="shrink-0 text-base font-bold"
                  style={{
                    color: "#1E293B",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {formatCurrency(expense.amount)}
                </span>

                {/* Eliminar */}
                <button
                  onClick={() => removeExpense(expense.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2"
                  aria-label={`Eliminar gasto: ${expense.description}`}
                  style={{ color: "#EF4444" }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default Family;