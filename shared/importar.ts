// Importar movimientos del archivo que baja cada banco o billetera (Excel o CSV): Galicia, Mercado Pago, Wallbit…
// Lógica pura que comparten la web y la app: encontrar la fila de títulos, saber qué columna es cada cosa,
// leer cada fila y marcar lo que ya está cargado o parece un pase entre tus cuentas. No guarda nada.
import type { Currency, Movement, MovementType } from "./movimientos";

export type Celda = string | number | boolean | Date | null | undefined;
export type Columna = "fecha" | "detalle" | "monto" | "debito" | "credito" | "tipo" | "moneda" | "operacion";
export type Columnas = Partial<Record<Columna, number>>;

export const NOMBRES_COLUMNAS: Record<Columna, string> = {
  fecha: "Fecha", detalle: "Detalle", monto: "Monto (con signo)", debito: "Débito o salida", credito: "Crédito o entrada",
  tipo: "Tipo (ingreso o egreso)", moneda: "Moneda", operacion: "N.º de operación",
};

// Cómo suele llamarse cada columna en los archivos de los bancos. Se prueban en este orden: la primera que coincide gana.
const TITULOS: [Columna, RegExp][] = [
  ["fecha", /^(fecha|date|d[ií]a)\b/i],
  ["operacion", /(n[uú]mero|nro|n[°º.])\s*(de\s*)?(operaci[oó]n|comprobante|transacci[oó]n)|^(operaci[oó]n|comprobante|id( de)? (operaci[oó]n|transacci[oó]n)|transaction id|reference id)$/i],
  ["debito", /d[eé]bito|egreso|salida|retiro|withdrawal|debit/i],
  ["credito", /cr[eé]dito|ingreso|entrada|dep[oó]sito|deposit|credit/i],
  ["monto", /^(monto|importe|valor|amount|total)\b|neto/i],
  ["tipo", /^(tipo|tipo de (movimiento|operaci[oó]n)|type)$/i],
  ["moneda", /^(moneda|divisa|currency)$/i],
  ["detalle", /descripci[oó]n|detalle|concepto|motivo|movimiento|referencia|description|details|leyenda/i],
];
const NO_ES_COLUMNA = /saldo|balance/i;

const texto = (value: Celda) => (value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value)).replace(/\s+/g, " ").trim();

// Qué columna es cada cosa según los títulos de una fila.
function columnasDe(fila: Celda[]): Columnas {
  const columnas: Columnas = {};
  fila.forEach((celda, index) => {
    const titulo = texto(celda);
    if (!titulo || titulo.length > 60 || NO_ES_COLUMNA.test(titulo)) return;
    const match = TITULOS.find(([columna, re]) => columnas[columna] === undefined && re.test(titulo));
    if (match) columnas[match[0]] = index;
  });
  return columnas;
}

const sirve = (columnas: Columnas) => columnas.fecha !== undefined && (columnas.monto !== undefined || columnas.debito !== undefined || columnas.credito !== undefined);

// La fila de títulos es la primera (de las 40 de arriba) que tiene fecha y algún monto. Los bancos suelen poner antes
// el nombre del titular, el número de cuenta o el período.
export function detectarColumnas(filas: Celda[][]): { header: number; columnas: Columnas } | null {
  for (let i = 0; i < Math.min(filas.length, 40); i++) {
    const columnas = columnasDe(filas[i] ?? []);
    if (sirve(columnas)) return { header: i, columnas };
  }
  return null;
}

// "1.234,56", "-1.234,56", "$ 1.234,56", "1,234.56", "(1.234,56)", 1234.56 → el número con su signo (null si no es un monto).
export function importe(value: Celda): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let text = value.replace(/\s|AR\$|ARS|USD|U\$S|US\$|\$/gi, "");
  if (!text) return null;
  const negativo = /^-|^\(.*\)$|-$/.test(text);
  text = text.replace(/^[(+-]+|[)+-]+$/g, "");
  if (!/^\d[\d.,]*$/.test(text)) return null;
  const coma = text.lastIndexOf(",");
  const punto = text.lastIndexOf(".");
  let numero: number;
  if (coma > punto) numero = Number(text.replace(/\./g, "").replace(",", "."));
  else if (coma >= 0) numero = Number(text.replace(/,/g, ""));
  else if (/^\d{1,3}(\.\d{3})+$/.test(text)) numero = Number(text.replace(/\./g, "")); // "1.234.567": miles
  else numero = Number(text);
  if (!Number.isFinite(numero)) return null;
  return negativo ? -numero : numero;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => (y >= 2000 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? y + "-" + pad(m) + "-" + pad(d) : null);

// "05/10/2026", "5/10/26", "05-10-2026 13:11", "2026-10-05", "2026-10-05T13:11:00", un Date o el número de fecha de Excel
// → { dia: "2026-10-05", hora: "13:11" | null }.
export function fecha(value: Celda): { dia: string; hora: string | null } | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : { dia: iso(value.getFullYear(), value.getMonth() + 1, value.getDate())!, hora: null };
  if (typeof value === "number") {
    if (value < 30000 || value > 80000) return null;
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000));
    const dia = iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    const hora = value % 1 ? pad(date.getUTCHours()) + ":" + pad(date.getUTCMinutes()) : null;
    return dia ? { dia, hora } : null;
  }
  const text = texto(value);
  const hora = text.match(/(?:^|\D)(\d{1,2}):(\d{2})/);
  const conHora = hora ? pad(Number(hora[1])) + ":" + hora[2] : null;
  const ymd = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) { const dia = iso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3])); return dia ? { dia, hora: conHora } : null; }
  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (!dmy) return null;
  const year = Number(dmy[3]) < 100 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
  const dia = iso(year, Number(dmy[2]), Number(dmy[1]));
  return dia ? { dia, hora: conHora } : null;
}

export type Importado = {
  fila: number; dia: string; hora: string | null; descripcion: string; monto: number; tipo: MovementType; moneda: Currency;
  operacion: string | null; clave: string;
};

const EGRESO = /egreso|d[eé]bito|salida|retiro|pago|enviad|compra|debit|withdraw|out/i;

// Cada fila con fecha y monto → un movimiento. La clave identifica la fila: si el mismo archivo se sube dos veces,
// no se duplica (dos filas iguales del mismo día se distinguen por el orden).
export function leerFilas(filas: Celda[][], header: number, columnas: Columnas): Importado[] {
  const vistos = new Map<string, number>();
  const result: Importado[] = [];
  for (let i = header + 1; i < filas.length; i++) {
    const fila = filas[i] ?? [];
    const cuando = columnas.fecha !== undefined ? fecha(fila[columnas.fecha]) : null;
    if (!cuando) continue;
    let valor: number | null = null;
    if (columnas.monto !== undefined) valor = importe(fila[columnas.monto]);
    if (valor === null && (columnas.debito !== undefined || columnas.credito !== undefined)) {
      const debito = columnas.debito !== undefined ? Math.abs(importe(fila[columnas.debito]) ?? 0) : 0;
      const credito = columnas.credito !== undefined ? Math.abs(importe(fila[columnas.credito]) ?? 0) : 0;
      valor = credito - debito;
    }
    if (valor === null || valor === 0) continue;
    // Montos sin signo con una columna «Tipo» (ingreso / egreso).
    const tipoTexto = columnas.tipo !== undefined ? texto(fila[columnas.tipo]) : "";
    if (valor > 0 && tipoTexto && EGRESO.test(tipoTexto)) valor = -valor;
    const monedaTexto = columnas.moneda !== undefined ? texto(fila[columnas.moneda]) : "";
    const moneda: Currency = /usd|u\$s|us\$|d[oó]lar/i.test(monedaTexto) ? "USD" : "ARS";
    const descripcion = (columnas.detalle !== undefined ? texto(fila[columnas.detalle]) : "") || "Movimiento";
    const operacion = columnas.operacion !== undefined ? texto(fila[columnas.operacion]) || null : null;
    const tipo: MovementType = valor < 0 ? "gasto" : "ingreso";
    const monto = Math.round(Math.abs(valor) * 100) / 100;
    const base = [cuando.dia, tipo, monto.toFixed(2), moneda, operacion ?? descripcion.toLowerCase()].join("|");
    const vez = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, vez);
    result.push({ fila: i, dia: cuando.dia, hora: cuando.hora, descripcion, monto, tipo, moneda, operacion, clave: hash(base + "|" + vez) });
  }
  return result;
}

// FNV-1a de 53 bits en base 36: corto, estable y sin dependencias.
function hash(text: string) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return ((h1 >>> 0) * 2 ** 21 + ((h2 >>> 0) & 0x1fffff)).toString(36);
}

export const claveExterna = (proveedor: string, item: Importado) => "import:" + proveedor + ":" + item.clave;

export type Estado = "nuevo" | "cargado" | "propia";

// Ya cargado: un movimiento de la misma cuenta (o cargado a mano) del mismo tipo y monto, con un día de diferencia como mucho.
// Pase entre tus cuentas: el detalle tiene tu nombre y apellido, o lo dice («entre tus cuentas», «a cuenta propia»).
export function estadoDe(item: Importado, proveedor: string, existentes: Movement[], nombre: string | null): Estado {
  const dia = new Date(item.dia + "T12:00:00").getTime();
  const cargado = existentes.some((movement) => {
    if (movement.type !== item.tipo || (movement.source !== proveedor && movement.source !== null)) return false;
    const monto = item.moneda === "USD" ? movement.original : movement.amount;
    if (monto === null || Math.abs(monto - item.monto) > 0.009) return false;
    return Math.abs(new Date(movement.date + "T12:00:00").getTime() - dia) <= 86400000;
  });
  if (cargado) return "cargado";
  return esPropia(item.descripcion, nombre) ? "propia" : "nuevo";
}

function esPropia(descripcion: string, nombre: string | null) {
  if (/entre (tus|mis) cuentas|cuenta propia|a mi cuenta|transferencia propia/i.test(descripcion)) return true;
  const palabras = (nombre ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter((palabra) => palabra.length > 2);
  if (palabras.length < 2) return false;
  const limpio = descripcion.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return limpio.includes(palabras[0]) && limpio.includes(palabras[palabras.length - 1]);
}

export const categoriaDe = (item: Importado) => (item.tipo === "gasto" && /transfer/i.test(item.descripcion) ? "transferencias" : "otro");
