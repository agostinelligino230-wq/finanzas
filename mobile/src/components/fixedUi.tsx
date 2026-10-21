import type { ReactNode } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { FixedKind } from "../../../shared/fijos";
import { radius, useColors } from "../lib/theme";
import { Icon } from "./Icon";
import { Button, IconButton, T, styles } from "./ui";

// Ícono de cada tipo de gasto fijo (los mismos que la web).
export const FIXED_ICONS: Record<FixedKind, string> = { impuesto: "Zap", suscripcion: "CreditCard", alquiler: "House", servicio: "Wifi", otro: "Ellipsis" };

// Cerrar una pantalla; si se abrió sin historial (por un enlace), vuelve a Inicio.
export function close() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

// Confirmación antes de algo que no tiene deshacer.
export function confirmAction(title: string, message: string | undefined, action: string, onConfirm: () => void) {
  Alert.alert(title, message, [
    { text: "Cancelar", style: "cancel" },
    { text: action, style: "destructive", onPress: onConfirm },
  ]);
}

// Pantalla modal con título y X para cerrar (como agregar.tsx).
export function SheetScreen({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.row, { paddingHorizontal: 16, paddingTop: 8 }]}>
          <T variant="title" style={{ flex: 1 }}>{title}</T>
          <IconButton icon="X" label="Cerrar" onPress={close} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Mientras cargan los datos, o si lo que se quería abrir ya no está.
export function SheetPending({ title, loaded, missing }: { title: string; loaded: boolean; missing: string }) {
  const colors = useColors();
  return (
    <SheetScreen title={title}>
      {loaded ? (
        <>
          <T>{missing}</T>
          <Button label="Volver" variant="secondary" onPress={close} />
        </>
      ) : <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />}
    </SheetScreen>
  );
}

// Círculo para marcar como pagado o desmarcar.
export function PaidCheck({ paid, label, onPress }: { paid: boolean; label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: paid }} accessibilityLabel={label} hitSlop={6} onPress={onPress}
      style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: "center", justifyContent: "center", borderColor: paid ? colors.income : colors.border, backgroundColor: paid ? colors.income : "transparent", opacity: pressed ? 0.7 : 1 })}>
      {paid ? <Icon name="Check" size={18} color="#ffffff" /> : null}
    </Pressable>
  );
}

// Opción de radio con título y aclaración debajo.
export function RadioRow({ selected, title, hint, onPress }: { selected: boolean; title: string; hint?: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, minHeight: 44, paddingVertical: 4 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, marginTop: 1, alignItems: "center", justifyContent: "center", borderColor: selected ? colors.primary : colors.border }}>
        {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <T>{title}</T>
        {hint ? <T variant="small">{hint}</T> : null}
      </View>
    </Pressable>
  );
}

// Caja gris de ayuda o resumen dentro de una hoja.
export function SheetNote({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={{ backgroundColor: colors.surface2, borderRadius: radius.field, paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>{children}</View>;
}
