import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { currentMonthISO, money, monthLabel, usd } from "../../../shared/format";
import { FIXED_LABELS, type FixedRowView } from "../../../shared/fijos";
import { cardMonthSummary, installmentNumber, itemsForMonth, lastMonth, type CardItem, type CardPayment, type CardStatement, type CreditCard } from "../../../shared/tarjetas";
import { useAuth } from "../lib/auth";
import { useCards } from "../lib/cards";
import { useFixed } from "../lib/fixed";
import { radius, useColors } from "../lib/theme";
import { Fab } from "../components/Fab";
import { Icon } from "../components/Icon";
import { ProviderIcon } from "../components/ProviderIcon";
import { FIXED_ICONS, PaidCheck, close, confirmAction } from "../components/fixedUi";
import { Button, Card, ErrorBox, IconButton, MonthPicker, Segmented, T, styles } from "../components/ui";

export default function FixedScreen() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/login" />;
  return <FixedAndCards userId={session.user.id} />;
}

type Tab = "fijos" | "tarjetas";

const shortDate = (date: string, month: "long" | "short") => new Date(date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month });

function FixedAndCards({ userId }: { userId: string }) {
  const colors = useColors();
  const [month, setMonth] = useState(currentMonthISO());
  const [tab, setTab] = useState<Tab>("fijos");
  const fixed = useFixed(userId, month);
  const cardsData = useCards(userId);
  const { cards, items, statements, payments } = cardsData;
  const monthName = monthLabel(month).toLowerCase();

  const summaries = cards.map((card) => ({ card, summary: cardMonthSummary(items, statements, card.id, month, payments) }));
  const fixedTotal = fixed.rows.reduce((sum, row) => sum + row.amount, 0);
  const cardsTotal = summaries.reduce((sum, entry) => sum + entry.summary.total, 0);
  const paidTotal = fixed.rows.filter((row) => row.paid).reduce((sum, row) => sum + row.amount, 0) + summaries.filter((entry) => entry.summary.payment).reduce((sum, entry) => sum + entry.summary.total, 0);
  const total = fixedTotal + cardsTotal;

  const refresh = () => { fixed.reload(); cardsData.reload(); };
  const editFixed = (row: FixedRowView) => router.push({ pathname: "/fijo", params: { mes: month, id: row.item.id } });
  const toggleFixed = (row: FixedRowView) => {
    if (row.paid) confirmAction("¿Desmarcar " + row.item.name + "?", "Si lo sumaste a tus gastos, también se quita.", "Desmarcar", () => { fixed.unpay(row); });
    else router.push({ pathname: "/pagar", params: { tipo: "fijo", id: row.item.id, mes: month } });
  };
  const add = () => {
    if (tab === "fijos") router.push({ pathname: "/fijo", params: { mes: month } });
    else if (cards.length === 0) router.push({ pathname: "/tarjeta", params: { despues: "cuota", mes: month } });
    else router.push({ pathname: "/cuota", params: { mes: month } });
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.row, { paddingHorizontal: 8, paddingTop: 4, gap: 4 }]}>
        <IconButton icon="ChevronLeft" label="Volver" color={colors.text} onPress={close} />
        <T variant="title" style={{ flex: 1, fontSize: 20 }} numberOfLines={1}>Fijos y tarjetas</T>
      </View>
      <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={fixed.refreshing || cardsData.refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <ErrorBox message={fixed.error || cardsData.error} />
        <MonthPicker month={month} onChange={setMonth} />

        <View style={{ backgroundColor: colors.hero, borderRadius: 28, padding: 20, gap: 4 }}>
          <Text style={{ color: colors.heroText, opacity: 0.8, fontSize: 14 }}>Fijos y tarjetas de {monthName}</Text>
          <Text accessibilityRole="header" style={{ color: colors.heroText, fontSize: 36, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{money(total)}</Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
            {[{ label: "Ya pagado", value: paidTotal }, { label: "Falta pagar", value: total - paidTotal }].map((box) => (
              <View key={box.label} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 12 }}>
                <Text style={{ color: colors.heroText, opacity: 0.8, fontSize: 12 }}>{box.label}</Text>
                <Text style={{ color: colors.heroText, fontSize: 18, fontWeight: "700", marginTop: 4, fontVariant: ["tabular-nums"] }}>{money(box.value)}</Text>
              </View>
            ))}
          </View>
          <Text style={{ color: colors.heroText, opacity: 0.75, fontSize: 12, marginTop: 12 }}>Al marcar algo como pagado se suma a tus gastos del mes en Inicio.</Text>
        </View>

        <Segmented value={tab} onChange={setTab} options={[{ value: "fijos", label: "Fijos" }, { value: "tarjetas", label: "Tarjetas" }]} />

        {tab === "fijos" ? (
          <>
            <SectionTitle icon="CalendarClock" label="Gastos fijos" total={fixedTotal} />
            {!fixed.loaded && !fixed.error ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} /> : fixed.rows.length === 0 ? (
              <Card style={{ paddingVertical: 24 }}><T variant="small" style={{ textAlign: "center", fontSize: 14 }}>No hay gastos fijos en {monthName}. Agregá alquiler, luz o gimnasio con el botón +.</T></Card>
            ) : (
              <Card style={{ paddingVertical: 4 }}>
                {fixed.rows.map((row, index) => <FixedRow key={row.item.id} row={row} first={index === 0} onToggle={() => toggleFixed(row)} onEdit={() => editFixed(row)} />)}
              </Card>
            )}
          </>
        ) : (
          <>
            <SectionTitle icon="CreditCard" label="De tarjeta" total={cardsTotal} />
            <T variant="small" style={{ paddingHorizontal: 8 }}>Cada mes muestra lo que pagás ese mes (el resumen que vence en ese mes). También aparece en lo que falta pagar de Inicio.</T>
            {!cardsData.loaded && !cardsData.error && cards.length === 0 ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} /> : cards.length === 0 ? (
              <Card style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
                <Icon name="CreditCard" size={32} color={colors.muted} />
                <T variant="subtitle">Todavía no cargaste tarjetas</T>
                <T variant="small" style={{ textAlign: "center", fontSize: 14 }}>Agregá tu tarjeta (Ualá, Naranja X, Santander…) y después las compras en cuotas o los débitos fijos.</T>
              </Card>
            ) : cards.map((card) => (
              <CardBlock key={card.id} card={card} month={month} items={items} statements={statements} payments={payments}
                onUnpay={() => confirmAction("¿Desmarcar el pago de " + card.name + "?", "También se quita de tus gastos del mes.", "Desmarcar", () => { cardsData.unpayCard(card, month); })}
                onRemove={() => confirmAction("¿Eliminar la tarjeta " + card.name + "?", "Se borran también todas sus cuotas y resúmenes.", "Eliminar", () => { cardsData.removeCard(card); })} />
            ))}
            <Pressable accessibilityRole="button" onPress={() => router.push("/tarjeta")} style={({ pressed }) => ({ minHeight: 48, borderRadius: radius.field, borderWidth: 2, borderStyle: "dashed", borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: pressed ? 0.7 : 1 })}>
              <Icon name="Plus" size={18} color={colors.muted} /><Text style={{ color: colors.muted, fontWeight: "600", fontSize: 15 }}>Agregar tarjeta</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
      <Fab onPress={add} label={tab === "fijos" ? "Agregar gasto fijo" : "Agregar cuota o débito de tarjeta"} />
      </View>
    </SafeAreaView>
  );
}

function SectionTitle({ icon, label, total }: { icon: string; label: string; total: number }) {
  const colors = useColors();
  return (
    <View style={[styles.row, { justifyContent: "space-between", paddingHorizontal: 8, marginTop: 4 }]}>
      <View style={[styles.row, { gap: 8 }]}><Icon name={icon} size={16} color={colors.muted} /><T variant="label">{label}</T></View>
      <Text style={{ color: colors.muted, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{money(total)}</Text>
    </View>
  );
}

function FixedRow({ row, first, onToggle, onEdit }: { row: FixedRowView; first: boolean; onToggle: () => void; onEdit: () => void }) {
  const colors = useColors();
  const { item } = row;
  return (
    <View style={[styles.row, { paddingVertical: 8, borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }]}>
      <PaidCheck paid={row.paid} label={row.paid ? "Marcar " + item.name + " como pendiente" : "Pagar " + item.name} onPress={onToggle} />
      <Pressable accessibilityRole="button" accessibilityLabel={"Editar " + item.name + ", " + money(row.amount)} onPress={onEdit} style={({ pressed }) => [styles.row, { flex: 1, minHeight: 48, opacity: pressed ? 0.7 : 1 }]}>
        <View style={{ width: 40, height: 40, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
          <Icon name={FIXED_ICONS[item.category]} size={19} color={colors.primaryText} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T numberOfLines={1} color={row.paid ? colors.muted : undefined} style={{ fontWeight: "600" }}>{item.name}</T>
          <T variant="small" numberOfLines={1}>{FIXED_LABELS[item.category]} · vence el {item.dueDay}{row.paid ? " · pagado" : ""}</T>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] }}>{money(row.amount)}</Text>
          {row.previous !== null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon name={row.amount > row.previous ? "TrendingUp" : "TrendingDown"} size={12} color={colors.muted} />
              <T variant="small">antes {money(row.previous)}</T>
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

function CardBlock({ card, month, items, statements, payments, onUnpay, onRemove }: { card: CreditCard; month: string; items: CardItem[]; statements: CardStatement[]; payments: CardPayment[]; onUnpay: () => void; onRemove: () => void }) {
  const colors = useColors();
  const [showLines, setShowLines] = useState(false);
  const summary = cardMonthSummary(items, statements, card.id, month, payments);
  const monthItems = itemsForMonth(items, card.id, month).sort((a, b) => b.amount - a.amount);
  const statement = summary.statement;
  const diff = statement ? statement.total - summary.loaded : 0;
  // Lo que todavía falta pagar de compras en cuotas (después de este mes).
  const remaining = items.filter((item) => item.cardId === card.id && item.kind === "cuotas").reduce((sum, item) => {
    const n = installmentNumber(item, month);
    const left = n === null ? (item.firstMonth > month ? item.installments ?? 0 : 0) : (item.installments ?? 1) - n;
    return sum + item.amount * left;
  }, 0);
  const editItem = (item?: CardItem) => router.push({ pathname: "/cuota", params: item ? { tarjeta: card.id, mes: month, id: item.id } : { tarjeta: card.id, mes: month } });
  const statementDetail = statement ? [statement.dueDate && "Vence el " + shortDate(statement.dueDate, "long"), statement.minPayment && "pago mínimo " + money(statement.minPayment)].filter(Boolean).join(" · ") : "";
  const spentLines = statement ? statement.lines.filter((line) => line.kind !== "pago").length : 0;

  return (
    <Card style={{ gap: 12 }}>
      <View style={styles.row}>
        <ProviderIcon name={card.name} color={card.color} provider={card.provider} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T variant="subtitle" numberOfLines={1} style={{ fontSize: 18, fontWeight: "700" }}>{card.name}</T>
          <T variant="small">{card.dueDay ? "Vence el día " + card.dueDay : "Tarjeta de crédito"}</T>
        </View>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] }}>{money(summary.total)}</Text>
      </View>

      {statement ? (
        <View style={{ flexDirection: "row", gap: 8, backgroundColor: colors.surface2, borderRadius: radius.field, padding: 12 }}>
          <View style={{ marginTop: 2 }}><Icon name="Mail" size={16} color={colors.primaryText} /></View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <T style={{ fontWeight: "600", fontSize: 14 }}>Resumen {statement.source === "pdf" ? "leído del PDF" : statement.source === "gmail" ? "que llegó por mail" : "del mes"}: {money(statement.total)}{statement.totalUsd > 0 ? " + " + usd(statement.totalUsd) : ""}</T>
            {statementDetail ? <T variant="small" style={{ fontSize: 13 }}>{statementDetail}</T> : null}
            {statement.source !== "pdf" && Math.abs(diff) >= 1 ? <T variant="small" style={{ fontSize: 13, marginTop: 4 }}>Cargado en la app: {money(summary.loaded)} · {diff > 0 ? "hay " + money(diff) + " de compras que no están cargadas acá" : "cargaste " + money(-diff) + " de más (¿alguna cuota ya terminó?)"}</T> : null}
            {statement.lines.length > 0 ? (
              <>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: showLines }} onPress={() => setShowLines(!showLines)} style={[styles.row, { minHeight: 44, gap: 6 }]}>
                  <Text style={{ color: colors.primaryText, fontWeight: "600", fontSize: 14 }}>{showLines ? "Ocultar los gastos del resumen" : "Ver los " + spentLines + " gastos del resumen"}</Text>
                  <Icon name={showLines ? "ChevronDown" : "ChevronRight"} size={16} color={colors.primaryText} />
                </Pressable>
                {showLines ? statement.lines.map((line, index) => (
                  <View key={index} style={[styles.row, { gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T numberOfLines={1} style={{ fontSize: 14 }}>{line.description}</T>
                      <T variant="small">{[line.date && shortDate(line.date, "short"), line.cuota && "cuota " + line.cuota.n + " de " + line.cuota.m, line.kind === "cargo" && "impuesto o cargo", line.kind === "pago" && "pago"].filter(Boolean).join(" · ")}</T>
                    </View>
                    <Text style={{ fontSize: 14, color: line.kind === "pago" ? colors.income : colors.text, fontVariant: ["tabular-nums"] }}>{line.kind === "pago" ? "−" : ""}{line.currency === "USD" ? usd(line.amount) : money(line.amount)}</Text>
                  </View>
                )) : null}
              </>
            ) : null}
          </View>
        </View>
      ) : null}

      {monthItems.length === 0 ? (
        <T variant="small" style={{ fontSize: 14 }}>No hay cuotas ni débitos fijos para este mes.</T>
      ) : (
        <View>
          {monthItems.map((item, index) => {
            const n = installmentNumber(item, month) ?? 1;
            const last = lastMonth(item);
            return (
              <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={"Editar " + item.description + ", " + money(item.amount)} onPress={() => editItem(item)}
                style={({ pressed }) => [styles.row, { minHeight: 52, paddingVertical: 8, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <T numberOfLines={1} style={{ fontWeight: "600" }}>{item.description}</T>
                  {item.kind === "cuotas" ? (
                    <>
                      <T variant="small">Cuota {n} de {item.installments} · {n === item.installments ? "última cuota" : "se cancela en " + (last ? monthLabel(last).toLowerCase() : "")}</T>
                      <View style={{ height: 6, maxWidth: 192, borderRadius: 3, overflow: "hidden", backgroundColor: colors.surface2, marginTop: 4 }}>
                        <View style={{ height: 6, width: `${(n / (item.installments ?? 1)) * 100}%`, borderRadius: 3, backgroundColor: card.color }} />
                      </View>
                    </>
                  ) : <T variant="small">Todos los meses</T>}
                </View>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text, fontVariant: ["tabular-nums"] }}>{money(item.amount)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {remaining > 0 ? <T variant="small" style={{ fontSize: 14 }}>Después de este mes te quedan <Text style={{ color: colors.text, fontWeight: "700" }}>{money(remaining)}</Text> en cuotas por pagar.</T> : null}

      {summary.payment ? (
        <Pressable accessibilityRole="button" accessibilityLabel={"Pagaste " + money(summary.payment.amount) + ". Tocá para desmarcar el pago de " + card.name} onPress={onUnpay}
          style={({ pressed }) => ({ minHeight: 48, borderRadius: radius.field, backgroundColor: colors.surface2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: pressed ? 0.7 : 1 })}>
          <Icon name="Check" size={18} color={colors.income} /><Text style={{ color: colors.income, fontWeight: "600", fontSize: 15 }}>Pagaste {money(summary.payment.amount)}</Text>
        </Pressable>
      ) : summary.total > 0 ? (
        <Button label="Marcar el resumen como pagado" onPress={() => router.push({ pathname: "/pagar", params: { tipo: "tarjeta", id: card.id, mes: month } })} />
      ) : null}

      <View style={[styles.row, { gap: 8 }]}>
        <Button label="Agregar cuota o débito" icon="Plus" variant="soft" onPress={() => editItem()} style={{ flex: 1 }} accessibilityLabel={"Agregar cuota o débito a " + card.name} />
        <IconButton icon="Trash2" label={"Eliminar " + card.name} onPress={onRemove} size={48} />
      </View>
    </Card>
  );
}
