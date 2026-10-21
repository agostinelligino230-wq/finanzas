import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { money } from "../../../shared/format";
import { BUDGET_COUNTRIES, BUDGET_GUIDE } from "../../../shared/ahorro";
import { useAuth } from "../lib/auth";
import { radius, useColors } from "../lib/theme";
import { Icon } from "../components/Icon";
import { Card, Field, IconButton, Screen, T, styles } from "../components/ui";

const goBack = () => (router.canGoBack() ? router.back() : router.replace("/mas"));

export default function SuggestionsScreen() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/login" />;
  return <Suggestions />;
}

function Suggestions() {
  const colors = useColors();
  const [incomeText, setIncomeText] = useState("200000");
  const [country, setCountry] = useState(BUDGET_COUNTRIES[0]);
  const income = Math.max(0, Number(incomeText) || 0);

  return (
    <Screen>
      <View style={[styles.row, { gap: 4, marginLeft: -8 }]}>
        <IconButton icon="ChevronLeft" label="Volver" onPress={goBack} color={colors.text} />
        <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: colors.text, flex: 1 }]}>Sugerencias</Text>
      </View>
      <View style={{ gap: 4 }}>
        <T variant="subtitle">Sugerencias para tu presupuesto</T>
        <T variant="small">Usá estos porcentajes como punto de partida, no como una regla. La realidad cambia según tu ciudad, ingresos, familia y deudas.</T>
      </View>

      <Card style={{ gap: 16 }}>
        <Field label="Ingreso mensual estimado" value={incomeText} onChangeText={(text) => setIncomeText(text.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="$ 0" style={{ fontSize: 18 }} />
        <View style={{ gap: 8 }}>
          <T variant="label">País de referencia</T>
          <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {BUDGET_COUNTRIES.map((item) => {
              const active = country === item;
              return (
                <Pressable key={item} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => setCountry(item)}
                  style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: active ? colors.primary : colors.surface2 }}>
                  <Text style={{ color: active ? "#ffffff" : colors.text, fontWeight: "600" }}>{item}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={[styles.row, { alignItems: "flex-start", gap: 10, padding: 14, borderRadius: radius.field, backgroundColor: colors.primarySoft }]}>
          <Icon name="ShieldCheck" size={19} color={colors.primaryText} />
          <T style={{ flex: 1, fontSize: 14, lineHeight: 21 }} color={colors.primaryText}>Para {country}, mostramos una referencia general en la moneda configurada. No reemplaza asesoramiento financiero ni contempla automáticamente inflación, alquileres locales o impuestos individuales.</T>
        </View>
      </Card>

      {BUDGET_GUIDE.map((item) => (
        <Card key={item.key} style={{ gap: 8 }}>
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <View style={[styles.row, { flex: 1 }]}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: item.color }} />
              <T style={{ fontWeight: "600", flex: 1 }}>{item.label}</T>
            </View>
            <Text style={{ fontSize: 14, fontWeight: "700", color: item.color }}>{item.percentage}%</Text>
          </View>
          <Text style={{ fontSize: 24, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] }}>{money((income * item.percentage) / 100)}</Text>
          <T variant="small" style={{ fontSize: 14, lineHeight: 20 }}>{item.note}</T>
          <View style={{ height: 8, marginTop: 4, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.surface2 }}>
            <View style={{ height: "100%", width: `${Math.min(item.percentage * 3.33, 100)}%`, borderRadius: radius.pill, backgroundColor: item.color }} />
          </View>
        </Card>
      ))}

      <Card style={[styles.row, { alignItems: "flex-start", backgroundColor: colors.primarySoft }]}>
        <Icon name="Lightbulb" size={20} color={colors.primaryText} />
        <View style={{ flex: 1, gap: 6 }}>
          <T variant="subtitle">Cómo interpretar la guía</T>
          <T variant="small" style={{ fontSize: 14, lineHeight: 21 }}>La base es una adaptación sencilla de presupuestos por porcentajes: priorizar necesidades, limitar deudas, reservar ahorro y dejar espacio para gastos personales. En Argentina conviene revisar estos números con frecuencia por inflación y actualizar el ingreso de referencia.</T>
        </View>
      </Card>
    </Screen>
  );
}
