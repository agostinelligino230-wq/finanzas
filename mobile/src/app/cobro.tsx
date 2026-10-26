import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { currentCycle, cycleText, type Cobro } from "../../../shared/cobro";
import { useAuth } from "../lib/auth";
import { saveCobro, useCobro } from "../lib/cobro";
import { useColors } from "../lib/theme";
import { Button, Card, ErrorBox, Screen, Segmented, T } from "../components/ui";

type Choice = "dia" | "ultimo" | "ninguno";
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
const choiceOf = (cobro: Cobro | null | undefined): Choice => (!cobro ? "dia" : cobro.ultimoHabil ? "ultimo" : cobro.dia ? "dia" : "ninguno");

// Día de cobro: se pregunta al entrar por primera vez (lo manda el layout de las pestañas) y se cambia desde «Más».
export default function CobroScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const current = useCobro(userId);
  if (!userId) return <Redirect href="/login" />;
  if (current === undefined) return <Screen title="Día de cobro"><T>Cargando…</T></Screen>;
  return <CobroForm userId={userId} current={current} />;
}

function CobroForm({ userId, current }: { userId: string; current: Cobro | null }) {
  const colors = useColors();
  const [choice, setChoice] = useState<Choice>(choiceOf(current));
  const [day, setDay] = useState(current?.dia ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cobro: Cobro = choice === "dia" ? { dia: day, ultimoHabil: false } : { dia: null, ultimoHabil: choice === "ultimo" };
  const preview = cycleText(currentCycle(cobro), cobro);
  const first = current === null;

  const save = async () => {
    setBusy(true);
    const result = await saveCobro(userId, cobro);
    setBusy(false);
    if (result) { setError(result); return; }
    if (first) router.replace("/");
    else router.back();
  };

  return (
    <Screen title="¿Qué día cobrás?" edges={["top", "bottom"]}>
      <T>Así «tu mes» va de un cobro al siguiente: el sueldo y lo que gastás con él quedan juntos.</T>
      <Segmented<Choice> value={choice} onChange={setChoice} options={[{ value: "dia", label: "Día fijo" }, { value: "ultimo", label: "Último hábil" }, { value: "ninguno", label: "Sin día" }]} />
      {choice === "dia" ? (
        <Card style={{ gap: 12 }}>
          <T variant="label">Día del mes</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {DAYS.map((value) => {
              const active = value === day;
              return (
                <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={"Día " + value} onPress={() => setDay(value)}
                  style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: active ? colors.primary : colors.surface2 }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: active ? "#ffffff" : colors.text, fontVariant: ["tabular-nums"] }}>{value}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      ) : null}
      <T variant="small">{preview ? "Tu mes de ahora va " + preview + ". Si el día cae sábado o domingo, tomamos el viernes anterior." : "Vas a ver cada mes del 1 al último día, como en el calendario."}</T>
      {first ? <T variant="small">Después, en Cuentas, conectá tu Gmail: traemos tus movimientos de los últimos 60 días, así tu mes arranca completo desde el día de cobro.</T> : null}
      {error ? <ErrorBox message={error} /> : null}
      <Button label="Guardar" onPress={save} busy={busy} />
      {first ? null : <Button label="Cancelar" variant="secondary" onPress={() => router.back()} />}
    </Screen>
  );
}
