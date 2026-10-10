import { useState, useMemo } from "react";
import {
  Plus,
  Trash2,
  UtensilsCrossed,
  Wine,
  Music,
  Film,
  Gamepad2,
  Coffee,
  ShoppingBag,
  PartyPopper,
  ChevronDown,
  CalendarDays,
} from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import { es } from "date-fns/locale";

/* ------------------------------------------------------------------ */
/*  Tipos                                                             */
/* ------------------------------------------------------------------ */

type CategoriaSalida =
  | "restaurante"
  | "bar"
  | "entretenimiento"
  | "cine"
  | "juegos"
  | "cafeteria"
  | "compras"
  | "fiesta"
  | "otro";

interface Salida {
  id: string;
  descripcion: string;
  monto: number;
  categoria: CategoriaSalida;
  fecha: string; // ISO 8601
}

/* ------------------------------------------------------------------ */
/*  Catálogo de categorías                                            */
/* ------------------------------------------------------------------ */

const CATEGORIAS: {
  key: CategoriaSalida;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "restaurante", label: "Restaurante", icon: UtensilsCrossed },
  { key: "bar", label: "Bar", icon: Wine },
  { key: "entretenimiento", label: "Entretenimiento", icon: Music },
  { key: "cine", label: "Cine", icon: Film },
  { key: "juegos", label: "Juegos", icon: Gamepad2 },
  { key: "cafeteria", label: "Cafetería", icon: Coffee },
  { key: "compras", label: "Compras", icon: ShoppingBag },
  { key: "fiesta", label: "Fiesta", icon: PartyPopper },
  { key: "otro", label: "Otro", icon: ChevronDown },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function generarId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatearMonto(monto: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(monto);
}

function obtenerMesActual(): string {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/*  Datos demo                                                        */
/* ------------------------------------------------------------------ */

const SALIDAS_DEMO: Salida[] = [
  {
    id: "1",
    descripcion: "Cena en La Tagliatella",
    monto: 47.5,
    categoria: "restaurante",
    fecha: "2025-06-10",
  },
  {
    id: "2",
    descripcion: "Copas en O'Connell",
    monto: 32.0,
    categoria: "bar",
    fecha: "2025-06-08",
  },
  {
    id: "3",
    descripcion: "Entradas concierto",
    monto: 65.0,
    categoria: "entretenimiento",
    fecha: "2025-06-05",
  },
  {
    id: "4",
    descripcion: "Cine + palomitas",
    monto: 18.9,
    categoria: "cine",
    fecha: "2025-06-03",
  },
  {
    id: "5",
    descripcion: "Bolera con amigos",
    monto: 22.0,
    categoria: "juegos",
    fecha: "2025-06-01",
  },
];

/* ------------------------------------------------------------------ */
/*  Componente principal                                               */
/* ------------------------------------------------------------------ */

export default function Outings() {
  const [salidas, setSalidas] = useState<Salida[]>(SALIDAS_DEMO);
  const [mesSeleccionado, setMesSeleccionado] = useState<string>(obtenerMesActual());

  /* ---- Filtrado por mes ---- */
  const salidasFiltradas = useMemo(() => {
    const [anioSel, mesSel] = mesSeleccionado.split("-");
    return salidas.filter((s) => {
      const [anio, mes] = s.fecha.split("-");
      return anio === anioSel && mes === mesSel;
    });
  }, [salidas, mesSeleccionado]);

  /* ---- Total mensual ---- */
  const totalMensual = useMemo(
    () => salidasFiltradas.reduce((acc, s) => acc + s.monto, 0),
    [salidasFiltradas],
  );

  /* ---- Formulario nueva salida ---- */
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nuevaDescripcion, setNuevaDescripcion] = useState("");
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [nuevaCategoria, setNuevaCategoria] = useState<CategoriaSalida>("restaurante");
  const [nuevaFecha, setNuevaFecha] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );

  function agregarSalida(e: React.FormEvent) {
    e.preventDefault();

    const monto = parseFloat(nuevoMonto);
    if (!nuevaDescripcion.trim() || isNaN(monto) || monto <= 0) return;

    const nueva: Salida = {
      id: generarId(),
      descripcion: nuevaDescripcion.trim(),
      monto,
      categoria: nuevaCategoria,
      fecha: nuevaFecha,
    };

    setSalidas((prev) => [nueva, ...prev]);
    setNuevaDescripcion("");
    setNuevoMonto("");
    setNuevaCategoria("restaurante");
    setNuevaFecha(format(new Date(), "yyyy-MM-dd"));
    setMostrarFormulario(false);
  }

  function eliminarSalida(id: string) {
    setSalidas((prev) => prev.filter((s) => s.id !== id));
  }

  /* ---- Meses disponibles para el selector ---- */
  const mesesDisponibles = useMemo(() => {
    const meses = new Set(salidas.map((s) => s.fecha.slice(0, 7)));
    if (!meses.has(mesSeleccionado)) meses.add(mesSeleccionado);
    return Array.from(meses).sort().reverse();
  }, [salidas, mesSeleccionado]);

  /* ---- Render ---- */
  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 font-['Inter']">
            Salidas
          </h2>
          <p className="mt-1 text-sm text-slate-500 font-['Inter']">
            Gastos en restaurantes, bares, entretenimiento y más
          </p>
        </div>

        <button
          type="button"
          onClick={() => setMostrarFormulario((v) => !v)}
          className={clsx(
            "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold font-['Inter'] transition-colors duration-200",
            "bg-sky-500 text-white hover:bg-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2",
          )}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nueva salida
        </button>
      </div>

      {/* Selector de mes + total */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <select
            value={mesSeleccionado}
            onChange={(e) => setMesSeleccionado(e.target.value)}
            className="appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 pr-8 text-sm font-medium text-slate-700 font-['Inter'] focus:outline-none focus:ring-2 focus:ring-sky-400"
            aria-label="Seleccionar mes"
          >
            {mesesDisponibles.map((m) => {
              const [anio, mes] = m.split("-");
              const fecha = new Date(Number(anio), Number(mes) - 1, 1);
              const etiqueta = format(fecha, "MMMM yyyy", { locale: es });
              return (
                <option key={m} value={m}>
                  {etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)}
                </option>
              );
            })}
          </select>
        </div>

        {/* Total mensual */}
        <div className="rounded-xl bg-white px-5 py-3 shadow-sm border border-slate-100">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 font-['Inter']">
            Total del mes
          </p>
          <p className="mt-0.5 text-2xl font-bold text-slate-800 font-['JetBrains_Mono',_monospace] tabular-nums">
            {formatearMonto(totalMensual)}
          </p>
        </div>
      </div>

      {/* Formulario nueva salida */}
      {mostrarFormulario && (
        <form
          onSubmit={agregarSalida}
          className="rounded-xl bg-white p-5 shadow-sm border border-slate-100 space-y-4"
        >
          <h3 className="text-base font-semibold text-slate-800 font-['Inter']">
            Registrar nueva salida
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Descripción */}
            <div className="space-y-1.5">
              <label
                htmlFor="descripcion-salida"
                className="block text-sm font-medium text-slate-600 font-['Inter']"
              >
                Descripción
              </label>
              <input
                id="descripcion-salida"
                type="text"
                value={nuevaDescripcion}
                onChange={(e) => setNuevaDescripcion(e.target.value)}
                placeholder="Ej. Cena en el centro"
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 font-['Inter'] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>

            {/* Monto */}
            <div className="space-y-1.5">
              <label
                htmlFor="monto-salida"
                className="block text-sm font-medium text-slate-600 font-['Inter']"
              >
                Monto (€)
              </label>
              <input
                id="monto-salida"
                type="number"
                step="0.01"
                min="0.01"
                value={nuevoMonto}
                onChange={(e) => setNuevoMonto(e.target.value)}
                placeholder="0,00"
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 font-['JetBrains_Mono',_monospace] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>

            {/* Categoría */}
            <div className="space-y-1.5">
              <label
                htmlFor="categoria-salida"
                className="block text-sm font-medium text-slate-600 font-['Inter']"
              >
                Categoría
              </label>
              <select
                id="categoria-salida"
                value={nuevaCategoria}
                onChange={(e) =>
                  setNuevaCategoria(e.target.value as CategoriaSalida)
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 font-['Inter'] focus:outline-none focus:ring-2 focus:ring-sky-400"
              >
                {CATEGORIAS.map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Fecha */}
            <div className="space-y-1.5">
              <label
                htmlFor="fecha-salida"
                className="block text-sm font-medium text-slate-600 font-['Inter']"
              >
                Fecha
              </label>
              <input
                id="fecha-salida"
                type="date"
                value={nuevaFecha}
                onChange={(e) => setNuevaFecha(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 font-['Inter'] focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white font-['Inter'] hover:bg-sky-600 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Agregar
            </button>
            <button
              type="button"
              onClick={() => setMostrarFormulario(false)}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 font-['Inter'] hover:text-slate-700 hover:bg-slate-100 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Lista de salidas */}
      {salidasFiltradas.length === 0 ? (
        <div className="rounded-xl bg-white px-6 py-12 shadow-sm border border-slate-100 text-center">
          <UtensilsCrossed
            className="mx-auto h-10 w-10 text-slate-300"
            aria-hidden="true"
          />
          <p className="mt-4 text-sm font-medium text-slate-500 font-['Inter']">
            No hay salidas registradas este mes
          </p>
          <p className="mt-1 text-sm text-slate-400 font-['Inter']">
            Agrega tu primera salida para empezar a hacer seguimiento de tus
            gastos.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {salidasFiltradas.map((salida) => {
            const cat = CATEGORIAS.find((c) => c.key === salida.categoria);
            const Icono = cat?.icon ?? ChevronDown;

            return (
              <li
                key={salida.id}
                className="flex items-center gap-4 rounded-xl bg-white px-5 py-4 shadow-sm border border-slate-100 transition-shadow hover:shadow-md"
              >
                {/* Icono de categoría */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-500">
                  <Icono className="h-5 w-5" aria-hidden="true" />
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800 font-['Inter']">
                    {salida.descripcion}
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-400 font-['Inter']">
                    <span>{cat?.label ?? "Otro"}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={salida.fecha}>
                      {format(new Date(salida.fecha + "T00:00:00"), "d MMM yyyy", {
                        locale: es,
                      })}
                    </time>
                  </p>
                </div>

                {/* Monto */}
                <p className="shrink-0 text-sm font-semibold text-slate-800 font-['JetBrains_Mono',_monospace] tabular-nums">
                  {formatearMonto(salida.monto)}
                </p>

                {/* Eliminar */}
                <button
                  type="button"
                  onClick={() => eliminarSalida(salida.id)}
                  className="shrink-0 rounded-lg p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                  aria-label={`Eliminar ${salida.descripcion}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Resumen por categoría */}
      {salidasFiltradas.length > 0 && (
        <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 font-['Inter'] mb-4">
            Desglose por categoría
          </h3>
          <div className="space-y-3">
            {CATEGORIAS.map((cat) => {
              const totalCat = salidasFiltradas
                .filter((s) => s.categoria === cat.key)
                .reduce((acc, s) => acc + s.monto, 0);

              if (totalCat === 0) return null;

              const porcentaje =
                totalMensual > 0 ? (totalCat / totalMensual) * 100 : 0;
              const Icono = cat.icon;

              return (
                <div key={cat.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2 text-slate-600 font-['Inter']">
                      <Icono className="h-3.5 w-3.5 text-sky-500" aria-hidden="true" />
                      {cat.label}
                    </span>
                    <span className="text-sm font-semibold text-slate-800 font-['JetBrains_Mono',_monospace] tabular-nums">
                      {formatearMonto(totalCat)}
                    </span>
                  </div>
                  {/* Barra de progreso */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-sky-500 transition-all duration-300"
                      style={{ width: `${Math.min(porcentaje, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}