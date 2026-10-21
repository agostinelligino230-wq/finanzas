// Bancos, billeteras y tarjetas que se pueden agregar.
// "auto" dice qué se trae solo leyendo los mails de esa cuenta (si no tiene, se carga a mano).

export type ProviderKind = "billetera" | "banco" | "tarjeta";
// "domain" es la web oficial: de ahí se muestra su ícono (si no carga, se ven las iniciales).
export type Provider = { id: string; name: string; kind: ProviderKind; color: string; domain?: string; auto?: string };

export const PROVIDERS: Provider[] = [
  { id: "uala", name: "Ualá", kind: "billetera", color: "#2F80ED", domain: "uala.com.ar", auto: "Transferencias que hacés y el resumen de la tarjeta" },
  { id: "mercadopago", name: "Mercado Pago", kind: "billetera", color: "#169C8C", domain: "mercadopago.com.ar", auto: "Pagos aprobados" },
  { id: "wallbit", name: "Wallbit", kind: "billetera", color: "#3D4A63", domain: "wallbit.io", auto: "Dólares que recibís (como ingreso en US$)" },
  { id: "naranjax", name: "Naranja X", kind: "billetera", color: "#F08C2E", domain: "naranjax.com", auto: "Compras con tu tarjeta de crédito" },
  { id: "brubank", name: "Brubank", kind: "billetera", color: "#5B6CF0", domain: "brubank.com" },
  { id: "lemon", name: "Lemon", kind: "billetera", color: "#3BB273", domain: "lemon.me" },
  { id: "belo", name: "Belo", kind: "billetera", color: "#5B6CF0", domain: "belo.app" },
  { id: "personalpay", name: "Personal Pay", kind: "billetera", color: "#2F80ED", domain: "personalpay.com.ar" },
  { id: "prex", name: "Prex", kind: "billetera", color: "#E0475F", domain: "prexcard.com.ar" },
  { id: "modo", name: "MODO", kind: "billetera", color: "#3BB273", domain: "modo.com.ar" },
  { id: "cuentadni", name: "Cuenta DNI", kind: "billetera", color: "#169C8C", domain: "cuentadni.com.ar" },
  { id: "reba", name: "Reba", kind: "billetera", color: "#3D4A63", domain: "reba.com.ar" },
  { id: "cocos", name: "Cocos", kind: "billetera", color: "#2F80ED", domain: "cocos.capital" },
  { id: "nacion", name: "Banco Nación", kind: "banco", color: "#2F80ED", domain: "bna.com.ar", auto: "Transferencias que hacés" },
  { id: "macro", name: "Banco Macro", kind: "banco", color: "#3D4A63", domain: "macro.com.ar", auto: "Transferencias que hacés" },
  { id: "santander", name: "Santander", kind: "banco", color: "#E0475F", domain: "santander.com.ar" },
  { id: "galicia", name: "Galicia", kind: "banco", color: "#F08C2E", domain: "bancogalicia.com" },
  { id: "bbva", name: "BBVA", kind: "banco", color: "#2F80ED", domain: "bbva.com.ar" },
  { id: "provincia", name: "Banco Provincia", kind: "banco", color: "#3BB273", domain: "bancoprovincia.com.ar" },
  { id: "ciudad", name: "Banco Ciudad", kind: "banco", color: "#169C8C", domain: "bancociudad.com.ar" },
  { id: "icbc", name: "ICBC", kind: "banco", color: "#E0475F", domain: "icbc.com.ar" },
  { id: "hsbc", name: "HSBC", kind: "banco", color: "#E0475F", domain: "hsbc.com.ar" },
  { id: "supervielle", name: "Supervielle", kind: "banco", color: "#E0475F", domain: "supervielle.com.ar" },
  { id: "patagonia", name: "Banco Patagonia", kind: "banco", color: "#3D4A63", domain: "bancopatagonia.com.ar" },
  { id: "credicoop", name: "Credicoop", kind: "banco", color: "#3BB273", domain: "bancocredicoop.coop" },
  { id: "comafi", name: "Comafi", kind: "banco", color: "#5B6CF0", domain: "comafi.com.ar" },
  { id: "hipotecario", name: "Hipotecario", kind: "banco", color: "#F08C2E", domain: "hipotecario.com.ar" },
  { id: "openbank", name: "Openbank", kind: "banco", color: "#E0475F", domain: "openbank.com.ar" },
  { id: "columbia", name: "Banco Columbia", kind: "banco", color: "#2F80ED", domain: "bancocolumbia.com.ar" },
  { id: "delsol", name: "Banco del Sol", kind: "banco", color: "#F5B72E", domain: "bancodelsol.com" },
  { id: "cordoba", name: "Bancor", kind: "banco", color: "#2F80ED", domain: "bancor.com.ar" },
  { id: "santafe", name: "Banco Santa Fe", kind: "banco", color: "#E0475F", domain: "bancosantafe.com.ar" },
  { id: "entrerios", name: "Banco Entre Ríos", kind: "banco", color: "#3BB273", domain: "bancoentrerios.com.ar" },
  { id: "amex", name: "American Express", kind: "tarjeta", color: "#2F80ED", domain: "americanexpress.com.ar" },
  { id: "cencosud", name: "Tarjeta Cencosud", kind: "tarjeta", color: "#169C8C", domain: "tarjetacencosud.com.ar" },
  { id: "shopping", name: "Tarjeta Shopping", kind: "tarjeta", color: "#E0475F", domain: "tarjetashopping.com.ar" },
  { id: "cabal", name: "Cabal", kind: "tarjeta", color: "#2F80ED", domain: "cabal.coop" },
];

export const KIND_LABELS: Record<ProviderKind, string> = { billetera: "Billeteras", banco: "Bancos", tarjeta: "Tarjetas" };

export const logoUrl = (domain: string) => "https://www.google.com/s2/favicons?domain=" + domain + "&sz=128";

export const AUTO_PROVIDERS = PROVIDERS.filter((provider) => provider.auto);

export const findProvider = (id: string | null | undefined) => PROVIDERS.find((provider) => provider.id === id) ?? null;

// Busca por id y, si la tarjeta no tiene, por el nombre (por ejemplo una tarjeta llamada "Ualá").
export const resolveProvider = (id: string | null | undefined, name?: string) => findProvider(id) ?? (name ? PROVIDERS.find((provider) => provider.name.toLowerCase() === name.trim().toLowerCase()) ?? null : null);

export const initials = (name: string) => name.replace(/^Banco\s+/i, "").split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
