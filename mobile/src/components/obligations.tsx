import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { money, monthLabel } from "../../../shared/format";
import { cardMonthSummary } from "../../../shared/tarjetas";
import { useCards } from "../lib/cards";
import { useFixed } from "../lib/fixed";
import { radius, useColors } from "../lib/theme";
import { Icon } from "./Icon";
import { ProviderIcon } from "./ProviderIcon";
import { Card, T, styles } from "./ui";

// Lo que falta pagar del mes en Inicio: gastos fijos y tarjetas sin marcar como pagados.
// Con «available» (el disponible del mes) muestra cuánto queda si se paga todo, como la web.
export function PendingPayments({ userId, month, available }: { userId: string; month: string; available?: number }) {
  const colors = useColors();
  const fixed = useFixed(userId, month);
  const { cards, items, statements, payments } = useCards(userId);
  const monthName = monthLabel(month).toLowerCase();

  const pendingFixed = fixed.rows.filter((row) => !row.paid && row.amount > 0);
  const pendingCards = cards.map((card) => ({ card, summary: cardMonthSummary(items, statements, card.id, month, payments) })).filter((entry) => !entry.summary.payment && entry.summary.total > 0);
  const pendingTotal = pendingFixed.reduce((sum, row) => sum + row.amount, 0) + pendingCards.reduce((sum, entry) => sum + entry.summary.total, 0);
  if (fixed.rows.length === 0 && cards.length === 0) return null;

  const pay = (tipo: "fijo" | "tarjeta", id: string) => router.push({ pathname: "/pagar", params: { tipo, id, mes: month } });
  const left = available !== undefined ? available - pendingTotal : null;

  return (
    <Card style={{ gap: 8 }}>
      <View style={[styles.row, { justifyContent: "space-between" }]}>
        <View style={[styles.row, { gap: 8, flex: 1 }]}>
          <Icon name="CalendarClock" size={18} color={colors.primaryText} />
          <T variant="subtitle" style={{ flex: 1 }}>{pendingTotal > 0 ? "Te falta pagar en " + monthName : "Fijos y tarjetas al día"}</T>
        </View>
        {pendingTotal > 0 ? <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] }}>{money(pendingTotal)}</Text> : null}
      </View>

      {pendingTotal > 0 ? (
        <View>
          {pendingFixed.map((row, index) => (
            <PendingRow key={row.item.id} first={index === 0} title={row.item.name} detail={"Gasto fijo · vence el " + row.item.dueDay} amount={row.amount} onPress={() => pay("fijo", row.item.id)} />
          ))}
          {pendingCards.map(({ card, summary }, index) => (
            <PendingRow key={card.id} first={pendingFixed.length === 0 && index === 0} title={"Tarjeta " + card.name} detail={(summary.statement ? "Resumen del mail" : "Cuotas y débitos") + (card.dueDay ? " · vence el " + card.dueDay : "")} amount={summary.total} onPress={() => pay("tarjeta", card.id)}
              icon={<ProviderIcon name={card.name} color={card.color} provider={card.provider} size={28} />} />
          ))}
        </View>
      ) : <T variant="small" style={{ fontSize: 14 }}>Ya pagaste todos los gastos fijos y las tarjetas de este mes.</T>}

      {pendingTotal > 0 && left !== null ? (
        <View style={{ backgroundColor: colors.surface2, borderRadius: radius.field, paddingHorizontal: 12, paddingVertical: 8 }}>
          <T style={{ fontSize: 14 }}>Si pagás todo, te quedan <Text style={{ fontWeight: "700", color: left < 0 ? colors.expense : colors.text, fontVariant: ["tabular-nums"] }}>{money(left)}</Text></T>
        </View>
      ) : null}

      <Pressable accessibilityRole="link" onPress={() => router.push("/fijos")} style={({ pressed }) => [styles.row, { minHeight: 44, gap: 4, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={{ color: colors.primaryText, fontWeight: "600", fontSize: 14 }}>Ver fijos y tarjetas</Text>
        <Icon name="ChevronRight" size={16} color={colors.primaryText} />
      </Pressable>
    </Card>
  );
}

function PendingRow({ title, detail, amount, first, icon, onPress }: { title: string; detail: string; amount: number; first: boolean; icon?: ReactNode; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={"Pagar " + title + ", " + money(amount)} onPress={onPress}
      style={({ pressed }) => [styles.row, { minHeight: 52, paddingVertical: 8, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T numberOfLines={1} style={{ fontSize: 14, fontWeight: "500" }}>{title}</T>
        <T variant="small" numberOfLines={1}>{detail}</T>
      </View>
      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] }}>{money(amount)}</Text>
      <View style={{ height: 32, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primaryText }}>Pagar</Text>
      </View>
    </Pressable>
  );
}
