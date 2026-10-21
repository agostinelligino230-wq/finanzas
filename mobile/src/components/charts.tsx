import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, View, type ScrollViewInstance } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { compactMoney, money, monthLabel, shortMonth } from "../../../shared/format";
import type { Category } from "../../../shared/categorias";
import { useColors, type Colors } from "../lib/theme";
import { CategoryIcon, styles } from "./ui";

export type MonthRow = { month: string; income: number; expense: number; saving: number; result: number };
export type CategoryShare = { category: Category; value: number; percent: number };

type SeriesKey = "income" | "expense" | "saving";
export const SERIES: { key: SeriesKey; label: string; color: keyof Colors }[] = [
  { key: "income", label: "Ingresos", color: "chartIncome" },
  { key: "expense", label: "Gastos", color: "chartExpense" },
  { key: "saving", label: "Ahorro", color: "chartSaving" },
];

const H = 240;
const PAD = { top: 16, right: 4, bottom: 28, left: 44 };
const MIN_GROUP = 44; // Cada mes tocable de 44 px como mínimo; si no entran, el gráfico se desliza.

function barPath(x: number, y: number, width: number, height: number) {
  const r = Math.min(4, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

export function SeriesLegend() {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {SERIES.map((serie) => (
        <View key={serie.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors[serie.color] }} />
          <Text style={{ fontSize: 13, color: colors.muted }}>{serie.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function MonthlyBars({ data, selected, onSelect }: { data: MonthRow[]; selected: string; onSelect: (month: string) => void }) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const scroll = useRef<ScrollViewInstance>(null);

  const max = Math.max(1, ...data.flatMap((row) => [row.income, row.expense, row.saving]));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const niceMax = Math.ceil(max / step) * step;
  const plotH = H - PAD.top - PAD.bottom;
  const visible = Math.max(0, width - PAD.left);
  const groupW = Math.max(MIN_GROUP, (visible - PAD.right) / data.length);
  const contentW = groupW * data.length + PAD.right;
  const barW = Math.max(4, Math.min(18, (groupW - 12) / 3 - 2));
  const y = (value: number) => PAD.top + plotH - (value / niceMax) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ratio * niceMax);

  // Se corre 8 px hacia los bordes de la tarjeta para que 6 meses entren sin deslizar en un teléfono.
  return (
    <View style={{ height: H, flexDirection: "row", marginHorizontal: -8 }} onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}>
      {width > 0 ? (
        <>
          <Svg width={PAD.left} height={H}>
            {ticks.map((tick) => <SvgText key={tick} x={PAD.left - 6} y={y(tick) + 4} textAnchor="end" fontSize={11} fill={colors.muted}>{compactMoney(tick)}</SvgText>)}
          </Svg>
          <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} scrollEnabled={contentW > visible} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
            <View style={{ width: contentW, height: H }}>
              <Svg width={contentW} height={H}>
                {ticks.map((tick) => <Line key={tick} x1={0} x2={contentW - PAD.right} y1={y(tick)} y2={y(tick)} stroke={colors.border} strokeWidth={1} />)}
                {data.map((row, index) => {
                  const x0 = index * groupW;
                  const start = x0 + (groupW - (barW * 3 + 4)) / 2;
                  const active = row.month === selected;
                  return (
                    <G key={row.month}>
                      {active ? <Rect x={x0 + 2} y={PAD.top} width={groupW - 4} height={plotH} rx={8} fill={colors.surface2} /> : null}
                      {SERIES.map((serie, serieIndex) => {
                        const height = PAD.top + plotH - y(row[serie.key]);
                        return height > 0 ? <Path key={serie.key} d={barPath(start + serieIndex * (barW + 2), y(row[serie.key]), barW, height)} fill={colors[serie.color]} /> : null;
                      })}
                      <SvgText x={x0 + groupW / 2} y={H - 8} textAnchor="middle" fontSize={12} fontWeight={active ? "700" : "400"} fill={active ? colors.text : colors.muted}>{shortMonth(row.month)}</SvgText>
                    </G>
                  );
                })}
              </Svg>
              {data.map((row, index) => (
                <Pressable
                  key={row.month}
                  accessibilityRole="button"
                  accessibilityState={{ selected: row.month === selected }}
                  accessibilityLabel={`${monthLabel(row.month)}: ingresos ${money(row.income)}, gastos ${money(row.expense)}, ahorro ${money(row.saving)}`}
                  onPress={() => onSelect(row.month)}
                  style={{ position: "absolute", left: index * groupW, top: 0, width: groupW, height: H }}
                />
              ))}
            </View>
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

export function MonthDetail({ row }: { row: MonthRow }) {
  const colors = useColors();
  const items = [
    { label: "Ingresos", value: row.income, color: colors.text },
    { label: "Gastos", value: row.expense, color: colors.text },
    { label: "Ahorro", value: row.saving, color: colors.text },
    { label: "Te quedó", value: row.result, color: row.result < 0 ? colors.expense : colors.income },
  ];
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: colors.surface2, borderRadius: 16, padding: 12, gap: 8 }}>
      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>{monthLabel(row.month)}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8 }}>
        {items.map((item) => (
          <View key={item.label} style={{ width: "50%" }}>
            <Text style={{ fontSize: 13, color: colors.muted }}>{item.label}</Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: item.color, fontVariant: ["tabular-nums"] }}>{money(item.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// Anillo por categoría con 2 px de separación entre segmentos.
export function CategoryDonut({ rows, total }: { rows: CategoryShare[]; total: number }) {
  const colors = useColors();
  const radius = 70;
  const stroke = 22;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = rows.map((row) => {
    const length = (row.value / (total || 1)) * circumference;
    const segment = { key: row.category.id, color: row.category.color, dash: Math.max(0, length - 2), offset };
    offset += length;
    return segment;
  });
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={"Gastos por categoría, total " + money(total)} style={{ width: 180, height: 180, alignSelf: "center" }}>
      <Svg width={180} height={180} viewBox="0 0 180 180">
        <G rotation={-90} origin="90, 90">
          {segments.map((segment) => <Circle key={segment.key} cx={90} cy={90} r={radius} fill="none" stroke={segment.color} strokeWidth={stroke} strokeDasharray={[segment.dash, circumference]} strokeDashoffset={-segment.offset} />)}
        </G>
      </Svg>
      <View pointerEvents="none" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 12, color: colors.muted }}>Total</Text>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] }}>{compactMoney(total)}</Text>
      </View>
    </View>
  );
}

export function CategoryList({ rows }: { rows: CategoryShare[] }) {
  const colors = useColors();
  return (
    <View style={{ gap: 8 }}>
      {rows.map((row) => (
        <View key={row.category.id} style={[styles.row, { minHeight: 40 }]}>
          <CategoryIcon category={row.category} size={32} />
          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: "500", color: colors.text }}>{row.category.name}</Text>
          <Text style={{ width: 44, textAlign: "right", fontSize: 13, color: colors.muted, fontVariant: ["tabular-nums"] }}>{Math.round(row.percent)}%</Text>
          <Text style={{ minWidth: 96, textAlign: "right", fontSize: 15, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] }}>{money(row.value)}</Text>
        </View>
      ))}
    </View>
  );
}
