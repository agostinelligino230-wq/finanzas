import { useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { currentMonthISO, dayLabel, money } from "../../../../shared/format";
import { findCategory } from "../../../../shared/categorias";
import type { Movement } from "../../../../shared/movimientos";
import { useAuth } from "../../lib/auth";
import { useCategories } from "../../lib/categories";
import { useMovements } from "../../lib/movements";
import { radius, useColors } from "../../lib/theme";
import { Icon } from "../../components/Icon";
import { Fab } from "../../components/Fab";
import { MovementRow, ReviewList } from "../../components/movements";
import { Card, ErrorBox, MonthPicker, Screen, Segmented, T } from "../../components/ui";

type Filter = "todos" | "gasto" | "ingreso";

export default function Movements() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const colors = useColors();
  const data = useMovements(userId);
  const { categories } = useCategories(userId);
  const [month, setMonth] = useState(currentMonthISO());
  const [filter, setFilter] = useState<Filter>("todos");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return data.movements.filter((item) => {
      if (!item.date.startsWith(month)) return false;
      if (filter !== "todos" && item.type !== filter) return false;
      if (!text) return true;
      return item.description.toLowerCase().includes(text) || findCategory(categories, item.type, item.category).name.toLowerCase().includes(text);
    });
  }, [data.movements, month, filter, query, categories]);

  const byDay = useMemo(() => {
    const map = new Map<string, Movement[]>();
    visible.forEach((item) => map.set(item.date, [...(map.get(item.date) ?? []), item]));
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [visible]);

  const income = visible.filter((item) => item.type === "ingreso").reduce((sum, item) => sum + item.amount, 0);
  const expense = visible.filter((item) => item.type === "gasto").reduce((sum, item) => sum + item.amount, 0);

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Movimientos" refreshing={data.refreshing} onRefresh={data.reload}>
        <ErrorBox message={data.error} />
        <ReviewList items={data.toReview} onConfirm={data.confirm} onRemove={data.remove} />
        <MonthPicker month={month} onChange={setMonth} />
        <Segmented value={filter} onChange={setFilter} options={[{ value: "todos", label: "Todos" }, { value: "gasto", label: "Gastos" }, { value: "ingreso", label: "Ingresos" }]} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: radius.field, paddingHorizontal: 16, minHeight: 48 }}>
          <Icon name="Search" size={18} color={colors.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Buscar por categoría o detalle" placeholderTextColor={colors.muted} accessibilityLabel="Buscar" style={{ flex: 1, fontSize: 16, color: colors.text }} />
        </View>
        <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <T variant="small">{visible.length} movimientos</T>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Text style={{ color: colors.income, fontWeight: "700", fontVariant: ["tabular-nums"] }}>+{money(income)}</Text>
            <Text style={{ color: colors.expense, fontWeight: "700", fontVariant: ["tabular-nums"] }}>−{money(expense)}</Text>
          </View>
        </Card>
        {byDay.length === 0 ? <Card style={{ alignItems: "center", paddingVertical: 32 }}><T variant="small">No hay movimientos para mostrar.</T></Card> : byDay.map(([day, items]) => (
          <View key={day} style={{ gap: 6 }}>
            <T variant="small" style={{ fontWeight: "600", paddingHorizontal: 8 }}>{dayLabel(day)}</T>
            <Card style={{ paddingVertical: 4 }}>
              {items.map((item, index) => (
                <View key={item.id} style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}>
                  <MovementRow item={item} categories={categories} onRemove={data.remove} />
                </View>
              ))}
            </Card>
          </View>
        ))}
      </Screen>
      <Fab onPress={() => router.push({ pathname: "/agregar", params: { tipo: filter === "ingreso" ? "ingreso" : "gasto" } })} />
    </View>
  );
}
