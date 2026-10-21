import { useEffect, useState } from "react";
import { Alert, Platform, Switch, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AUTO_PROVIDERS } from "../../../../shared/providers";
import { useAuth } from "../../lib/auth";
import { isInstant, useGmail, type ConnectResult } from "../../lib/gmail";
import { disponible as lectorDisponible, useLector } from "../../lib/notificaciones";
import { useColors } from "../../lib/theme";
import { Icon } from "../../components/Icon";
import { StatementSources } from "../../components/statements";
import { Button, Card, ErrorBox, Loading, Notice, Screen, T, styles } from "../../components/ui";

const RESULTS: Record<ConnectResult, { text: string; ok: boolean }> = {
  ok: { text: "¡Listo! Tu Gmail quedó conectado y ya trajimos tus últimos movimientos.", ok: true },
  cancelado: { text: "No se conectó: cancelaste en la pantalla de Google.", ok: false },
  "sin-permiso": { text: "Falta un permiso: en la pantalla de Google tildá «Ver tus mensajes de correo electrónico» y probá de nuevo.", ok: false },
  error: { text: "Algo falló al conectar. Probá de nuevo.", ok: false },
};

export default function Accounts() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const colors = useColors();
  const gmail = useGmail(userId);
  const params = useLocalSearchParams<{ gmail?: string }>();
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  // Vuelta de Google como enlace a la app (finanzas://conectar?gmail=…).
  useEffect(() => {
    if (!params.gmail) return;
    setNotice(RESULTS[params.gmail as ConnectResult] ?? RESULTS.error);
    gmail.reload();
    router.setParams({ gmail: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.gmail]);

  const lector = useLector();
  const lectorActivo = lector.estado.activo && lector.estado.vinculado && !lector.estado.revocado;
  const link = gmail.link;
  const providers = link?.providers ?? AUTO_PROVIDERS.map((provider) => provider.id);
  const toggle = (id: string) => gmail.setProviders(providers.includes(id) ? providers.filter((entry) => entry !== id) : [...providers, id]);

  const connect = async () => {
    const result = await gmail.connect();
    if (result && result !== "cancelado") setNotice(RESULTS[result]);
  };
  const refresh = async () => {
    const result = await gmail.refresh();
    if (result) setNotice({ text: result.movimientos ? "Actualizado: " + result.movimientos + (result.movimientos === 1 ? " movimiento nuevo." : " movimientos nuevos.") : "Actualizado: no había movimientos nuevos.", ok: true });
  };
  const disconnect = () => Alert.alert("¿Desconectar tu Gmail?", "Los movimientos que ya se cargaron quedan.", [
    { text: "Cancelar", style: "cancel" },
    { text: "Desconectar", style: "destructive", onPress: () => gmail.disconnect() },
  ]);

  return (
    <Screen title="Cuentas" refreshing={false} onRefresh={gmail.reload}>
      <ErrorBox message={gmail.error} onRetry={gmail.reload} />
      {notice ? <Notice message={notice.text} ok={notice.ok} /> : null}

      {!gmail.loaded ? (gmail.error ? null : <Loading label="Buscando tu conexión con Gmail…" />) : <Card style={{ gap: 12 }}>
        {link ? (
          <>
            <View style={styles.row}>
              <View style={{ width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }}><Icon name="Check" size={22} color={colors.income} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T style={{ fontWeight: "600" }}>Gmail conectado</T>
                <T variant="small" numberOfLines={1}>{link.email ?? "Tu cuenta de Google"}</T>
              </View>
            </View>
            <T variant="small">{isInstant(link) ? "Al instante: cada aviso entra apenas llega el mail." : "Se lee una vez por día y cuando tocás «Actualizar ahora»."}</T>
            <T variant="small">{link.last_sync_at ? "Última lectura: " + new Date(link.last_sync_at).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Todavía no se leyó"}</T>
            <Button label={gmail.busy ? "Leyendo…" : "Actualizar ahora"} icon="RefreshCw" variant="soft" onPress={refresh} busy={gmail.busy} />
          </>
        ) : (
          <>
            <T variant="subtitle">Conectá tu Gmail</T>
            <T variant="small">Entrás con tu cuenta de Google, aceptás y listo. Los avisos de tus bancos y billeteras se cargan solos.</T>
            <Button label={gmail.busy ? "Abriendo Google…" : "Conectar con Google"} icon="Mail" onPress={connect} busy={gmail.busy} disabled={!gmail.loaded} />
            <T variant="small">Como la app es nueva, Google puede mostrarte un aviso: tocá «Configuración avanzada» → «Ir a Finanzas Personales» y después «Continuar».</T>
          </>
        )}
        <T variant="label">{link ? "Qué se carga solo" : "Qué se va a cargar solo"}</T>
        {AUTO_PROVIDERS.map((provider) => (
          <View key={provider.id} style={[styles.row, { minHeight: 48 }]}>
            <View style={{ flex: 1 }}><T style={{ fontWeight: "600" }}>{provider.name}</T><T variant="small">{provider.auto}</T></View>
            {link ? <Switch value={providers.includes(provider.id)} onValueChange={() => toggle(provider.id)} accessibilityLabel={"Leer " + provider.name} trackColor={{ true: colors.primary, false: colors.border }} /> : null}
          </View>
        ))}
        <View style={[styles.row, { gap: 8 }]}>
          <Icon name="ShieldCheck" size={16} color={colors.income} />
          <T variant="small" style={{ flex: 1 }}>Solo pedimos permiso para leer: nunca enviamos, borramos ni tocamos tus mails, y solo miramos los avisos de estas cuentas.</T>
        </View>
        {link ? <Button label="Desconectar Gmail" variant="ghost" onPress={disconnect} disabled={gmail.busy} /> : null}
      </Card>}

      {lectorDisponible ? (
        <Card style={{ gap: 10 }}>
          <View style={styles.row}>
            <Icon name="BellRing" size={20} color={lectorActivo ? colors.income : colors.muted} />
            <T variant="subtitle" style={{ flex: 1 }}>Notificaciones de tus bancos</T>
          </View>
          <T variant="small">{lectorActivo ? (lector.estado.escuchando ? "Activadas: cada aviso de tus bancos entra al instante." : "Activadas, esperando que Android conecte el lector.") : "Con las notificaciones activadas, lo que te avisa la app de tu banco se carga solo, en segundos."}</T>
          <Button label={lectorActivo ? "Ver estado" : "Activar"} variant={lectorActivo ? "secondary" : "primary"} onPress={() => router.push("/notificaciones")} />
        </Card>
      ) : Platform.OS === "ios" ? (
        <Card style={{ gap: 8 }}>
          <T variant="subtitle">Avisos por mail de tus bancos</T>
          <T variant="small">En iPhone la app no puede leer las notificaciones de otras apps. Para que todo entre solo: conectá tu Gmail acá arriba y, en la app de cada banco, prendé los avisos por mail de compras, transferencias y plata recibida.</T>
        </Card>
      ) : null}
      {link ? <StatementSources userId={userId} /> : null}
    </Screen>
  );
}
