import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { currentMonthISO, monthLabel, money, usd } from "../../../../shared/format";
import { findCategory } from "../../../../shared/categorias";
import { hasDetail, monthTotals, type MovementType } from "../../../../shared/movimientos";
import { useAuth } from "../../lib/auth";
import { useCategories } from "../../lib/categories";
import { useMovements } from "../../lib/movements";
import { useColors } from "../../lib/theme";
import { Icon } from "../../components/Icon";
import { Fab } from "../../components/Fab";
import { MovementRow, ReviewList } from "../../components/movements";
import { Card, CategoryIcon, ErrorBox, MonthPicker, Screen, Segmented, T, styles } from "../../components/ui";

export default function Home() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const colors = useColors();
  const data = useMovements(userId);
  const { categories } = useCategories(userId);
  const [month, setMonth] = useState(currentMonthISO());
  const [tab, setTab] = useState<MovementType>("gasto");
  const [open, setOpen] = useState<string | null>(null);

  const totals = useMemo(() => monthTotals(data.movements, month), [data.movements, month]);
  const accumulated = data.movements.reduce((sum, item) => sum + (item.type === "ingreso" ? item.amount : -item.amount), 0);
  const dollars = totals.items.filter((item) => item.type === "ingreso" && item.currency === "USD");
  const dollarTotal = dollars.reduce((sum, item) => sum + (item.original ?? 0), 0);

  const tabItems = totals.items.filter((item) => item.type === tab);
  const tabTotal = tabItems.reduce((sum, item) => sum + item.amount, 0);
  const groups = useMemo(() => {
    const map = new Map<string, typeof tabItems>();
    tabItems.forEach((item) => map.set(item.category, [...(map.get(item.category) ?? []), item]));
    return [...map.entries()].map(([id, items]) => ({ category: findCategory(categories, tab, id), items, total: items.reduce((sum, item) => sum + item.amount, 0) })).sort((a, b) => b.total - a.total);
  }, [tabItems, categories, tab]);

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={data.refreshing} onRefresh={data.reload}>
        <View style={{ backgroundColor: colors.hero, borderRadius: 28, padding: 20, gap: 4 }}>
          <Text style={{ color: colors.heroText, opacity: 0.8, fontSize: 14 }}>Disponible en {monthLabel(month)}</Text>
          <Text accessibilityRole="header" style={{ color: totals.available < 0 ? "#ffb3c0" : colors.heroText, fontSize: 38, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{money(totals.available)}</Text>
          {dollarTotal > 0 ? <Text style={{ color: colors.heroText, opacity: 0.8, fontSize: 13 }}>Tus ingresos incluyen {usd(dollarTotal)}</Text> : null}
          <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
            {[{ label: "Ingresos", icon: "ArrowDownLeft", value: totals.income }, { label: "Gastos", icon: "ArrowUpRight", value: totals.expense }].map((box) => (
              <View key={box.label} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name={box.icon} size={14} color={colors.heroText} /><Text style={{ color: colors.heroText, opacity: 0.8, fontSize: 12 }}>{box.label}</Text></View>
                <Text style={{ color: colors.heroText, fontSize: 18, fontWeight: "700", marginTop: 4, fontVariant: ["tabular-nums"] }}>{money(box.value)}</Text>
              </View>
            ))}
          </View>
          <Text style={{ color: colors.heroText, opacity: 0.75, fontSize: 12, marginTop: 12 }}>Saldo acumulado: {money(accumulated)}{totals.pending > 0 ? " · Falta pagar este mes: " + money(totals.pending) : ""}</Text>
        </View>

        <ErrorBox message={data.error} />
        <ReviewList items={data.toReview} onConfirm={data.confirm} onRemove={data.remove} />

        <MonthPicker month={month} onChange={(value) => { setMonth(value); setOpen(null); }} />
        <Segmented value={tab} onChange={(value) => { setTab(value); setOpen(null); }} options={[{ value: "gasto", label: "Gastos" }, { value: "ingreso", label: "Ingresos" }]} />

        <Card style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <T variant="small">{tab === "gasto" ? "Total gastado" : "Total cobrado"}</T>
          <Text style={{ fontSize: 24, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] }}>{money(tabTotal)}</Text>
        </Card>

        {groups.length === 0 ? (
          <Card style={{ alignItems: "center", paddingVertical: 32, gap: 4 }}>
            <T variant="subtitle">{tab === "gasto" ? "Todavía no hay gastos este mes" : "Todavía no hay ingresos este mes"}</T>
            <T variant="small">Tocá el botón + para cargar el primero.</T>
          </Card>
        ) : groups.map(({ category, items, total }) => {
          const expanded = open === category.id;
          const percent = tabTotal > 0 ? Math.round((total / tabTotal) * 100) : 0;
          const details = [...new Set(items.filter((item) => hasDetail(item, category.name)).map((item) => item.description.trim()))];
          return (
            <Card key={category.id} style={{ paddingVertical: 4 }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={category.name + ", " + money(total)} onPress={() => setOpen(expanded ? null : category.id)} style={[styles.row, { minHeight: 56 }]}>
                <CategoryIcon category={category} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T numberOfLines={1} style={{ fontWeight: "600" }}>{category.name}</T>
                  {details.length > 0 ? <T variant="small" numberOfLines={1}>{details.join(", ")}</T> : null}
                </View>
                <T variant="small">{percent}%</T>
                <Text style={{ fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] }}>{money(total)}</Text>
                <Icon name={expanded ? "ChevronDown" : "ChevronRight"} size={18} color={colors.muted} />
              </Pressable>
              {expanded ? <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>{items.map((item) => <MovementRow key={item.id} item={item} categories={categories} onTogglePaid={data.togglePaid} onRemove={data.remove} showDay />)}</View> : null}
            </Card>
          );
        })}
      </Screen>
      <Fab onPress={() => router.push({ pathname: "/agregar", params: { tipo: tab } })} />
    </View>
  );
}
