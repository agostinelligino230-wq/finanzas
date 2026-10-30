import { useEffect, useState, type ReactNode } from "react";
import { Image, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { dayLabel, money, parseAmount, timeLabel, usd } from "../../../shared/format";
import { findCategory, type Category } from "../../../shared/categorias";
import { findPayee, payeeKey } from "../../../shared/destinatarios";
import { MAP_CREDIT, mapLink, mapTile, type NearbyPlace } from "../../../shared/mapa";
import { hasDetail, needsReview, originLabel, readFrom, type Movement } from "../../../shared/movimientos";
import { findProvider } from "../../../shared/providers";
import { useAuth } from "../lib/auth";
import { useCategories } from "../lib/categories";
import { useMovements } from "../lib/movements";
import { usePayees } from "../lib/payees";
import { radius, useColors } from "../lib/theme";
import { lugaresCerca } from "../lib/ubicacion";
import { Icon } from "../components/Icon";
import { IconColorPicker } from "../components/IconColorPicker";
import { ProviderIcon } from "../components/ProviderIcon";
import { toast } from "../components/Toast";
import { SheetNote, SheetPending, SheetScreen, close, confirmAction } from "../components/fixedUi";
import { Button, CategoryIcon, Field, T, styles } from "../components/ui";

export default function MovementScreen() {
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const movements = useMovements(session?.user.id ?? "");
  if (!session) return <Redirect href="/login" />;
  const item = movements.all.find((entry) => entry.id === id);
  if (!item) return <SheetPending title="Movimiento" loaded={movements.loaded} missing="Ese movimiento ya no está: puede que lo hayas borrado desde otro lado." />;
  return <Detail key={item.id} userId={session.user.id} item={item} movements={movements} />;
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return <View style={{ gap: 6 }}><T variant="label">{title}</T>{children}</View>;
}

function Line({ label, value }: { label: string; value: string }) {
  return <View style={[styles.row, { alignItems: "flex-start", justifyContent: "space-between" }]}><T variant="small">{label}</T><T style={{ flexShrink: 1, textAlign: "right" }}>{value}</T></View>;
}

function CategoryChips({ list, value, onChange }: { list: Category[]; value: string; onChange: (id: string) => void }) {
  const colors = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
      {list.map((category) => {
        const active = category.id === value;
        return (
          <Pressable key={category.id} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => onChange(category.id)} style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 2, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : colors.surface }}>
            <Icon name={category.icon} size={16} color={active ? colors.primaryText : category.color} />
            <Text style={{ color: active ? colors.primaryText : colors.text, fontWeight: active ? "700" : "500" }}>{category.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SmallMap({ lat, lng }: { lat: number; lng: number }) {
  const colors = useColors();
  const [failed, setFailed] = useState(false);
  const tile = mapTile(lat, lng);
  const open = () => Linking.openURL(mapLink(lat, lng)).catch(() => toast("No se pudo abrir el mapa."));
  if (failed) return <Button label="Ver en el mapa" icon="MapPin" variant="secondary" onPress={open} />;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel="Ver en el mapa" onPress={open} style={{ alignSelf: "center", width: tile.size, height: tile.size, borderRadius: radius.field, overflow: "hidden", backgroundColor: colors.surface2 }}>
      <Image source={{ uri: tile.url }} onError={() => setFailed(true)} accessibilityIgnoresInvertColors style={{ width: tile.size, height: tile.size }} />
      <View style={{ position: "absolute", left: tile.left * tile.size - 12, top: tile.top * tile.size - 24 }}><Icon name="MapPin" size={24} color="#E0475F" /></View>
      <Text style={{ position: "absolute", right: 4, bottom: 2, fontSize: 10, color: "#333333" }}>{MAP_CREDIT}</Text>
    </Pressable>
  );
}

function Detail({ userId, item, movements }: { userId: string; item: Movement; movements: ReturnType<typeof useMovements> }) {
  const colors = useColors();
  const { categories } = useCategories(userId);
  const { payees, savePayee } = usePayees(userId);
  const payee = findPayee(payees, item);
  const category = findCategory(categories, item.type, item.category);
  const provider = findProvider(item.source);
  const list = categories.filter((entry) => entry.kind === item.type);
  const hasPayee = Boolean(payeeKey(item));

  const [categoryId, setCategoryId] = useState(item.category);
  const [note, setNote] = useState(item.note ?? "");
  const [busy, setBusy] = useState(false);
  const [editingPlace, setEditingPlace] = useState(false);
  const [placeName, setPlaceName] = useState(item.place.name ?? payee?.placeName ?? "");
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [splitAmount, setSplitAmount] = useState("");
  const [splitCategory, setSplitCategory] = useState("otro");
  const [styling, setStyling] = useState(false);
  const [look, setLook] = useState({ icon: payee?.icon ?? "Tag", color: payee?.color ?? "#2F80ED" });

  const { lat, lng } = item.place;
  useEffect(() => {
    if (!editingPlace || lat === null || lng === null) return;
    let active = true;
    lugaresCerca(lat, lng).then((result) => { if (active) setNearby(result?.lugares ?? []); });
    return () => { active = false; };
  }, [editingPlace, lat, lng]);

  const { photoLink } = movements;
  useEffect(() => {
    if (!item.photoPath) { setPhotoUrl(null); return; }
    let active = true;
    photoLink(item.photoPath).then((url) => { if (active) setPhotoUrl(url); });
    return () => { active = false; };
    // photoLink es la misma función para todo el movimiento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.photoPath]);

  const incoming = item.type === "ingreso";
  const who = item.counterpartyName ?? (hasDetail(item, category.name) ? item.description : category.name);
  const changed = categoryId !== item.category || note.trim() !== (item.note ?? "");

  const saveDetail = async () => {
    setBusy(true);
    const ok = await movements.saveDetail(item, { category: categoryId, note: note.trim() || null });
    setBusy(false);
    if (ok) toast("Guardado.", { ok: true });
  };

  const savePlace = async (name: string, address: string) => {
    if (!name.trim()) return;
    setBusy(true);
    const ok = await movements.setPlace(item, { lat, lng, name: name.trim(), address });
    if (ok && hasPayee) await savePayee(item, { placeName: name.trim() });
    setBusy(false);
    if (ok) { setPlaceName(name.trim()); setEditingPlace(false); }
  };

  const pickPhoto = async (camera: boolean) => {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { toast("Sin permiso para la cámara. Podés darlo en los Ajustes del teléfono."); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: "images", quality: 0.6 };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      setBusy(true);
      const ok = await movements.attachPhoto(item, asset.uri, asset.mimeType ?? "image/jpeg");
      setBusy(false);
      if (ok) toast("Foto guardada.", { ok: true });
    } catch {
      setBusy(false);
      toast("No se pudo abrir la cámara ni las fotos.");
    }
  };

  const doSplit = async () => {
    const value = parseAmount(splitAmount);
    if (!(value > 0) || value >= item.amount) { toast("El monto tiene que ser menor a " + money(item.amount) + "."); return; }
    setBusy(true);
    const ok = await movements.split(item, value, splitCategory);
    setBusy(false);
    if (ok) { setSplitting(false); setSplitAmount(""); toast("Listo: quedó dividido en dos.", { ok: true }); }
  };

  const saveLook = async () => {
    setBusy(true);
    const ok = await savePayee(item, look);
    setBusy(false);
    if (ok) setStyling(false); else toast("No se pudo guardar. Revisá tu conexión.");
  };

  const remove = () => confirmAction("¿Eliminar este movimiento?", item.description || undefined, "Eliminar", () => { movements.remove(item); close(); });

  return (
    <SheetScreen title="Detalle">
      {needsReview(item) ? (
        <SheetNote>
          <T style={{ fontWeight: "600" }}>Confirmá este movimiento</T>
          <T variant="small">Llegó sin un aviso verificado: no suma hasta que lo confirmes.</T>
          <View style={[styles.row, { gap: 8 }]}>
            <Button label="Sí, es mío" icon="Check" variant="soft" onPress={() => movements.confirm(item)} style={{ flex: 1, paddingHorizontal: 8 }} />
            <Button label="No" variant="danger" onPress={remove} style={{ flex: 1, paddingHorizontal: 8 }} />
          </View>
        </SheetNote>
      ) : null}

      <View style={{ alignItems: "center", gap: 6 }}>
        {payee?.icon ? <CategoryIcon category={{ icon: payee.icon, color: payee.color ?? "#607D8B" }} size={56} /> : provider ? <ProviderIcon name={provider.name} color={provider.color} provider={provider.id} size={56} /> : <CategoryIcon category={category} size={56} />}
        <Text style={{ fontSize: 32, fontWeight: "700", color: incoming ? colors.income : colors.text, fontVariant: ["tabular-nums"], textDecorationLine: item.excluded ? "line-through" : "none" }}>{incoming ? "+" : "−"}{money(item.amount)}</Text>
        {item.currency === "USD" && item.original !== null ? <T variant="small">{usd(item.original)} a {money(item.rate ?? 0)}</T> : null}
        <T style={{ textAlign: "center", fontWeight: "600" }}>{item.counterpartyName ? (incoming ? "Recibiste de " : "Enviaste a ") + who : who}</T>
        {item.excluded ? <T variant="small">No es un gasto: no suma</T> : null}
      </View>

      <Block title="Cuándo"><T>{dayLabel(item.date)} · {timeLabel(item.createdAt)} hs</T></Block>

      {item.counterpartyName || item.counterpartyRef ? (
        <Block title={incoming ? "Origen" : "Destino"}>
          {item.counterpartyName ? <Line label="Nombre" value={item.counterpartyName} /> : null}
          {item.counterpartyRef ? <Line label="CBU, CVU o alias" value={item.counterpartyRef} /> : null}
        </Block>
      ) : null}

      <Block title={incoming ? "Entró en" : "Salió de"}><T>{provider?.name ?? "Sin cuenta asociada"}</T></Block>

      <Block title="Comprobante">
        {item.opRef ? <Line label="Número de operación" value={item.opRef} /> : null}
        <Line label="Se leyó de" value={readFrom(item)} />
        {originLabel(item) ? <T variant="small">{originLabel(item)}</T> : null}
      </Block>

      <Block title="Qué fue">
        <CategoryChips list={list} value={categoryId} onChange={setCategoryId} />
        <Field value={note} onChangeText={setNote} placeholder="Ej.: kiosco, cigarrillos y gaseosa" accessibilityLabel="Nota" maxLength={300} multiline />
        {changed ? <Button label="Guardar" onPress={saveDetail} busy={busy} /> : null}
      </Block>

      <Block title="Dónde">
        {item.place.name ? <T style={{ fontWeight: "600" }}>{item.place.name}</T> : <T variant="small">Sin lugar guardado.</T>}
        {item.place.address ? <T variant="small">{item.place.address}</T> : null}
        {lat !== null && lng !== null ? <SmallMap lat={lat} lng={lng} /> : null}
        {editingPlace ? (
          <View style={{ gap: 8 }}>
            {nearby.map((place) => <Button key={place.nombre} label={place.nombre} variant="secondary" disabled={busy} onPress={() => savePlace(place.nombre, place.direccion)} />)}
            <Field value={placeName} onChangeText={setPlaceName} placeholder="Nombre del lugar" accessibilityLabel="Nombre del lugar" maxLength={120} />
            <Button label="Guardar lugar" disabled={!placeName.trim()} busy={busy} onPress={() => savePlace(placeName, item.place.address ?? "")} />
          </View>
        ) : <Button label={item.place.name ? "¿No fue acá?" : "Agregar lugar"} variant="ghost" onPress={() => setEditingPlace(true)} />}
      </Block>

      <Block title="Foto del ticket">
        {photoUrl ? <Image source={{ uri: photoUrl }} accessibilityLabel="Foto del ticket" resizeMode="contain" style={{ width: "100%", height: 240, borderRadius: radius.field, backgroundColor: colors.surface2 }} /> : null}
        <View style={[styles.row, { gap: 8 }]}>
          <Button label="Sacar foto" icon="Camera" variant="secondary" disabled={busy} onPress={() => pickPhoto(true)} style={{ flex: 1, paddingHorizontal: 8 }} />
          <Button label="Subir foto" icon="Image" variant="secondary" disabled={busy} onPress={() => pickPhoto(false)} style={{ flex: 1, paddingHorizontal: 8 }} />
        </View>
        {item.photoPath ? <Button label="Quitar la foto" variant="ghost" disabled={busy} onPress={() => confirmAction("¿Quitar la foto?", undefined, "Quitar", () => { movements.removePhoto(item); })} /> : null}
      </Block>

      {hasPayee ? (
        <Block title="Ícono de este destinatario">
          {styling ? (
            <View style={{ gap: 10 }}>
              <IconColorPicker icon={look.icon} color={look.color} onChange={setLook} />
              <Button label="Guardar" busy={busy} onPress={saveLook} />
            </View>
          ) : <Button label={payee?.icon ? "Cambiar ícono y color" : "Ponerle ícono y color"} variant="ghost" onPress={() => setStyling(true)} />}
        </Block>
      ) : null}

      {splitting ? (
        <SheetNote>
          <T style={{ fontWeight: "600" }}>Dividir en dos categorías</T>
          <Field label="Monto de la otra parte" value={splitAmount} onChangeText={setSplitAmount} placeholder="$ 0" keyboardType="decimal-pad" />
          <CategoryChips list={list} value={splitCategory} onChange={setSplitCategory} />
          <Button label="Dividir" busy={busy} onPress={doSplit} />
          <Button label="Cancelar" variant="ghost" onPress={() => setSplitting(false)} />
        </SheetNote>
      ) : null}

      <View style={{ gap: 8 }}>
        {item.type === "gasto" ? <Button label={item.excluded ? "Volver a contarlo como gasto" : "No es un gasto"} variant="secondary" disabled={busy} onPress={() => movements.setExcluded(item, !item.excluded)} /> : null}
        {item.currency === "ARS" && !splitting ? <Button label="Dividir en dos categorías" variant="secondary" onPress={() => setSplitting(true)} /> : null}
        <Button label="Corregir monto o fecha" icon="Pencil" variant="secondary" onPress={() => router.push({ pathname: "/agregar", params: { id: item.id } })} />
        <Button label="Borrar" icon="Trash2" variant="danger" onPress={remove} />
      </View>
    </SheetScreen>
  );
}
