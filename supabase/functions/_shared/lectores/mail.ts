// Lectores de mails: los mismos de siempre (misma regex, mismo id externo), ahora compartidos
// entre la lectura diaria (gmail) y la lectura al instante (gmail-push).
import type { Aviso, Lector, Lectura } from "./tipos.ts";
import { amount, isOwn, MONTHS, titleCase } from "./texto.ts";
import { ENTIDADES } from "./entidades.ts";

// Dos búsquedas en Gmail para todas las cuentas (Gmail cobra cada búsqueda; los mails repetidos se bajan una vez):
// 1) los asuntos que leen los lectores de abajo (aunque Gmail los haya mandado a Promociones);
// 2) todo lo que llega de los dominios oficiales de cada entidad, menos Promociones y Social:
//    lo que ningún lector reconoce pasa por el genérico y la IA (si el banco lo firmó) y queda «para revisar».
const REGLAS = '{from:uala.com.ar from:mercadopago from:bna from:macro from:wallbit from:naranjax.com} {subject:"transferencia fue exitosa" subject:"Resumen tarjeta" subject:"Pago aprobado" subject:"Aviso de transferencia" subject:Recibiste subject:"una compra en tu tarjeta" subject:"transferencia fue enviada" subject:"Pagaste tu" subject:"Pagaste tus"}';
const DOMINIOS = [...new Set(ENTIDADES.flatMap((item) => item.dominios))];
const AMPLIA = "{" + DOMINIOS.map((dominio) => "from:" + dominio).join(" ") + "} -category:promotions -category:social";
export const BUSQUEDA = [REGLAS, AMPLIA];
export const LEIDOS_POR_MAIL = ENTIDADES.filter((item) => item.dominios.length).map((item) => item.id);

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
      const ref = aviso.texto.match(/(?:CBU|CVU|Alias):?\s+([\w.-]{6,})/i);
      if (!value || !op) return null;
      if (isOwn(ctx.nombre, name)) return { descartar: "transferencia a vos mismo" };
      return { tipo: "gasto", monto: amount(value[1]), moneda: "ARS", descripcion: name ? "Transferencia a " + titleCase(name) : "Transferencia", categoria: "transferencias", opRef: op[1], idExterno: "uala:" + op[1], contraparte: { nombre: name ? titleCase(name) : undefined, ref: ref?.[1] } };
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
    // La cuota de un crédito de Mercado Pago (muestra real del 15-oct): «Pagaste tu crédito» (o «Pagaste tus créditos»),
    // «Tomas, pagaste tu crédito y estás al día · Resumen de pago · Monto pagado $ 24.271,45 · Medio de pago Dinero en cuenta».
    // Sin este lector lo descartaba el genérico (el pie del mail habla de la contraseña).
    proveedor: "mercadopago", canal: "mail",
    reconoce: (aviso) => de(aviso, /mercado ?pago/i, /Pagaste tus? cr[eé]ditos?/i),
    leer(aviso) {
      const value = aviso.texto.match(/Monto pagado:?\s*\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/i);
      if (!value) return null;
      const several = /cr[eé]ditos/i.test(aviso.titulo);
      return { tipo: "gasto", monto: amount(value[1]), moneda: "ARS", descripcion: (several ? "Cuotas de tus créditos" : "Cuota de tu crédito") + " (Mercado Pago)", categoria: "otro" };
    },
  },
  {
    // Transferencia que mandaste desde Mercado Pago (muestra real): «Tu transferencia fue enviada»,
    // «Ya enviamos tu transferencia de $ 580.000 · Datos del beneficiario · Nombre y apellido: Apellido, Nombre ·
    // Entidad: <banco> · Número de cuenta: …». El nombre viene «Apellido, Nombre».
    proveedor: "mercadopago", canal: "mail",
    reconoce: (aviso) => de(aviso, /mercado ?pago/i, /transferencia fue enviada/i),
    leer(aviso, ctx) {
      const value = aviso.texto.match(/transferencia de\s*\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)/i);
      if (!value) return null;
      const to = aviso.texto.match(/Nombre y apellido:?\s*(.+?)\s+(?:Entidad|CUIT|CUIL|CVU|CBU|Alias|N[uú]mero de cuenta)\b/i);
      const raw = to ? to[1].trim() : "";
      if (raw && isOwn(ctx.nombre, raw)) return { descartar: "transferencia a vos mismo" };
      const name = raw.includes(",") ? raw.split(",").slice(1).join(" ").trim() + " " + raw.split(",")[0].trim() : raw;
      const ref = aviso.texto.match(/(?:CBU|CVU|Alias):?\s+([\w.-]{6,})/i);
      return { tipo: "gasto", monto: amount(value[1]), moneda: "ARS", descripcion: name ? "Transferencia a " + titleCase(name) : "Transferencia (Mercado Pago)", categoria: "transferencias", contraparte: { nombre: name ? titleCase(name) : undefined, ref: ref?.[1] } };
    },
  },
  {
    proveedor: "nacion", canal: "mail",
    reconoce: (aviso) => de(aviso, /bna/i, /Aviso de transferencia/i),
    leer(aviso, ctx) {
      const data = aviso.texto.match(/transferencia a (.+?) por \$\s*([\d.,]+)/i);
      if (!data) return null;
      if (isOwn(ctx.nombre, data[1])) return { descartar: "transferencia a vos mismo" };
      return { tipo: "gasto", monto: amount(data[2]), moneda: "ARS", descripcion: "Transferencia a " + titleCase(data[1].trim()) + " (Nación)", categoria: "transferencias", contraparte: { nombre: titleCase(data[1].trim()) } };
    },
  },
  {
    proveedor: "macro", canal: "mail",
    reconoce: (aviso) => de(aviso, /macro/i, /Aviso de Transferencia/i),
    leer(aviso, ctx) {
      const data = aviso.texto.match(/transferencia al CBU\/CVU\/alias\s+(\S+)\s+por\s+\$\s*([\d.,]+)/i);
      if (!data) return null;
      if (isOwn(ctx.nombre, data[1])) return { descartar: "transferencia a vos mismo" };
      return { tipo: "gasto", monto: amount(data[2]), moneda: "ARS", descripcion: "Transferencia a " + data[1] + " (Macro)", categoria: "transferencias", contraparte: { ref: data[1] } };
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
