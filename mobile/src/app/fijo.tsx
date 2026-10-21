import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { currentMonthISO, monthLabel, parseAmount } from "../../../shared/format";
import { FIXED_KINDS, FIXED_LABELS, type Fixed, type FixedInput, type FixedKind, type FixedRowView } from "../../../shared/fijos";
import { useAuth } from "../lib/auth";
import { useFixed } from "../lib/fixed";
import { radius, useColors } from "../lib/theme";
import { Icon } from "../components/Icon";
import { FIXED_ICONS, RadioRow, SheetNote, SheetPending, SheetScreen, close, confirmAction } from "../components/fixedUi";
import { Button, ErrorBox, Field, IconButton, T, styles } from "../components/ui";

export default function FixedSheetScreen() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/login" />;
  return <FixedSheet userId={session.user.id} />;
}

function FixedSheet({ userId }: { userId: string }) {
  const { mes, id } = useLocalSearchParams<{ mes?: string; id?: string }>();
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : currentMonthISO();
  const fixed = useFixed(userId, month);
  // Guarda la última fila vista: al dejar de pagarlo o borrarlo sale de la lista mientras la hoja se cierra.
  const last = useRef<FixedRowView | null>(null);
  const found = id ? fixed.rows.find((row) => row.item.id === id) : undefined;
  if (found) last.current = found;
  const row = found ?? last.current;
  const actions = { onCreate: fixed.create, onUpdate: fixed.update, onStop: fixed.stop, onDelete: fixed.remove };
  if (!id) return <FixedForm key="new" month={month} amountNow={null} {...actions} />;
  if (!row) return <SheetPending title="Editar gasto fijo" loaded={fixed.loaded} missing={"Este gasto fijo no está en " + monthLabel(month).toLowerCase() + "."} />;
  return <FixedForm key={row.item.id} item={row.item} month={month} amountNow={row.amount} {...actions} />;
}

function FixedForm({ item, month, amountNow, onCreate, onUpdate, onStop, onDelete }: {
  item?: Fixed; month: string; amountNow: number | null;
  onCreate: (input: FixedInput) => Promise<boolean>;
  onUpdate: (item: Fixed, input: FixedInput & { scope: "desde" | "solo" }) => Promise<boolean>;
  onStop: (item: Fixed) => Promise<boolean>;
  onDelete: (item: Fixed) => Promise<boolean>;
}) {
  const colors = useColors();
  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState(amountNow !== null ? String(amountNow).replace(".", ",") : "");
  const [category, setCategory] = useState<FixedKind>(item?.category ?? "servicio");
  const [dueDay, setDueDay] = useState(String(item?.dueDay ?? 1));
  const [scope, setScope] = useState<"desde" | "solo">("desde");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const value = parseAmount(amount);
  const changedAmount = Boolean(item) && amountNow !== null && value !== amountNow;
  const monthName = monthLabel(month).toLowerCase();

  const save = async () => {
    if (!name.trim()) { setError("Escribí qué gasto es, por ejemplo Gimnasio."); return; }
    if (!(value >= 0) || amount.trim() === "") { setError("Escribí el monto."); return; }
    const input = { name: name.trim(), amount: value, category, dueDay: Math.min(31, Math.max(1, Number(dueDay) || 1)) };
    setBusy(true);
    const ok = item ? await onUpdate(item, { ...input, scope }) : await onCreate(input);
    setBusy(false);
    if (ok) close(); else setError("No se pudo guardar. Probá de nuevo.");
  };

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await action();
    setBusy(false);
    if (ok) close(); else setError("No se pudo guardar. Probá de nuevo.");
  };

  return (
    <SheetScreen title={item ? "Editar gasto fijo" : "Nuevo gasto fijo"}>
      <Field label="Qué es" value={name} onChangeText={setName} placeholder="Ej.: Gimnasio, luz, alquiler" autoFocus={!item} maxLength={80} />
      <Field label={"Monto en " + monthName} value={amount} onChangeText={setAmount} placeholder="$ 0" keyboardType="decimal-pad" style={{ fontVariant: ["tabular-nums"] }} />
      {changedAmount ? (
        <SheetNote>
          <T style={{ fontWeight: "600" }}>¿Desde cuándo cambia el monto?</T>
          <RadioRow selected={scope === "desde"} onPress={() => setScope("desde")} title={"Desde " + monthName + " en adelante"} hint="Los meses anteriores quedan como estaban." />
          <RadioRow selected={scope === "solo"} onPress={() => setScope("solo")} title={"Solo en " + monthName} hint="El mes que viene vuelve al monto anterior." />
        </SheetNote>
      ) : null}

      <View style={{ gap: 8 }}>
        <T variant="label">Tipo</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {FIXED_KINDS.map((kind) => {
            const active = category === kind;
            return (
              <Pressable key={kind} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => setCategory(kind)}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 2, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : colors.surface }}>
                <Icon name={FIXED_ICONS[kind]} size={16} color={active ? colors.primaryText : colors.muted} />
                <Text style={{ color: active ? colors.primaryText : colors.text, fontWeight: active ? "700" : "500" }}>{FIXED_LABELS[kind]}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Field label="Vence el día" value={dueDay} onChangeText={(text) => setDueDay(text.replace(/\D/g, "").slice(0, 2))} keyboardType="number-pad" maxLength={2} style={{ fontVariant: ["tabular-nums"] }} />
      {!item ? <T variant="small" style={{ fontSize: 13 }}>Empieza a contar desde {monthName}.</T> : null}

      <ErrorBox message={error} />
      <Button label={busy ? "Guardando…" : item ? "Guardar cambios" : "Agregar gasto fijo"} onPress={save} busy={busy} />
      {item ? (
        <View style={[styles.row, { gap: 8 }]}>
          <Button label={"Ya no lo pago desde " + monthName} variant="secondary" disabled={busy} onPress={() => run(() => onStop(item))} style={{ flex: 1 }} />
          <IconButton icon="Trash2" label="Borrar del todo" color={colors.expense} size={48} onPress={() => confirmAction("¿Borrar " + item.name + "?", "Se borra de todos los meses, incluido el historial.", "Borrar", () => { run(() => onDelete(item)); })} />
        </View>
      ) : null}
    </SheetScreen>
  );
}
