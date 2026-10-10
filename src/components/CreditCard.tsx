import { useState, useMemo } from "react";
import {
  CreditCard as CreditCardIcon,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Wallet,
} from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/* -------------------------------------------------------------------------- */
/*  Tipos internos                                                            */
/* -------------------------------------------------------------------------- */

interface Cuota {
  /** Número de cuota (1‑based) */
  numero: number;
  /** Total de cuotas del plan */
  totalCuotas: number;
  /** Monto de esta cuota en pesos */
  monto: number;
  /** Fecha de vencimiento ISO (YYYY‑MM‑DD) */
  vencimiento: string;
  /** Estado de la cuota */
  estado: "pendiente" | "pagada" | "vencida";
  /** Concepto / descripción de la compra */
  concepto: string;
}

interface Tarjeta {
  /** Nombre del banco o emisor */
  emisor: string;
  /** Últimos 4 dígitos de la tarjeta */
  ultimosDigitos: string;
  /** Marca: visa, mastercard, amex */
  marca: "visa" | "mastercard" | "amex";
  /** Límite de crédito total */
  limiteCredito: number;
  /** Saldo utilizado hasta hoy */
  saldoUtilizado: number;
  /** Fecha de cierre próxima (ISO) */
  fechaCierre: string;
  /** Fecha de vencimiento próxima (ISO) */
  fechaVencimiento: string;
  /** Cuotas registradas */
  cuotas: Cuota[];
}

/* -------------------------------------------------------------------------- */
/*  Datos de demostración (reemplazar con datos reales al conectar backend)   */
/* -------------------------------------------------------------------------- */

const TARJETA_DEMO: Tarjeta = {
  emisor: "Banco Santander",
  ultimosDigitos: "4589",
  marca: "visa",
  limiteCredito: 500000,
  saldoUtilizado: 187350,
  fechaCierre: "2025-07-05",
  fechaVencimiento: "2025-07-15",
  cuotas: [
    {
      numero: 1,
      totalCuotas: 6,
      monto: 12500,
      vencimiento: "2025-07-15",
      estado: "pendiente",
      concepto: "Notebook Lenovo ThinkPad",
    },
    {
      numero: 2,
      totalCuotas: 6,
      monto: 12500,
      vencimiento: "2025-08-15",
      estado: "pendiente",
      concepto: "Notebook Lenovo ThinkPad",
    },
    {
      numero: 3,
      totalCuotas: 6,
      monto: 12500,
      vencimiento: "2025-09-15",
      estado: "pendiente",
      concepto: "Notebook Lenovo ThinkPad",
    },
    {
      numero: 1,
      totalCuotas: 3,
      monto: 8400,
      vencimiento: "2025-06-20",
      estado: "vencida",
      concepto: "Suscripción anual Adobe CC",
    },
    {
      numero: 2,
      totalCuotas: 3,
      monto: 8400,
      vencimiento: "2025-07-20",
      estado: "pendiente",
      concepto: "Suscripción anual Adobe CC",
    },
    {
      numero: 3,
      totalCuotas: 3,
      monto: 8400,
      vencimiento: "2025-08-20",
      estado: "pendiente",
      concepto: "Suscripción anual Adobe CC",
    },
    {
      numero: 1,
      totalCuotas: 1,
      monto: 22350,
      vencimiento: "2025-06-10",
      estado: "pagada",
      concepto: "Supermercado Jumbo",
    },
    {
      numero: 1,
      totalCuotas: 12,
      monto: 9800,
      vencimiento: "2025-07-01",
      estado: "pendiente",
      concepto: "iPhone 15 Pro",
    },
    {
      numero: 2,
      totalCuotas: 12,
      monto: 9800,
      vencimiento: "2025-08-01",
      estado: "pendiente",
      concepto: "iPhone 15 Pro",
    },
    {
      numero: 3,
      totalCuotas: 12,
      monto: 9800,
      vencimiento: "2025-09-01",
      estado: "pendiente",
      concepto: "iPhone 15 Pro",
    },
    {
      numero: 4,
      totalCuotas: 12,
      monto: 9800,
      vencimiento: "2025-10-01",
      estado: "pendiente",
      concepto: "iPhone 15 Pro",
    },
    {
      numero: 5,
      totalCuotas: 12,
      monto: 9800,
      vencimiento: "2025-11-01",
      estado: "pendiente",
      concepto: "iPhone 15 Pro",
    },
    {
      numero: 6,
      totalCuotas: 12,
      monto: 9800,
      vencimiento: "2025-12-01",
      estado: "pendiente",
      concepto: "iPhone 15 Pro",
    },
  ],
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const cn = (...inputs: (string | undefined | false | null)[]) =>
  twMerge(clsx(inputs));

function formatearPesos(monto: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(monto);
}

function formatearFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Agrupa cuotas por concepto y devuelve totales por plan */
function agruparPlanes(cuotas: Cuota[]) {
  const mapa = new Map<
    string,
    { concepto: string; totalCuotas: number; cuotas: Cuota[]; totalPlan: number }
  >();

  for (const c of cuotas) {
    const clave = `${c.concepto}::${c.totalCuotas}`;
    const existente = mapa.get(clave);
    if (existente) {
      existente.cuotas.push(c);
      existente.totalPlan += c.monto;
    } else {
      mapa.set(clave, {
        concepto: c.concepto,
        totalCuotas: c.totalCuotas,
        cuotas: [c],
        totalPlan: c.monto,
      });
    }
  }

  return Array.from(mapa.values());
}

function calcularTotales(cuotas: Cuota[]) {
  let pendiente = 0;
  let vencido = 0;
  let pagado = 0;

  for (const c of cuotas) {
    if (c.estado === "pendiente") pendiente += c.monto;
    else if (c.estado === "vencida") vencido += c.monto;
    else if (c.estado === "pagada") pagado += c.monto;
  }

  return { pendiente, vencido, pagado };
}

/* -------------------------------------------------------------------------- */
/*  Sub‑componentes                                                           */
/* -------------------------------------------------------------------------- */

function MarcaTarjeta({ marca }: { marca: Tarjeta["marca"] }) {
  const colores: Record<Tarjeta["marca"], string> = {
    visa: "bg-[#1A1F71] text-white",
    mastercard: "bg-[#EB001B] text-white",
    amex: "bg-[#2E77BC] text-white",
  };

  const etiquetas: Record<Tarjeta["marca"], string> = {
    visa: "VISA",
    mastercard: "MC",
    amex: "AMEX",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wider",
        colores[marca],
      )}
    >
      {etiquetas[marca]}
    </span>
  );
}

function BarraProgreso({ valor, maximo }: { valor: number; maximo: number }) {
  const pct = Math.min((valor / maximo) * 100, 100);
  const esAlto = pct > 80;

  return (
    <div className="h-2 w-full rounded-full bg-slate-200">
      <div
        className={cn(
          "h-2 rounded-full transition-all duration-300",
          esAlto ? "bg-rose-500" : "bg-sky-500",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function EstadoCuota({ estado }: { estado: Cuota["estado"] }) {
  if (estado === "pagada") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
        <CheckCircle2 size={14} />
        Pagada
      </span>
    );
  }

  if (estado === "vencida") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600">
        <AlertCircle size={14} />
        Vencida
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
      <Clock size={14} />
      Pendiente
    </span>
  );
}

function PlanCuotas({
  plan,
  inicialmenteExpandido,
}: {
  plan: ReturnType<typeof agruparPlanes>[number];
  inicialmenteExpandido: boolean;
}) {
  const [expandido, setExpandido] = useState(inicialmenteExpandido);

  const pendientes = plan.cuotas.filter((c) => c.estado !== "pagada").length;
  const pagadas = plan.cuotas.filter((c) => c.estado === "pagada").length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {/* Encabezado del plan */}
      <button
        type="button"
        onClick={() => setExpandido((p) => !p)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors rounded-t-lg"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">
            {plan.concepto}
          </p>
          <p className="text-xs text-slate-500">
            {plan.totalCuotas} cuota{plan.totalCuotas > 1 ? "s" : ""} de{" "}
            {formatearPesos(plan.cuotas[0]?.monto ?? 0)} —{" "}
            {pagadas} pagada{pagadas !== 1 ? "s" : ""},{" "}
            {pendientes} pendiente{pendientes !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold text-slate-800 tabular-nums">
            {formatearPesos(plan.totalPlan)}
          </span>
          {expandido ? (
            <ChevronUp size={18} className="text-slate-400" />
          ) : (
            <ChevronDown size={18} className="text-slate-400" />
          )}
        </div>
      </button>

      {/* Detalle de cuotas */}
      {expandido && (
        <div className="border-t border-slate-100 px-4 py-2">
          <div className="divide-y divide-slate-50">
            {plan.cuotas.map((cuota) => (
              <div
                key={`${plan.concepto}-${cuota.numero}`}
                className="flex items-center justify-between py-2.5"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold tabular-nums text-slate-600">
                    {cuota.numero}
                  </span>
                  <div>
                    <p className="text-sm text-slate-700">
                      Cuota {cuota.numero} de {cuota.totalCuotas}
                    </p>
                    <p className="text-xs text-slate-400">
                      Vence {formatearFecha(cuota.vencimiento)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium tabular-nums text-slate-700">
                    {formatearPesos(cuota.monto)}
                  </span>
                  <EstadoCuota estado={cuota.estado} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Componente principal                                                      */
/* -------------------------------------------------------------------------- */

function CreditCard() {
  const tarjeta = TARJETA_DEMO;

  const totales = useMemo(() => calcularTotales(tarjeta.cuotas), [tarjeta.cuotas]);
  const planes = useMemo(() => agruparPlanes(tarjeta.cuotas), [tarjeta.cuotas]);

  const pctUtilizado = (tarjeta.saldoUtilizado / tarjeta.limiteCredito) * 100;
  const disponible = tarjeta.limiteCredito - tarjeta.saldoUtilizado;

  return (
    <div className="space-y-6 font-['Inter',sans-serif]">
      {/* ── Tarjeta visual ── */}
      <div className="rounded-xl bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 p-6 text-white shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              {tarjeta.emisor}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <CreditCardIcon size={20} className="text-sky-400" />
              <span className="text-lg font-semibold tracking-wide">
                •••• {tarjeta.ultimosDigitos}
              </span>
            </div>
          </div>
          <MarcaTarjeta marca={tarjeta.marca} />
        </div>

        {/* Límite y disponible */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Saldo utilizado</span>
            <span className="font-semibold tabular-nums">
              {formatearPesos(tarjeta.saldoUtilizado)}
            </span>
          </div>
          <div className="mt-2">
            <BarraProgreso
              valor={tarjeta.saldoUtilizado}
              maximo={tarjeta.limiteCredito}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>
              Límite: {formatearPesos(tarjeta.limiteCredito)}
            </span>
            <span
              className={cn(
                "font-medium",
                pctUtilizado > 80 ? "text-rose-400" : "text-emerald-400",
              )}
            >
              Disponible: {formatearPesos(disponible)}
            </span>
          </div>
        </div>

        {/* Fechas clave */}
        <div className="mt-5 flex gap-6 border-t border-slate-600/50 pt-4">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-slate-400" />
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500">
                Cierre
              </p>
              <p className="text-sm font-medium tabular-nums">
                {formatearFecha(tarjeta.fechaCierre)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-slate-400" />
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500">
                Vencimiento
              </p>
              <p className="text-sm font-medium tabular-nums">
                {formatearFecha(tarjeta.fechaVencimiento)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Resumen de totales ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
              <Clock size={16} className="text-amber-600" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Pendiente
            </span>
          </div>
          <p className="mt-3 text-xl font-bold tabular-nums text-slate-800">
            {formatearPesos(totales.pendiente)}
          </p>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100">
              <AlertCircle size={16} className="text-rose-600" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Vencido
            </span>
          </div>
          <p className="mt-3 text-xl font-bold tabular-nums text-rose-600">
            {formatearPesos(totales.vencido)}
          </p>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
              <CheckCircle2 size={16} className="text-emerald-600" />
            </div>
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Pagado
            </span>
          </div>
          <p className="mt-3 text-xl font-bold tabular-nums text-slate-800">
            {formatearPesos(totales.pagado)}
          </p>
        </div>
      </div>

      {/* ── Total pendiente general ── */}
      <div className="flex items-center justify-between rounded-xl bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100">
            <Wallet size={20} className="text-sky-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">
              Total pendiente de pago
            </p>
            <p className="text-xs text-slate-400">
              Suma de cuotas pendientes + vencidas
            </p>
          </div>
        </div>
        <p className="text-2xl font-bold tabular-nums text-slate-800">
          {formatearPesos(totales.pendiente + totales.vencido)}
        </p>
      </div>

      {/* ── Detalle de planes de cuotas ── */}
      <div>
        <h2 className="mb-4 text-lg font-bold text-slate-800">
          Planes de cuotas
        </h2>

        {planes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-white px-6 py-12 shadow-sm">
            <DollarSign size={40} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-500">
              No hay cuotas registradas
            </p>
            <p className="text-xs text-slate-400">
              Las compras en cuotas aparecerán aquí cuando las registres.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {planes.map((plan, idx) => (
              <PlanCuotas
                key={`${plan.concepto}-${plan.totalCuotas}`}
                plan={plan}
                inicialmenteExpandido={idx === 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CreditCard;