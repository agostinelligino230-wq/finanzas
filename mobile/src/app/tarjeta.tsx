import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { currentMonthISO } from "../../../shared/format";
import { COLORS } from "../../../shared/categorias";
import { KIND_LABELS, PROVIDERS, type Provider } from "../../../shared/providers";
import { useAuth } from "../lib/auth";
import { useCards } from "../lib/cards";
import { radius, useColors } from "../lib/theme";
import { Icon } from "../components/Icon";
import { ProviderIcon } from "../components/ProviderIcon";
import { SheetScreen, close } from "../components/fixedUi";
import { Button, ErrorBox, Field, T, styles } from "../components/ui";

export default function NewCardScreen() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/login" />;
  return <NewCard userId={session.user.id} />;
}

// Elegir banco o billetera para una tarjeta nueva. Con despues=cuota, al crearla sigue a cargar la cuota.
function NewCard({ userId }: { userId: string }) {
  const { despues, mes } = useLocalSearchParams<{ despues?: string; mes?: string }>();
  const colors = useColors();
  const { addCard } = useCards(userId);
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [picked, setPicked] = useState<Provider | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[6]);
  const [dueDay, setDueDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const text = query.trim().toLowerCase();
  const list = PROVIDERS.filter((provider) => !text || provider.name.toLowerCase().includes(text));

  const choose = (provider: Provider | null) => {
    setPicked(provider);
    setName(provider ? provider.name : query.trim());
    setColor(provider ? provider.color : COLORS[6]);
    setError("");
    setStep("form");
  };

  const save = async () => {
    if (!name.trim()) { setError("Poné un nombre para la tarjeta."); return; }
    setBusy(true);
    const created = await addCard({ name: name.trim(), color, dueDay: dueDay ? Math.min(31, Math.max(1, Number(dueDay))) : null, provider: picked?.id ?? null });
    setBusy(false);
    if (!created) { setError("No se pudo crear la tarjeta."); return; }
    if (despues === "cuota") router.replace({ pathname: "/cuota", params: { tarjeta: created.id, mes: mes && /^\d{4}-\d{2}$/.test(mes) ? mes : currentMonthISO() } });
    else close();
  };

  if (step === "pick") {
    return (
      <SheetScreen title="¿De qué banco o billetera es?">
        <View style={[styles.row, { gap: 8, minHeight: 48, borderRadius: radius.field, paddingHorizontal: 16, backgroundColor: colors.surface2 }]}>
          <Icon name="Search" size={18} color={colors.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Buscar: Naranja X, Santander…" placeholderTextColor={colors.muted} autoFocus accessibilityLabel="Buscar banco o billetera" style={{ flex: 1, minHeight: 48, fontSize: 16, color: colors.text }} />
        </View>
        {(["billetera", "banco", "tarjeta"] as const).map((kind) => {
          const group = list.filter((provider) => provider.kind === kind);
          if (group.length === 0) return null;
          return (
            <View key={kind} style={{ gap: 8 }}>
              <T variant="label">{KIND_LABELS[kind]}</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 }}>
                {group.map((provider) => (
                  <Pressable key={provider.id} accessibilityRole="button" accessibilityLabel={provider.name} onPress={() => choose(provider)}
                    style={({ pressed }) => [styles.row, { width: "48.5%", gap: 8, minHeight: 52, padding: 8, borderRadius: radius.field, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.surface2 : colors.surface }]}>
                    <ProviderIcon name={provider.name} color={provider.color} provider={provider.id} size={34} />
                    <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontWeight: "600", fontSize: 14 }}>{provider.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
        <Pressable accessibilityRole="button" onPress={() => choose(null)} style={({ pressed }) => ({ minHeight: 48, borderRadius: radius.field, borderWidth: 2, borderStyle: "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 12, opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 14 }}>{query.trim() ? "Usar “" + query.trim() + "”" : "Otra tarjeta (escribir el nombre)"}</Text>
        </Pressable>
      </SheetScreen>
    );
  }

  return (
    <SheetScreen title="Nueva tarjeta">
      <View style={styles.row}>
        <ProviderIcon key={(picked?.id ?? "") + name} name={name || "?"} color={color} provider={picked?.id} size={48} />
        <View style={{ flex: 1 }}><Field value={name} onChangeText={setName} placeholder="Ej.: Visa Santander" autoFocus={!picked} maxLength={60} accessibilityLabel="Nombre de la tarjeta" /></View>
      </View>
      <Field label="Día de vencimiento (opcional)" value={dueDay} onChangeText={(value) => setDueDay(value.replace(/\D/g, "").slice(0, 2))} keyboardType="number-pad" maxLength={2} placeholder="Ej.: 8" />
      <View style={{ gap: 8 }}>
        <T variant="label">Color</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {COLORS.map((value) => (
            <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: color === value }} accessibilityLabel={"Color " + value} onPress={() => setColor(value)} hitSlop={4}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: value, alignItems: "center", justifyContent: "center" }}>
              {color === value ? <Icon name="Check" size={16} color="#ffffff" /> : null}
            </Pressable>
          ))}
        </View>
      </View>
      <ErrorBox message={error} />
      <Button label={busy ? "Guardando…" : "Crear tarjeta"} onPress={save} busy={busy} />
      <Button label="Elegir otro banco" variant="ghost" onPress={() => setStep("pick")} />
    </SheetScreen>
  );
}
