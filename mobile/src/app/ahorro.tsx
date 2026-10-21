import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { money } from "../../../shared/format";
import { GOAL_PERIODS, normalizeDigits, type Goal, type GoalPeriod } from "../../../shared/ahorro";
import { useAuth } from "../lib/auth";
import { useSavings } from "../lib/savings";
import { radius, useColors } from "../lib/theme";
import { Icon, type IconName } from "../components/Icon";
import { Button, Card, ErrorBox, Field, IconButton, Loading, Screen, Segmented, T, styles } from "../components/ui";

const ICONS: Record<Goal["icon"], IconName> = { phone: "Smartphone", laptop: "Laptop", trip: "Plane", piggy: "PiggyBank" };
const PERIOD_LABELS: Record<GoalPeriod, string> = { mensual: "Mensual", semestral: "Semestral", anual: "Anual" };
// Solo dígitos y sin ceros adelante, como el campo numérico de la web.
const digits = (text: string) => normalizeDigits(text.replace(/\D/g, ""));
const goBack = () => (router.canGoBack() ? router.back() : router.replace("/mas"));

export default function SavingsScreen() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/login" />;
  return <Savings userId={session.user.id} />;
}

function Savings({ userId }: { userId: string }) {
  const colors = useColors();
  const { goals, error, refreshing, reload, addGoal, setSaved, saveSaved, removeGoal } = useSavings(userId);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [saved, setSavedText] = useState("");
  const [period, setPeriod] = useState<GoalPeriod>("mensual");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const totalTarget = goals.reduce((sum, goal) => sum + goal.target, 0);
  const totalSaved = goals.reduce((sum, goal) => sum + goal.saved, 0);
  const numericTarget = Number(target);
  const numericSaved = Number(saved) || 0;

  const create = async () => {
    if (!name.trim()) { setFormError("Escribí para qué ahorrás, por ejemplo Viaje."); return; }
    if (!(numericTarget > 0)) { setFormError("Escribí cuánto querés juntar."); return; }
    setFormError("");
    setBusy(true);
    const ok = await addGoal({ name: name.trim(), target: numericTarget, saved: numericSaved, period });
    setBusy(false);
    if (!ok) return;
    setName(""); setTarget(""); setSavedText(""); setPeriod("mensual");
  };

  const confirmRemove = (goal: Goal) => Alert.alert("¿Eliminar esta meta?", goal.name, [
    { text: "Cancelar", style: "cancel" },
    { text: "Eliminar", style: "destructive", onPress: () => removeGoal(goal.id) },
  ]);

  const summary: { icon: IconName; label: string; value: string }[] = [
    { icon: "Target", label: "Objetivo total", value: money(totalTarget) },
    { icon: "PiggyBank", label: "Monto ahorrado", value: money(totalSaved) },
    { icon: "Banknote", label: "Metas activas", value: String(goals.length) },
  ];

  return (
    <Screen refreshing={refreshing} onRefresh={reload}>
      <View style={[styles.row, { gap: 4, marginLeft: -8 }]}>
        <IconButton icon="ChevronLeft" label="Volver" onPress={goBack} color={colors.text} />
        <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: colors.text, flex: 1 }]}>Metas de ahorro</Text>
      </View>
      <View style={{ gap: 4 }}>
        <T variant="subtitle">Ahorrar con un objetivo claro</T>
        <T variant="small">Registrá lo que destinás a ahorro y distribuí ese monto entre tus metas.</T>
      </View>

      <ErrorBox message={error} onRetry={reload} />

      <Card style={{ gap: 4, paddingVertical: 8 }}>
        {summary.map((item) => (
          <View key={item.label} style={[styles.row, { minHeight: 44 }]}>
            <Icon name={item.icon} size={20} color={colors.primary} />
            <T variant="small" style={{ flex: 1 }}>{item.label}</T>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] }}>{item.value}</Text>
          </View>
        ))}
      </Card>

      <Card style={{ gap: 16 }}>
        <View style={styles.row}>
          <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft }}><Icon name="Plus" size={20} color={colors.primaryText} /></View>
          <View style={{ flex: 1 }}>
            <T variant="subtitle">Nueva meta</T>
            <T variant="small">El ícono se elige automáticamente según el nombre.</T>
          </View>
        </View>
        <Field label="Objetivo" value={name} onChangeText={setName} placeholder="Ej.: iPhone, notebook o viaje" maxLength={80} />
        <Field label="Monto objetivo" value={target} onChangeText={(text) => setTarget(digits(text))} placeholder="$ 0" keyboardType="number-pad" />
        <Field label="Ya ahorrado" value={saved} onChangeText={(text) => setSavedText(digits(text))} placeholder="$ 0" keyboardType="number-pad" />
        <View style={{ gap: 6 }}>
          <T variant="label">Plazo</T>
          <Segmented value={period} onChange={setPeriod} options={GOAL_PERIODS.map((value) => ({ value, label: PERIOD_LABELS[value] }))} />
        </View>
        <ErrorBox message={formError} />
        <Button label="Crear meta" icon="Plus" onPress={create} busy={busy} />
      </Card>

      <T variant="subtitle" style={{ fontSize: 20, marginTop: 8 }}>Tus metas</T>
      {goals.length === 0 ? (
        refreshing ? <Loading label="Cargando tus metas…" /> : (
          <Card style={{ alignItems: "center", paddingVertical: 32, gap: 4, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border }}>
            <Icon name="PiggyBank" size={32} color={colors.muted} />
            <T style={{ marginTop: 8 }}>Todavía no tenés metas creadas.</T>
            <T variant="small">Creá la primera desde el formulario superior.</T>
          </Card>
        )
      ) : goals.map((goal) => {
        const progress = goal.target > 0 ? Math.min((goal.saved / goal.target) * 100, 100) : 0;
        return (
          <Card key={goal.id} style={{ gap: 12 }}>
            <View style={[styles.row, { alignItems: "flex-start" }]}>
              <View style={{ width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft }}><Icon name={ICONS[goal.icon]} size={24} color={colors.primary} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T numberOfLines={1} style={{ fontSize: 17, fontWeight: "600" }}>{goal.name}</T>
                <T variant="small">Meta {goal.period}</T>
              </View>
              <IconButton icon="Trash2" label={"Eliminar meta " + goal.name} onPress={() => confirmRemove(goal)} />
            </View>
            <View style={[styles.row, { alignItems: "flex-end", justifyContent: "space-between" }]}>
              <T variant="small" style={{ flexShrink: 1 }}>Ahorrado <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] }}>{money(goal.saved)}</Text></T>
              <T variant="small">de {money(goal.target)}</T>
            </View>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress) }} style={{ height: 12, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.surface2 }}>
              <View style={{ height: "100%", width: `${progress}%`, borderRadius: radius.pill, backgroundColor: colors.primary }} />
            </View>
            <View style={styles.row}>
              <T variant="small" color={colors.text}>Actualizar</T>
              <View style={{ flex: 1 }}>
                {/* Se ve al instante y se guarda al terminar de editar, como en la web al salir del campo. */}
                <Field value={goal.saved ? String(goal.saved) : ""} onChangeText={(text) => setSaved(goal.id, Number(digits(text)) || 0)} onEndEditing={() => saveSaved(goal.id)} keyboardType="number-pad" placeholder="$ 0" accessibilityLabel={"Monto ahorrado para " + goal.name} style={{ minHeight: 44 }} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primaryText, fontVariant: ["tabular-nums"] }}>{Math.round(progress)}%</Text>
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
