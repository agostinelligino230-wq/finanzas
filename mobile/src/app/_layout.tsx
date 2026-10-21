import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/auth";
import { useColors } from "../lib/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// Cada pantalla decide a dónde mandar si falta (o sobra) la sesión: ver (tabs)/_layout y login.
function Root() {
  const { loading } = useAuth();
  const colors = useColors();
  if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}><ActivityIndicator color={colors.primary} /></View>;
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="agregar" options={{ presentation: "modal" }} />
        <Stack.Screen name="pagar" options={{ presentation: "modal" }} />
        <Stack.Screen name="fijo" options={{ presentation: "modal" }} />
        <Stack.Screen name="tarjeta" options={{ presentation: "modal" }} />
        <Stack.Screen name="cuota" options={{ presentation: "modal" }} />
        <Stack.Screen name="fijos" />
        <Stack.Screen name="ahorro" />
        <Stack.Screen name="sugerencias" />
        <Stack.Screen name="login" />
        <Stack.Screen name="conectar" />
        <Stack.Screen name="auth" />
      </Stack>
    </>
  );
}
