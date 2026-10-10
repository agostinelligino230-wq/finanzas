import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  ArrowRight,
  Utensils,
  ShoppingBag,
  Home as House,
  Bus,
  Dumbbell,
  MoreHorizontal,
} from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cn = (...inputs: (string | undefined | false | null)[]) =>
  twMerge(clsx(inputs));

// ---------------------------------------------------------------------------
// Tipos locales
// ---------------------------------------------------------------------------

interface Gasto {
  id: string;
  descripcion: string;
  categoria: Categoria;
  monto: number;
  fecha: string; // ISO
}

type Categoria =
  | "Alimentación"
  | "Compras"
  | "Vivienda"
  | "Transporte"
  | "Entretenimiento"
  | "Otros";

interface ResumenCategoria {
  categoria: Categoria;
  total: number;
  porcentaje: number;
}

// ---------------------------------------------------------------------------
// Datos demo (mientras no haya backend)
// ---------------------------------------------------------------------------

const CATEGORIA_ICON: Record<Categoria, React.FC<{ className?: string }>> = {
  Alimentación: Utensils,
  Compras: ShoppingBag,
  Vivienda: House,
  Transporte: Bus,
  Entretenimiento: Dumbbell,
  Otros: MoreHorizontal,
};

const CATEGORIA_COLOR: Record<Categoria, string> = {
  Alimentación: "#c9b7a6",
  Compras: "#b9a7d8",
  Vivienda: "#d4bd91",
  Transporte: "#a8c4b8",
  Entretenimiento: "#c9a6ad",
  Otros: "#918b88",
};

const GASTOS_DEMO: Gasto[] = [
  {
    id: "1",
    descripcion: "Supermercado semanal",
    categoria: "Alimentación",
    monto: 85_400,
    fecha: "2025-06-15",
  },
  {
    id: "2",
    descripcion: "Zapatillas running",
    categoria: "Compras",
    monto: 62_000,
    fecha: "2025-06-14",
  },
  {
    id: "3",
    descripcion: "Alquiler junio",
    categoria: "Vivienda",
    monto: 380_000,
    fecha: "2025-06-01",
  },
  {
    id: "4",
    descripcion: "Carga nafta",
    categoria: "Transporte",
    monto: 28_500,
    fecha: "2025-06-13",
  },
  {
    id: "5",
    descripcion: "Cine + pochoclos",
    categoria: "Entretenimiento",
    monto: 9_200,
    fecha: "2025-06-12",
  },
  {
    id: "6",
    descripcion: "Pedido Rappi",
    categoria: "Alimentación",
    monto: 14_300,
    fecha: "2025-06-11",
  },
  {
    id: "7",
    descripcion: "Remerón algodón",
    categoria: "Compras",
    monto: 23_000,
    fecha: "2025-06-10",
  },
  {
    id: "8",
    descripcion: "Expensas",
    categoria: "Vivienda",
    monto: 45_000,
    fecha: "2025-06-05",
  },
  {
    id: "9",
    descripcion: "Subte + bondi",
    categoria: "Transporte",
    monto: 8_400,
    fecha: "2025-06-09",
  },
  {
    id: "10",
    descripcion: "Suscripción streaming",
    categoria: "Entretenimiento",
    monto: 6_500,
    fecha: "2025-06-03",
  },
];

// ---------------------------------------------------------------------------
// Formateo de moneda (ARS como ejemplo; adaptable)
// ---------------------------------------------------------------------------

const formatearMoneda = (valor: number): string =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor);

const formatearFecha = (iso: string): string => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

/** Tarjeta de resumen de una categoría con barra de progreso */
const TarjetaCategoria = ({
  resumen,
  totalMes,
}: {
  resumen: ResumenCategoria;
  totalMes: number;
}) => {
  const Icono = CATEGORIA_ICON[resumen.categoria];
  const pct = totalMes > 0 ? Math.round((resumen.total / totalMes) * 100) : 0;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${CATEGORIA_COLOR[resumen.categoria]}18` }}
      >
        <Icono
          className="h-5 w-5"
          style={{ color: CATEGORIA_COLOR[resumen.categoria] }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-slate-800">
            {resumen.categoria}
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
            {formatearMoneda(resumen.total)}
          </span>
        </div>

        {/* Barra de progreso */}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(pct, 100)}%`,
              backgroundColor: CATEGORIA_COLOR[resumen.categoria],
            }}
          />
        </div>

        <p className="mt-1 text-xs tabular-nums text-slate-400">{pct}% del total</p>
      </div>
    </div>
  );
};

/** Fila individual de la lista de últimos gastos */
const FilaGasto = ({ gasto }: { gasto: Gasto }) => {
  const Icono = CATEGORIA_ICON[gasto.categoria];

  return (
    <li className="flex items-center gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${CATEGORIA_COLOR[gasto.categoria]}14` }}
      >
        <Icono
          className="h-4 w-4"
          style={{ color: CATEGORIA_COLOR[gasto.categoria] }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">
          {gasto.descripcion}
        </p>
        <p className="text-xs text-slate-400">
          {gasto.categoria} · {formatearFecha(gasto.fecha)}
        </p>
      </div>

      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
        {formatearMoneda(gasto.monto)}
      </span>
    </li>
  );
};

/** Tooltip personalizado para el gráfico de torta */
const TooltipPie = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { porcentaje: number } }[];
}) => {
  if (!active || !payload || payload.length === 0) return null;

  const dato = payload[0];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-slate-500">{dato.name}</p>
      <p className="text-sm font-bold tabular-nums text-slate-800">
        {formatearMoneda(dato.value)}
      </p>
      <p className="text-xs tabular-nums text-slate-400">
        {dato.payload.porcentaje}% del total
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

const Dashboard = () => {
  const [gastos] = useState<Gasto[]>(GASTOS_DEMO);

  // -----------------------------------------------------------------------
  // Cálculos derivados
  // -----------------------------------------------------------------------

  const totalMes = useMemo(
    () => gastos.reduce((acc, g) => acc + g.monto, 0),
    [gastos],
  );

  const resumenPorCategoria = useMemo<ResumenCategoria[]>(() => {
    const mapa = new Map<Categoria, number>();

    for (const g of gastos) {
      mapa.set(g.categoria, (mapa.get(g.categoria) ?? 0) + g.monto);
    }

    const resultado: ResumenCategoria[] = [];
    for (const [categoria, total] of mapa) {
      resultado.push({
        categoria,
        total,
        porcentaje: totalMes > 0 ? Math.round((total / totalMes) * 100) : 0,
      });
    }

    // Ordenar de mayor a menor
    resultado.sort((a, b) => b.total - a.total);
    return resultado;
  }, [gastos, totalMes]);

  const ultimos5 = useMemo(() => gastos.slice(-5).reverse(), [gastos]);

  // Comparativa mes anterior (simulada)
  const mesAnterior = 612_000; // valor fijo demo
  const variacion =
    mesAnterior > 0 ? ((totalMes - mesAnterior) / mesAnterior) * 100 : 0;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6 text-stone-100">
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Resumen de tus gastos del mes
        </p>
      </div>

      {/* Tarjetas de total y variación */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Total del mes */}
        <div className="flex items-center gap-4 rounded-xl bg-white p-5 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-50">
            <Wallet className="h-6 w-6 text-sky-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-slate-500">Total del mes</p>
            <p className="text-2xl font-bold tabular-nums text-slate-800">
              {formatearMoneda(totalMes)}
            </p>
          </div>
        </div>

        {/* Variación vs mes anterior */}
        <div className="flex items-center gap-4 rounded-xl bg-white p-5 shadow-sm">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
              variacion >= 0 ? "bg-red-50" : "bg-emerald-50",
            )}
          >
            {variacion >= 0 ? (
              <TrendingUp className="h-6 w-6 text-red-500" />
            ) : (
              <TrendingDown className="h-6 w-6 text-emerald-500" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-slate-500">vs. mes anterior</p>
            <p
              className={cn(
                "text-2xl font-bold tabular-nums",
                variacion >= 0 ? "text-red-500" : "text-emerald-500",
              )}
            >
              {variacion >= 0 ? "+" : ""}
              {Math.round(variacion)}%
            </p>
          </div>
        </div>
      </div>

      {/* Gráfico de torta + Resumen por categoría */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Gráfico */}
        <div className="rounded-xl bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-slate-800">
            Distribución por categoría
          </h2>

          {resumenPorCategoria.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">
              Sin datos para mostrar
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={resumenPorCategoria}
                  dataKey="total"
                  nameKey="categoria"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={55}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {resumenPorCategoria.map((r) => (
                    <Cell
                      key={r.categoria}
                      fill={CATEGORIA_COLOR[r.categoria]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<TooltipPie />} />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  formatter={(value: Categoria) => (
                    <span className="text-xs text-slate-600">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Lista de categorías con barras */}
        <div className="space-y-3 lg:col-span-3">
          <h2 className="text-base font-semibold text-slate-800">
            Gastos por categoría
          </h2>

          {resumenPorCategoria.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-xl bg-white text-sm text-slate-400 shadow-sm">
              Sin gastos registrados este mes
            </div>
          ) : (
            resumenPorCategoria.map((r) => (
              <TarjetaCategoria key={r.categoria} resumen={r} totalMes={totalMes} />
            ))
          )}
        </div>
      </div>

      {/* Últimos 5 gastos */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-sky-500" />
            <h2 className="text-base font-semibold text-slate-800">
              Últimos gastos
            </h2>
          </div>

          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm font-medium text-sky-500 transition-colors hover:text-sky-600"
          >
            Ver todos
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {ultimos5.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">
            Aún no hay gastos registrados. ¡Agregá el primero!
          </div>
        ) : (
          <ul className="space-y-3">
            {ultimos5.map((g) => (
              <FilaGasto key={g.id} gasto={g} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Dashboard;