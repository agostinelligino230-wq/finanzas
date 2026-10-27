// Importar movimientos en la web: el archivo se lee en el navegador (la planilla no sale de la compu)
// y se guardan solo las filas que confirmás. Importar dos veces el mismo archivo no duplica nada.
import { supabase } from "./supabase";
import { getDollarRateOn } from "../../shared/dollar";
import { categoriaDe, claveExterna, type Celda, type Importado } from "../../shared/importar";

// Excel (.xlsx, .xls) o CSV. Se usa la hoja con más filas (algunos bancos ponen una carátula antes).
export async function leerArchivo(file: File): Promise<Celda[][]> {
  const XLSX = await import("xlsx");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const csv = /\.(csv|txt)$/i.test(file.name) || file.type === "text/csv";
  const book = csv ? XLSX.read(decodeText(bytes), { type: "string", raw: true }) : XLSX.read(bytes, { type: "array", raw: true, cellDates: false });
  const sheets = book.SheetNames.map((name) => XLSX.utils.sheet_to_json<Celda[]>(book.Sheets[name], { header: 1, raw: true, defval: null }));
  return sheets.sort((a, b) => b.length - a.length)[0] ?? [];
}

// Los CSV de los bancos vienen en UTF-8 o en Windows-1252 (el de Excel en español): si no es UTF-8 válido, es el otro.
function decodeText(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// Los dólares pasan a pesos con la cotización del día de cada movimiento. Devuelve cuántos entraron de verdad
// (los que ya se habían importado antes se saltean solos).
export async function importar(userId: string, proveedor: string, items: Importado[]): Promise<{ importados: number; error?: string }> {
  if (!supabase) return { importados: 0, error: "Falta configurar Supabase." };
  const rows = [];
  for (const item of items) {
    const usd = item.moneda === "USD";
    const rate = usd ? await getDollarRateOn(item.dia) : null;
    if (usd && !rate) return { importados: 0, error: "No pudimos traer la cotización del dólar. Probá en un rato." };
    rows.push({
      user_id: userId, description: item.descripcion.slice(0, 120), amount: usd ? Math.round(item.monto * rate! * 100) / 100 : item.monto,
      category: categoriaDe(item), movement_type: item.tipo, movement_date: item.dia, paid: true,
      currency: item.moneda, original_amount: usd ? item.monto : null, exchange_rate: rate,
      source: proveedor, external_id: claveExterna(proveedor, item), op_ref: item.operacion,
      created_at: new Date(item.dia + "T" + (item.hora ?? "12:00") + ":00-03:00").toISOString(),
    });
  }
  let importados = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await supabase.from("movements").upsert(rows.slice(i, i + 200), { onConflict: "user_id,external_id", ignoreDuplicates: true }).select("id");
    if (error) return { importados, error: "No se pudo terminar de importar. Lo que entró queda; probá de nuevo con el mismo archivo." };
    importados += data?.length ?? 0;
  }
  return { importados };
}
