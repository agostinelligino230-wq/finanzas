import { useCallback, useEffect, useState } from "react";
import { detectGoalIcon, goalFromRow, type Goal, type GoalPeriod, type GoalRow } from "../../../shared/ahorro";
import { createStore } from "./store";
import { toast } from "../components/Toast";
import { supabase } from "./supabase";

// Metas de ahorro (las mismas que en la web).
const store = createStore<Goal[]>([]);

export function useSavings(userId: string) {
  const goals = store.useValue(userId);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    if (!supabase) return;
    setRefreshing(true);
    const { data, error: loadError } = await supabase.from("savings_goals").select("*").order("created_at", { ascending: false });
    setRefreshing(false);
    if (loadError) { setError("No se pudieron cargar las metas."); return; }
    setError("");
    store.set(userId, () => ((data ?? []) as GoalRow[]).map(goalFromRow));
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);

  const addGoal = async (input: { name: string; target: number; saved: number; period: GoalPeriod }) => {
    if (!supabase) return false;
    const { data, error: saveError } = await supabase.from("savings_goals").insert({ user_id: userId, name: input.name, target: input.target, saved: input.saved, period: input.period, icon: detectGoalIcon(input.name) }).select().single();
    if (saveError || !data) { toast("No se pudo crear la meta. Revisá tu conexión: lo que escribiste sigue ahí."); return false; }
    store.set(userId, (current) => [goalFromRow(data as GoalRow), ...current]);
    return true;
  };

  // Mientras se escribe cambia en pantalla; se guarda al terminar (como en la web, al salir del campo).
  const setSaved = (id: string, saved: number) => store.set(userId, (current) => current.map((goal) => (goal.id === id ? { ...goal, saved } : goal)));

  const saveSaved = async (id: string) => {
    const goal = store.get(userId).find((item) => item.id === id);
    if (!goal || !supabase) return;
    const { error: saveError } = await supabase.from("savings_goals").update({ saved: goal.saved }).eq("id", id);
    if (saveError) toast("No se pudo guardar lo ahorrado en «" + goal.name + "». Revisá tu conexión.", { action: { label: "Reintentar", onPress: () => saveSaved(id) } });
  };

  const removeGoal = async (id: string) => {
    if (!supabase) return;
    const { error: saveError } = await supabase.from("savings_goals").delete().eq("id", id);
    if (saveError) { toast("No se pudo eliminar la meta. Revisá tu conexión."); return; }
    store.set(userId, (current) => current.filter((item) => item.id !== id));
  };

  return { goals, error, refreshing, reload, addGoal, setSaved, saveSaved, removeGoal };
}
