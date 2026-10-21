import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../lib/auth";
import { useColors } from "../../lib/theme";

export default function TabsLayout() {
  const { session } = useAuth();
  const colors = useColors();
  if (!session) return <Redirect href="/login" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primaryText,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Inicio", tabBarIcon: ({ color }) => <Icon name="House" color={String(color)} /> }} />
      <Tabs.Screen name="movimientos" options={{ title: "Movimientos", tabBarIcon: ({ color }) => <Icon name="ListOrdered" color={String(color)} /> }} />
      <Tabs.Screen name="cuentas" options={{ title: "Cuentas", tabBarIcon: ({ color }) => <Icon name="Landmark" color={String(color)} /> }} />
      <Tabs.Screen name="mas" options={{ title: "Más", tabBarIcon: ({ color }) => <Icon name="Ellipsis" color={String(color)} /> }} />
    </Tabs>
  );
}
