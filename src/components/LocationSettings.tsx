import { useState } from "react";
import { MapPin } from "lucide-react";
import { Card } from "./ui";
import { useLocationEnabled } from "../lib/location";

// Ajustes de ubicación: apagarla y borrar todo lo guardado.
export default function LocationSettings({ userId }: { userId: string }) {
  const location = useLocationEnabled(userId);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  if (location.enabled === null) return null;

  const toggle = async () => {
    setBusy(true);
    const ok = await location.save(!location.enabled);
    setBusy(false);
    setNotice(ok ? "" : "No se pudo guardar. Probá de nuevo.");
  };

  const forget = async () => {
    if (!window.confirm("¿Borrar el lugar de todos tus movimientos? No se puede deshacer.")) return;
    setBusy(true);
    const ok = await location.forget();
    setBusy(false);
    setNotice(ok ? "Listo: borramos todas las ubicaciones guardadas." : "No se pudieron borrar. Probá de nuevo.");
  };

  return (
    <Card className="space-y-3">
      <label className="flex cursor-pointer items-center gap-3">
        <MapPin size={20} className="shrink-0 text-[var(--primary-text)]" />
        <span className="min-w-0 flex-1"><span className="block font-semibold">Guardar dónde hice cada gasto</span><span className="block text-sm text-[var(--muted)]">Queda solo en el movimiento y lo ves vos. No seguimos tus pasos.</span></span>
        <input type="checkbox" checked={location.enabled} disabled={busy} onChange={toggle} className="h-6 w-6 shrink-0 accent-[var(--primary)]" />
      </label>
      <button type="button" disabled={busy} onClick={forget} className="text-sm font-semibold text-[var(--expense)] disabled:opacity-60">Borrar todas las ubicaciones</button>
      {notice && <p role="status" className="text-sm text-[var(--muted)]">{notice}</p>}
    </Card>
  );
}
