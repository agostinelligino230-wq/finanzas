import { useState } from "react";
import { Switch, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { currentMonthISO, monthLabel, parseAmount } from "../../../shared/format";
import { cardMonthSummary } from "../../../shared/tarjetas";
import { useAuth } from "../lib/auth";
import { useCards } from "../lib/cards";
import { useFixed } from "../lib/fixed";
import { useColors } from "../lib/theme";
import { SheetNote, SheetPending, SheetScreen, close } from "../components/fixedUi";
import { Button, ErrorBox, Field, T, styles } from "../components/ui";

export default function PayScreen() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/login" />;
  return <Pay userId={session.user.id} />;
}

function Pay({ userId }: { userId: string }) {
  const { tipo, id, mes } = useLocalSearchParams<{ tipo?: string; id?: string; mes?: string }>();
  const month = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : currentMonthISO();
  return tipo === "tarjeta" ? <PayCard userId={userId} id={id ?? ""} month={month} /> : <PayFixed userId={userId} id={id ?? ""} month={month} />;
}

function PayFixed({ userId, id, month }: { userId: string; id: string; month: string }) {
  const fixed = useFixed(userId, month);
  const row = fixed.rows.find((entry) => entry.item.id === id);
  if (!row) return <SheetPending title="Pagar" loaded={fixed.loaded} missing={"No encontramos este gasto fijo en " + monthLabel(month).toLowerCase() + "."} />;
  return <PayForm key={row.item.id} title={row.item.name} month={month} suggested={row.amount} onConfirm={(amount, add) => fixed.pay(row, amount, add)} />;
}

function PayCard({ userId, id, month }: { userId: string; id: string; month: string }) {
  const { cards, items, statements, payments, loaded, payCard } = useCards(userId);
  const card = cards.find((entry) => entry.id === id);
  if (!card) return <SheetPending title="Pagar" loaded={loaded} missing="No encontramos esta tarjeta." />;
  const suggested = cardMonthSummary(items, statements, card.id, month, payments).total;
  return <PayForm key={card.id} title={"tarjeta " + card.name} detail={"Resumen de " + monthLabel(month).toLowerCase()} month={month} suggested={suggested} onConfirm={(amount, add) => payCard(card, month, amount, add)} />;
}

// Confirmación al marcar algo como pagado: se puede ajustar el monto y elegir si se suma a los gastos.
function PayForm({ title, detail, month, suggested, onConfirm }: { title: string; detail?: string; month: string; suggested: number; onConfirm: (amount: number, addToExpenses: boolean) => Promise<boolean> }) {
  const colors = useColors();
  const [amount, setAmount] = useState(String(Math.round(suggested * 100) / 100).replace(".", ","));
  const [add, setAdd] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const value = parseAmount(amount);

  const confirm = async () => {
    if (!(value >= 0) || amount.trim() === "") { setError("Escribí cuánto pagaste."); return; }
    setBusy(true);
    const ok = await onConfirm(value, add);
    setBusy(false);
    if (ok) close(); else setError("No se pudo guardar. Probá de nuevo.");
  };

  return (
    <SheetScreen title={"Pagar " + title}>
      {detail ? <T variant="small" style={{ fontSize: 14, marginTop: -8 }}>{detail}</T> : null}
      <Field label="Cuánto pagaste" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" autoFocus selectTextOnFocus style={{ fontSize: 22, fontWeight: "700", minHeight: 56 }} />
      <SheetNote>
        <View style={[styles.row, { alignItems: "flex-start" }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <T style={{ fontWeight: "600" }}>Sumarlo a mis gastos de {monthLabel(month).toLowerCase()}</T>
            <T variant="small" style={{ fontSize: 13 }}>Así se descuenta de tu disponible en Inicio. Apagalo si ya lo cargaste (por ejemplo, si te aparece como transferencia).</T>
          </View>
          <Switch value={add} onValueChange={setAdd} trackColor={{ true: colors.income, false: colors.border }} accessibilityLabel={"Sumarlo a mis gastos de " + monthLabel(month).toLowerCase()} />
        </View>
      </SheetNote>
      <ErrorBox message={error} />
      <Button label={busy ? "Guardando…" : "Marcar como pagado"} onPress={confirm} busy={busy} />
    </SheetScreen>
  );
}
