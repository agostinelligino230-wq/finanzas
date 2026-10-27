// Cotización del dólar para sugerir al cargar movimientos en US$.
// Se usa el dólar cripto (el más parecido a billeteras como Wallbit) y, si no responde, el MEP.
// Siempre es una sugerencia: el usuario puede escribir la cotización que le muestra su billetera.

export type DollarQuote = { buy: number; sell: number; source: string; updatedAt: string };

let cached: { at: number; quote: DollarQuote } | null = null;

async function load(kind: "cripto" | "bolsa"): Promise<DollarQuote | null> {
  try {
    const response = await fetch("https://dolarapi.com/v1/dolares/" + kind);
    if (!response.ok) return null;
    const data = (await response.json()) as { compra?: number; venta?: number; fechaActualizacion?: string };
    if (!data.compra || !data.venta) return null;
    return { buy: Number(data.compra), sell: Number(data.venta), source: kind === "cripto" ? "dólar cripto" : "dólar MEP", updatedAt: data.fechaActualizacion ?? "" };
  } catch {
    return null;
  }
}

export async function getDollarQuote(): Promise<DollarQuote | null> {
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.quote;
  const quote = (await load("cripto")) ?? (await load("bolsa"));
  if (quote) cached = { at: Date.now(), quote };
  return quote;
}

// Cotización (compra) de un día ("2026-10-05"), del historial de ArgentinaDatos: para pasar a pesos lo que entró en dólares
// ese día. Si ese día no tiene (fin de semana o feriado), la del día hábil anterior; si no responde, la de hoy.
const history = new Map<string, Promise<number | null>>();

export function getDollarRateOn(day: string): Promise<number | null> {
  let rate = history.get(day);
  if (!rate) history.set(day, rate = loadRateOn(day));
  return rate;
}

async function loadRateOn(day: string) {
  const start = new Date(day + "T12:00:00Z").getTime();
  for (let back = 0; back < 5; back++) {
    const date = new Date(start - back * 86400000).toISOString().slice(0, 10).replace(/-/g, "/");
    for (const kind of ["cripto", "bolsa"]) {
      try {
        const response = await fetch("https://api.argentinadatos.com/v1/cotizaciones/dolares/" + kind + "/" + date);
        const data = response.ok ? ((await response.json()) as { compra?: number }) : null;
        if (data?.compra) return Number(data.compra);
      } catch { /* probar el siguiente */ }
    }
  }
  return (await getDollarQuote())?.buy ?? null;
}
