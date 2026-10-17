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
