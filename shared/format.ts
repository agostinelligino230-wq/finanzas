export const money = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);

export const usd = (value: number) => "US$ " + value.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const compactMoney = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return "$" + (value / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "M";
  if (abs >= 1_000) return "$" + Math.round(value / 1_000).toLocaleString("es-AR") + "k";
  return "$" + Math.round(value).toLocaleString("es-AR");
};

const capitalize = (text: string) => text.replace(/^./, (letter) => letter.toUpperCase());

export const todayISO = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const daysAgoISO = (days: number) => {
  const date = new Date(todayISO() + "T12:00:00");
  date.setDate(date.getDate() - days);
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
};

export const currentMonthISO = () => todayISO().slice(0, 7);

export const shiftMonth = (month: string, offset: number) => {
  const date = new Date(month + "-01T12:00:00");
  date.setMonth(date.getMonth() + offset);
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
};

export const monthLabel = (month: string) => capitalize(new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(new Date(month + "-01T12:00:00")));

export const shortMonth = (month: string) => new Intl.DateTimeFormat("es-AR", { month: "short" }).format(new Date(month + "-01T12:00:00")).replace(".", "");

export const dayLabel = (date: string) => capitalize(new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(date + "T12:00:00")));

export const timeLabel = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
};

// Acepta "1.250.000", "1250000" o "1250,50"
export const parseAmount = (text: string) => {
  const cleaned = text.replace(/\s/g, "").replace(/\$/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : NaN;
};

// Cuántos meses hay entre dos meses "AAAA-MM" (b - a)
export const monthsBetween = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
