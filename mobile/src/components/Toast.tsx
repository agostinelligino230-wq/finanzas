import { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius } from "../lib/theme";
import { Icon } from "./Icon";

// Aviso arriba de la pantalla con el resultado de una acción (se ve aunque la lista esté más abajo y no lo tapa el teclado).
type Aviso = { id: number; text: string; ok: boolean; action?: { label: string; onPress: () => void } };

let current: Aviso | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let nextId = 1;
const listeners = new Set<(aviso: Aviso | null) => void>();
const show = (aviso: Aviso | null) => { current = aviso; listeners.forEach((listener) => listener(aviso)); };

export function toast(text: string, options: { ok?: boolean; action?: Aviso["action"] } = {}) {
  clearTimeout(timer);
  show({ id: nextId++, text, ok: options.ok ?? false, action: options.action });
  AccessibilityInfo.announceForAccessibility(text);
  timer = setTimeout(() => show(null), options.action ? 8000 : 5000);
}

export function Toaster() {
  const insets = useSafeAreaInsets();
  const [aviso, setAviso] = useState(current);
  useEffect(() => {
    listeners.add(setAviso);
    return () => { listeners.delete(setAviso); };
  }, []);
  if (!aviso) return null;
  const hide = () => { clearTimeout(timer); show(null); };
  // Mismos colores en claro y oscuro: fondo oscuro con borde, para que se despegue de las tarjetas.
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 12, right: 12, top: insets.top + 8 }}>
      <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingLeft: 14, paddingRight: 4, borderRadius: radius.field, borderWidth: 1, borderColor: "#3d3747", backgroundColor: "#24212b", elevation: 8, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
        <Icon name={aviso.ok ? "Check" : "CircleAlert"} size={18} color={aviso.ok ? "#45c98c" : "#ff8a9c"} />
        <Text style={{ flex: 1, color: "#ffffff", fontSize: 14, paddingVertical: 8 }}>{aviso.text}</Text>
        {aviso.action ? (
          <Pressable accessibilityRole="button" onPress={() => { hide(); aviso.action!.onPress(); }} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: "center" }}>
            <Text style={{ color: "#c3b4f6", fontWeight: "700", fontSize: 14 }}>{aviso.action.label}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar aviso" onPress={hide} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Icon name="X" size={16} color="#c9c3d3" />
          </Pressable>
        )}
      </View>
    </View>
  );
}
