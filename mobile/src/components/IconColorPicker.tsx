import { Pressable, View } from "react-native";
import { COLORS, ICON_GROUPS } from "../../../shared/categorias";
import { useColors } from "../lib/theme";
import { Icon } from "./Icon";
import { T } from "./ui";

// Elegir color e ícono: el mismo selector en categorías, gastos fijos y destinatarios.
export function IconColorPicker({ icon, color, onChange, colorOnly }: { icon: string; color: string; onChange: (value: { icon: string; color: string }) => void; colorOnly?: boolean }) {
  const colors = useColors();
  return (
    <>
      <T variant="label">Color</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {COLORS.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ selected: color === value }} accessibilityLabel={"Color " + value} onPress={() => onChange({ icon, color: value })} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: value, alignItems: "center", justifyContent: "center" }}>{color === value ? <Icon name="Check" size={16} color="#ffffff" /> : null}</Pressable>)}
      </View>
      {colorOnly ? null : ICON_GROUPS.map((group) => (
        <View key={group.label} style={{ gap: 6 }}>
          <T variant="label">{group.label}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {group.icons.map((item) => { const active = icon === item; return <Pressable key={item} accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={item} onPress={() => onChange({ icon: item, color })} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center", borderColor: active ? color : colors.border, backgroundColor: active ? color : "transparent" }}><Icon name={item} size={18} color={active ? "#ffffff" : colors.text} /></Pressable>; })}
          </View>
        </View>
      ))}
    </>
  );
}
