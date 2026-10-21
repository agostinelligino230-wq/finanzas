// Bancos y billeteras que se leen solos: cómo se reconoce su mail, con qué dominios firman (DKIM)
// y qué app de Android publica sus notificaciones. Para sumar una entidad alcanza con agregarla acá:
// el celular baja la lista de paquetes del servidor, sin publicar otra versión de la app.
export type Entidad = {
  id: string;           // el mismo id de src/lib/providers.ts
  nombre: string;
  remitente?: RegExp;   // cómo se reconoce en el From (es lo que se usa desde antes)
  dominios: string[];   // dominios oficiales de mail (sirven para la firma DKIM y para filtrar)
  // Con true, un mail sin firma DKIM de esos dominios queda «dudoso». Con false (falta confirmar
  // los dominios con mails reales, prueba P2) sigue sumando como hasta hoy, sin sello.
  dkimConfirmado: boolean;
  paquetes: string[];   // apps oficiales de Android
};

export const ENTIDADES: Entidad[] = [
  { id: "uala", nombre: "Ualá", remitente: /uala/i, dominios: ["uala.com.ar"], dkimConfirmado: false, paquetes: ["ar.com.bancar.uala"] },
  { id: "mercadopago", nombre: "Mercado Pago", remitente: /mercado ?pago/i, dominios: ["mercadopago.com", "mercadopago.com.ar"], dkimConfirmado: false, paquetes: ["com.mercadopago.wallet"] },
  { id: "wallbit", nombre: "Wallbit", remitente: /wallbit/i, dominios: ["wallbit.io"], dkimConfirmado: false, paquetes: [] },
  { id: "nacion", nombre: "Banco Nación", remitente: /bna/i, dominios: ["bna.com.ar"], dkimConfirmado: false, paquetes: ["com.banconacion.bnamas"] },
  { id: "macro", nombre: "Banco Macro", remitente: /macro/i, dominios: ["macro.com.ar"], dkimConfirmado: false, paquetes: [] },
  // Galicia publicó sus únicos remitentes oficiales (cuenta @BancoGalicia en X, ago-2022). Falta ver con qué dominio firman (P2).
  { id: "galicia", nombre: "Galicia", remitente: /galicia/i, dominios: ["email.galicia.ar", "email.quiero.ar", "mkt.bancogalicia.com.ar", "bancogalicia.com.ar", "mensajesgalicia.com.ar", "mktins.galicia.ar"], dkimConfirmado: false, paquetes: ["com.mosync.app_Banco_Galicia"] },
  // Solo por notificación (lista argentina de Bluecoins + Naranja X). Falta el paquete de Macro y de Wallbit.
  { id: "naranjax", nombre: "Naranja X", dominios: [], dkimConfirmado: false, paquetes: ["com.tarjetanaranja.ncuenta"] },
  { id: "brubank", nombre: "Brubank", dominios: [], dkimConfirmado: false, paquetes: ["com.brubank"] },
  { id: "bbva", nombre: "BBVA", dominios: [], dkimConfirmado: false, paquetes: ["com.bbva.nxt_argentina"] },
  { id: "santander", nombre: "Santander", dominios: [], dkimConfirmado: false, paquetes: ["ar.com.santander.rio.mbanking"] },
  { id: "cuentadni", nombre: "Cuenta DNI", dominios: [], dkimConfirmado: false, paquetes: ["ar.com.bancoprovincia.CuentaDNI"] },
  { id: "patagonia", nombre: "Banco Patagonia", dominios: [], dkimConfirmado: false, paquetes: ["ar.com.bcopatagonia.android"] },
  { id: "openbank", nombre: "Openbank", dominios: [], dkimConfirmado: false, paquetes: ["ar.openbank.modelbank"] },
  { id: "hipotecario", nombre: "Hipotecario", dominios: [], dkimConfirmado: false, paquetes: ["com.hipotecario.mobile"] },
  { id: "lemon", nombre: "Lemon", dominios: [], dkimConfirmado: false, paquetes: ["com.applemoncash"] },
];

export const entidad = (id: string | null | undefined) => ENTIDADES.find((item) => item.id === id) ?? null;

export const entidadDePaquete = (paquete: string) => ENTIDADES.find((item) => item.paquetes.includes(paquete)) ?? null;

// Lista que baja el celular (GET /notificaciones). Subir la versión cuando cambie.
export const PAQUETES = { version: 1, paquetes: ENTIDADES.flatMap((item) => item.paquetes.map((paquete) => ({ paquete, proveedor: item.id }))) };

const dominioDe = (from: string) => (from.match(/@([\w.-]+)/)?.[1] ?? "").toLowerCase();
const esDe = (dominio: string, oficial: string) => dominio === oficial || dominio.endsWith("." + oficial);

// Entidad de un mail solo por el dominio del remitente (lo usa gmail-push para decidir si baja el cuerpo:
// un nombre parecido, como "Macro Shop", no alcanza para leer un mail que no es del banco).
export function entidadPorDominio(from: string, proveedores?: string[] | null) {
  const dominio = dominioDe(from);
  return ENTIDADES.find((item) => (!proveedores || proveedores.includes(item.id)) && item.dominios.some((oficial) => esDe(dominio, oficial))) ?? null;
}

// Entidad de un mail por el dominio del remitente o, como hasta hoy, por el nombre que aparece en el From.
export function entidadDeMail(from: string, proveedores?: string[] | null) {
  const lista = ENTIDADES.filter((item) => !proveedores || proveedores.includes(item.id));
  return entidadPorDominio(from, proveedores) ?? lista.find((item) => item.remitente?.test(from)) ?? null;
}
