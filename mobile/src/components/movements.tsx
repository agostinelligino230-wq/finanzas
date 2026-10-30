import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { dayLabel, money, timeLabel, usd } from "../../../shared/format";
import { findCategory, type Category } from "../../../shared/categorias";
import { findPayee } from "../../../shared/destinatarios";
import { findProvider } from "../../../shared/providers";
import { hasDetail, originLabel, type Movement } from "../../../shared/movimientos";
import { useAuth } from "../lib/auth";
import { usePayees } from "../lib/payees";
import { useColors } from "../lib/theme";
import { Icon } from "./Icon";
import { ProviderIcon } from "./ProviderIcon";
import { Button, Card, CategoryIcon, IconButton, T, styles } from "./ui";

// Confirmación antes de borrar (no hay deshacer).
export function confirmRemove(item: Movement, onRemove: (item: Movement) => void, message = "¿Eliminar este movimiento?") {
  Alert.alert(message, item.description || undefined, [
    { text: "Cancelar", style: "cancel" },
    { text: "Eliminar", style: "destructive", onPress: () => onRemove(item) },
  ]);
}

// Dónde vino: «Verificado · mail de Mercado Pago», con el escudo si lo avisó el banco.
// Lo leído por la IA lleva su marca (✦) para que se note que hay que mirarlo.
export function Origin({ item, lines = 1 }: { item: Movement; lines?: number }) {
  const colors = useColors();
  const label = originLabel(item);
  if (!label) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {item.trust === "verified" ? <Icon name="ShieldCheck" size={12} color={colors.income} /> : item.readByAI ? <Icon name="Sparkles" size={12} color={colors.primaryText} /> : null}
      <T variant="small" numberOfLines={lines} style={{ flexShrink: 1 }}>{label}</T>
    </View>
  );
}

// Ícono del destinatario si se le eligió uno; en las transferencias, el logo de la cuenta; si no, la categoría.
function Leading({ item, category }: { item: Movement; category: Category }) {
  const { session } = useAuth();
  const { payees } = usePayees(session?.user.id ?? "");
  const payee = findPayee(payees, item);
  const provider = findProvider(item.source);
  if (payee?.icon) return <CategoryIcon category={{ icon: payee.icon, color: payee.color ?? category.color }} size={32} />;
  if (item.category === "transferencias" && provider) return <ProviderIcon name={provider.name} color={provider.color} provider={provider.id} size={32} />;
  return <CategoryIcon category={category} size={32} />;
}

export function MovementRow({ item, categories, onTogglePaid, onRemove, showDay }: { item: Movement; categories: Category[]; onTogglePaid?: (item: Movement) => void; onRemove?: (item: Movement) => void; showDay?: boolean }) {
  const colors = useColors();
  const category = findCategory(categories, item.type, item.category);
  const pending = item.type === "gasto" && !item.paid;
  const title = hasDetail(item, category.name) ? item.description : category.name;
  return (
    <View style={[styles.row, { paddingVertical: 8 }]}>
      {onTogglePaid && item.type === "gasto" ? (
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.paid }} accessibilityLabel={item.paid ? "Marcar como pendiente" : "Marcar como pagado"} hitSlop={8} onPress={() => onTogglePaid(item)}
          style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center", borderColor: item.paid ? colors.income : colors.border, backgroundColor: item.paid ? colors.income : "transparent" }}>
          {item.paid ? <Icon name="Check" size={16} color="#ffffff" /> : null}
        </Pressable>
      ) : <Leading item={item} category={category} />}
      <Pressable onPress={() => router.push({ pathname: "/movimiento", params: { id: item.id } })} accessibilityRole="button" accessibilityHint="Abre el detalle del movimiento"
        style={[styles.row, { flex: 1, minWidth: 0 }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T numberOfLines={1} color={pending ? colors.muted : undefined} style={{ fontWeight: "500" }}>{title}{pending ? " · pendiente" : ""}{item.excluded ? " · no cuenta" : ""}</T>
          <T variant="small" numberOfLines={1}>{showDay ? dayLabel(item.date) + " · " : ""}{timeLabel(item.createdAt)}{item.currency === "USD" && item.original !== null ? " · " + usd(item.original) + " a " + money(item.rate ?? 0) : ""}</T>
          <Origin item={item} />
        </View>
        <Text style={{ fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"], color: item.excluded ? colors.muted : item.type === "ingreso" ? colors.income : colors.text, textDecorationLine: item.excluded ? "line-through" : "none" }}>{item.type === "ingreso" ? "+" : "−"}{money(item.amount)}</Text>
      </Pressable>
      {onRemove ? <IconButton icon="Trash2" label={"Eliminar " + title} onPress={() => confirmRemove(item, onRemove)} /> : null}
    </View>
  );
}

// Movimientos que llegaron sin un aviso verificado: no suman hasta que la persona los confirma.
export function ReviewList({ items, onConfirm, onRemove }: { items: Movement[]; onConfirm: (item: Movement) => void; onRemove: (item: Movement) => void }) {
  const colors = useColors();
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;
  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={[styles.row, { minHeight: 44 }]}>
        <Icon name="ShieldAlert" size={18} color={colors.expense} />
        <T variant="subtitle" style={{ flex: 1 }}>Para revisar ({items.length})</T>
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={18} color={colors.muted} />
      </Pressable>
      {open ? (
        <View style={{ gap: 4 }}>
          <T variant="small">Llegaron sin un aviso verificado del banco. No suman hasta que los confirmes; si algo está mal leído, corregilo.</T>
          {items.map((item) => (
            <View key={item.id} style={{ paddingVertical: 8, gap: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T numberOfLines={2} style={{ fontWeight: "500" }}>{item.description}</T>
                  <T variant="small">{dayLabel(item.date)} · {timeLabel(item.createdAt)}</T>
                  <Origin item={item} lines={2} />
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"], color: item.type === "ingreso" ? colors.income : colors.text }}>{item.type === "ingreso" ? "+" : "−"}{money(item.amount)}</Text>
                  {item.currency === "USD" && item.original !== null ? <T variant="small">{usd(item.original)}</T> : null}
                </View>
              </View>
              <View style={[styles.row, { gap: 8 }]}>
                <Button label="Es mío" icon="Check" variant="soft" onPress={() => onConfirm(item)} style={{ flex: 1, paddingHorizontal: 8 }} accessibilityLabel={"Confirmar " + item.description + ", " + money(item.amount)} />
                <Button label="Corregir" icon="Pencil" variant="secondary" onPress={() => router.push({ pathname: "/agregar", params: { id: item.id } })} style={{ flex: 1, paddingHorizontal: 8 }} accessibilityLabel={"Corregir " + item.description} />
                <IconButton icon="Trash2" label={"Borrar " + item.description} color={colors.expense} background={colors.expenseSoft} size={48} onPress={() => confirmRemove(item, onRemove, "¿Borrar este movimiento? Si no era tuyo, no suma en ningún lado.")} />
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
