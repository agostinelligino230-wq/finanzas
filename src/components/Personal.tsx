import { useState, useMemo } from "react";
import { Plus, Trash2, Dumbbell, CreditCard, Bus, ShoppingBag, Wifi, Smartphone, MoreHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/* ------------------------------------------------------------------ */
/*  Tipos                                                             */
/* ------------------------------------------------------------------ */

type Categoria = "gimnasio" | "suscripciones" | "transporte" | "compras" | "internet" | "celular" | "otro";

interface Gasto {
  id: string;
  descripcion: string;
  monto: number;
  categoria: Categoria;
  fecha: string; // ISO 8601
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const CATEGORIAS: { key: Categoria; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "gimnasio", label: "Gimnasio", icon: Dumbbell },
  { key: "suscripciones", label: "Suscripciones", icon: CreditCard },
  { key: "transporte", label: "Transporte", icon: Bus },
  { key: "compras", label: "Compras", icon: ShoppingBag },
  { key: "internet", label: "Internet", icon: Wifi },
  { key: "celular", label: "Celular", icon: Smartphone },
  { key: "otro", label: "Otro", icon: MoreHorizontal },
];

const generarId = (): string => crypto.randomUUID();

const formatearMoneda = (valor: number): string =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(valor);

const hoyISO = (): string => new Date().toISOString().slice(0, 10);

const mesActual = (): string => hoyISO().slice(0, 7); // "2025-07"

/* ------------------------------------------------------------------ */
/*  Datos demo                                                        */
/* ------------------------------------------------------------------ */

const DEMO_GASTOS: Gasto[] = [
  { id: "1", descripcion: "Gimnasio mensual", monto: 15000, categoria: "gimnasio", fecha: "2025-07-01" },
  { id: "2", descripcion: "Netflix", monto: 4200, categoria: "suscripciones", fecha: "2025-07-03" },
  { id: "3", descripcion: "Spotify", monto: 1200, categoria: "suscripciones", fecha: "2025-07-03" },
  { id: "4", descripcion: "Subte y colectivo", monto: 8500, categoria: "transporte", fecha: "2025-07-05" },
  { id: "5", descripcion: "Supermercado online", monto: 32000, categoria: "compras", fecha: "2025-07-07" },
  { id: "6", descripcion: "Fibra óptica 300MB", monto: 7800, categoria: "internet", fecha: "2025-07-02" },
  { id: "7", descripcion: "Abono celular", monto: 3500, categoria: "celular", fecha: "2025-07-02" },
];

/* ------------------------------------------------------------------ */
/*  Componente principal                                              */
/* ------------------------------------------------------------------ */

const Personal = () => {
  const [gastos, setGastos] = useState<Gasto[]>(DEMO_GASTOS);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  /* --- formulario --- */
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [categoria, setCategoria] = useState<Categoria>("otro");
  const [fecha, setFecha] = useState(hoyISO());

  /* --- filtro de mes --- */
  const mesFiltro = mesActual();

  const gastosFiltrados = useMemo(
    () => gastos.filter((g) => g.fecha.startsWith(mesFiltro)),
    [gastos, mesFiltro],
  );

  const totalMensual = useMemo(
    () => gastosFiltrados.reduce((acc, g) => acc + g.monto, 0),
    [gastosFiltrados],
  );

  /* --- agregar gasto --- */
  const agregarGasto = () => {
    const montoNum = Number(monto);
    if (!descripcion.trim() || isNaN(montoNum) || montoNum <= 0) return;

    const nuevo: Gasto = {
      id: generarId(),
      descripcion: descripcion.trim(),
      monto: montoNum,
      categoria,
      fecha,
    };

    setGastos((prev) => [nuevo, ...prev]);
    setDescripcion("");
    setMonto("");
    setCategoria("otro");
    setFecha(hoyISO());
    setMostrarFormulario(false);
  };

  /* --- eliminar gasto --- */
  const eliminarGasto = (id: string) => {
    setGastos((prev) => prev.filter((g) => g.id !== id));
  };

  /* --- agrupación por categoría --- */
  const agrupado = useMemo(() => {
    const mapa: Record<Categoria, Gasto[]> = {
      gimnasio: [],
      suscripciones: [],
      transporte: [],
      compras: [],
      internet: [],
      celular: [],
      otro: [],
    };
    gastosFiltrados.forEach((g) => mapa[g.categoria].push(g));
    return mapa;
  }, [gastosFiltrados]);

  /* --- variación mes a mes (simulada) --- */
  const variacion = useMemo(() => {
    const mesAnterior = gastos
      .filter((g) => g.fecha.startsWith("2025-06"))
      .reduce((acc, g) => acc + g.monto, 0);
    if (mesAnterior === 0) return null;
    return ((totalMensual - mesAnterior) / mesAnterior) * 100;
  }, [gastos, totalMensual]);

  /* ------------------------------------------------------------------ */
  /*  Render                                                            */
  /* ------------------------------------------------------------------ */

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800" style={{ fontFamily: "'Inter', sans-serif" }}>
            Gastos personales
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Gimnasio, suscripciones, transporte, compras, internet, celular y más.
          </p>
        </div>

        <button
          onClick={() => setMostrarFormulario(true)}
          className={clsx(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors",
            "bg-sky-500 hover:bg-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2",
          )}
        >
          <Plus className="h-4 w-4" />
          Agregar gasto
        </button>
      </div>

      {/* Tarjeta de total mensual */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Total del mes</p>
            <p
              className="mt-1 text-3xl font-bold text-slate-800"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {formatearMoneda(totalMensual)}
            </p>
          </div>
          {variacion !== null && (
            <div
              className={clsx(
                "flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold",
                variacion > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600",
              )}
            >
              {variacion > 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              {Math.abs(variacion).toFixed(1)}%
            </div>
          )}
        </div>

        {/* Barra de progreso por categoría */}
        <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-slate-100">
          {CATEGORIAS.map((cat) => {
            const subtotal = agrupado[cat.key].reduce((acc, g) => acc + g.monto, 0);
            const pct = totalMensual > 0 ? (subtotal / totalMensual) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={cat.key}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor:
                    cat.key === "gimnasio"
                      ? "#0EA5E9"
                      : cat.key === "suscripciones"
                        ? "#8B5CF6"
                        : cat.key === "transporte"
                          ? "#F59E0B"
                          : cat.key === "compras"
                            ? "#10B981"
                            : cat.key === "internet"
                              ? "#EF4444"
                              : cat.key === "celular"
                                ? "#EC4899"
                                : "#94A3B8",
                }}
                title={`${cat.label}: ${formatearMoneda(subtotal)}`}
              />
            );
          })}
        </div>

        {/* Leyenda de la barra */}
        <div className="mt-3 flex flex-wrap gap-3">
          {CATEGORIAS.map((cat) => {
            const subtotal = agrupado[cat.key].reduce((acc, g) => acc + g.monto, 0);
            if (subtotal === 0) return null;
            return (
              <div key={cat.key} className="flex items-center gap-1.5 text-xs text-slate-500">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor:
                      cat.key === "gimnasio"
                        ? "#0EA5E9"
                        : cat.key === "suscripciones"
                          ? "#8B5CF6"
                          : cat.key === "transporte"
                            ? "#F59E0B"
                            : cat.key === "compras"
                              ? "#10B981"
                              : cat.key === "internet"
                                ? "#EF4444"
                                : cat.key === "celular"
                                  ? "#EC4899"
                                  : "#94A3B8",
                  }}
                />
                {cat.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Secciones por categoría */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIAS.map((cat) => {
          const items = agrupado[cat.key];
          const Icono = cat.icon;
          const subtotal = items.reduce((acc, g) => acc + g.monto, 0);

          return (
            <div key={cat.key} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50">
                  <Icono className="h-5 w-5 text-sky-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-slate-800">
                    {cat.label}
                  </h3>
                  <p
                    className="text-sm font-medium text-slate-500"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {formatearMoneda(subtotal)}
                  </p>
                </div>
              </div>

              {/* Barra de progreso dentro de la tarjeta */}
              {totalMensual > 0 && (
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all"
                    style={{ width: `${Math.min((subtotal / totalMensual) * 100, 100)}%` }}
                  />
                </div>
              )}

              {/* Lista de gastos */}
              {items.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {items.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-slate-700">{g.descripcion}</p>
                        <p className="text-xs text-slate-400">{g.fecha}</p>
                      </div>
                      <div className="ml-3 flex items-center gap-2">
                        <span
                          className="text-sm font-semibold text-slate-800"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {formatearMoneda(g.monto)}
                        </span>
                        <button
                          onClick={() => eliminarGasto(g.id)}
                          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                          aria-label={`Eliminar ${g.descripcion}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-slate-400">Sin gastos este mes</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal / overlay del formulario */}
      {mostrarFormulario && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMostrarFormulario(false);
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-bold text-slate-800">Nuevo gasto</h3>

            <div className="mt-4 space-y-4">
              {/* Descripción */}
              <div>
                <label htmlFor="descripcion" className="block text-sm font-medium text-slate-700">
                  Descripción
                </label>
                <input
                  id="descripcion"
                  type="text"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej: Gimnasio mensual"
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                />
              </div>

              {/* Monto */}
              <div>
                <label htmlFor="monto" className="block text-sm font-medium text-slate-700">
                  Monto ($)
                </label>
                <input
                  id="monto"
                  type="number"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>

              {/* Categoría */}
              <div>
                <label htmlFor="categoria" className="block text-sm font-medium text-slate-700">
                  Categoría
                </label>
                <select
                  id="categoria"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value as Categoria)}
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fecha */}
              <div>
                <label htmlFor="fecha" className="block text-sm font-medium text-slate-700">
                  Fecha
                </label>
                <input
                  id="fecha"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                />
              </div>
            </div>

            {/* Acciones */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setMostrarFormulario(false)}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Cancelar
              </button>
              <button
                onClick={agregarGasto}
                disabled={!descripcion.trim() || !monto || Number(monto) <= 0}
                className={clsx(
                  "flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors",
                  "bg-sky-500 hover:bg-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Personal;