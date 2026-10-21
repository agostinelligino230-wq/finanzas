import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { currentMonthISO, monthLabel, shiftMonth } from "../../../../shared/format";
import { findCategory } from "../../../../shared/categorias";
import { useAuth } from "../../lib/auth";
import { useCategories } from "../../lib/categories";
import { useMovements } from "../../lib/movements";
import { useColors } from "../../lib/theme";
import { CategoryDonut, CategoryList, MonthDetail, MonthlyBars, SeriesLegend, type MonthRow } from "../../components/charts";
import { Card, ErrorBox, Loading, Screen, Segmented, T } from "../../components/ui";

type Range = "6" | "12";

export default function Graficos() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const colors = useColors();
  const data = useMovements(userId);
  const { categories } = useCategories(userId);
  const [range, setRange] = useState<Range>("6");
  const [selected, setSelected] = useState(currentMonthISO());
  const movements = data.movements;

  const months = useMemo(() => {
    const count = Number(range);
    const last = currentMonthISO();
    return Array.from({ length: count }, (_, index) => shiftMonth(last, index - count + 1));
  }, [range]);

  const rows = useMemo<MonthRow[]>(() => months.map((month) => {
    const items = movements.filter((item) => item.date.startsWith(month));
    const income = items.filter((item) => item.type === "ingreso").reduce((sum, item) => sum + item.amount, 0);
    const expense = items.filter((item) => item.type === "gasto").reduce((sum, item) => sum + item.amount, 0);
    const saving = items.filter((item) => item.type === "gasto" && item.category === "ahorro").reduce((sum, item) => sum + item.amount, 0);
    return { month, income, expense, saving, result: income - expense };
  }), [months, movements]);

  const current = rows.find((row) => row.month === selected) ?? rows[rows.length - 1];
  const breakdown = useMemo(() => {
    const map = new Map<string, number>();
    movements.filter((item) => item.type === "gasto" && item.date.startsWith(current.month)).forEach((item) => map.set(item.category, (map.get(item.category) ?? 0) + item.amount));
    const total = [...map.values()].reduce((sum, value) => sum + value, 0);
    return { total, rows: [...map.entries()].map(([id, value]) => ({ category: findCategory(categories, "gasto", id), value, percent: total > 0 ? (value / total) * 100 : 0 })).sort((a, b) => b.value - a.value) };
  }, [movements, current.month, categories]);

  return (
    <Screen title="Gráficos" refreshing={data.refreshing} onRefresh={data.reload}>
      <ErrorBox message={data.error} onRetry={data.reload} />
      {!data.loaded ? (data.error ? null : <Loading label="Cargando tus movimientos…" />) : (
        <>
          <Segmented value={range} onChange={setRange} options={[{ value: "6", label: "Últimos 6 meses" }, { value: "12", label: "Últimos 12 meses" }]} />

          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Mes a mes</Text>
              <SeriesLegend />
            </View>
            <MonthlyBars data={rows} selected={current.month} onSelect={setSelected} />
            <MonthDetail row={current} />
            <T variant="small">Tocá un mes en el gráfico para ver el detalle.</T>
          </Card>

          <Card style={{ gap: 16 }}>
            <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>¿En qué se fue la plata en {monthLabel(current.month).toLowerCase()}?</Text>
            {breakdown.rows.length === 0 ? <T variant="small" style={{ fontSize: 14 }}>No hay gastos cargados ese mes.</T> : (
              <>
                <CategoryDonut rows={breakdown.rows} total={breakdown.total} />
                <CategoryList rows={breakdown.rows} />
              </>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
