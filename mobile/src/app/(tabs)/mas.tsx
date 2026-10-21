import { Alert, Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../../lib/auth";
import { WEB_URL } from "../../lib/supabase";
import { useColors } from "../../lib/theme";
import { Icon } from "../../components/Icon";
import { Button, Card, Screen, T, styles } from "../../components/ui";

// Las secciones de la web que no tienen pestaña propia.
const LINKS: { href: Href; icon: string; title: string; detail: string }[] = [
  { href: "/fijos", icon: "CalendarClock", title: "Fijos y tarjetas", detail: "Lo que pagás todos los meses, cuotas y resúmenes" },
  { href: "/ahorro", icon: "PiggyBank", title: "Ahorro", detail: "Tus metas y cuánto llevás juntado" },
  { href: "/sugerencias", icon: "Lightbulb", title: "Sugerencias", detail: "Una guía para repartir tu ingreso" },
];

export default function More() {
  const { session, signOut } = useAuth();
  const colors = useColors();
  const leave = () => Alert.alert("¿Cerrar sesión?", undefined, [
    { text: "Cancelar", style: "cancel" },
    { text: "Cerrar sesión", style: "destructive", onPress: () => signOut() },
  ]);
  return (
    <Screen title="Más">
      <Card style={{ paddingVertical: 4 }}>
        {LINKS.map((link, index) => (
          <Pressable key={link.title} accessibilityRole="button" accessibilityLabel={link.title} accessibilityHint={link.detail} onPress={() => router.push(link.href)}
            style={({ pressed }) => [styles.row, { minHeight: 64, opacity: pressed ? 0.7 : 1, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border }]}>
            <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft }}><Icon name={link.icon} size={20} color={colors.primaryText} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T style={{ fontWeight: "600" }}>{link.title}</T>
              <T variant="small" numberOfLines={1}>{link.detail}</T>
            </View>
            <Icon name="ChevronRight" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </Card>
      <Card style={{ gap: 4 }}>
        <T variant="label">Tu cuenta</T>
        <T>{session?.user.email ?? ""}</T>
      </Card>
      <Card style={{ gap: 8 }}>
        <Button label="Política de privacidad" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(WEB_URL + "/privacidad.html")} />
        <Button label="Cerrar sesión" icon="LogOut" variant="danger" onPress={leave} />
      </Card>
      <T variant="small" style={{ textAlign: "center" }}>Finanzas Personales {Constants.expoConfig?.version ?? ""}</T>
    </Screen>
  );
}
