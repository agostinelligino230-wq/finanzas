import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { Redirect, router, useLocalSearchParams, usePreventRemove } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { dayText, daysAgoISO, money, parseAmount, parseDay, todayISO } from "../../../shared/format";
import { COLORS } from "../../../shared/categorias";
import { getDollarQuote, type DollarQuote } from "../../../shared/dollar";
import type { Currency, Movement, MovementType } from "../../../shared/movimientos";
import { useAuth } from "../lib/auth";
import { useCategories } from "../lib/categories";
import { useMovements } from "../lib/movements";
import { radius, useColors } from "../lib/theme";
import { Icon } from "../components/Icon";
import { IconColorPicker } from "../components/IconColorPicker";
import { toast } from "../components/Toast";
import { Button, CategoryIcon, ErrorBox, Field, IconButton, Loading, Segmented, T, styles } from "../components/ui";

export default function AddMovementScreen() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/login" />;
  return <AddMovement userId={session.user.id} />;
}

// Sin id: movimiento nuevo. Con id: corregir uno que llegó solo (queda confirmado al guardar).
function AddMovement({ userId }: { userId: string }) {
  const { tipo, id } = useLocalSearchParams<{ tipo?: string; id?: string }>();
  const colors = useColors();
  const { all, loaded } = useMovements(userId);
  if (!id) return <MovementForm userId={userId} initialKind={tipo === "ingreso" ? "ingreso" : "gasto"} />;
  const editing = all.find((item) => item.id === id);
  // Si se vuelve a leer el mail y cambia lo leído, el formulario arranca de nuevo con lo nuevo.
  if (editing) return <MovementForm key={[editing.id, editing.type, editing.amount, editing.description].join("|")} userId={userId} initialKind={editing.type} editing={editing} />;
  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.surface, padding: 16, gap: 16 }}>
      {loaded ? (
        <>
          <T>Ese movimiento ya no está: puede que lo hayas borrado desde otro lado.</T>
          <Button label="Volver" variant="secondary" onPress={() => router.back()} />
        </>
      ) : <Loading label="Buscando el movimiento…" />}
    </SafeAreaView>
  );
}

// "1250.5" → "1250,5" para mostrar en el campo, como se escribe acá.
const amountText = (value: number | null) => (value === null ? "" : String(value).replace(".", ","));
const exact = (value: number) => "$ " + value.toLocaleString("es-AR", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 });

function MovementForm({ userId, initialKind, editing }: { userId: string; initialKind: MovementType; editing?: Movement }) {
  const colors = useColors();
  const { add, update, reread } = useMovements(userId);
  const { categories, addCategory } = useCategories(userId);
  const usdEdit = editing?.currency === "USD" && editing.original !== null;
  const [kind, setKind] = useState<MovementType>(initialKind);
  const [amount, setAmount] = useState(editing ? amountText(usdEdit ? editing.original : editing.amount) : "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [date, setDate] = useState(dayText(editing?.date ?? todayISO()));
  const [description, setDescription] = useState(editing?.description ?? "");
  const [paid, setPaid] = useState(editing?.paid ?? true);
  const [currency, setCurrency] = useState<Currency>(usdEdit ? "USD" : "ARS");
  const [rate, setRate] = useState(usdEdit ? amountText(editing.rate) : "");
  const [rateTouched, setRateTouched] = useState(usdEdit);
  const [quote, setQuote] = useState<DollarQuote | null>(null);
  const [quoteState, setQuoteState] = useState<"idle" | "loading" | "error">("idle");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [rereading, setRereading] = useState(false);

  const rereadMail = async () => {
    if (!editing) return;
    setRereading(true);
    setError("");
    const problem = await reread(editing);
    setRereading(false);
    if (problem) { setError(problem); return; }
    toast("Listo: volvimos a leer el mail.", { ok: true });
  };

  // Al elegir dólares, trae la cotización del momento y la propone (se puede cambiar).
  useEffect(() => {
    if (currency !== "USD" || quote || rateTouched) return;
    let active = true;
    setQuoteState("loading");
    getDollarQuote().then((result) => { if (!active) return; setQuote(result); setQuoteState(result ? "idle" : "error"); });
    return () => { active = false; };
  }, [currency, quote, rateTouched]);

  useEffect(() => {
    if (currency !== "USD" || !quote || rateTouched) return;
    setRate(String(Math.round(kind === "ingreso" ? quote.buy : quote.sell)));
  }, [currency, quote, kind, rateTouched]);

  // Si hay algo escrito, cerrar (X, deslizar o el botón atrás de Android) pregunta antes de perderlo.
  const fields = JSON.stringify([kind, amount, category, date, description, paid, currency, rate]);
  const [initialFields] = useState(fields);
  const dirty = editing ? fields !== initialFields : amount.trim() !== "" || description.trim() !== "";
  const allowLeave = usePreventRemove(dirty && !leaving, ({ repeat }) => {
    Alert.alert(editing ? "¿Salir sin guardar los cambios?" : kind === "gasto" ? "¿Descartar este gasto?" : "¿Descartar este ingreso?", "Lo que escribiste no se guarda.", [
      { text: "Seguir acá", style: "cancel" },
      { text: "Descartar", style: "destructive", onPress: () => { setLeaving(true); repeat(); } },
    ]);
  });

  const list = categories.filter((item) => item.kind === kind);
  const value = parseAmount(amount);
  const rateValue = parseAmount(rate);
  const pesos = currency === "USD" ? Math.round(value * rateValue * 100) / 100 : value;
  const day = parseDay(date);
  const quickDates = [{ label: "Hoy", value: todayISO() }, { label: "Ayer", value: daysAgoISO(1) }, { label: "Anteayer", value: daysAgoISO(2) }];

  const save = async () => {
    if (!(value > 0)) { setError("Escribí un monto mayor a cero."); return; }
    if (currency === "USD" && !(rateValue > 0)) { setError("Escribí a cuántos pesos está el dólar."); return; }
    if (!category) { setError("Elegí una categoría."); return; }
    if (!day) { setError("Escribí la fecha como " + dayText(todayISO()) + "."); return; }
    setBusy(true);
    const input = { description: description.trim(), amount: pesos, category, date: day, type: kind, paid: kind === "ingreso" ? true : paid, ...(currency === "USD" ? { currency: "USD" as const, original: value, rate: rateValue } : {}) };
    const ok = editing ? await update(editing, input) : await add(input);
    setBusy(false);
    if (!ok) { setError("No se pudo guardar. Revisá tu conexión y probá de nuevo: lo que escribiste sigue acá."); return; }
    allowLeave();
    if (editing) toast("Corregido: ya suma a tus " + (kind === "gasto" ? "gastos." : "ingresos."), { ok: true });
    router.back();
  };

  const title = editing ? "Revisar movimiento" : kind === "gasto" ? "Nuevo gasto" : "Nuevo ingreso";
  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.row, { paddingHorizontal: 16, paddingTop: 8 }]}>
          <T variant="title" style={{ flex: 1 }}>{title}</T>
          <IconButton icon="X" label="Cerrar" onPress={() => router.back()} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {editing?.readByAI ? (
            <View style={[styles.row, { alignItems: "flex-start", gap: 8, padding: 12, borderRadius: radius.field, backgroundColor: colors.primarySoft }]}>
              <Icon name="Sparkles" size={16} color={colors.primaryText} />
              <T style={{ flex: 1, fontSize: 14 }} color={colors.primaryText}>Este aviso lo leyó la IA porque no lo reconocimos. Revisá el monto y el tipo: al guardar queda confirmado.</T>
            </View>
          ) : editing ? <T variant="small" style={{ fontSize: 14 }}>Revisá lo que leímos del aviso. Al guardar queda confirmado y suma.</T> : null}
          {editing?.fromMail ? (
            <Button label={rereading ? "Leyendo el mail…" : "Volver a leer el mail"} icon="RefreshCw" variant="ghost" onPress={rereadMail} busy={rereading} disabled={busy || rereading} style={{ alignSelf: "flex-start", paddingHorizontal: 0 }} />
          ) : null}
          <Segmented value={kind} onChange={(next) => { setKind(next); if (!editing) setCategory(""); setCreating(false); }} options={[{ value: "gasto", label: "Gasto" }, { value: "ingreso", label: "Ingreso" }]} />

          <View style={{ gap: 6 }}>
            <View style={[styles.row, { justifyContent: "space-between" }]}>
              <T variant="label">Monto</T>
              <Segmented value={currency} onChange={setCurrency} options={[{ value: "ARS", label: "$" }, { value: "USD", label: "US$" }]} />
            </View>
            <Field value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" autoFocus={!editing} style={{ fontSize: 28, fontWeight: "700", minHeight: 64 }} accessibilityLabel={currency === "USD" ? "Monto en dólares" : "Monto en pesos"} />
            {currency === "ARS" && value > 0 && /[.,]/.test(amount) ? <T variant="small">Se guarda como {exact(value)}</T> : null}
            {currency === "USD" ? (
              <View style={{ gap: 6 }}>
                <Field label="Cotización (pesos por dólar)" value={rate} onChangeText={(text) => { setRate(text); setRateTouched(true); }} keyboardType="decimal-pad" />
                <T variant="small">{quoteState === "loading" ? "Buscando la cotización…" : quote ? "Sugerida: " + quote.source + " (" + (kind === "ingreso" ? "compra" : "venta") + "). Cambiala si tu billetera muestra otra." : quoteState === "error" ? "No pude traer la cotización: escribí la que te muestra tu billetera." : ""}</T>
                {value > 0 && rateValue > 0 ? <T variant="small" color={colors.text}>= {money(pesos)}</T> : null}
              </View>
            ) : null}
          </View>

          <View style={{ gap: 8 }}>
            <T variant="label">Categoría</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {list.map((item) => {
                const active = category === item.id;
                return (
                  <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => setCategory(item.id)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, borderRadius: radius.pill, borderWidth: 2, borderColor: active ? item.color : colors.border, backgroundColor: active ? colors.surface2 : colors.surface, minHeight: 44 }}>
                    <CategoryIcon category={item} size={28} />
                    <Text style={{ color: colors.text, fontWeight: active ? "700" : "500" }}>{item.name}</Text>
                  </Pressable>
                );
              })}
              <Pressable accessibilityRole="button" onPress={() => setCreating(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 2, borderStyle: "dashed", borderColor: colors.border, minHeight: 44 }}>
                <Icon name="Plus" size={16} color={colors.muted} /><Text style={{ color: colors.muted, fontWeight: "600" }}>Nueva</Text>
              </Pressable>
            </View>
            {creating ? <CategoryCreator kind={kind} onCancel={() => setCreating(false)} onCreate={async (input) => { const created = await addCategory(input); if (created) { setCategory(created.id); setCreating(false); } return Boolean(created); }} /> : null}
          </View>

          <Field label="Detalle (opcional)" value={description} onChangeText={setDescription} placeholder={kind === "gasto" ? "Ej.: luz, súper, nafta" : "Ej.: sueldo de octubre"} maxLength={120} />

          <View style={{ gap: 8 }}>
            <T variant="label">Fecha</T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {quickDates.map((item) => {
                const active = day === item.value;
                return <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => setDate(dayText(item.value))} style={{ flex: 1, minHeight: 44, borderRadius: radius.field, alignItems: "center", justifyContent: "center", backgroundColor: active ? colors.primary : colors.surface2 }}><Text style={{ color: active ? "#ffffff" : colors.text, fontWeight: "600" }}>{item.label}</Text></Pressable>;
              })}
            </View>
            <Field value={date} onChangeText={setDate} placeholder={dayText(todayISO())} keyboardType="numbers-and-punctuation" accessibilityLabel="Fecha (día/mes/año)" />
          </View>

          {kind === "gasto" ? (
            <View style={[styles.row, { justifyContent: "space-between", minHeight: 48 }]}>
              <View style={{ flex: 1 }}><T>Ya lo pagué</T><T variant="small">Si no, queda como pendiente del mes.</T></View>
              <Switch value={paid} onValueChange={setPaid} trackColor={{ true: colors.income, false: colors.border }} accessibilityLabel="Ya lo pagué" />
            </View>
          ) : null}

          <ErrorBox message={error} />
          <Button label={busy ? "Guardando…" : editing ? "Guardar y confirmar" : "Guardar"} onPress={save} busy={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CategoryCreator({ kind, onCreate, onCancel }: { kind: MovementType; onCreate: (input: { name: string; kind: MovementType; icon: string; color: string }) => Promise<boolean>; onCancel: () => void }) {
  const colors = useColors();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("Tag");
  const [color, setColor] = useState(COLORS[5]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const create = async () => {
    if (!name.trim()) { setError("Poné un nombre para la categoría."); return; }
    setBusy(true);
    const ok = await onCreate({ name: name.trim(), kind, icon, color });
    setBusy(false);
    if (!ok) setError("No se pudo crear la categoría. Probá de nuevo.");
  };
  return (
    <View style={{ gap: 12, padding: 12, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 }}>
      <View style={styles.row}>
        <CategoryIcon category={{ icon, color }} size={44} />
        <View style={{ flex: 1 }}><Field value={name} onChangeText={setName} placeholder={kind === "gasto" ? "Ej.: Plataformas" : "Ej.: Alquiler cobrado"} autoFocus accessibilityLabel="Nombre de la categoría" /></View>
      </View>
      <IconColorPicker icon={icon} color={color} onChange={(value) => { setIcon(value.icon); setColor(value.color); }} />
      <ErrorBox message={error} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="Cancelar" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
        <Button label="Crear" onPress={create} busy={busy} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
