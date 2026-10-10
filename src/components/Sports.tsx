import { useState, useMemo } from "react";
import { Dumbbell, Plus, Trash2, TrendingUp, Wallet } from "lucide-react";
import { clsx } from "clsx";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface GastoDeporte {
  id: string;
  categoria: string;
  descripcion: string;
  monto: number;
  fecha: string; // ISO
}

type Filtro = "todos" | "gimnasio" | "clases" | "equipamiento" | "cuotas" | "otro";

// ─── Datos demo ──────────────────────────────────────────────────────────────

const GASTOS_DEMO: GastoDeporte[] = [
  {
    id: "1",
    categoria: "gimnasio",
    descripcion: "Membresía mensual SportClub",
    monto: 8500,
    fecha: "2025-03-01",
  },
  {
    id: "2",
    categoria: "clases",
    descripcion: "Clases de natación (4 sesiones)",
    monto: 6200,
    fecha: "2025-03-05",
  },
  {
    id: "3",
    categoria: "equipamiento",
    descripcion: "Zapatillas running Nike",
    monto: 45000,
    fecha: "2025-03-10",
  },
  {
    id: "4",
    categoria: "cuotas",
    descripcion: "Cuota torneo de pádel",
    monto: 3200,
    fecha: "2025-03-12",
  },
  {
    id: "5",
    categoria: "gimnasio",
    descripcion: "Suplementos proteína",
    monto: 12800,
    fecha: "2025-03-15",
  },
  {
    id: "6",
    categoria: "otro",
    descripcion: "Alquiler de bicicleta",
    monto: 1800,
    fecha: "2025-03-18",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generarId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatearARS(monto: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(monto);
}

function formatearFecha(iso: string): string {
  const fecha = new Date(iso + "T00:00:00");
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(fecha);
}

function obtenerMesActual(): string {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Etiquetas de categoría ──────────────────────────────────────────────────

const CATEGORIAS: { valor: Filtro; etiqueta: string; icono: React.ReactNode }[] = [
  { valor: "todos", etiqueta: "Todos", icono: null },
  { valor: "gimnasio", etiqueta: "Gimnasio", icono: <Dumbbell size={14} /> },
  { valor: "clases", etiqueta: "Clases", icono: <TrendingUp size={14} /> },
  { valor: "equipamiento", etiqueta: "Equipamiento", icono: <Wallet size={14} /> },
  { valor: "cuotas", etiqueta: "Cuotas", icono: <Wallet size={14} /> },
  { valor: "otro", etiqueta: "Otro", icono: null },
];

// ─── Componente ──────────────────────────────────────────────────────────────

const Sports = () => {
  const [gastos, setGastos] = useState<GastoDeporte[]>(GASTOS_DEMO);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  // Campos del formulario
  const [nuevaCategoria, setNuevaCategoria] = useState<string>("gimnasio");
  const [nuevaDescripcion, setNuevaDescripcion] = useState("");
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [nuevaFecha, setNuevaFecha] = useState(
    new Date().toISOString().slice(0, 10),
  );

  const mesActual = obtenerMesActual();

  // Filtrar gastos
  const gastosFiltrados = useMemo(() => {
    if (filtro === "todos") return gastos;
    return gastos.filter((g) => g.categoria === filtro);
  }, [gastos, filtro]);

  // Total del mes actual
  const totalMensual = useMemo(() => {
    return gastos
      .filter((g) => g.fecha.startsWith(mesActual))
      .reduce((acc, g) => acc + g.monto, 0);
  }, [gastos, mesActual]);

  // Agregar gasto
  const agregarGasto = () => {
    if (!nuevaDescripcion.trim() || !nuevoMonto || !nuevaFecha) return;

    const nuevo: GastoDeporte = {
      id: generarId(),
      categoria: nuevaCategoria,
      descripcion: nuevaDescripcion.trim(),
      monto: Number(nuevoMonto),
      fecha: nuevaFecha,
    };

    setGastos((prev) => [nuevo, ...prev]);
    setNuevaDescripcion("");
    setNuevoMonto("");
    setNuevaFecha(new Date().toISOString().slice(0, 10));
    setMostrarFormulario(false);
  };

  // Eliminar gasto
  const eliminarGasto = (id: string) => {
    setGastos((prev) => prev.filter((g) => g.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* ─── Encabezado ─────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[24px] font-bold leading-tight text-[#1E293B]">
            Deporte
          </h2>
          <p className="mt-1 text-[14px] text-slate-500">
            Gastos en deporte: gimnasio, clases, equipamiento, cuotas y más.
          </p>
        </div>

        {/* Total mensual */}
        <div className="flex items-center gap-3 rounded-xl bg-[#0EA5E9]/10 px-4 py-3">
          <Dumbbell size={20} className="text-[#0EA5E9]" />
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wide text-slate-500">
              Total del mes
            </p>
            <p className="text-[20px] font-bold text-[#1E293B] font-mono">
              {formatearARS(totalMensual)}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Filtros ────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIAS.map((cat) => (
          <button
            key={cat.valor}
            onClick={() => setFiltro(cat.valor)}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-medium transition-colors duration-200",
              filtro === cat.valor
                ? "bg-[#0EA5E9] text-white shadow-sm"
                : "bg-white text-[#1E293B] shadow-sm ring-1 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {cat.icono}
            {cat.etiqueta}
          </button>
        ))}
      </div>

      {/* ─── Botón agregar ──────────────────────────────── */}
      {!mostrarFormulario && (
        <button
          onClick={() => setMostrarFormulario(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0EA5E9] px-5 py-3 text-[14px] font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9] focus-visible:ring-offset-2"
        >
          <Plus size={18} />
          Agregar gasto
        </button>
      )}

      {/* ─── Formulario ─────────────────────────────────── */}
      {mostrarFormulario && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-[16px] font-semibold text-[#1E293B]">
            Nuevo gasto deportivo
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Categoría */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="cat-deporte"
                className="text-[14px] font-medium text-[#1E293B]"
              >
                Categoría
              </label>
              <select
                id="cat-deporte"
                value={nuevaCategoria}
                onChange={(e) => setNuevaCategoria(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
              >
                <option value="gimnasio">Gimnasio</option>
                <option value="clases">Clases</option>
                <option value="equipamiento">Equipamiento</option>
                <option value="cuotas">Cuotas</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            {/* Descripción */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="desc-deporte"
                className="text-[14px] font-medium text-[#1E293B]"
              >
                Descripción
              </label>
              <input
                id="desc-deporte"
                type="text"
                value={nuevaDescripcion}
                onChange={(e) => setNuevaDescripcion(e.target.value)}
                placeholder="Ej: Membresía mensual"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-[#1E293B] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
              />
            </div>

            {/* Monto */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="monto-deporte"
                className="text-[14px] font-medium text-[#1E293B]"
              >
                Monto (ARS)
              </label>
              <input
                id="monto-deporte"
                type="number"
                value={nuevoMonto}
                onChange={(e) => setNuevoMonto(e.target.value)}
                placeholder="0"
                min="0"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-[#1E293B] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
              />
            </div>

            {/* Fecha */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="fecha-deporte"
                className="text-[14px] font-medium text-[#1E293B]"
              >
                Fecha
              </label>
              <input
                id="fecha-deporte"
                type="date"
                value={nuevaFecha}
                onChange={(e) => setNuevaFecha(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[14px] text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]"
              />
            </div>
          </div>

          {/* Acciones del formulario */}
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={agregarGasto}
              disabled={
                !nuevaDescripcion.trim() || !nuevoMonto || Number(nuevoMonto) <= 0
              }
              className="inline-flex items-center gap-2 rounded-xl bg-[#0EA5E9] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0EA5E9] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={16} />
              Guardar gasto
            </button>
            <button
              onClick={() => setMostrarFormulario(false)}
              className="rounded-xl px-5 py-2.5 text-[14px] font-medium text-slate-600 transition-colors duration-200 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ─── Lista de gastos ────────────────────────────── */}
      {gastosFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <Dumbbell size={40} className="mb-4 text-slate-300" />
          <p className="text-[16px] font-medium text-[#1E293B]">
            Sin gastos registrados
          </p>
          <p className="mt-1 text-[14px] text-slate-500">
            {filtro === "todos"
              ? "Agregá tu primer gasto deportivo para empezar a hacer seguimiento."
              : "No hay gastos en esta categoría. Probá con otro filtro."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {gastosFiltrados.map((gasto) => (
            <div
              key={gasto.id}
              className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-5 py-4 shadow-sm transition-shadow duration-200 hover:shadow-md"
            >
              <div className="flex items-center gap-4 min-w-0">
                {/* Icono de categoría */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0EA5E9]/10">
                  <Dumbbell size={18} className="text-[#0EA5E9]" />
                </div>

                {/* Info */}
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-[#1E293B]">
                    {gasto.descripcion}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-[12px] text-slate-500">
                    <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-600">
                      {gasto.categoria}
                    </span>
                    <span>{formatearFecha(gasto.fecha)}</span>
                  </div>
                </div>
              </div>

              {/* Monto + eliminar */}
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-[16px] font-bold text-[#1E293B] font-mono tabular-nums">
                  {formatearARS(gasto.monto)}
                </span>
                <button
                  onClick={() => eliminarGasto(gasto.id)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                  aria-label={`Eliminar gasto: ${gasto.descripcion}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Resumen por categoría ──────────────────────── */}
      {gastos.length > 0 && (
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-[16px] font-semibold text-[#1E293B]">
            Resumen por categoría
          </h3>
          <div className="space-y-3">
            {(["gimnasio", "clases", "equipamiento", "cuotas", "otro"] as const).map(
              (cat) => {
                const totalCat = gastos
                  .filter((g) => g.categoria === cat && g.fecha.startsWith(mesActual))
                  .reduce((acc, g) => acc + g.monto, 0);

                if (totalCat === 0) return null;

                const porcentaje =
                  totalMensual > 0
                    ? Math.round((totalCat / totalMensual) * 100)
                    : 0;

                const etiqueta =
                  CATEGORIAS.find((c) => c.valor === cat)?.etiqueta ?? cat;

                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-[14px]">
                      <span className="font-medium capitalize text-[#1E293B]">
                        {etiqueta}
                      </span>
                      <span className="font-mono text-[14px] font-semibold text-[#1E293B] tabular-nums">
                        {formatearARS(totalCat)}
                      </span>
                    </div>
                    {/* Barra de progreso */}
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#0EA5E9] transition-all duration-500"
                        style={{ width: `${porcentaje}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-[12px] text-slate-400">
                      {porcentaje}% del total mensual
                    </p>
                  </div>
                );
              },
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Sports;