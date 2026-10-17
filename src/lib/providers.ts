// Bancos, billeteras y tarjetas que se pueden agregar.
// "auto" dice qué se trae solo leyendo los mails de esa cuenta (si no tiene, se carga a mano).

export type ProviderKind = "billetera" | "banco";
export type Provider = { id: string; name: string; kind: ProviderKind; color: string; auto?: string };

export const PROVIDERS: Provider[] = [
  { id: "uala", name: "Ualá", kind: "billetera", color: "#2F80ED", auto: "Transferencias que hacés y el resumen de la tarjeta" },
  { id: "mercadopago", name: "Mercado Pago", kind: "billetera", color: "#169C8C", auto: "Pagos aprobados" },
  { id: "wallbit", name: "Wallbit", kind: "billetera", color: "#3D4A63", auto: "Dólares que recibís (como ingreso en US$)" },
  { id: "naranjax", name: "Naranja X", kind: "billetera", color: "#F08C2E" },
  { id: "brubank", name: "Brubank", kind: "billetera", color: "#5B6CF0" },
  { id: "lemon", name: "Lemon", kind: "billetera", color: "#3BB273" },
  { id: "personalpay", name: "Personal Pay", kind: "billetera", color: "#2F80ED" },
  { id: "prex", name: "Prex", kind: "billetera", color: "#E0475F" },
  { id: "modo", name: "MODO", kind: "billetera", color: "#3BB273" },
  { id: "cuentadni", name: "Cuenta DNI", kind: "billetera", color: "#169C8C" },
  { id: "nacion", name: "Banco Nación", kind: "banco", color: "#2F80ED", auto: "Transferencias que hacés" },
  { id: "macro", name: "Banco Macro", kind: "banco", color: "#3D4A63", auto: "Transferencias que hacés" },
  { id: "santander", name: "Santander", kind: "banco", color: "#E0475F" },
  { id: "galicia", name: "Galicia", kind: "banco", color: "#F08C2E" },
  { id: "bbva", name: "BBVA", kind: "banco", color: "#2F80ED" },
  { id: "provincia", name: "Banco Provincia", kind: "banco", color: "#3BB273" },
  { id: "ciudad", name: "Banco Ciudad", kind: "banco", color: "#169C8C" },
  { id: "icbc", name: "ICBC", kind: "banco", color: "#E0475F" },
  { id: "hsbc", name: "HSBC", kind: "banco", color: "#E0475F" },
  { id: "supervielle", name: "Supervielle", kind: "banco", color: "#E0475F" },
  { id: "patagonia", name: "Banco Patagonia", kind: "banco", color: "#3D4A63" },
  { id: "credicoop", name: "Credicoop", kind: "banco", color: "#3BB273" },
  { id: "comafi", name: "Comafi", kind: "banco", color: "#5B6CF0" },
  { id: "hipotecario", name: "Hipotecario", kind: "banco", color: "#F08C2E" },
  { id: "cordoba", name: "Bancor", kind: "banco", color: "#2F80ED" },
  { id: "santafe", name: "Banco Santa Fe", kind: "banco", color: "#E0475F" },
];

export const AUTO_PROVIDERS = PROVIDERS.filter((provider) => provider.auto);

export const findProvider = (id: string | null | undefined) => PROVIDERS.find((provider) => provider.id === id) ?? null;

export const initials = (name: string) => name.replace(/^Banco\s+/i, "").split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
