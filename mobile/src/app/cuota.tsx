import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { currentMonthISO, money, monthLabel, parseAmount, shiftMonth } from "../../../shared/format";
import { installmentNumber, type CardItem, type CardItemKind, type CreditCard } from "../../../shared/tarjetas";
import { useAuth } from "../lib/auth";
import { useCards } from "../lib/cards";
import { radius, useColors } from "../lib/theme";
import { Icon } from "../components/Icon";
import { ProviderIcon } from "../components/ProviderIcon";
import { SheetNote, SheetPending, SheetScreen, close, confirmAction } from "../components/fixedUi";
import { Button, ErrorBox, Field, Segmented, T, styles } from "../components/ui";

export default function CardItemScreen() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/login" />;
  return <CardItemSheet userId={session.user.id} />;
}

function CardItemSheet({ userId }: { userId: string }) {
  const { tarjeta, mes, id } = useLocalSearchParams<{ tarjeta?: string; mes?: string; id?: string }>();
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : currentMonthISO();
  const { cards, items, loaded, saveItem, removeItem } = useCards(userId);
  // Guarda el último visto: al eliminarlo sale de la lista mientras la hoja se cierra.
  const last = useRef<CardItem | null>(null);
  const found = id ? items.find((entry) => entry.id === id) : undefined;
  if (found) last.current = found;
  const editing = found ?? last.current ?? undefined;
  if (!loaded && cards.length === 0) return <SheetPending title="Cuota o débito de tarjeta" loaded={false} missing="" />;
  if (id && !editing) return <SheetPending title="Editar cuota o débito" loaded={loaded} missing="Esta cuota o débito ya no está." />;
  return <CardItemForm key={(editing?.id ?? "new") + month} editing={editing} initialCard={tarjeta} cards={cards} month={month} onSave={saveItem} onRemove={removeItem} />;
}

function CardItemForm({ editing, initialCard, cards, month, onSave, onRemove }: {
  editing?: CardItem; initialCard?: string; cards: CreditCard[]; month: string;
  onSave: (input: Omit<CardItem, "id"> & { id?: string }) => Promise<boolean>;
  onRemove: (item: CardItem) => Promise<boolean>;
}) {
  const colors = useColors();
  const [cardId, setCardId] = useState(editing?.cardId ?? initialCard ?? cards[0]?.id ?? "");
  const [kind, setKind] = useState<CardItemKind>(editing?.kind ?? "cuotas");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.amount).replace(".", ",") : "");
  const [current, setCurrent] = useState(editing?.kind === "cuotas" ? String(Math.max(1, installmentNumber({ ...editing, kind: "fijo", endMonth: null }, month) ?? 1)) : "1");
  const [total, setTotal] = useState(editing?.installments ? String(editing.installments) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const card = cards.find((entry) => entry.id === cardId);
  const monthName = monthLabel(month).toLowerCase();

  const value = parseAmount(amount);
  const n = Number(current) || 0;
  const N = Number(total) || 0;
  const valid = kind === "fijo" || (n >= 1 && N >= 1 && n <= N);
  const firstMonth = kind === "cuotas" ? shiftMonth(month, -(n - 1)) : editing?.kind === "fijo" ? editing.firstMonth : month;
  const end = kind === "cuotas" && valid ? shiftMonth(firstMonth, N - 1) : null;

  const save = async () => {
    if (!card) { setError("Elegí la tarjeta."); return; }
    if (!description.trim()) { setError("Escribí qué es, por ejemplo Ventilador."); return; }
    if (!(value > 0)) { setError("Escribí el monto que pagás por mes."); return; }
    if (!valid) { setError("Revisá las cuotas: la cuota de este mes no puede ser mayor al total."); return; }
    setBusy(true);
    const ok = await onSave({ id: editing?.id, cardId: card.id, description: description.trim(), kind, amount: value, installments: kind === "cuotas" ? N : null, firstMonth, endMonth: kind === "fijo" ? editing?.endMonth ?? null : null });
    setBusy(false);
    if (ok) close(); else setError("No se pudo guardar.");
  };

  const stopFixed = async () => {
    if (!editing) return;
    setBusy(true);
    const ok = await onSave({ ...editing, endMonth: shiftMonth(month, -1) });
    setBusy(false);
    if (ok) close(); else setError("No se pudo guardar.");
  };

  const remove = () => {
    if (!editing) return;
    confirmAction("¿Eliminar " + editing.description + "?", "Se borra de todos los meses.", "Eliminar", async () => {
      setBusy(true);
      const ok = await onRemove(editing);
      setBusy(false);
      if (ok) close(); else setError("No se pudo eliminar.");
    });
  };

  return (
    <SheetScreen title={editing ? "Editar en " + (card?.name ?? "la tarjeta") : "Cuota o débito de tarjeta"}>
      {!editing ? (
        <View style={{ gap: 8 }}>
          <T variant="label">Tarjeta</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {cards.map((entry) => {
              const active = entry.id === cardId;
              return (
                <Pressable key={entry.id} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => setCardId(entry.id)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 10, borderRadius: radius.field, borderWidth: 2, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : colors.surface }}>
                  <ProviderIcon name={entry.name} color={entry.color} provider={entry.provider} size={24} />
                  <Text style={{ color: active ? colors.primaryText : colors.text, fontWeight: "600" }}>{entry.name}</Text>
                </Pressable>
              );
            })}
            <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: "/tarjeta", params: { despues: "cuota", mes: month } })}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: radius.field, borderWidth: 2, borderStyle: "dashed", borderColor: colors.border }}>
              <Icon name="Plus" size={16} color={colors.muted} /><Text style={{ color: colors.muted, fontWeight: "600" }}>Nueva tarjeta</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Segmented value={kind} onChange={setKind} options={[{ value: "cuotas", label: "En cuotas" }, { value: "fijo", label: "Fijo mensual" }]} />
      <Field label="Qué es" value={description} onChangeText={setDescription} placeholder={kind === "cuotas" ? "Ej.: Ventilador" : "Ej.: Spotify, seguro"} maxLength={80} />
      <Field label={kind === "cuotas" ? "Monto de cada cuota" : "Monto por mes"} value={amount} onChangeText={setAmount} placeholder="$ 0" keyboardType="decimal-pad" style={{ fontVariant: ["tabular-nums"] }} />

      {kind === "cuotas" ? (
        <View style={{ gap: 8 }}>
          <T variant="label">Cuota que pagás en {monthName}</T>
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Field value={current} onChangeText={(text) => setCurrent(text.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" maxLength={3} accessibilityLabel="Cuota actual" style={{ textAlign: "center", fontVariant: ["tabular-nums"] }} /></View>
            <T color={colors.muted}>de</T>
            <View style={{ flex: 1 }}><Field value={total} onChangeText={(text) => setTotal(text.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" maxLength={3} placeholder="12" accessibilityLabel="Total de cuotas" style={{ textAlign: "center", fontVariant: ["tabular-nums"] }} /></View>
          </View>
          {valid && value > 0 && end ? (
            <SheetNote>
              <T style={{ fontSize: 14 }}>Se cancela en <Text style={{ fontWeight: "700" }}>{monthLabel(end).toLowerCase()}</Text>. Total de la compra {money(value * N)} · te quedan {money(value * (N - n + 1))} contando esta cuota.</T>
            </SheetNote>
          ) : null}
        </View>
      ) : null}

      <ErrorBox message={error} />
      <Button label={busy ? "Guardando…" : "Guardar"} onPress={save} busy={busy} />
      {editing ? (
        <View style={[styles.row, { gap: 8 }]}>
          {editing.kind === "fijo" ? <Button label={"Dar de baja desde " + monthName} variant="secondary" disabled={busy} onPress={stopFixed} style={{ flex: 1 }} /> : null}
          <Button label="Eliminar" icon="Trash2" variant="danger" disabled={busy} onPress={remove} style={{ flex: 1 }} accessibilityLabel={"Eliminar " + editing.description} />
        </View>
      ) : null}
    </SheetScreen>
  );
}
