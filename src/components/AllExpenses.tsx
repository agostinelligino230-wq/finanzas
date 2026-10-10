import { useState, useMemo, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
  type PaginationState,
} from "@tanstack/react-table";
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Calendar,
  Tag,
  CreditCard,
  X,
  Receipt,
} from "lucide-react";
import { clsx } from "clsx";
import { format, startOfMonth, endOfMonth, isSameMonth } from "date-fns";
import { es } from "date-fns/locale";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "otro";

interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string; // ISO
  paymentMethod: PaymentMethod;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Datos demo (locales — sin backend)
// ---------------------------------------------------------------------------

const CATEGORIES = [
  "Alimentación",
  "Transporte",
  "Vivienda",
  "Entretenimiento",
  "Salud",
  "Educación",
  "Servicios",
  "Ropa",
  "Tecnología",
  "Otros",
] as const;

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "otro", label: "Otro" },
];

const DEMO_EXPENSES: Expense[] = [
  {
    id: "1",
    description: "Supermercado semanal",
    amount: 85_400,
    category: "Alimentación",
    date: "2025-06-02",
    paymentMethod: "tarjeta",
  },
  {
    id: "2",
    description: "Gasolina",
    amount: 42_000,
    category: "Transporte",
    date: "2025-06-05",
    paymentMethod: "efectivo",
  },
  {
    id: "3",
    description: "Alquiler junio",
    amount: 450_000,
    category: "Vivienda",
    date: "2025-06-01",
    paymentMethod: "transferencia",
  },
  {
    id: "4",
    description: "Cine con amigos",
    amount: 18_500,
    category: "Entretenimiento",
    date: "2025-06-10",
    paymentMethod: "tarjeta",
  },
  {
    id: "5",
    description: "Consulta médica",
    amount: 35_000,
    category: "Salud",
    date: "2025-05-20",
    paymentMethod: "efectivo",
  },
  {
    id: "6",
    description: "Curso online",
    amount: 120_000,
    category: "Educación",
    date: "2025-05-15",
    paymentMethod: "tarjeta",
  },
  {
    id: "7",
    description: "Electricidad",
    amount: 28_300,
    category: "Servicios",
    date: "2025-06-08",
    paymentMethod: "transferencia",
  },
  {
    id: "8",
    description: "Zapatillas nuevas",
    amount: 65_000,
    category: "Ropa",
    date: "2025-04-22",
    paymentMethod: "tarjeta",
  },
  {
    id: "9",
    description: "Teclado mecánico",
    amount: 95_000,
    category: "Tecnología",
    date: "2025-06-12",
    paymentMethod: "tarjeta",
  },
  {
    id: "10",
    description: "Regalo cumpleaños",
    amount: 30_000,
    category: "Otros",
    date: "2025-06-14",
    paymentMethod: "efectivo",
  },
  {
    id: "11",
    description: "Internet fibra",
    amount: 22_500,
    category: "Servicios",
    date: "2025-06-03",
    paymentMethod: "transferencia",
  },
  {
    id: "12",
    description: "Taxi aeropuerto",
    amount: 15_000,
    category: "Transporte",
    date: "2025-05-28",
    paymentMethod: "efectivo",
  },
  {
    id: "13",
    description: "Cena restaurante",
    amount: 48_000,
    category: "Alimentación",
    date: "2025-06-15",
    paymentMethod: "tarjeta",
  },
  {
    id: "14",
    description: "Farmacia",
    amount: 12_800,
    category: "Salud",
    date: "2025-06-09",
    paymentMethod: "efectivo",
  },
  {
    id: "15",
    description: "Suscripción streaming",
    amount: 8_500,
    category: "Entretenimiento",
    date: "2025-06-01",
    paymentMethod: "tarjeta",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTHS = Array.from({ length: 12 }, (_, i) => i); // 0-11

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (iso: string): string => {
  const d = new Date(iso + "T00:00:00");
  return format(d, "dd MMM yyyy", { locale: es });
};

const paymentIcon = (method: PaymentMethod) => {
  switch (method) {
    case "efectivo":
      return "💵";
    case "tarjeta":
      return "💳";
    case "transferencia":
      return "🏦";
    default:
      return "📋";
  }
};

// ---------------------------------------------------------------------------
// Columna helper
// ---------------------------------------------------------------------------

const columnHelper = createColumnHelper<Expense>();

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

const AllExpenses = () => {
  // ---- Estado de filtros ----
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | "">("");
  const [searchText, setSearchText] = useState("");

  // ---- Estado de tabla ----
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 8,
  });

  // ---- Datos filtrados (local) ----
  const filteredData = useMemo(() => {
    let rows = DEMO_EXPENSES;

    // Categoría
    if (selectedCategory) {
      rows = rows.filter((e) => e.category === selectedCategory);
    }

    // Mes
    if (selectedMonth !== null) {
      rows = rows.filter((e) => {
        const d = new Date(e.date + "T00:00:00");
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
      });
    }

    // Año (solo si no hay mes seleccionado)
    if (selectedMonth === null) {
      rows = rows.filter((e) => {
        const d = new Date(e.date + "T00:00:00");
        return d.getFullYear() === selectedYear;
      });
    }

    // Método de pago
    if (selectedPayment) {
      rows = rows.filter((e) => e.paymentMethod === selectedPayment);
    }

    // Búsqueda por texto
    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim();
      rows = rows.filter(
        (e) =>
          e.description.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          e.notes?.toLowerCase().includes(q),
      );
    }

    return rows;
  }, [selectedCategory, selectedMonth, selectedYear, selectedPayment, searchText]);

  // ---- Columnas ----
  const columns = useMemo(
    () => [
      columnHelper.accessor("description", {
        header: "Descripción",
        cell: (info) => (
          <span className="font-medium text-slate-800 truncate block max-w-[200px]" title={info.getValue()}>
            {info.getValue()}
          </span>
        ),
        size: 200,
      }),
      columnHelper.accessor("amount", {
        header: "Importe",
        cell: (info) => (
          <span className="font-mono tabular-nums text-slate-800 font-medium">
            {formatCurrency(info.getValue())}
          </span>
        ),
        sortingFn: "basic",
        size: 130,
      }),
      columnHelper.accessor("category", {
        header: "Categoría",
        cell: (info) => (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-50 text-sky-700">
            <Tag size={12} />
            {info.getValue()}
          </span>
        ),
        size: 150,
      }),
      columnHelper.accessor("date", {
        header: "Fecha",
        cell: (info) => (
          <span className="text-slate-600 text-sm">{formatDate(info.getValue())}</span>
        ),
        sortingFn: "datetime",
        size: 130,
      }),
      columnHelper.accessor("paymentMethod", {
        header: "Pago",
        cell: (info) => {
          const method = info.getValue();
          const label = PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
          return (
            <span className="inline-flex items-center gap-1 text-sm text-slate-600">
              <span aria-hidden>{paymentIcon(method)}</span>
              {label}
            </span>
          );
        },
        size: 140,
      }),
    ],
    [],
  );

  // ---- Tabla ----
  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnFilters, pagination },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualFiltering: true, // ya filtramos nosotros
  });

  // ---- Totales ----
  const totalAmount = useMemo(
    () => filteredData.reduce((sum, e) => sum + e.amount, 0),
    [filteredData],
  );

  // ---- Limpiar filtros ----
  const hasFilters =
    selectedCategory || selectedMonth !== null || selectedPayment || searchText.trim();

  const clearFilters = useCallback(() => {
    setSelectedCategory("");
    setSelectedMonth(null);
    setSelectedYear(new Date().getFullYear());
    setSelectedPayment("");
    setSearchText("");
  }, []);

  // ---- Años disponibles ----
  const availableYears = useMemo(() => {
    const years = new Set(DEMO_EXPENSES.map((e) => new Date(e.date + "T00:00:00").getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 font-['Inter']">
          Todos los gastos
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Consultá, filtrá y ordená todos tus movimientos registrados.
        </p>
      </div>

      {/* Barra de filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
        {/* Fila 1: búsqueda + categoría + pago */}
        <div className="flex flex-wrap gap-3 items-end">
          {/* Búsqueda */}
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="search-expenses" className="block text-xs font-medium text-slate-500 mb-1">
              Buscar
            </label>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                id="search-expenses"
                type="text"
                placeholder="Descripción, categoría…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition"
              />
            </div>
          </div>

          {/* Categoría */}
          <div className="min-w-[160px]">
            <label htmlFor="filter-category" className="block text-xs font-medium text-slate-500 mb-1">
              Categoría
            </label>
            <select
              id="filter-category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition"
            >
              <option value="">Todas</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Método de pago */}
          <div className="min-w-[160px]">
            <label htmlFor="filter-payment" className="block text-xs font-medium text-slate-500 mb-1">
              Tipo de pago
            </label>
            <select
              id="filter-payment"
              value={selectedPayment}
              onChange={(e) => setSelectedPayment(e.target.value as PaymentMethod | "")}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition"
            >
              <option value="">Todos</option>
              {PAYMENT_METHODS.map((pm) => (
                <option key={pm.value} value={pm.value}>
                  {pm.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Fila 2: mes + año + limpiar */}
        <div className="flex flex-wrap gap-3 items-end">
          {/* Mes */}
          <div className="min-w-[160px]">
            <label htmlFor="filter-month" className="block text-xs font-medium text-slate-500 mb-1">
              Mes
            </label>
            <select
              id="filter-month"
              value={selectedMonth ?? ""}
              onChange={(e) =>
                setSelectedMonth(e.target.value === "" ? null : Number(e.target.value))
              }
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition"
            >
              <option value="">Todos</option>
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {format(new Date(2025, m, 1), "MMMM", { locale: es }).replace(
                    /^\w/,
                    (c) => c.toUpperCase(),
                  )}
                </option>
              ))}
            </select>
          </div>

          {/* Año */}
          <div className="min-w-[120px]">
            <label htmlFor="filter-year" className="block text-xs font-medium text-slate-500 mb-1">
              Año
            </label>
            <select
              id="filter-year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Limpiar filtros */}
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-sky-600 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition"
            >
              <X size={16} />
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tarjeta de total */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center">
            <Receipt size={20} className="text-sky-500" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Total de gastos visibles</p>
            <p className="text-2xl font-bold text-slate-800 font-['JetBrains_Mono'] tabular-nums">
              {formatCurrency(totalAmount)}
            </p>
          </div>
        </div>
        <div className="text-sm text-slate-400">
          {filteredData.length} {filteredData.length === 1 ? "gasto" : "gastos"}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Cabecera de tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-slate-200 bg-slate-50/50">
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const isSorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        style={{ width: header.getSize() }}
                        className={clsx(
                          "px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider select-none",
                          canSort && "cursor-pointer hover:text-slate-700 transition",
                        )}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      >
                        <span className="inline-flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && (
                            <span className="text-slate-400">
                              {isSorted === "asc" ? (
                                <ArrowUp size={14} />
                              ) : isSorted === "desc" ? (
                                <ArrowDown size={14} />
                              ) : (
                                <ArrowUpDown size={14} />
                              )}
                            </span>
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-16 text-center"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                        <Search size={24} className="text-slate-300" />
                      </div>
                      <p className="text-slate-500 font-medium">Sin resultados</p>
                      <p className="text-sm text-slate-400 max-w-xs">
                        No se encontraron gastos con los filtros aplicados. Probá ajustando los criterios de búsqueda.
                      </p>
                      {hasFilters && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-sky-600 bg-sky-50 hover:bg-sky-100 rounded-lg transition"
                        >
                          <X size={16} />
                          Limpiar filtros
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 hover:bg-slate-50/50 transition"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {filteredData.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 border-t border-slate-200 bg-slate-50/30">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>
                Página{" "}
                <span className="font-medium text-slate-700">
                  {table.getState().pagination.pageIndex + 1}
                </span>{" "}
                de{" "}
                <span className="font-medium text-slate-700">{table.getPageCount()}</span>
              </span>
              <span className="text-slate-300">|</span>
              <span>
                {filteredData.length} resultado{filteredData.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {/* Primera página */}
              <button
                type="button"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
                aria-label="Primera página"
              >
                <ChevronsLeft size={16} />
              </button>

              {/* Anterior */}
              <button
                type="button"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
                aria-label="Página anterior"
              >
                <ChevronLeft size={16} />
              </button>

              {/* Números de página */}
              <div className="hidden sm:flex items-center gap-1">
                {Array.from({ length: table.getPageCount() }, (_, i) => {
                  const pageIndex = i;
                  const isActive = pageIndex === table.getState().pagination.pageIndex;
                  // Mostrar solo un rango alrededor de la página actual
                  const current = table.getState().pagination.pageIndex;
                  if (
                    pageIndex !== 0 &&
                    pageIndex !== table.getPageCount() - 1 &&
                    Math.abs(pageIndex - current) > 2
                  ) {
                    // Elipsis
                    if (Math.abs(pageIndex - current) === 3) {
                      return (
                        <span key={pageIndex} className="px-1 text-slate-300 select-none">
                          …
                        </span>
                      );
                    }
                    return null;
                  }
                  return (
                    <button
                      key={pageIndex}
                      type="button"
                      onClick={() => table.setPageIndex(pageIndex)}
                      className={clsx(
                        "min-w-[36px] h-9 px-2 rounded-lg text-sm font-medium transition",
                        isActive
                          ? "bg-sky-500 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-200",
                      )}
                    >
                      {pageIndex + 1}
                    </button>
                  );
                })}
              </div>

              {/* Siguiente */}
              <button
                type="button"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
                aria-label="Página siguiente"
              >
                <ChevronRight size={16} />
              </button>

              {/* Última página */}
              <button
                type="button"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
                aria-label="Última página"
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AllExpenses;