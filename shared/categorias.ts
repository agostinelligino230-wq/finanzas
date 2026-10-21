// Categorías de gastos e ingresos (datos puros: el ícono es un nombre de lucide; cada app tiene su mapa de íconos).
import type { MovementType } from "./movimientos";

export const ICON_GROUPS: { label: string; icons: string[] }[] = [
  { label: "Finanzas", icons: ["Wallet", "Banknote", "Coins", "CreditCard", "Landmark", "PiggyBank", "HandCoins", "TrendingUp", "Percent", "Receipt", "Briefcase"] },
  { label: "Casa y servicios", icons: ["Home", "Sofa", "Hammer", "Wrench", "Zap", "Flame", "Droplets", "Wifi", "Smartphone", "Tv", "Building2"] },
  { label: "Comida y compras", icons: ["ShoppingCart", "ShoppingBag", "Store", "Utensils", "Pizza", "Coffee", "Beer", "Package", "Shirt", "Gift"] },
  { label: "Transporte", icons: ["Car", "Bus", "Train", "Bike", "Fuel", "Plane"] },
  { label: "Salud y cuidado", icons: ["HeartPulse", "Stethoscope", "Pill", "Dumbbell", "Scissors", "Sparkles", "Cigarette"] },
  { label: "Ocio y familia", icons: ["Gamepad2", "Film", "Music", "Ticket", "Palette", "BookOpen", "GraduationCap", "Laptop", "Baby", "Dog", "Trees", "Tag", "HelpCircle"] },
];

// Íconos que se pueden usar en una categoría (los de las categorías base también están acá).
export const ICON_NAMES = ICON_GROUPS.flatMap((group) => group.icons);

export const COLORS = ["#E0475F", "#F08C2E", "#F5B72E", "#3BB273", "#169C8C", "#2F80ED", "#5B6CF0", "#8E5BD9", "#D94FA6", "#9C6B4E", "#607D8B", "#3D4A63"];

export type Category = { id: string; name: string; kind: MovementType; icon: string; color: string; custom: boolean };

const base = (kind: MovementType, id: string, name: string, icon: string, color: string): Category => ({ id, name, kind, icon, color, custom: false });

export const DEFAULT_CATEGORIES: Category[] = [
  base("gasto", "hogar", "Hogar", "Home", "#3BB273"),
  base("gasto", "comida", "Comida", "ShoppingCart", "#F08C2E"),
  base("gasto", "impuestos", "Impuestos", "Receipt", "#E0475F"),
  base("gasto", "transporte", "Transporte", "Bus", "#2F80ED"),
  base("gasto", "salud", "Salud", "HeartPulse", "#D94FA6"),
  base("gasto", "ocio", "Ocio", "Gamepad2", "#F5B72E"),
  base("gasto", "gustos", "Gustos", "Coffee", "#9C6B4E"),
  base("gasto", "educacion", "Educación", "GraduationCap", "#5B6CF0"),
  base("gasto", "regalos", "Regalos", "Gift", "#8E5BD9"),
  base("gasto", "ahorro", "Ahorro", "PiggyBank", "#169C8C"),
  base("gasto", "transferencias", "Transferencias", "Banknote", "#3D4A63"),
  base("gasto", "tarjeta", "Tarjetas", "CreditCard", "#5B6CF0"),
  base("gasto", "otro", "Otros", "Tag", "#607D8B"),
  base("ingreso", "salario", "Salario", "Briefcase", "#2F80ED"),
  base("ingreso", "extra", "Trabajo extra", "HandCoins", "#3BB273"),
  base("ingreso", "regalo", "Regalo", "Gift", "#D94FA6"),
  base("ingreso", "interes", "Intereses", "Landmark", "#169C8C"),
  base("ingreso", "otro", "Otros ingresos", "Coins", "#607D8B"),
];

export type CategoryRow = { id: string; name: string; kind: MovementType; icon: string; color: string };
export const categoryFromRow = (row: CategoryRow, validIcon: (name: string) => boolean): Category => ({ id: "c:" + row.id, name: row.name, kind: row.kind, icon: validIcon(row.icon) ? row.icon : "Tag", color: row.color, custom: true });

export function findCategory(list: Category[], kind: MovementType, id: string): Category {
  return list.find((item) => item.kind === kind && item.id === id) ?? { id, name: id ? id.charAt(0).toUpperCase() + id.slice(1) : "Otros", kind, icon: "Tag", color: "#607D8B", custom: false };
}
