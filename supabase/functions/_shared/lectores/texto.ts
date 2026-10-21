// Utilidades para leer montos, nombres y fechas de los avisos.
const TZ = "America/Argentina/Buenos_Aires";

export const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

// "$50.000,00" o "$3500" → 50000 / 3500
export function amount(text: string) {
  const clean = text.replace(/\.$/, "");
  return Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean.replace(/\.(?=\d{3}(\D|$))/g, ""));
}

export const titleCase = (text: string) => text.toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

// Transferencias a vos mismo (por nombre o alias) no cuentan como gasto.
export function isOwn(name: string | null, text: string) {
  const words = (name ?? "").toLowerCase().split(/\s+/).filter((word) => word.length > 2);
  if (words.length < 2) return false;
  const clean = text.toLowerCase().replace(/[^a-záéíóúñ]/g, "");
  return clean.includes(words[0]) && clean.includes(words[words.length - 1]);
}

export const MONTHS: Record<string, string> = { ene: "01", jan: "01", feb: "02", mar: "03", abr: "04", apr: "04", may: "05", jun: "06", jul: "07", ago: "08", aug: "08", sep: "09", set: "09", oct: "10", nov: "11", dic: "12", dec: "12" };
