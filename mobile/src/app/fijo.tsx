import { useRef, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { currentMonthISO, monthLabel, parseAmount } from "../../../shared/format";
import { FIXED_KINDS, FIXED_LABELS, PAYMENT_LABELS, PAYMENT_METHODS, REMINDER_OPTIONS, type Fixed, type FixedInput, type FixedKind, type FixedRowView, type PaymentMethod } from "../../../shared/fijos";
import { COLORS } from "../../../shared/categorias";
import { SERVICE_PROVIDERS, findProvider, type Provider } from "../../../shared/providers";
import { useAuth } from "../lib/auth";
import type { CreditCard } from "../../../shared/tarjetas";
import { useCards } from "../lib/cards";
import { useFixed } from "../lib/fixed";
import { radius, useColors } from "../lib/theme";
import { Icon } from "../components/Icon";
import { IconColorPicker } from "../components/IconColorPicker";
import { ProviderIcon } from "../components/ProviderIcon";
import { FIXED_ICONS, RadioRow, SheetNote, SheetPending, SheetScreen, close, confirmAction } from "../components/fixedUi";
import { Button, ErrorBox, Field, IconButton, MonthPicker, Segmented, T, styles } from "../components/ui";

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
  const { cards } = useCards(userId);
  const actions = { cards, onCreate: fixed.create, onUpdate: fixed.update, onStop: fixed.stop, onDelete: fixed.remove };
  if (!id) return <FixedForm key="new" month={month} amountNow={null} {...actions} />;
  if (!row) return <SheetPending title="Editar gasto fijo" loaded={fixed.loaded} missing={"Este gasto fijo no está en " + monthLabel(month).toLowerCase() + "."} />;
  return <FixedForm key={row.item.id} item={row.item} month={month} amountNow={row.usd ?? row.amount} {...actions} />;
}

// Botón redondo para elegir una opción entre varias (tipo, cómo se paga, aviso).
function Chip({ label, active, icon, onPress }: { label: string; active: boolean; icon?: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 2, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : colors.surface }}>
      {icon ? <Icon name={icon} size={16} color={active ? colors.primaryText : colors.muted} /> : null}
      <Text style={{ color: active ? colors.primaryText : colors.text, fontWeight: active ? "700" : "500" }}>{label}</Text>
    </Pressable>
  );
}

function FixedForm({ item, month, amountNow, cards, onCreate, onUpdate, onStop, onDelete }: {
  item?: Fixed; month: string; amountNow: number | null; cards: CreditCard[];
  onCreate: (input: FixedInput) => Promise<boolean>;
  onUpdate: (item: Fixed, input: FixedInput & { scope: "desde" | "solo" }) => Promise<boolean>;
  onStop: (item: Fixed) => Promise<boolean>;
  onDelete: (item: Fixed) => Promise<boolean>;
}) {
  const colors = useColors();
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<Provider | null>(findProvider(item?.provider));
  const [other, setOther] = useState(Boolean(item) && !item?.provider);
  const [name, setName] = useState(item?.name ?? "");
  const [look, setLook] = useState({ icon: item?.icon ?? "Tag", color: item?.color ?? findProvider(item?.provider)?.color ?? COLORS[5] });
  const [category, setCategory] = useState<FixedKind>(item?.category ?? "servicio");
  const [currency, setCurrency] = useState<"ARS" | "USD">(item?.currency ?? "ARS");
  const [amount, setAmount] = useState(amountNow !== null ? String(amountNow).replace(".", ",") : "");
  const [variable, setVariable] = useState(item?.variable ?? false);
  const [method, setMethod] = useState<PaymentMethod | null>(item?.paymentMethod ?? null);
  const [cardId, setCardId] = useState(item?.cardId ?? cards[0]?.id ?? null);
  const [dueDay, setDueDay] = useState(item ? String(item.dueDay) : "");
  const [reminder, setReminder] = useState<number | null>(item?.reminderDays ?? null);
  const [start, setStart] = useState(item?.startMonth ?? month);
  const [end, setEnd] = useState<string | null>(item?.endMonth ?? null);
  const [note, setNote] = useState(item?.note ?? "");
  const [scope, setScope] = useState<"desde" | "solo">("desde");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const value = parseAmount(amount);
  const changedAmount = Boolean(item) && amountNow !== null && value !== amountNow;
  const monthName = monthLabel(month).toLowerCase();
  const text = query.trim().toLowerCase();
  const services = SERVICE_PROVIDERS.filter((entry) => !text || entry.name.toLowerCase().includes(text));

  const choose = (entry: Provider) => {
    setProvider(entry);
    setOther(false);
    setName(entry.name);
    setLook({ icon: entry.icon ?? look.icon, color: entry.color });
    if (entry.fixedKind) setCategory(entry.fixedKind);
  };
  const chooseOther = () => { setProvider(null); setOther(true); setName(query.trim() || (provider ? "" : name)); };

  const save = async () => {
    if (!provider && !other) { setError("Elegí el servicio, o tocá «Otro» para escribirlo."); return; }
    if (!name.trim()) { setError("Escribí qué gasto es, por ejemplo Gimnasio."); return; }
    if (!(value >= 0) || amount.trim() === "") { setError("Escribí el monto."); return; }
    const day = Number(dueDay);
    if (!(day >= 1 && day <= 31)) { setError("Escribí el día de vencimiento, del 1 al 31."); return; }
    if (method === "tarjeta" && !cardId) { setError("Elegí con qué tarjeta lo pagás."); return; }
    if (end && end < start) { setError("El mes de fin no puede ser anterior al de inicio."); return; }
    const input: FixedInput = {
      name: name.trim(), amount: value, category, dueDay: day, provider: provider?.id ?? null, icon: provider ? provider.icon ?? null : look.icon, color: look.color, currency,
      paymentMethod: method, cardId, reminderDays: reminder, variable, note,
      // Un gasto viejo sin mes de inicio lo conserva si no se cambia: si no, desaparecería de los meses anteriores.
      startMonth: item && start === (item.startMonth ?? month) ? undefined : start, endMonth: end,
    };
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
      <View style={{ gap: 8 }}>
        <T variant="label">Servicio</T>
        <Field value={query} onChangeText={setQuery} placeholder="Buscar: Netflix, Edenor…" accessibilityLabel="Buscar servicio" />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {services.map((entry) => {
            const active = provider?.id === entry.id;
            return (
              <Pressable key={entry.id} accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={entry.name} onPress={() => choose(entry)}
                style={{ width: "31%", minHeight: 76, alignItems: "center", justifyContent: "center", gap: 4, padding: 6, borderRadius: radius.field, borderWidth: 2, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : colors.surface }}>
                <ProviderIcon name={entry.name} color={entry.color} provider={entry.id} size={32} />
                <Text numberOfLines={1} style={{ fontSize: 12, color: colors.text, fontWeight: active ? "700" : "500" }}>{entry.name}</Text>
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="radio" accessibilityState={{ selected: other }} accessibilityLabel="Otro" onPress={chooseOther}
            style={{ width: "31%", minHeight: 76, alignItems: "center", justifyContent: "center", gap: 4, padding: 6, borderRadius: radius.field, borderWidth: 2, borderStyle: "dashed", borderColor: other ? colors.primary : colors.border }}>
            <Icon name="Plus" size={24} color={colors.muted} />
            <Text style={{ fontSize: 12, color: colors.text, fontWeight: other ? "700" : "500" }}>Otro</Text>
          </Pressable>
        </View>
        {provider || other ? <Field label="Nombre" value={name} onChangeText={setName} placeholder="Ej.: Gimnasio, luz, alquiler" maxLength={80} /> : null}
        {provider || other ? <IconColorPicker icon={look.icon} color={look.color} onChange={setLook} colorOnly={!other} /> : null}
      </View>

      <View style={{ gap: 8 }}>
        <T variant="label">Tipo</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {FIXED_KINDS.map((kind) => <Chip key={kind} label={FIXED_LABELS[kind]} icon={FIXED_ICONS[kind]} active={category === kind} onPress={() => setCategory(kind)} />)}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <T variant="label">Monto</T>
        <Segmented value={currency} onChange={setCurrency} options={[{ value: "ARS", label: "Pesos" }, { value: "USD", label: "Dólares" }]} />
        <Field label={"Monto en " + monthName} value={amount} onChangeText={setAmount} placeholder={currency === "USD" ? "US$ 0" : "$ 0"} keyboardType="decimal-pad" style={{ fontVariant: ["tabular-nums"] }} />
        <View style={[styles.row, { justifyContent: "space-between", minHeight: 48 }]}>
          <T style={{ flex: 1 }}>Varía todos los meses</T>
          <Switch value={variable} onValueChange={setVariable} trackColor={{ true: colors.income, false: colors.border }} accessibilityLabel="Varía todos los meses" />
        </View>
        {changedAmount ? (
          <SheetNote>
            <T style={{ fontWeight: "600" }}>¿Desde cuándo cambia el monto?</T>
            <RadioRow selected={scope === "desde"} onPress={() => setScope("desde")} title={"Desde " + monthName + " en adelante"} hint="Los meses anteriores quedan como estaban." />
            <RadioRow selected={scope === "solo"} onPress={() => setScope("solo")} title={"Solo en " + monthName} hint="El mes que viene vuelve al monto anterior." />
          </SheetNote>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <T variant="label">Cómo lo pagás (opcional)</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PAYMENT_METHODS.map((entry) => <Chip key={entry} label={PAYMENT_LABELS[entry]} active={method === entry} onPress={() => setMethod(method === entry ? null : entry)} />)}
        </View>
        {method === "tarjeta" ? (
          cards.length === 0 ? <T variant="small">Todavía no cargaste tarjetas. Agregá una en Fijos y tarjetas.</T> : (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {cards.map((card) => <Chip key={card.id} label={card.name} active={cardId === card.id} onPress={() => setCardId(card.id)} />)}
              </View>
              <T variant="small">Cuando llegue el resumen de esa tarjeta, este gasto se cuenta adentro y no se suma dos veces.</T>
            </>
          )
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <Field label="Vence el día" value={dueDay} onChangeText={(value) => setDueDay(value.replace(/\D/g, "").slice(0, 2))} placeholder="1 a 31" keyboardType="number-pad" maxLength={2} style={{ fontVariant: ["tabular-nums"] }} />
        <T variant="small">Si el mes tiene menos días, vence el último.</T>
        <T variant="label">Aviso</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {REMINDER_OPTIONS.map((option) => <Chip key={option.label} label={option.label} active={reminder === option.value} onPress={() => setReminder(option.value)} />)}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <T variant="label">Desde qué mes</T>
        <MonthPicker month={start} onChange={setStart} />
        <View style={[styles.row, { justifyContent: "space-between", minHeight: 48 }]}>
          <T style={{ flex: 1 }}>Tiene mes de fin</T>
          <Switch value={end !== null} onValueChange={(on) => setEnd(on ? start : null)} trackColor={{ true: colors.income, false: colors.border }} accessibilityLabel="Tiene mes de fin" />
        </View>
        {end !== null ? <MonthPicker month={end} onChange={setEnd} /> : null}
        <Field label="Nota (opcional)" value={note} onChangeText={setNote} placeholder="Ej.: número de cliente" maxLength={200} />
      </View>

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
