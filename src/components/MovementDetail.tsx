import { useEffect, useRef, useState } from "react";
import { Camera, Check, ExternalLink, MapPin, Pencil, Scissors, Trash2, Undo2, X } from "lucide-react";
import IconColorPicker from "./IconColorPicker";
import { CategoryIcon, sheetField as field, sheetLabel as label } from "./ui";
import { ProviderIcon } from "./sheets";
import { COLORS, findCategory, type Category } from "../lib/categories";
import { dayLabel, money, parseAmount, timeLabel, usd } from "../lib/format";
import { currentPosition, nearbyPlaces, type Point } from "../lib/location";
import { photoUrl, readFrom, type useMovements, type Movement } from "../lib/movements";
import { findPayee, payeeKey, type usePayees } from "../lib/payees";
import { findProvider } from "../lib/providers";
import { MAP_CREDIT, mapLink, mapTile, type NearbyPlace } from "../../shared/mapa";

const isTransfer = (item: Movement) => item.category === "transferencias";

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="flex justify-between gap-4 py-2 text-sm"><span className="shrink-0 text-[var(--muted)]">{title}</span><span className="min-w-0 break-words text-right font-medium">{children}</span></div>;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-5"><h3 className={label}>{title}</h3>{children}</section>;
}

// Dónde fue: el lugar guardado, o los comercios cerca de las coordenadas para elegir.
function PlaceBlock({ item, savedPlace, onSave }: { item: Movement; savedPlace: string | null; onSave: (point: Point | null, name: string, address: string) => Promise<boolean> }) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [point, setPoint] = useState<Point | null>(null);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [address, setAddress] = useState("");
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const { lat, lng, name } = item.place;

  const open = async () => {
    setPicking(true);
    setBusy(true);
    setError("");
    const found = lat !== null && lng !== null ? { lat, lng } : await currentPosition();
    const here = found && found !== "denied" ? found : null;
    setPoint(here);
    if (here) { const result = await nearbyPlaces(here); setPlaces(result.lugares); setAddress(result.direccion); }
    else setError("No pudimos saber dónde estás: escribí el lugar a mano.");
    setBusy(false);
  };

  const choose = async (place: string, placeAddress: string) => {
    if (!place.trim()) return;
    setBusy(true);
    const ok = await onSave(point, place.trim(), placeAddress);
    setBusy(false);
    if (ok) setPicking(false); else setError("No se pudo guardar el lugar. Probá de nuevo.");
  };

  const tile = lat !== null && lng !== null ? mapTile(lat, lng) : null;
  return (
    <Block title="Dónde">
      {name ? <p className="font-semibold">{name}</p> : <p className="text-sm text-[var(--muted)]">{tile ? "Tenemos el punto, falta elegir el lugar." : "Sin lugar guardado."}</p>}
      {item.place.address && <p className="text-sm text-[var(--muted)]">{item.place.address}</p>}
      {tile && lat !== null && lng !== null && (
        <>
          <div className="relative mx-auto mt-3 overflow-hidden rounded-2xl" style={{ width: tile.size, height: tile.size }}>
            <img src={tile.url} alt={"Mapa de " + (name ?? "donde fue el gasto")} loading="lazy" width={tile.size} height={tile.size} />
            <MapPin size={28} className="absolute -translate-x-1/2 -translate-y-full fill-[var(--expense)] text-white" style={{ left: tile.left * 100 + "%", top: tile.top * 100 + "%" }} aria-hidden />
          </div>
          <p className="mt-1 flex items-center justify-center gap-3 text-xs text-[var(--muted)]">{MAP_CREDIT}<a href={mapLink(lat, lng)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[var(--primary-text)]">Abrir el mapa<ExternalLink size={12} /></a></p>
        </>
      )}
      {!picking ? (
        <button type="button" onClick={open} className="mt-2 text-sm font-semibold text-[var(--primary-text)]">{name ? "¿No fue acá?" : "Elegir el lugar"}</button>
      ) : (
        <div className="mt-3 space-y-2 rounded-2xl bg-[var(--surface-2)] p-3">
          {busy && <p className="text-sm text-[var(--muted)]">Buscando comercios cerca…</p>}
          {savedPlace && <button type="button" disabled={busy} onClick={() => choose(savedPlace, "")} className="block w-full rounded-xl bg-[var(--surface)] px-3 py-2 text-left text-sm font-semibold">{savedPlace} <span className="font-normal text-[var(--muted)]">· la última vez</span></button>}
          {places.map((place) => <button key={place.nombre} type="button" disabled={busy} onClick={() => choose(place.nombre, place.direccion || address)} className="block w-full rounded-xl bg-[var(--surface)] px-3 py-2 text-left text-sm"><span className="block font-semibold">{place.nombre}</span>{place.direccion && <span className="block text-xs text-[var(--muted)]">{place.direccion}</span>}</button>)}
          {!busy && places.length === 0 && point && <p className="text-sm text-[var(--muted)]">No encontramos comercios cerca: escribilo vos.</p>}
          <div className="flex gap-2">
            <input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="Ej.: Kiosco Pepe" aria-label="Nombre del lugar" className={field + " bg-[var(--surface)]"} />
            <button type="button" disabled={busy || !custom.trim()} onClick={() => choose(custom, address)} className="h-12 shrink-0 rounded-2xl bg-[var(--primary)] px-4 font-semibold text-white disabled:opacity-60">Guardar</button>
          </div>
          {error && <p role="alert" className="text-sm text-[var(--expense)]">{error}</p>}
          <button type="button" onClick={() => setPicking(false)} className="text-sm font-semibold text-[var(--muted)]">Cancelar</button>
        </div>
      )}
    </Block>
  );
}

function PhotoBlock({ item, onUpload, onRemove }: { item: Movement; onUpload: (file: File) => Promise<boolean>; onRemove: () => Promise<boolean> }) {
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setUrl("");
    if (item.photoPath) photoUrl(item.photoPath).then((value) => { if (active) setUrl(value); });
    return () => { active = false; };
  }, [item.photoPath]);

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    const ok = await onUpload(file);
    setBusy(false);
    if (!ok) setError("No se pudo subir la foto. Tiene que ser una imagen de hasta 8 MB.");
  };

  return (
    <Block title="Foto del ticket">
      {item.photoPath && (url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Ticket" className="max-h-64 w-full rounded-2xl object-contain" /></a> : <p className="text-sm text-[var(--muted)]">Cargando la foto…</p>)}
      <input ref={input} type="file" accept="image/*" hidden onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ""; }} />
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="flex h-11 items-center gap-2 rounded-2xl border border-[var(--border)] px-4 text-sm font-semibold disabled:opacity-60"><Camera size={16} />{busy ? "Subiendo…" : item.photoPath ? "Cambiar la foto" : "Subir una foto"}</button>
        {item.photoPath && <button type="button" disabled={busy} onClick={() => { if (window.confirm("¿Borrar la foto del ticket?")) onRemove(); }} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] text-[var(--expense)]" aria-label="Borrar la foto"><Trash2 size={16} /></button>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-[var(--expense)]">{error}</p>}
    </Block>
  );
}

// Detalle de un movimiento: panel lateral en pantallas grandes y hoja desde abajo en las chicas.
export default function MovementDetail({ item, categories, data, payees, onClose }: { item: Movement; categories: Category[]; data: ReturnType<typeof useMovements>; payees: ReturnType<typeof usePayees>; onClose: () => void }) {
  const category = findCategory(categories, item.type, item.category);
  const payee = findPayee(payees.payees, item);
  const provider = findProvider(item.source);
  const [categoryId, setCategoryId] = useState(item.category);
  const [note, setNote] = useState(item.note ?? "");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [splitAmount, setSplitAmount] = useState("");
  const [splitCategory, setSplitCategory] = useState("");
  const [styling, setStyling] = useState(false);
  const [icon, setIcon] = useState(payee?.icon ?? "Tag");
  const [color, setColor] = useState(payee?.color ?? COLORS[5]);
  const person = payee?.name ?? item.counterpartyName;
  const heading = isTransfer(item) && person ? (item.type === "gasto" ? "Enviaste a " : "Recibiste de ") + person : item.description || category.name;
  const dirty = categoryId !== item.category || note.trim() !== (item.note ?? "");
  const options = categories.filter((entry) => entry.kind === item.type);
  const splitValue = parseAmount(splitAmount);

  const saveDetail = async () => {
    setSaving(true);
    const ok = await data.saveDetail(item, { note, category: categoryId });
    setSaving(false);
    setSaved(ok);
    setError(ok ? "" : "No se pudo guardar. Probá de nuevo.");
  };

  const split = async () => {
    if (!(splitValue > 0) || splitValue >= item.amount) { setError("El monto tiene que ser mayor a cero y menor al total."); return; }
    if (!splitCategory) { setError("Elegí la otra categoría."); return; }
    setSaving(true);
    const ok = await data.split(item, splitValue, splitCategory);
    setSaving(false);
    if (ok) { setSplitting(false); setSplitAmount(""); setError(""); } else setError("No se pudo dividir el movimiento.");
  };

  const savePlace = async (point: Point | null, name: string, address: string) => {
    const ok = await data.setPlace(item, point, name, address);
    if (ok && payeeKey(item)) await payees.save(item, { placeName: name });
    return ok;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-end bg-black/50 sm:items-stretch" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={"Detalle de " + heading} onClick={(event) => event.stopPropagation()} className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-[var(--surface)] p-5 pb-8 text-[var(--text)] shadow-2xl sm:max-h-none sm:max-w-md sm:rounded-none">
        <div className="flex justify-end"><button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[var(--surface-2)]" aria-label="Cerrar"><X size={20} /></button></div>
        <div className="flex flex-col items-center text-center">
          {payee?.icon ? <CategoryIcon category={{ icon: payee.icon, color: payee.color ?? COLORS[5] }} size={56} /> : provider ? <ProviderIcon name={provider.name} color={provider.color} provider={provider.id} size={56} /> : <CategoryIcon category={category} size={56} />}
          <p className="mt-3 text-3xl font-bold tabular-nums" style={{ color: item.type === "ingreso" ? "var(--income)" : undefined }}>{item.type === "ingreso" ? "+" : "−"}{money(item.amount)}</p>
          {item.currency === "USD" && item.original !== null && <p className="text-sm text-[var(--muted)]">{usd(item.original)} a {money(item.rate ?? 0)}</p>}
          <p className="mt-1 font-semibold">{heading}</p>
          {item.excluded && <p className="mt-2 rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">No es un gasto: no suma</p>}
        </div>

        {item.trust === "doubtful" && !item.confirmedAt && !item.excluded && (
          <div className="mt-4 rounded-2xl bg-[var(--expense-soft)] p-3">
            <p className="font-semibold">Confirmá este movimiento</p>
            <p className="text-sm text-[var(--muted)]">Llegó sin un aviso verificado y no suma hasta que lo confirmes.</p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => data.confirm(item)} className="flex h-11 flex-1 items-center justify-center gap-1 rounded-2xl bg-[var(--primary)] font-semibold text-white"><Check size={16} />Sí, es mío</button>
              <button type="button" onClick={() => { if (window.confirm("¿Borrar este movimiento?")) { data.remove(item); onClose(); } }} className="h-11 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] font-semibold">No, borrar</button>
            </div>
          </div>
        )}

        <div className="mt-4 divide-y divide-[var(--border)]">
          <Row title="Cuándo">{dayLabel(item.date)} · {timeLabel(item.createdAt)} hs</Row>
          {(person || item.counterpartyRef) && <Row title={item.type === "gasto" ? "Destino" : "De quién"}>{person}{person && item.counterpartyRef && <br />}{item.counterpartyRef}</Row>}
          {provider && <Row title="Origen">{provider.name}</Row>}
          {item.opRef && <Row title="Operación">{item.opRef}</Row>}
          <Row title="Se leyó de">{readFrom(item)}</Row>
        </div>

        {payeeKey(item) && (
          <div className="mt-2">
            {!styling ? <button type="button" onClick={() => setStyling(true)} className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary-text)]"><Pencil size={14} />{payee?.icon ? "Cambiar ícono y color" : "Ponerle ícono y color"}</button> : (
              <div className="space-y-3 rounded-2xl bg-[var(--surface-2)] p-3">
                <IconColorPicker icon={icon} color={color} onIcon={setIcon} onColor={setColor} />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStyling(false)} className="h-11 flex-1 rounded-2xl border border-[var(--border)] font-semibold">Cancelar</button>
                  <button type="button" onClick={async () => { if (await payees.save(item, { icon, color })) setStyling(false); else setError("No se pudo guardar el ícono."); }} className="h-11 flex-1 rounded-2xl bg-[var(--primary)] font-semibold text-white">Guardar</button>
                </div>
              </div>
            )}
          </div>
        )}

        <Block title="Qué fue">
          <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setSaved(false); }} aria-label="Categoría" className={field}>{options.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
          <textarea value={note} onChange={(event) => { setNote(event.target.value); setSaved(false); }} rows={2} maxLength={300} placeholder="Ej.: kiosco, cigarrillos y gaseosa" aria-label="Nota" className={field + " mt-2 h-auto py-3"} />
          {dirty && <button type="button" disabled={saving} onClick={saveDetail} className="mt-2 h-11 w-full rounded-2xl bg-[var(--accent)] font-bold text-[var(--accent-text)] disabled:opacity-60">{saving ? "Guardando…" : "Guardar"}</button>}
          {saved && !dirty && <p className="mt-2 text-sm text-[var(--income)]">Guardado.</p>}
        </Block>

        <PlaceBlock key={item.id} item={item} savedPlace={payee?.placeName ?? null} onSave={savePlace} />
        <PhotoBlock item={item} onUpload={(file) => data.uploadPhoto(item, file)} onRemove={() => data.removePhoto(item)} />

        {splitting && (
          <Block title="Dividir en dos categorías">
            <div className="space-y-2 rounded-2xl bg-[var(--surface-2)] p-3">
              <input value={splitAmount} onChange={(event) => setSplitAmount(event.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="Cuánto va a la otra categoría" aria-label="Monto a separar" className={field + " bg-[var(--surface)] tabular-nums"} />
              <select value={splitCategory} onChange={(event) => setSplitCategory(event.target.value)} aria-label="Otra categoría" className={field + " bg-[var(--surface)]"}><option value="">Elegí la categoría</option>{options.filter((entry) => entry.id !== item.category).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
              {splitValue > 0 && splitValue < item.amount && <p className="text-sm text-[var(--muted)]">Quedan {money(item.amount - splitValue)} en {category.name}.</p>}
              <button type="button" disabled={saving} onClick={split} className="h-11 w-full rounded-2xl bg-[var(--primary)] font-semibold text-white disabled:opacity-60">Dividir</button>
            </div>
          </Block>
        )}

        {error && <p role="alert" className="mt-4 text-sm text-[var(--expense)]">{error}</p>}

        <div className="mt-5 grid gap-2">
          {item.type === "gasto" && <button type="button" onClick={() => data.setExcluded(item, !item.excluded)} className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] text-sm font-semibold"><Undo2 size={16} />{item.excluded ? "Volver a contarlo como gasto" : "No es un gasto (pase entre mis cuentas)"}</button>}
          {item.currency === "ARS" && !splitting && <button type="button" onClick={() => setSplitting(true)} className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] text-sm font-semibold"><Scissors size={16} />Dividir en dos categorías</button>}
          <button type="button" onClick={() => { if (window.confirm("¿Eliminar este movimiento?")) { data.remove(item); onClose(); } }} className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] text-sm font-semibold text-[var(--expense)]"><Trash2 size={16} />Borrar</button>
        </div>
      </div>
    </div>
  );
}
