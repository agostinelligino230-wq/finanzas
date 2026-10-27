import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileSpreadsheet, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthGate";
import { Card, ErrorBox, sheetField, sheetLabel } from "./ui";
import { dayLabel, money, usd } from "../lib/format";
import { useGmail } from "../lib/gmail";
import { importar, leerArchivo } from "../lib/importar";
import { useMovements } from "../lib/movements";
import { AUTO_PROVIDERS, PROVIDERS } from "../lib/providers";
import { NOMBRES_COLUMNAS, detectarColumnas, estadoDe, leerFilas, type Celda, type Columna, type Columnas, type Estado } from "../../shared/importar";

// Las cuentas que se leen solas primero (son las que más se usan), después el resto.
const CUENTAS = [...AUTO_PROVIDERS, ...PROVIDERS.filter((provider) => !provider.auto)];
const ESTADOS: Record<Estado, { label: string; className: string }> = {
  nuevo: { label: "Nuevo", className: "bg-[var(--primary-soft)] text-[var(--primary-text)]" },
  cargado: { label: "Ya está", className: "bg-[var(--surface-2)] text-[var(--muted)]" },
  propia: { label: "Entre tus cuentas", className: "bg-[var(--expense-soft)] text-[var(--expense)]" },
};

// Subís el archivo de movimientos que bajás de tu banco o billetera (Excel o CSV) y elegís qué entra.
// Lo que ya está cargado y lo que parece un pase entre tus cuentas queda sin tildar.
export default function ImportPage() {
  const { user } = useAuth();
  const data = useMovements(user.id);
  const gmail = useGmail(user.id);
  const [proveedor, setProveedor] = useState("");
  const [archivo, setArchivo] = useState("");
  const [filas, setFilas] = useState<Celda[][] | null>(null);
  const [header, setHeader] = useState(0);
  const [columnas, setColumnas] = useState<Columnas>({});
  const [reconocido, setReconocido] = useState(true);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState("");

  const nombre = gmail.link?.name ?? (user.user_metadata?.full_name as string | undefined) ?? null;
  const existentes = useMemo(() => [...data.movements, ...data.toReview], [data.movements, data.toReview]);
  const items = useMemo(() => (filas ? leerFilas(filas, header, columnas) : []), [filas, header, columnas]);
  const estados = useMemo(() => new Map(items.map((item) => [item.clave, estadoDe(item, proveedor, existentes, nombre)])), [items, proveedor, existentes, nombre]);
  // Cada vez que cambia lo leído, quedan tildados solo los nuevos.
  useEffect(() => { setElegidos(new Set(items.filter((item) => estados.get(item.clave) === "nuevo").map((item) => item.clave))); }, [items, estados]);

  const titulos = filas?.[header]?.map((celda, index) => ({ index, text: String(celda ?? "").trim() || "Columna " + (index + 1) })) ?? [];
  const elegidosItems = items.filter((item) => elegidos.has(item.clave));
  const pesos = (tipo: "gasto" | "ingreso") => elegidosItems.filter((item) => item.tipo === tipo && item.moneda === "ARS").reduce((sum, item) => sum + item.monto, 0);
  const cuenta = CUENTAS.find((provider) => provider.id === proveedor);

  const abrir = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setListo("");
    setLeyendo(true);
    try {
      const leidas = await leerArchivo(file);
      const detectado = detectarColumnas(leidas);
      setArchivo(file.name);
      setFilas(leidas);
      setHeader(detectado?.header ?? Math.max(0, leidas.findIndex((fila) => fila.some((celda) => String(celda ?? "").trim()))));
      setColumnas(detectado?.columnas ?? {});
      setReconocido(Boolean(detectado));
    } catch {
      setFilas(null);
      setError("No pudimos leer ese archivo. Probá con el Excel o el CSV que descargás de tu banco.");
    }
    setLeyendo(false);
  };

  const toggle = (clave: string) => setElegidos((current) => {
    const next = new Set(current);
    if (next.has(clave)) next.delete(clave); else next.add(clave);
    return next;
  });

  const guardar = async () => {
    if (!proveedor || !elegidosItems.length) return;
    setGuardando(true);
    setError("");
    const result = await importar(user.id, proveedor, elegidosItems);
    setGuardando(false);
    if (result.error) setError(result.error);
    if (result.importados || !result.error) {
      setListo("Listo: entraron " + result.importados + (result.importados === 1 ? " movimiento" : " movimientos") + " de " + (cuenta?.name ?? "tu cuenta") + (result.importados < elegidosItems.length ? " (los demás ya estaban importados)." : "."));
      setFilas(null);
      setArchivo("");
      data.reload();
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/movimientos" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary-text)]"><ArrowLeft size={16} />Movimientos</Link>
      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary-text)]"><FileSpreadsheet size={20} /></div>
          <div>
            <h1 className="text-lg font-bold">Importar movimientos</h1>
            <p className="text-sm text-[var(--muted)]">Subí el archivo de movimientos que descargás de tu banco o billetera (Excel o CSV). Se lee en tu compu y antes de cargar nada te mostramos qué entra. Si subís el mismo archivo dos veces, no se duplica.</p>
          </div>
        </div>
        <ErrorBox message={error} />
        {listo && <p role="status" className="rounded-2xl bg-[var(--surface-2)] px-4 py-3 text-sm font-medium text-[var(--income)]">{listo}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={sheetLabel}>¿De qué cuenta es?</span>
            <select value={proveedor} onChange={(event) => setProveedor(event.target.value)} className={sheetField}>
              <option value="">Elegí el banco o la billetera</option>
              {CUENTAS.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={sheetLabel}>Archivo</span>
            <span className={sheetField + " flex cursor-pointer items-center gap-2 " + (!proveedor ? "opacity-60" : "")}>
              <Upload size={18} className="shrink-0 text-[var(--muted)]" />
              <span className="truncate">{leyendo ? "Leyendo…" : archivo || "Elegir Excel o CSV"}</span>
              <input type="file" accept=".xlsx,.xls,.csv,.txt" disabled={!proveedor || leyendo} className="sr-only" onChange={(event) => { abrir(event.target.files?.[0]); event.target.value = ""; }} />
            </span>
          </label>
        </div>
      </Card>

      {filas && (
        <Card className="space-y-3">
          <details open={!reconocido || !items.length}>
            <summary className="cursor-pointer text-sm font-semibold">{reconocido && items.length ? "Columnas que encontramos (cambialas si alguna está mal)" : "No reconocimos las columnas: elegí cuál es cada una"}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={sheetLabel}>Fila con los títulos</span>
                <input type="number" min={1} max={filas.length} value={header + 1} onChange={(event) => setHeader(Math.min(filas.length - 1, Math.max(0, Number(event.target.value) - 1)))} className={sheetField} />
              </label>
              {(Object.keys(NOMBRES_COLUMNAS) as Columna[]).map((columna) => (
                <label key={columna} className="block">
                  <span className={sheetLabel}>{NOMBRES_COLUMNAS[columna]}</span>
                  <select value={columnas[columna] ?? ""} onChange={(event) => setColumnas((current) => ({ ...current, [columna]: event.target.value === "" ? undefined : Number(event.target.value) }))} className={sheetField}>
                    <option value="">No tiene</option>
                    {titulos.map((titulo) => <option key={titulo.index} value={titulo.index}>{titulo.text}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </details>

          {items.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No encontramos movimientos con fecha y monto. Revisá las columnas de arriba.</p>
          ) : (
            <>
              <p className="text-sm text-[var(--muted)]">
                {items.length} movimientos en el archivo · {[...estados.values()].filter((estado) => estado === "cargado").length} ya estaban en la app · {[...estados.values()].filter((estado) => estado === "propia").length} parecen pases entre tus cuentas (no suman ni como ingreso ni como gasto: tildalos si no lo son).
              </p>
              <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-[var(--surface-2)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                    <tr><th className="w-10 p-2" /><th className="p-2">Fecha</th><th className="p-2">Detalle</th><th className="p-2 text-right">Monto</th><th className="p-2">Estado</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {items.map((item) => {
                      const estado = estados.get(item.clave) ?? "nuevo";
                      return (
                        <tr key={item.clave} className={elegidos.has(item.clave) ? "" : "opacity-60"}>
                          <td className="p-2"><input type="checkbox" checked={elegidos.has(item.clave)} onChange={() => toggle(item.clave)} aria-label={"Importar " + item.descripcion} className="h-4 w-4 accent-[var(--primary)]" /></td>
                          <td className="whitespace-nowrap p-2">{dayLabel(item.dia)}{item.hora && <span className="text-[var(--muted)]"> · {item.hora}</span>}</td>
                          <td className="max-w-[260px] truncate p-2" title={item.descripcion}>{item.descripcion}</td>
                          <td className="whitespace-nowrap p-2 text-right font-semibold tabular-nums" style={{ color: item.tipo === "ingreso" ? "var(--income)" : undefined }}>{item.tipo === "ingreso" ? "+" : "−"}{item.moneda === "USD" ? usd(item.monto) : money(item.monto)}</td>
                          <td className="p-2"><span className={"whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold " + ESTADOS[estado].className}>{ESTADOS[estado].label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm tabular-nums"><span className="text-[var(--income)]">+{money(pesos("ingreso"))}</span> · <span className="text-[var(--expense)]">−{money(pesos("gasto"))}</span>{elegidosItems.some((item) => item.moneda === "USD") && <span className="text-[var(--muted)]"> (más lo que está en dólares, con la cotización de cada día)</span>}</span>
                <button type="button" disabled={guardando || !elegidosItems.length} onClick={guardar} className="h-12 rounded-2xl bg-[var(--primary)] px-5 font-semibold text-white disabled:opacity-60">
                  {guardando ? "Importando…" : "Importar " + elegidosItems.length + (elegidosItems.length === 1 ? " movimiento" : " movimientos")}
                </button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
