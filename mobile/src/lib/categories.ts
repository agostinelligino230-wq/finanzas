import { useEffect, useState } from "react";
import { DEFAULT_CATEGORIES, ICON_NAMES, categoryFromRow, type Category, type CategoryRow } from "../../../shared/categorias";
import type { MovementType } from "../../../shared/movimientos";
import { supabase } from "./supabase";

const cache = new Map<string, Category[]>();
const valid = new Set(ICON_NAMES);

// Las categorías base más las que creó la persona (las mismas que en la web).
export function useCategories(userId: string) {
  const [custom, setCustom] = useState<Category[]>(() => cache.get(userId) ?? []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.from("categories").select("*").order("created_at", { ascending: true }).then(({ data, error }) => {
      if (!active || error) return;
      const list = ((data ?? []) as CategoryRow[]).map((row) => categoryFromRow(row, (name) => valid.has(name)));
      cache.set(userId, list);
      setCustom(list);
    });
    return () => { active = false; };
  }, [userId]);

  const addCategory = async (input: { name: string; kind: MovementType; icon: string; color: string }) => {
    if (!supabase) return null;
    const { data, error } = await supabase.from("categories").insert({ user_id: userId, ...input }).select().single();
    if (error || !data) return null;
    const created = categoryFromRow(data as CategoryRow, (name) => valid.has(name));
    setCustom((current) => { const next = [...current, created]; cache.set(userId, next); return next; });
    return created;
  };

  return { categories: [...DEFAULT_CATEGORIES, ...custom], addCategory };
}
