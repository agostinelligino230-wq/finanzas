// Lectores de mails: los mismos de siempre (misma regex, mismo id externo), ahora compartidos
// entre la lectura diaria (gmail) y la lectura al instante (gmail-push).
import type { Aviso, Lector, Lectura } from "./tipos.ts";
import { amount, isOwn, MONTHS, titleCase } from "./texto.ts";

// Una sola búsqueda en Gmail para todas las cuentas (Gmail cobra cada búsqueda) y después se separa por remitente y asunto.
export const BUSQUEDA = '{from:uala.com.ar from:mercadopago from:bna from:macro from:wallbit from:naranjax.com} {subject:"transferencia fue exitosa" subject:"Resumen tarjeta" subject:"Pago aprobado" subject:"Aviso de transferencia" subject:Recibiste subject:"una compra en tu tarjeta"}';
export const LEIDOS_POR_MAIL = ["uala", "mercadopago", "nacion", "macro", "wallbit", "naranjax"];

const de = (aviso: Aviso, from: RegExp, subject: RegExp) => from.test(aviso.remitente) && subject.test(aviso.titulo);

export const LECTORES_MAIL: Lector[] = [
  {
    proveedor: "uala", canal: "mail",
    reconoce: (aviso) => de(aviso, /uala/i, /transferencia fue exitosa/i),
    leer(aviso, ctx) {
      const value = aviso.texto.match(/Monto:?\s*\$\s*([\d.,]+)/i);
      const to = aviso.texto.match(/Destinatario:?\s+(.+?)\s+(CBU|CVU|Alias|Id\.)/i);
      const op = aviso.texto.match(/Id\.?\s*Op\.?:?\s*([\w-]+)/i);
      const name = to ? to[1].trim() : "";
      if (!value || !op) return null;
      if (isOwn(ctx.nombre, name)) return { descartar: "transferencia a vos mismo" };
      return { tipo: "gasto", monto: amount(value[1]), moneda: "ARS", descripcion: name ? "Transferencia a " + titleCase(name) : "Transferencia", categoria: "transferencias", opRef: op[1], idExterno: "uala:" + op[1] };
    },
  },
  {
    proveedor: "uala", canal: "mail",
    reconoce: (aviso) => de(aviso, /uala/i, /Resumen tarjeta/i),
    leer(aviso) {
      const due = aviso.texto.match(/vencimiento:?\s+(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóú]{3})[A-Za-zÁÉÍÓÚáéíóú]*\.?\s+(\d{4})/i);
      const pesos = aviso.texto.match(/Total en pesos:?\s*\$\s*([\d.,]+)/i);
      const usd = aviso.texto.match(/Total en d[oó]lares:?\s*(?:USD|US\$)\s*([\d.,]+)/i);
      const month = due ? MONTHS[due[2].toLowerCase()] : null;
      if (!due || !pesos || !month) return null;
      return { resumen: { provider: "uala", card: "Ualá", color: "#2F80ED", month: due[3] + "-" + month, due_date: due[3] + "-" + month + "-" + due[1].padStart(2, "0"), total: amount(pesos[1]), total_usd: usd ? amount(usd[1]) : 0 } };
    },
  },
  {
    proveedor: "mercadopago", canal: "mail",
    reconoce: (aviso) => de(aviso, /mercado ?pago/i, /Pago aprobado/i),
    leer(aviso) {
      const value = aviso.texto.match(/Pagaste:?\s*\$\s*([\d.,]+)/i);
      if (!value) return null;
      const shop = aviso.titulo.replace(/^.*Pago aprobado (en|a)\s*/i, "").trim();
      return { tipo: "gasto", monto: amount(value[1]), moneda: "ARS", descripcion: (shop || "Pago") + " (Mercado Pago)", categoria: "otro" };
    },
  },
  {
    proveedor: "nacion", canal: "mail",
    reconoce: (aviso) => de(aviso, /bna/i, /Aviso de transferencia/i),
    leer(aviso, ctx) {
      const data = aviso.texto.match(/transferencia a (.+?) por \$\s*([\d.,]+)/i);
      if (!data) return null;
      if (isOwn(ctx.nombre, data[1])) return { descartar: "transferencia a vos mismo" };
      return { tipo: "gasto", monto: amount(data[2]), moneda: "ARS", descripcion: "Transferencia a " + titleCase(data[1].trim()) + " (Nación)", categoria: "transferencias" };
    },
  },
  {
    proveedor: "macro", canal: "mail",
    reconoce: (aviso) => de(aviso, /macro/i, /Aviso de Transferencia/i),
    leer(aviso, ctx) {
      const data = aviso.texto.match(/transferencia al CBU\/CVU\/alias\s+(\S+)\s+por\s+\$\s*([\d.,]+)/i);
      if (!data) return null;
      if (isOwn(ctx.nombre, data[1])) return { descartar: "transferencia a vos mismo" };
      return { tipo: "gasto", monto: amount(data[2]), moneda: "ARS", descripcion: "Transferencia a " + data[1] + " (Macro)", categoria: "transferencias" };
    },
  },
  {
    // «Ingresó una compra en tu tarjeta crédito»: TU COMPRA $ 57.600,00 COMERCIO Titular - … Plan 06 cuotas en PESOS
    proveedor: "naranjax", canal: "mail",
    reconoce: (aviso) => de(aviso, /naranja/i, /una compra en tu tarjeta/i),
    leer(aviso) {
      const data = aviso.texto.match(/TU COMPRA\s*\$\s*([\d.]+,\d{2})\s+(.+?)\s+Titular\b/i);
      const plan = aviso.texto.match(/Plan\s+(.+?)\s+en\s+(PESOS|D[OÓ]LARES)\b/i);
      // Solo compras en pesos: todavía no hay muestras de una en dólares (queda «no reconocido»).
      if (!data || !plan || !/PESOS/i.test(plan[2])) return null;
      const cuotas = Number(plan[1].match(/^(\d+)\s*cuotas?/i)?.[1] ?? 1);
      const detalle = cuotas > 1 ? " en " + cuotas + " cuotas" : /ZETA|\bZ\b/i.test(plan[1]) ? " en Plan Z" : "";
      return { tipo: "gasto", monto: amount(data[1]), moneda: "ARS", descripcion: titleCase(data[2].trim()) + detalle + " (Naranja X)", categoria: "otro" };
    },
  },
  {
    proveedor: "wallbit", canal: "mail",
    reconoce: (aviso) => de(aviso, /wallbit/i, /Recibiste/i),
    leer(aviso): Lectura {
      // El monto viene en el mail o en el asunto ("Recibiste USD $691.55").
      const value = aviso.texto.match(/Monto:\s*USD\s*\$?\s*([\d.,]+)/i) ?? aviso.titulo.match(/Recibiste\s+US[D$]\s*\$?\s*([\d.,]+)/i);
      const origin = aviso.texto.match(/Origen:\s*(.+?)\s*(ID de operaci|$)/i);
      const op = aviso.texto.match(/ID de operaci[oó]n:\s*([\w-]+)/i);
      if (!value) return null;
      return { tipo: "ingreso", monto: Number(value[1].replace(/,/g, "")), moneda: "USD", descripcion: origin ? "Wallbit · " + titleCase(origin[1]) : "Wallbit", categoria: "otro", ...(op ? { opRef: op[1], idExterno: "wallbit:" + op[1] } : {}) };
    },
  },
];
