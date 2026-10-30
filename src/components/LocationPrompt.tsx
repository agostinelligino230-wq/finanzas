import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { Sheet } from "./ui";
import { money } from "../lib/format";
import { addSkipped, currentPosition, nearbyPlaces, readConsent, readSkipped, saveConsent, useLocationEnabled, type Point } from "../lib/location";
import { unlocated, type Movement } from "../lib/movements";
import type { NearbyPlace } from "../../shared/mapa";

type Found = { item: Movement; point: Point; address: string; places: NearbyPlace[] };

// Al abrir la app: si hay gastos recientes sin lugar, pregunta «¿Fue acá?». El permiso se pide una sola vez,
// con esta explicación antes del cartel del navegador. Si dice que no, todo sigue andando sin ubicación.
export default function LocationPrompt({ userId, movements, onSave }: { userId: string; movements: Movement[]; onSave: (item: Movement, point: Point, name: string, address: string) => Promise<boolean> }) {
  const location = useLocationEnabled(userId);
  const [consent, setConsent] = useState(() => readConsent(userId));
  const [skipped, setSkipped] = useState(() => readSkipped(userId));
  const [found, setFound] = useState<Found | null>(null);
  const [choosing, setChoosing] = useState(false);
  const pending = useMemo(() => unlocated(movements).filter((item) => !skipped.includes(item.id)), [movements, skipped]);
  const next = pending[0] ?? null;
  const nextId = next?.id ?? null;

  useEffect(() => {
    if (!next || consent !== "ok" || location.enabled !== true) { setFound(null); return; }
    let active = true;
    setChoosing(false);
    (async () => {
      const here = next.place.lat !== null && next.place.lng !== null ? { lat: next.place.lat, lng: next.place.lng } : await currentPosition();
      if (!active) return;
      if (here === "denied") { saveConsent(userId, "no"); setConsent("no"); return; }
      if (!here) return;
      const result = await nearbyPlaces(here);
      if (!active) return;
      // Sin comercios ni dirección no hay nada que preguntar.
      if (result.lugares.length || result.direccion) setFound({ item: next, point: here, address: result.direccion, places: result.lugares });
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextId, consent, location.enabled, userId]);

  if (!next || location.enabled !== true) return null;

  if (consent === null) {
    const answer = (value: "ok" | "no") => { saveConsent(userId, value); setConsent(value); };
    return (
      <Sheet title="¿Guardamos dónde gastás?" onClose={() => answer("no")}>
        <p className="flex gap-3 text-base"><MapPin size={22} className="shrink-0 text-[var(--primary-text)]" />Guardamos dónde hiciste cada gasto para que sepas qué fue.</p>
        <p className="mt-2 text-sm text-[var(--muted)]">Solo queda en el movimiento y lo ves vos: no seguimos tus pasos. Lo podés apagar cuando quieras en Conectar.</p>
        <button type="button" onClick={() => answer("ok")} className="mt-5 w-full rounded-2xl bg-[var(--accent)] py-3.5 text-base font-bold text-[var(--accent-text)]">Dale, usar mi ubicación</button>
        <button type="button" onClick={() => answer("no")} className="mt-2 h-11 w-full text-sm font-semibold text-[var(--muted)]">Ahora no</button>
      </Sheet>
    );
  }

  if (!found || found.item.id !== next.id) return null;
  const { item, point, address, places } = found;
  const best = places[0] ?? { nombre: address, direccion: "" };
  const skip = () => { addSkipped(userId, item.id); setSkipped((current) => [...current, item.id]); setFound(null); };
  const save = async (name: string, placeAddress: string) => { if (await onSave(item, point, name, placeAddress)) setFound(null); };

  return (
    <Sheet title="¿Fue acá?" onClose={skip}>
      <p className="text-sm text-[var(--muted)]">{item.description || "Tu gasto"} · {money(item.amount)}</p>
      {choosing ? (
        <div className="mt-3 space-y-2">
          {places.map((place) => <button key={place.nombre} type="button" onClick={() => save(place.nombre, place.direccion || address)} className="block w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-left hover:bg-[var(--surface-2)]"><span className="block font-semibold">{place.nombre}</span>{place.direccion && <span className="block text-sm text-[var(--muted)]">{place.direccion}</span>}</button>)}
          <p className="text-sm text-[var(--muted)]">¿No está en la lista? Escribilo desde el detalle del movimiento.</p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-lg font-bold">{best.nombre}</p>
          {(best.direccion || (address && address !== best.nombre)) && <p className="text-sm text-[var(--muted)]">{best.direccion || address}</p>}
          <button type="button" onClick={() => save(best.nombre, best.direccion || address)} className="mt-5 w-full rounded-2xl bg-[var(--accent)] py-3.5 text-base font-bold text-[var(--accent-text)]">Sí</button>
          {places.length > 1 && <button type="button" onClick={() => setChoosing(true)} className="mt-2 h-11 w-full rounded-2xl border border-[var(--border)] font-semibold">Elegir otro</button>}
        </>
      )}
      <button type="button" onClick={skip} className="mt-2 h-11 w-full text-sm font-semibold text-[var(--muted)]">No guardar</button>
    </Sheet>
  );
}
