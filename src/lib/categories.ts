import { useEffect, useState } from "react";
import {
  Baby, Banknote, Beer, Bike, BookOpen, Briefcase, Building2, Bus, Car, Cigarette, Coffee, Coins, CreditCard, Dog, Droplets, Dumbbell, Film, Flame, Fuel, Gamepad2, Gift,
  GraduationCap, Hammer, HandCoins, HeartPulse, HelpCircle, Home, Landmark, Laptop, Music, Package, Palette, Percent, PiggyBank, Pill, Pizza, Plane, Receipt, Scissors, Shirt,
  ShoppingBag, ShoppingCart, Smartphone, Sofa, Sparkles, Stethoscope, Store, Tag, Ticket, Train, Trees, TrendingUp, Tv, Utensils, Wallet, Wifi, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { supabase } from "./supabase";
import { readCache, writeCache } from "./cache";
import type { MovementType } from "./movements";

export const ICONS: Record<string, LucideIcon> = {
  Baby, Banknote, Beer, Bike, BookOpen, Briefcase, Building2, Bus, Car, Cigarette, Coffee, Coins, CreditCard, Dog, Droplets, Dumbbell, Film, Flame, Fuel, Gamepad2, Gift,
  GraduationCap, Hammer, HandCoins, HeartPulse, HelpCircle, Home, Landmark, Laptop, Music, Package, Palette, Percent, PiggyBank, Pill, Pizza, Plane, Receipt, Scissors, Shirt,
  ShoppingBag, ShoppingCart, Smartphone, Sofa, Sparkles, Stethoscope, Store, Tag, Ticket, Train, Trees, TrendingUp, Tv, Utensils, Wallet, Wifi, Wrench, Zap,
};

export const ICON_GROUPS: { label: string; icons: string[] }[] = [
  { label: "Finanzas", icons: ["Wallet", "Banknote", "Coins", "CreditCard", "Landmark", "PiggyBank", "HandCoins", "TrendingUp", "Percent", "Receipt", "Briefcase"] },
  { label: "Casa y servicios", icons: ["Home", "Sofa", "Hammer", "Wrench", "Zap", "Flame", "Droplets", "Wifi", "Smartphone", "Tv", "Building2"] },
  { label: "Comida y compras", icons: ["ShoppingCart", "ShoppingBag", "Store", "Utensils", "Pizza", "Coffee", "Beer", "Package", "Shirt", "Gift"] },
  { label: "Transporte", icons: ["Car", "Bus", "Train", "Bike", "Fuel", "Plane"] },
  { label: "Salud y cuidado", icons: ["HeartPulse", "Stethoscope", "Pill", "Dumbbell", "Scissors", "Sparkles", "Cigarette"] },
  { label: "Ocio y familia", icons: ["Gamepad2", "Film", "Music", "Ticket", "Palette", "BookOpen", "GraduationCap", "Laptop", "Baby", "Dog", "Trees", "Tag", "HelpCircle"] },
];

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
  base("gasto", "otro", "Otros", "Tag", "#607D8B"),
  base("ingreso", "salario", "Salario", "Briefcase", "#2F80ED"),
  base("ingreso", "extra", "Trabajo extra", "HandCoins", "#3BB273"),
  base("ingreso", "regalo", "Regalo", "Gift", "#D94FA6"),
  base("ingreso", "interes", "Intereses", "Landmark", "#169C8C"),
  base("ingreso", "otro", "Otros ingresos", "Coins", "#607D8B"),
];

type CategoryRow = { id: string; name: string; kind: MovementType; icon: string; color: string };
const fromRow = (row: CategoryRow): Category => ({ id: "c:" + row.id, name: row.name, kind: row.kind, icon: ICONS[row.icon] ? row.icon : "Tag", color: row.color, custom: true });

export function findCategory(list: Category[], kind: MovementType, id: string): Category {
  return list.find((item) => item.kind === kind && item.id === id) ?? { id, name: id ? id.charAt(0).toUpperCase() + id.slice(1) : "Otros", kind, icon: "Tag", color: "#607D8B", custom: false };
}

export function useCategories(userId: string) {
  const [custom, setCustom] = useState<Category[]>(() => readCache<Category[]>("categories", userId) ?? []);

  useEffect(() => { writeCache("categories", userId, custom); }, [custom, userId]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.from("categories").select("*").order("created_at", { ascending: true }).then(({ data, error }) => {
      if (active && !error) setCustom(((data ?? []) as CategoryRow[]).map(fromRow));
    });
    return () => { active = false; };
  }, [userId]);

  const addCategory = async (input: { name: string; kind: MovementType; icon: string; color: string }) => {
    if (!supabase) return null;
    const { data, error } = await supabase.from("categories").insert({ user_id: userId, ...input }).select().single();
    if (error || !data) return null;
    const created = fromRow(data as CategoryRow);
    setCustom((current) => [...current, created]);
    return created;
  };

  return { categories: [...DEFAULT_CATEGORIES, ...custom], addCategory };
}
