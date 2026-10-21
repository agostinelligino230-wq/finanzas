import { useState, type ReactNode } from "react";
import { Alert, Platform, View } from "react-native";
import { Redirect, router } from "expo-router";
import * as Lector from "../../modules/lector-avisos";
import { useAuth } from "../lib/auth";
import { desvincular, disponible, useLector, vincular } from "../lib/notificaciones";
import { useColors } from "../lib/theme";
import { Icon } from "../components/Icon";
import { Button, Card, ErrorBox, IconButton, Notice, Screen, T, styles } from "../components/ui";

// Pasos para que Android no corte el lector con la app cerrada, según la marca (prueba P4).
function guiaBateria() {
  const marca = String((Platform.constants as { Brand?: string; Manufacturer?: string }).Manufacturer ?? "").toLowerCase();
  if (marca.includes("samsung")) return "Ajustes → Aplicaciones → Finanzas Personales → Batería → «Sin restricciones».";
  if (marca.includes("xiaomi") || marca.includes("redmi") || marca.includes("poco")) return "Ajustes → Aplicaciones → Finanzas Personales → Ahorro de batería → «Sin restricciones», y prendé «Inicio automático».";
  if (marca.includes("motorola")) return "Ajustes → Aplicaciones → Finanzas Personales → Batería → «Sin restricciones».";
  return "Ajustes → Aplicaciones → Finanzas Personales → Batería → «Sin restricciones» (o «No optimizar»).";
}

export default function NotificationsScreen() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/login" />;
  return <Notifications />;
}

function Notifications() {
  const colors = useColors();
  const { estado, refresh } = useLector();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!disponible) {
    return (
      <Screen title="Notificaciones" edges={["top", "bottom"]}>
        <Card style={{ gap: 8 }}>
          <T>En iPhone la app no puede leer las notificaciones de otras apps (Apple no lo permite).</T>
          <T variant="small">Lo que sí funciona: conectá tu Gmail en Cuentas y prendé los avisos por mail en cada banco. Llegan al instante igual.</T>
          <Button label="Volver" variant="secondary" onPress={() => router.back()} />
        </Card>
      </Screen>
    );
  }

  const activo = estado.activo && estado.vinculado && !estado.revocado;
  const activar = async () => {
    setBusy(true); setError("");
    const problema = await vincular();
    setBusy(false);
    if (problema) setError(problema);
    refresh();
  };
  const apagar = () => Alert.alert("¿Dejar de leer las notificaciones?", "Los movimientos que ya entraron quedan.", [
    { text: "Cancelar", style: "cancel" },
    { text: "Apagar", style: "destructive", onPress: async () => { await desvincular(); refresh(); } },
  ]);

  const paso = (numero: number, hecho: boolean, titulo: string, children: ReactNode) => (
    <Card style={{ gap: 10 }}>
      <View style={styles.row}>
        <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: hecho ? colors.income : colors.surface2 }}>
          {hecho ? <Icon name="Check" size={18} color="#ffffff" /> : <T style={{ fontWeight: "700" }}>{numero}</T>}
        </View>
        <T variant="subtitle" style={{ flex: 1 }}>{titulo}</T>
      </View>
      {children}
    </Card>
  );

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={styles.row}>
        <IconButton icon="ChevronLeft" label="Volver" onPress={() => router.back()} />
        <T variant="title" style={{ flex: 1 }}>Notificaciones de tus bancos</T>
      </View>
      <T variant="small">La app lee las notificaciones de las apps de tus bancos y billeteras (Galicia, Mercado Pago, Ualá…) apenas llegan, y carga el movimiento solo. No lee ninguna otra notificación: ni mensajes, ni mails, ni otras apps.</T>
      <ErrorBox message={error} />
      {estado.revocado ? <Notice ok={false} message="Este celular fue desvinculado. Tocá «Activar» para volver a vincularlo." /> : null}

      {paso(1, estado.permiso, "Dar acceso a las notificaciones", (
        <>
          <T variant="small">Se abre Ajustes de Android: prendé «Finanzas Personales» y volvé a la app.</T>
          {!estado.permiso ? <Button label="Abrir Ajustes" icon="Settings" onPress={() => Lector.abrirAjustes()} /> : <T variant="small" color={colors.income}>Listo, la app tiene acceso.</T>}
        </>
      ))}

      {paso(2, activo, "Activar en este celular", (
        <>
          {activo ? (
            <>
              <T variant="small" color={colors.income}>{estado.escuchando ? "Leyendo: cada aviso entra al instante." : "Activado. Android todavía no conectó el lector: si no cambia, reiniciá el celular."}</T>
              <T variant="small">{estado.paquetes} apps de bancos en la lista{estado.pendientes ? " · " + estado.pendientes + " avisos por mandar (salen cuando haya internet)" : ""}.</T>
              <Button label="Dejar de leer" variant="ghost" onPress={apagar} />
            </>
          ) : <Button label="Activar" icon="BellRing" onPress={activar} busy={busy} disabled={!estado.permiso} />}
        </>
      ))}

      {paso(3, false, "Que Android no lo apague", (
        <>
          <T variant="small">Para que funcione con la app cerrada: {guiaBateria()}</T>
          <Button label="Abrir los ajustes de la app" variant="secondary" onPress={() => Lector.abrirAjustesApp()} />
        </>
      ))}

      {paso(4, false, "Prendé los avisos en tus bancos", (
        <>
          <T variant="small">La app solo ve lo que tu banco te avisa. En cada app, prendé los avisos de compras con tarjeta, plata recibida y transferencias.</T>
          <T variant="small">• Galicia: tocá la campana → la rueda (arriba a la derecha) y prendé los avisos de consumos en tiempo real y de plata recibida.</T>
          <T variant="small">• Otros bancos y billeteras: buscá «Notificaciones» en el menú de tu perfil o de ajustes.</T>
        </>
      ))}
    </Screen>
  );
}
