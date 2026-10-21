import { useEffect, useState } from "react";
import {
  Baby, Banknote, Beer, Bike, BookOpen, Briefcase, Building2, Bus, Car, Cigarette, Coffee, Coins, CreditCard, Dog, Droplets, Dumbbell, Film, Flame, Fuel, Gamepad2, Gift,
  GraduationCap, Hammer, HandCoins, HeartPulse, HelpCircle, Home, Landmark, Laptop, Music, Package, Palette, Percent, PiggyBank, Pill, Pizza, Plane, Receipt, Scissors, Shirt,
  ShoppingBag, ShoppingCart, Smartphone, Sofa, Sparkles, Stethoscope, Store, Tag, Ticket, Train, Trees, TrendingUp, Tv, Utensils, Wallet, Wifi, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import { supabase } from "./supabase";
import { readCache, writeCache } from "./cache";
import type { MovementType } from "./movements";
import { DEFAULT_CATEGORIES, categoryFromRow, type Category, type CategoryRow } from "../../shared/categorias";

export const ICONS: Record<string, LucideIcon> = {
  Baby, Banknote, Beer, Bike, BookOpen, Briefcase, Building2, Bus, Car, Cigarette, Coffee, Coins, CreditCard, Dog, Droplets, Dumbbell, Film, Flame, Fuel, Gamepad2, Gift,
  GraduationCap, Hammer, HandCoins, HeartPulse, HelpCircle, Home, Landmark, Laptop, Music, Package, Palette, Percent, PiggyBank, Pill, Pizza, Plane, Receipt, Scissors, Shirt,
  ShoppingBag, ShoppingCart, Smartphone, Sofa, Sparkles, Stethoscope, Store, Tag, Ticket, Train, Trees, TrendingUp, Tv, Utensils, Wallet, Wifi, Wrench, Zap,
};

// Los datos (categorías base, colores, grupos de íconos) viven en shared/categorias.ts: los usa también la app del celular.
export { COLORS, DEFAULT_CATEGORIES, ICON_GROUPS, findCategory, type Category } from "../../shared/categorias";

const fromRow = (row: CategoryRow): Category => categoryFromRow(row, (name) => Boolean(ICONS[name]));

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
