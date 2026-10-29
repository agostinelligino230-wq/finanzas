import { useEffect, useState } from "react";
import { Check, RefreshCw, ShieldCheck } from "lucide-react";
import { useMercadoPago, type MpItem, type MpResult } from "../lib/mercadopago";
import { PROVIDERS } from "../lib/providers";
import { money } from "../lib/format";
import { Card, ErrorBox } from "./ui";
import { ProviderIcon } from "./sheets";

// Mercado Pago por API (versión de prueba): conecta la cuenta con el permiso oficial de Mercado Pago y muestra,
// movimiento por movimiento, qué coincide con lo que ya entra por mail o aviso del celular y qué falta.

const RETURN_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  ok: { text: "¡Listo! Mercado Pago quedó conectado y ya trajimos tus movimientos de los últimos 60 días. Abajo ves cuáles coinciden con lo que entra por mail.", ok: true },
  cancelado: { text: "No se conectó: cancelaste en la pantalla de Mercado Pago.", ok: false },
  "sin-configurar": { text: "La conexión con Mercado Pago todavía no está configurada en el servidor. Avisale a Tomás.", ok: false },
  error: { text: "Algo falló al conectar Mercado Pago. Probá de nuevo.", ok: false },
};

const COLOR = PROVIDERS.find((provider) => provider.id === "mercadopago")?.color ?? "#00B1EA";
const shortDate = (iso: string) => new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const REPORTE: Record<string, string> = {
  pedido: "Le pedimos a Mercado Pago el reporte de movimientos de tu cuenta. Tarda unos minutos: tocá «Actualizar ahora» más tarde.",
  esperando: "Mercado Pago todavía está armando el reporte de movimientos de tu cuenta. Tocá «Actualizar ahora» en unos minutos.",
  "leído": "También leímos el reporte de movimientos de tu cuenta.",
};

function Badge({ item }: { item: MpItem }) {
  if (!item.tipo) return <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)]">No cuenta</span>;
  if (item.porMail) return <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--income)]">También por mail</span>;
  return <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--primary-text)]">Solo por API</span>;
}

function Summary({ result }: { result: MpResult }) {
  const total = (result.nuevos ?? 0) + (result.unidos ?? 0) + (result.repetidos ?? 0) + (result.descartados ?? 0);
  const cuentan = (result.detalle ?? []).filter((item) => item.tipo);
  const soloApi = cuentan.filter((item) => !item.porMail).length;
  const faltan = result.faltan ?? [];
  return (
    <div className="space-y-1 rounded-2xl bg-[var(--surface-2)] p-3 text-sm">
      <p className="font-semibold">Mercado Pago dio {total} {total === 1 ? "movimiento" : "movimientos"} de los últimos {result.dias ?? 35} días.</p>
      <p className="text-[var(--muted)]">
        {result.tambienPorMail ?? 0} también entraron por mail o aviso · {soloApi} solo por la API · {result.descartados ?? 0} no cuentan (plata tuya o pagos no aprobados)
      </p>
      {soloApi > 0 && <p className="text-[var(--muted)]">Los que vinieron solo por la API quedan para que los confirmes en Inicio: así nada se cuenta dos veces durante la prueba.</p>}
      {faltan.length > 0 && <p className="font-medium text-[var(--expense)]">{faltan.length} {faltan.length === 1 ? "movimiento de Mercado Pago entró" : "movimientos de Mercado Pago entraron"} por mail o aviso pero la API no {faltan.length === 1 ? "lo dio" : "los dio"}.</p>}
      {result.reporte && REPORTE[result.reporte] && <p className="text-[var(--muted)]">{REPORTE[result.reporte]}</p>}
    </div>
  );
}

export default function MercadoPagoCard({ userId }: { userId: string }) {
  const mp = useMercadoPago(userId);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Mensaje al volver de Mercado Pago (…/conectar?mp=ok).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("mp");
    if (!status) return;
    setNotice(RETURN_MESSAGES[status] ?? RETURN_MESSAGES.error);
    params.delete("mp");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? "?" + rest : ""));
  }, []);

  if (!mp.loaded || !mp.available) return null;
  const link = mp.link;
  const result = link?.last_result ?? null;
  const detalle = result?.detalle ?? [];
  const visibles = showAll ? detalle : detalle.slice(0, 12);

  const refresh = async () => {
    const data = await mp.refresh();
    if (data) setNotice({ text: data.nuevos ? "Actualizado: " + data.nuevos + (data.nuevos === 1 ? " movimiento nuevo." : " movimientos nuevos.") : "Actualizado: no había movimientos nuevos.", ok: true });
  };

  return (
    <Card className="space-y-4">
      <ErrorBox message={mp.error} />
      {notice && <p role="status" className={"rounded-2xl px-4 py-3 text-sm font-medium " + (notice.ok ? "bg-[var(--surface-2)] text-[var(--income)]" : "bg-[var(--expense-soft)] text-[var(--expense)]")}>{notice.text}</p>}

      <div className="flex items-center gap-3">
        <ProviderIcon name="Mercado Pago" color={COLOR} provider="mercadopago" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold">Mercado Pago directo <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--primary-text)]">Prueba</span></p>
          <p className="truncate text-sm text-[var(--muted)]">{link ? <><Check size={14} className="mr-1 inline text-[var(--income)]" />Conectado{link.nickname || link.email ? " · " + (link.nickname ?? link.email) : ""}</> : "Tus movimientos directo de Mercado Pago, sin esperar el mail."}</p>
        </div>
      </div>

      {!link ? (
        <>
          <button type="button" disabled={mp.busy} onClick={mp.connect} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-semibold text-white disabled:opacity-60" style={{ background: COLOR }}>
            {mp.busy ? "Abriendo Mercado Pago…" : "Conectar Mercado Pago"}
          </button>
          <p className="text-xs text-[var(--muted)]">Se abre la pantalla de Mercado Pago: entrás con tu cuenta y tocás <strong>Autorizar</strong>. Tu clave nunca pasa por la app. Después te mostramos qué movimientos coinciden con los que ya entran por mail.</p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--surface-2)] px-3 py-2 text-sm">
            <span className="text-[var(--muted)]">{link.last_sync_at ? "Última lectura: " + shortDate(link.last_sync_at) : "Todavía no se leyó"}</span>
            <button type="button" disabled={mp.busy} onClick={refresh} className="inline-flex items-center gap-1.5 font-semibold text-[var(--primary-text)] disabled:opacity-60"><RefreshCw size={15} className={mp.busy ? "animate-spin" : ""} />{mp.busy ? "Leyendo…" : "Actualizar ahora"}</button>
          </div>

          {result?.error === "permiso" && <p className="text-sm text-[var(--expense)]">Mercado Pago ya no nos deja leer tu cuenta. Desconectala y volvé a conectarla.</p>}
          {result && !result.error && <Summary result={result} />}

          {detalle.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Lo que dio Mercado Pago</p>
              <div className="divide-y divide-[var(--border)]">
                {visibles.map((item, index) => (
                  <div key={item.fecha + index} className="flex items-start gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.descripcion}</p>
                      <p className="text-xs text-[var(--muted)]">{shortDate(item.fecha)}{item.via === "reporte" ? " · del reporte" : ""}{item.nota ? " · " + item.nota : ""}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={"text-sm font-semibold " + (item.tipo === "ingreso" ? "text-[var(--income)]" : item.tipo === "gasto" ? "" : "text-[var(--muted)] line-through")}>{item.tipo === "ingreso" ? "+" : item.tipo === "gasto" ? "−" : ""}{money(item.monto)}</span>
                      <Badge item={item} />
                    </div>
                  </div>
                ))}
              </div>
              {detalle.length > 12 && <button type="button" onClick={() => setShowAll(!showAll)} className="mt-1 text-sm font-semibold text-[var(--primary-text)]">{showAll ? "Ver menos" : "Ver los " + detalle.length}</button>}
            </div>
          )}

          {(result?.faltan?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Entraron por mail o aviso pero no por la API</p>
              <div className="divide-y divide-[var(--border)]">
                {result!.faltan!.map((item, index) => (
                  <div key={item.fecha + index} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.descripcion}</p>
                      <p className="text-xs text-[var(--muted)]">{shortDate(item.fecha)}</p>
                    </div>
                    <span className={"shrink-0 text-sm font-semibold " + (item.tipo === "ingreso" ? "text-[var(--income)]" : "")}>{item.tipo === "ingreso" ? "+" : "−"}{money(item.monto)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result?.fuentes && <p className="text-[11px] text-[var(--muted)]">Para Tomás: {Object.entries(result.fuentes).map(([key, value]) => key + ": " + value).join(" · ")}</p>}
        </>
      )}

      <p className="flex gap-2 text-xs text-[var(--muted)]"><ShieldCheck size={16} className="shrink-0 text-[var(--income)]" />Solo leemos tus movimientos: la app no hace pagos ni transferencias. Si un movimiento ya entró por mail, se une y no se duplica.</p>
      {link && <button type="button" onClick={() => { if (window.confirm("¿Desconectar Mercado Pago? Los movimientos que ya se cargaron quedan.")) mp.disconnect(); }} className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--expense)]">Desconectar Mercado Pago</button>}
    </Card>
  );
}
