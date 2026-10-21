import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { monthLabel, shiftMonth } from "../../../shared/format";
import type { Category } from "../../../shared/categorias";
import { radius, useColors } from "../lib/theme";
import { Icon, type IconName } from "./Icon";

export function Screen({ children, title, refreshing, onRefresh, footer, edges = ["top"] }: { children: ReactNode; title?: string; refreshing?: boolean; onRefresh?: () => void; footer?: ReactNode; edges?: ("top" | "bottom")[] }) {
  const colors = useColors();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
      >
        {title ? <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text> : null}
        {children}
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return <View style={[{ backgroundColor: colors.surface, borderRadius: radius.card, padding: 16 }, style]}>{children}</View>;
}

export function T({ children, variant = "body", color, style, numberOfLines }: { children: ReactNode; variant?: "title" | "subtitle" | "body" | "small" | "label"; color?: string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const colors = useColors();
  const base = variant === "title" ? styles.title : variant === "subtitle" ? styles.subtitle : variant === "small" ? styles.small : variant === "label" ? styles.label : styles.body;
  const tone = color ?? (variant === "small" || variant === "label" ? colors.muted : colors.text);
  return <Text numberOfLines={numberOfLines} style={[base, { color: tone }, style]}>{children}</Text>;
}

export function Button({ label, onPress, variant = "primary", icon, disabled, busy, accessibilityLabel, style }: { label: string; onPress: () => void; variant?: "primary" | "secondary" | "soft" | "ghost" | "danger"; icon?: IconName; disabled?: boolean; busy?: boolean; accessibilityLabel?: string; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  const palette = {
    primary: { bg: colors.primary, fg: "#ffffff", border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
    soft: { bg: colors.primarySoft, fg: colors.primaryText, border: colors.primarySoft },
    ghost: { bg: "transparent", fg: colors.primaryText, border: "transparent" },
    danger: { bg: colors.expenseSoft, fg: colors.expense, border: colors.expenseSoft },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: palette.bg, borderColor: palette.border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, style]}
    >
      {busy ? <ActivityIndicator color={palette.fg} /> : icon ? <Icon name={icon} size={18} color={palette.fg} /> : null}
      <Text style={[styles.buttonText, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color, background, size = 40 }: { icon: IconName; onPress: () => void; label: string; color?: string; background?: string; size?: number }) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPress={onPress} style={({ pressed }) => [{ width: Math.max(size, 44), height: Math.max(size, 44), borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: background ?? "transparent", opacity: pressed ? 0.6 : 1 }]}>
      <Icon name={icon} size={18} color={color ?? colors.muted} />
    </Pressable>
  );
}

export function Segmented<V extends string>({ value, options, onChange }: { value: V; options: { value: V; label: string }[]; onChange: (value: V) => void }) {
  const colors = useColors();
  return (
    <View accessibilityRole="tablist" style={[styles.segmented, { backgroundColor: colors.surface }]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(option.value)} style={[styles.segment, active && { backgroundColor: colors.primary }]}>
            <Text style={[styles.segmentText, { color: active ? "#ffffff" : colors.muted }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const colors = useColors();
  return (
    <View style={[styles.monthPicker, { backgroundColor: colors.surface }]}>
      <IconButton icon="ChevronLeft" label="Mes anterior" onPress={() => onChange(shiftMonth(month, -1))} />
      <Text style={[styles.subtitle, { color: colors.text }]}>{monthLabel(month)}</Text>
      <IconButton icon="ChevronRight" label="Mes siguiente" onPress={() => onChange(shiftMonth(month, 1))} />
    </View>
  );
}

export function ErrorBox({ message }: { message: string }) {
  const colors = useColors();
  if (!message) return null;
  return <Text accessibilityRole="alert" style={[styles.notice, { backgroundColor: colors.expenseSoft, color: colors.expense }]}>{message}</Text>;
}

export function Notice({ message, ok = true }: { message: string; ok?: boolean }) {
  const colors = useColors();
  if (!message) return null;
  return <Text accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: ok ? colors.surface : colors.expenseSoft, color: ok ? colors.income : colors.expense }]}>{message}</Text>;
}

export function CategoryIcon({ category, size = 40 }: { category: Pick<Category, "icon" | "color">; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: category.color, alignItems: "center", justifyContent: "center" }}>
      <Icon name={category.icon} size={Math.round(size * 0.48)} color="#ffffff" />
    </View>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const colors = useColors();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      {label ? <T variant="label">{label}</T> : null}
      <TextInput placeholderTextColor={colors.muted} {...rest} style={[styles.field, { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text }, style]} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { padding: 16, paddingBottom: 120, gap: 12 },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 16, fontWeight: "600" },
  body: { fontSize: 15 },
  small: { fontSize: 12 },
  label: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  button: { minHeight: 48, borderRadius: radius.field, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1 },
  buttonText: { fontSize: 15, fontWeight: "600" },
  segmented: { flexDirection: "row", borderRadius: radius.field, padding: 4 },
  segment: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  segmentText: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  monthPicker: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: radius.field, padding: 4 },
  notice: { borderRadius: radius.field, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, overflow: "hidden" },
  field: { minHeight: 48, borderRadius: radius.field, borderWidth: 1, paddingHorizontal: 16, fontSize: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
