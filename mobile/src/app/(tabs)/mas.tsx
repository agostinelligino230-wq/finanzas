import { Alert } from "react-native";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../../lib/auth";
import { WEB_URL } from "../../lib/supabase";
import { Button, Card, Screen, T } from "../../components/ui";

export default function More() {
  const { session, signOut } = useAuth();
  const leave = () => Alert.alert("¿Cerrar sesión?", undefined, [
    { text: "Cancelar", style: "cancel" },
    { text: "Cerrar sesión", style: "destructive", onPress: () => signOut() },
  ]);
  return (
    <Screen title="Más">
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
