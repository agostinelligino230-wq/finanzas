import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { unlocated, type Movement } from "../../../shared/movimientos";
import type { NearbyPlace } from "../../../shared/mapa";
import { useMovements } from "../lib/movements";
import { usePayees } from "../lib/payees";
import { useColors } from "../lib/theme";
import { descartados, descartar, lugaresCerca, marcarPreguntado, pedirPermiso, posicionActual, tienePermiso, useUbicacion, yaPreguntado } from "../lib/ubicacion";
import { Icon } from "./Icon";
import { Button, Card, Field, T, styles } from "./ui";

type Sugerencia = { item: Movement; lat: number; lng: number; lugares: NearbyPlace[]; direccion: string };

// Va en Inicio: explica y pide el permiso una sola vez, y pregunta «¿Fue acá?» por el último gasto sin lugar.
export function UbicacionAlAbrir({ userId }: { userId: string }) {
  const { cargada, prendida } = useUbicacion(userId);
  const { all, setPlace } = useMovements(userId);
  const { savePayee } = usePayees(userId);
  const [explicar, setExplicar] = useState(false);
  const [permiso, setPermiso] = useState(false);
  const [sugerencia, setSugerencia] = useState<Sugerencia | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [otro, setOtro] = useState("");

  useEffect(() => {
    if (!cargada || !prendida) return;
    tienePermiso().then((granted) => { setPermiso(granted); if (!granted && !yaPreguntado()) setExplicar(true); });
  }, [cargada, prendida]);

  const pendiente = useMemo(() => {
    if (!prendida) return null;
    const saltear = descartados();
    return unlocated(all).find((item) => !saltear.has(item.id) && (permiso || item.place.lat !== null)) ?? null;
  }, [all, prendida, permiso]);
  const pendienteId = pendiente?.id;

  useEffect(() => {
    if (!pendiente) { setSugerencia(null); return; }
    let active = true;
    setEligiendo(false);
    setOtro("");
    (async () => {
      // Si llegó con la ubicación del aviso se usa esa; si no, donde está el celular ahora.
      const punto = pendiente.place.lat !== null && pendiente.place.lng !== null ? { lat: pendiente.place.lat, lng: pendiente.place.lng } : await posicionActual();
      if (!punto) return;
      const cerca = await lugaresCerca(punto.lat, punto.lng);
      if (active) setSugerencia({ item: pendiente, ...punto, lugares: cerca?.lugares ?? [], direccion: cerca?.direccion ?? "" });
    })();
    return () => { active = false; };
    // Se busca una vez por movimiento, no cada vez que cambia la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendienteId]);

  const responder = async (quiere: boolean) => {
    setExplicar(false);
    if (quiere) setPermiso(await pedirPermiso());
    else marcarPreguntado();
  };

  const guardar = async (nombre: string, direccion: string) => {
    if (!sugerencia) return;
    const { item, lat, lng } = sugerencia;
    setSugerencia(null);
    if (await setPlace(item, { lat, lng, name: nombre, address: direccion })) savePayee(item, { placeName: nombre });
    else descartar(item.id);
  };
  const noGuardar = () => { if (sugerencia) descartar(sugerencia.item.id); setSugerencia(null); };

  const principal = sugerencia?.lugares[0];
  return (
    <>
      <Modal visible={explicar} animationType="slide" onRequestClose={() => responder(false)}>
        <ExplicarPermiso onResponder={responder} />
      </Modal>
      {sugerencia ? (
        <Card style={{ gap: 8 }}>
          <View style={[styles.row, { gap: 8 }]}>
            <Icon name="MapPin" size={18} color="#E0475F" />
            <T variant="subtitle" style={{ flex: 1 }}>¿Fue acá?</T>
          </View>
          <T variant="small" numberOfLines={1}>{sugerencia.item.description}</T>
          <T style={{ fontWeight: "600" }}>{principal ? principal.nombre : sugerencia.direccion || "Tu ubicación actual"}</T>
          {principal && (principal.direccion || sugerencia.direccion) ? <T variant="small">{principal.direccion || sugerencia.direccion}</T> : null}
          {eligiendo ? (
            <View style={{ gap: 8 }}>
              {sugerencia.lugares.slice(1).map((lugar) => (
                <Pressable key={lugar.nombre} accessibilityRole="button" onPress={() => guardar(lugar.nombre, lugar.direccion)} style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", opacity: pressed ? 0.6 : 1 })}>
                  <T>{lugar.nombre}</T>
                </Pressable>
              ))}
              <Field value={otro} onChangeText={setOtro} placeholder="Escribí el lugar" accessibilityLabel="Nombre del lugar" maxLength={120} />
              <Button label="Guardar este lugar" variant="soft" disabled={!otro.trim()} onPress={() => guardar(otro.trim(), sugerencia.direccion)} />
              <Button label="No guardar" variant="ghost" onPress={noGuardar} />
            </View>
          ) : (
            <View style={[styles.row, { gap: 8 }]}>
              <Button label="Sí" variant="soft" onPress={() => guardar(principal?.nombre ?? sugerencia.direccion, principal?.direccion || sugerencia.direccion)} disabled={!principal && !sugerencia.direccion} style={{ flex: 1, paddingHorizontal: 8 }} />
              <Button label="Elegir otro" variant="secondary" onPress={() => setEligiendo(true)} style={{ flex: 1, paddingHorizontal: 8 }} />
              <Button label="No guardar" variant="ghost" onPress={noGuardar} style={{ flex: 1, paddingHorizontal: 4 }} />
            </View>
          )}
        </Card>
      ) : null}
    </>
  );
}

function ExplicarPermiso({ onResponder }: { onResponder: (quiere: boolean) => void }) {
  const colors = useColors();
  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.surface, padding: 24, gap: 16, justifyContent: "center" }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", alignSelf: "center" }}><Icon name="MapPin" size={32} color={colors.primaryText} /></View>
      <T variant="title" style={{ textAlign: "center" }}>¿Dónde hiciste cada gasto?</T>
      <T style={{ textAlign: "center" }}>Guardamos dónde hiciste cada gasto para que sepas qué fue. Solo mientras usás la app, y lo ves únicamente vos.</T>
      <T variant="small" style={{ textAlign: "center" }}>Podés apagarlo o borrar todo cuando quieras en Más. Si decís que no, la app sigue funcionando igual.</T>
      <Button label="Permitir ubicación" onPress={() => onResponder(true)} />
      <Button label="Ahora no" variant="ghost" onPress={() => onResponder(false)} />
    </SafeAreaView>
  );
}
