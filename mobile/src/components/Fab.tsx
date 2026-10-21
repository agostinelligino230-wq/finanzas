import { Pressable } from "react-native";
import { useColors } from "../lib/theme";
import { Icon } from "./Icon";

// Botón + para cargar un movimiento (abajo a la derecha, al alcance del pulgar).
export function Fab({ onPress, label = "Agregar movimiento" }: { onPress: () => void; label?: string }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ position: "absolute", right: 20, bottom: 20, width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, transform: [{ scale: pressed ? 0.95 : 1 }] })}
    >
      <Icon name="Plus" size={30} strokeWidth={2.5} color={colors.accentText} />
    </Pressable>
  );
}
