import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { daysAgoISO, money, parseAmount, todayISO } from "../../../shared/format";
import { COLORS, ICON_GROUPS } from "../../../shared/categorias";
import { getDollarQuote, type DollarQuote } from "../../../shared/dollar";
import type { Currency, MovementType } from "../../../shared/movimientos";
import { useAuth } from "../lib/auth";
import { useCategories } from "../lib/categories";
import { useMovements } from "../lib/movements";
import { radius, useColors } from "../lib/theme";
import { Icon } from "../components/Icon";
import { Button, CategoryIcon, ErrorBox, Field, IconButton, Segmented, T, styles } from "../components/ui";

export default function AddMovementScreen() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/login" />;
  return <AddMovement userId={session.user.id} />;
}

function AddMovement({ userId }: { userId: string }) {
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  const colors = useColors();
  const { add } = useMovements(userId);
  const { categories, addCategory } = useCategories(userId);
  const [kind, setKind] = useState<MovementType>(tipo === "ingreso" ? "ingreso" : "gasto");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [paid, setPaid] = useState(true);
  const [currency, setCurrency] = useState<Currency>("ARS");
  const [rate, setRate] = useState("");
  const [rateTouched, setRateTouched] = useState(false);
  const [quote, setQuote] = useState<DollarQuote | null>(null);
  const [quoteState, setQuoteState] = useState<"idle" | "loading" | "error">("idle");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Al elegir dólares, trae la cotización del momento y la propone (se puede cambiar).
  useEffect(() => {
    if (currency !== "USD" || quote) return;
    let active = true;
    setQuoteState("loading");
    getDollarQuote().then((result) => { if (!active) return; setQuote(result); setQuoteState(result ? "idle" : "error"); });
    return () => { active = false; };
  }, [currency, quote]);

  useEffect(() => {
    if (currency !== "USD" || !quote || rateTouched) return;
    setRate(String(Math.round(kind === "ingreso" ? quote.buy : quote.sell)));
  }, [currency, quote, kind, rateTouched]);

  const list = categories.filter((item) => item.kind === kind);
  const value = parseAmount(amount);
  const rateValue = parseAmount(rate);
  const pesos = currency === "USD" ? Math.round(value * rateValue * 100) / 100 : value;
  const quickDates = [{ label: "Hoy", value: todayISO() }, { label: "Ayer", value: daysAgoISO(1) }, { label: "Anteayer", value: daysAgoISO(2) }];

  const save = async () => {
    if (!(value > 0)) { setError("Escribí un monto mayor a cero."); return; }
    if (currency === "USD" && !(rateValue > 0)) { setError("Escribí a cuántos pesos está el dólar."); return; }
    if (!category) { setError("Elegí una categoría."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date + "T12:00:00").getTime())) { setError("La fecha va como AAAA-MM-DD (por ejemplo " + todayISO() + ")."); return; }
    setBusy(true);
    const ok = await add({ description: description.trim(), amount: pesos, category, date, type: kind, paid: kind === "ingreso" ? true : paid, ...(currency === "USD" ? { currency: "USD" as const, original: value, rate: rateValue } : {}) });
    setBusy(false);
    if (ok) router.back();
    else setError("No se pudo guardar. Probá de nuevo.");
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.row, { paddingHorizontal: 16, paddingTop: 8 }]}>
          <T variant="title" style={{ flex: 1 }}>{kind === "gasto" ? "Nuevo gasto" : "Nuevo ingreso"}</T>
          <IconButton icon="X" label="Cerrar" onPress={() => router.back()} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Segmented value={kind} onChange={(next) => { setKind(next); setCategory(""); setCreating(false); }} options={[{ value: "gasto", label: "Gasto" }, { value: "ingreso", label: "Ingreso" }]} />

          <View style={{ gap: 6 }}>
            <View style={[styles.row, { justifyContent: "space-between" }]}>
              <T variant="label">Monto</T>
              <Segmented value={currency} onChange={setCurrency} options={[{ value: "ARS", label: "$" }, { value: "USD", label: "US$" }]} />
            </View>
            <Field value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" autoFocus style={{ fontSize: 28, fontWeight: "700", minHeight: 64 }} accessibilityLabel="Monto" />
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
                const active = date === item.value;
                return <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => setDate(item.value)} style={{ flex: 1, minHeight: 44, borderRadius: radius.field, alignItems: "center", justifyContent: "center", backgroundColor: active ? colors.primary : colors.surface2 }}><Text style={{ color: active ? "#ffffff" : colors.text, fontWeight: "600" }}>{item.label}</Text></Pressable>;
              })}
            </View>
            <Field value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" accessibilityLabel="Fecha (AAAA-MM-DD)" />
          </View>

          {kind === "gasto" ? (
            <View style={[styles.row, { justifyContent: "space-between", minHeight: 48 }]}>
              <View style={{ flex: 1 }}><T>Ya lo pagué</T><T variant="small">Si no, queda como pendiente del mes.</T></View>
              <Switch value={paid} onValueChange={setPaid} trackColor={{ true: colors.income, false: colors.border }} accessibilityLabel="Ya lo pagué" />
            </View>
          ) : null}

          <ErrorBox message={error} />
          <Button label={busy ? "Guardando…" : "Guardar"} onPress={save} busy={busy} />
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
      <T variant="label">Color</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {COLORS.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: color === value }} accessibilityLabel={"Color " + value} onPress={() => setColor(value)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: value, alignItems: "center", justifyContent: "center" }}>{color === value ? <Icon name="Check" size={16} color="#ffffff" /> : null}</Pressable>)}
      </View>
      {ICON_GROUPS.map((group) => (
        <View key={group.label} style={{ gap: 6 }}>
          <T variant="label">{group.label}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {group.icons.map((item) => { const active = icon === item; return <Pressable key={item} accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={item} onPress={() => setIcon(item)} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center", borderColor: active ? color : colors.border, backgroundColor: active ? color : "transparent" }}><Icon name={item} size={18} color={active ? "#ffffff" : colors.text} /></Pressable>; })}
          </View>
        </View>
      ))}
      <ErrorBox message={error} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="Cancelar" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
        <Button label="Crear" onPress={create} busy={busy} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
