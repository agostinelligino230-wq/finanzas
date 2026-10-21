import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { exchangeCode } from "../lib/auth";
import { useColors } from "../lib/theme";

// Vuelta de Google (finanzas://auth?code=…): en Android también llega como enlace a la app.
// Si el cambio por la sesión falla, vuelve al ingreso con el motivo (no en silencio).
export default function AuthReturn() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const colors = useColors();
  useEffect(() => {
    (code ? exchangeCode(code) : Promise.resolve("Google no devolvió el permiso. Probá de nuevo.")).then((problem) => {
      router.replace(problem ? { pathname: "/login", params: { error: problem } } : "/");
    });
  }, [code]);
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}><ActivityIndicator color={colors.primary} /></View>;
}
