// Lector de respaldo para avisos de entidades de la lista que ningún lector propio reconoce
// (por ejemplo, un banco del que todavía no hay muestras). Lo que lee entra siempre «dudoso»:
// suma recién cuando la persona lo confirma. Si no está seguro, no lee nada.
import type { Aviso, Lectura } from "./tipos.ts";
import { amount } from "./texto.ts";

// "$" suelto o "AR$"/"ARS" (no el de "US$" ni "U$S").
const PESOS = /(?:AR\$|ARS|(?<![A-Za-z])\$)\s?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i;
const DOLARES = /(?:US\$|USD|U\$S|u\$d)\s?\$?\s?(\d[\d.,]*)/i;
const INGRESO = /\b(recibiste|te (?:transfiri[oó]|envi[oó]|pag[oó]|lleg[oó])|te acreditamos|acreditamos|ingres[oó] (?:plata|dinero)|cobraste)\b/i;
const GASTO = /\b(pagaste|compraste|transferiste|enviaste|consumo|compra (?:aprobada|realizada)|realizaste (?:una |un )?(?:compra|transferencia|pago)|debitamos|extrajiste)\b/i;
// Avisos de que salió un resumen («Resumen de Cuenta VISA» de Galicia, «El detalle mensual de tu cuenta está listo»):
// traen montos (total, mínimo) pero no son un movimiento. Los resúmenes de tarjeta se leen aparte, del PDF.
const NO_ES = /\b(promo|promoci[oó]n|descuento|beneficio|sin inter[eé]s|tu resumen|resumen de (?:cuenta|tarjeta)|detalle mensual|record[aá]|c[oó]digo de (?:seguridad|verificaci[oó]n)|tu clave|contrase[nñ]a|iniciaste sesi[oó]n|nuevo dispositivo|rechazad[ao]|no se pudo|cancelad[ao]|pendiente)\b/i;

// "1,234.56" o "1.234,56" o "15,99" → número.
function dollars(text: string) {
  const clean = text.replace(/[.,]$/, "");
  const comma = clean.lastIndexOf(",");
  const dot = clean.lastIndexOf(".");
  if (comma > dot) return Number(clean.replace(/\./g, "").replace(",", "."));
  return Number(clean.replace(/,/g, ""));
}

export function leerGenerico(aviso: Aviso, nombreEntidad: string): Lectura {
  const texto = (aviso.titulo + " · " + aviso.texto).replace(/\s+/g, " ");
  if (NO_ES.test(texto)) return { descartar: "no parece un movimiento" };
  const ingreso = INGRESO.test(texto);
  const gasto = GASTO.test(texto);
  if (ingreso === gasto) return null;
  const usd = texto.match(DOLARES);
  const ars = texto.match(PESOS);
  const moneda = usd && !ars ? "USD" : "ARS";
  const monto = moneda === "USD" ? dollars(usd![1]) : ars ? amount(ars[1]) : NaN;
  if (!Number.isFinite(monto) || monto <= 0) return null;
  const detalle = (aviso.titulo || aviso.texto).trim().slice(0, 70);
  return { tipo: ingreso ? "ingreso" : "gasto", monto, moneda, descripcion: detalle + " (" + nombreEntidad + ")", categoria: /transfer/i.test(texto) && gasto ? "transferencias" : "otro" };
}
