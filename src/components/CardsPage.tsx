import { useEffect, useState } from "react";
import { Check, CreditCard as CardIcon, Mail, Plus, Trash2 } from "lucide-react";
import { useAuth } from "./AuthGate";
import { Card, ErrorBox, MonthPicker, Sheet, Tabs, sheetField as field, sheetLabel as label } from "./ui";
import { COLORS } from "../lib/categories";
import { currentMonthISO, money, monthLabel, parseAmount, shiftMonth, usd } from "../lib/format";
import { cardMonthSummary, cardsMonthTotal, installmentNumber, itemsForMonth, lastMonth, useCards, type CardItem, type CardItemKind, type CreditCard } from "../lib/cards";

function NewCardSheet({ onSave, onClose }: { onSave: (input: { name: string; color: string; dueDay: number | null }) => Promise<boolean>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[6]);
  const [dueDay, setDueDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!name.trim()) { setError("Poné un nombre, por ejemplo Ualá."); return; }
    setBusy(true);
    const ok = await onSave({ name: name.trim(), color, dueDay: dueDay ? Math.min(31, Math.max(1, Number(dueDay))) : null });
    setBusy(false);
    if (ok) onClose(); else setError("No se pudo crear la tarjeta.");
  };
  return (
    <Sheet title="Nueva tarjeta" onClose={onClose}>
      <label className="block"><span className={label}>Nombre</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej.: Ualá, Visa Galicia" className={field} /></label>
      <label className="mt-4 block"><span className={label}>Día de vencimiento <span className="normal-case tracking-normal">(opcional)</span></span><input value={dueDay} onChange={(event) => setDueDay(event.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="Ej.: 8" className={field} /></label>
      <p className={label + " mt-4"}>Color</p>
      <div className="flex flex-wrap gap-2">{COLORS.map((value) => <button key={value} type="button" onClick={() => setColor(value)} aria-label={"Color " + value} className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ backgroundColor: value }}>{color === value && <Check size={16} />}</button>)}</div>
      {error && <p role="alert" className="mt-4 text-sm text-[var(--expense)]">{error}</p>}
      <button type="button" disabled={busy} onClick={save} className="mt-5 w-full rounded-2xl bg-[var(--accent)] py-3.5 text-base font-bold text-[var(--accent-text)] disabled:opacity-60">{busy ? "Guardando…" : "Crear tarjeta"}</button>
    </Sheet>
  );
}

type ItemDraft = { item?: CardItem; card: CreditCard };

function ItemSheet({ draft, month, onSave, onRemove, onClose }: { draft: ItemDraft; month: string; onSave: (input: Omit<CardItem, "id"> & { id?: string }) => Promise<boolean>; onRemove: (item: CardItem) => Promise<boolean>; onClose: () => void }) {
  const editing = draft.item;
  const [kind, setKind] = useState<CardItemKind>(editing?.kind ?? "cuotas");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.amount).replace(".", ",") : "");
  const [current, setCurrent] = useState(editing?.kind === "cuotas" ? String(Math.max(1, installmentNumber({ ...editing, kind: "fijo", endMonth: null }, month) ?? 1)) : "1");
  const [total, setTotal] = useState(editing?.installments ? String(editing.installments) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const value = parseAmount(amount);
  const n = Number(current) || 0;
  const N = Number(total) || 0;
  const valid = kind === "fijo" || (n >= 1 && N >= 1 && n <= N);
  const firstMonth = kind === "cuotas" ? shiftMonth(month, -(n - 1)) : editing?.kind === "fijo" ? editing.firstMonth : month;
  const end = kind === "cuotas" && valid ? shiftMonth(firstMonth, N - 1) : null;

  const save = async () => {
    if (!description.trim()) { setError("Escribí qué es, por ejemplo Ventilador."); return; }
    if (!(value > 0)) { setError("Escribí el monto que pagás por mes."); return; }
    if (!valid) { setError("Revisá las cuotas: la cuota de este mes no puede ser mayor al total."); return; }
    setBusy(true);
    const ok = await onSave({ id: editing?.id, cardId: draft.card.id, description: description.trim(), kind, amount: value, installments: kind === "cuotas" ? N : null, firstMonth, endMonth: kind === "fijo" ? editing?.endMonth ?? null : null });
    setBusy(false);
    if (ok) onClose(); else setError("No se pudo guardar.");
  };

  const stopFixed = async () => {
    if (!editing) return;
    setBusy(true);
    const ok = await onSave({ ...editing, endMonth: shiftMonth(month, -1) });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Sheet title={(editing ? "Editar en " : "Agregar a ") + draft.card.name} onClose={onClose}>
      <Tabs value={kind} onChange={setKind} options={[{ value: "cuotas", label: "En cuotas" }, { value: "fijo", label: "Fijo mensual" }]} />
      <label className="mt-5 block"><span className={label}>Qué es</span><input autoFocus={!editing} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={kind === "cuotas" ? "Ej.: Ventilador" : "Ej.: Spotify, seguro"} className={field} /></label>
      <label className="mt-4 block"><span className={label}>{kind === "cuotas" ? "Monto de cada cuota" : "Monto por mes"}</span><input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="$ 0" className={field + " tabular-nums"} /></label>
      {kind === "cuotas" && (
        <div className="mt-4">
          <span className={label}>Cuota que pagás en {monthLabel(month).toLowerCase()}</span>
          <div className="flex items-center gap-3">
            <input value={current} onChange={(event) => setCurrent(event.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" aria-label="Cuota actual" className={field + " text-center tabular-nums"} />
            <span className="text-[var(--muted)]">de</span>
            <input value={total} onChange={(event) => setTotal(event.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="12" aria-label="Total de cuotas" className={field + " text-center tabular-nums"} />
          </div>
          {valid && value > 0 && end && (
            <p className="mt-3 rounded-2xl bg-[var(--surface-2)] px-4 py-3 text-sm">
              Se cancela en <strong>{monthLabel(end).toLowerCase()}</strong>. Total de la compra {money(value * N)} · te quedan {money(value * (N - n + 1))} contando esta cuota.
            </p>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-4 text-sm text-[var(--expense)]">{error}</p>}
      <button type="button" disabled={busy} onClick={save} className="mt-5 w-full rounded-2xl bg-[var(--accent)] py-3.5 text-base font-bold text-[var(--accent-text)] disabled:opacity-60">{busy ? "Guardando…" : "Guardar"}</button>
      {editing && (
        <div className="mt-3 flex gap-2">
          {editing.kind === "fijo" && <button type="button" disabled={busy} onClick={stopFixed} className="h-11 flex-1 rounded-2xl border border-[var(--border)] text-sm font-semibold">Dar de baja desde {monthLabel(month).toLowerCase()}</button>}
          <button type="button" disabled={busy} onClick={async () => { if (window.confirm("¿Eliminar " + editing.description + "? Se borra de todos los meses.")) { if (await onRemove(editing)) onClose(); } }} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] text-sm font-semibold text-[var(--expense)]"><Trash2 size={16} />Eliminar</button>
        </div>
      )}
    </Sheet>
  );
}

export default function CardsPage() {
  const { user } = useAuth();
  const { cards, items, statements, error, addCard, removeCard, saveItem, removeItem, toggleStatementPaid } = useCards(user.id);
  const [month, setMonth] = useState(currentMonthISO());
  const [newCard, setNewCard] = useState(false);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const total = cardsMonthTotal(cards, items, statements, month);

  useEffect(() => { setDraft(null); }, [month]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ErrorBox message={error} />
      <MonthPicker month={month} onChange={setMonth} />
      <section className="rounded-[28px] bg-[var(--hero)] p-5 text-[var(--hero-text)]">
        <p className="text-sm opacity-80">A pagar con tarjetas en {monthLabel(month).toLowerCase()}</p>
        <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{money(total)}</p>
        <p className="mt-3 text-xs opacity-75">Cada mes muestra lo que pagás ese mes: el resumen que vence en ese mes. Se resta del disponible en Inicio.</p>
      </section>

      {cards.length === 0 ? (
        <Card className="py-10 text-center">
          <CardIcon className="mx-auto text-[var(--muted)]" size={32} />
          <p className="mt-3 text-base font-semibold">Todavía no cargaste tarjetas</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Agregá tu tarjeta y después las compras en cuotas o los cargos fijos.</p>
        </Card>
      ) : cards.map((card) => {
        const summary = cardMonthSummary(items, statements, card.id, month);
        const monthItems = itemsForMonth(items, card.id, month).sort((a, b) => b.amount - a.amount);
        const diff = summary.statement ? summary.statement.total - summary.loaded : 0;
        return (
          <Card key={card.id} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: card.color }}><CardIcon size={21} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold">{card.name}</p>
                <p className="text-xs text-[var(--muted)]">{card.dueDay ? "Vence el día " + card.dueDay : "Tarjeta de crédito"}</p>
              </div>
              <p className="text-xl font-bold tabular-nums">{money(summary.total)}</p>
            </div>

            {summary.statement && (
              <div className="rounded-2xl bg-[var(--surface-2)] p-3 text-sm">
                <div className="flex items-start gap-2">
                  <Mail size={16} className="mt-0.5 shrink-0 text-[var(--primary-text)]" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Resumen {summary.statement.source === "gmail" ? "que llegó por mail" : "del mes"}: {money(summary.statement.total)}{summary.statement.totalUsd > 0 && " + " + usd(summary.statement.totalUsd)}</p>
                    {summary.statement.dueDate && <p className="text-[var(--muted)]">Vence el {new Date(summary.statement.dueDate + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" })}</p>}
                    {Math.abs(diff) >= 1 && <p className="mt-1 text-[var(--muted)]">Cargado en la app: {money(summary.loaded)} · {diff > 0 ? "hay " + money(diff) + " de compras que no están cargadas acá" : "cargaste " + money(-diff) + " de más (¿alguna cuota ya terminó?)"}</p>}
                  </div>
                </div>
                <label className="mt-2 flex cursor-pointer items-center gap-2 font-medium">
                  <input type="checkbox" checked={summary.statement.paid} onChange={() => toggleStatementPaid(summary.statement!)} className="h-5 w-5 accent-[var(--primary)]" />
                  Resumen pagado
                </label>
              </div>
            )}

            {monthItems.length === 0 ? (
              <p className="px-1 text-sm text-[var(--muted)]">No hay cuotas ni cargos fijos para este mes.</p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {monthItems.map((item) => {
                  const n = installmentNumber(item, month) ?? 1;
                  const last = lastMonth(item);
                  return (
                    <button key={item.id} type="button" onClick={() => setDraft({ card, item })} className="flex w-full items-center gap-3 py-3 text-left">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{item.description}</p>
                        {item.kind === "cuotas" ? (
                          <>
                            <p className="text-xs text-[var(--muted)]">Cuota {n} de {item.installments} · {n === item.installments ? "última cuota" : "se cancela en " + (last ? monthLabel(last).toLowerCase() : "")}</p>
                            <div className="mt-1.5 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-[var(--surface-2)]"><span className="block h-full rounded-full" style={{ width: (n / (item.installments ?? 1)) * 100 + "%", backgroundColor: card.color }} /></div>
                          </>
                        ) : <p className="text-xs text-[var(--muted)]">Todos los meses</p>}
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">{money(item.amount)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => setDraft({ card })} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--primary-soft)] font-semibold text-[var(--primary-text)]"><Plus size={18} />Agregar cuota o fijo</button>
              <button type="button" onClick={() => { if (window.confirm("¿Eliminar la tarjeta " + card.name + " con todas sus cuotas y resúmenes?")) removeCard(card); }} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--expense)]" aria-label={"Eliminar " + card.name}><Trash2 size={18} /></button>
            </div>
          </Card>
        );
      })}

      <button type="button" onClick={() => setNewCard(true)} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] font-semibold text-[var(--muted)] hover:text-[var(--text)]"><Plus size={18} />Agregar tarjeta</button>

      {newCard && <NewCardSheet onSave={addCard} onClose={() => setNewCard(false)} />}
      {draft && <ItemSheet key={(draft.item?.id ?? "new") + month} draft={draft} month={month} onSave={saveItem} onRemove={removeItem} onClose={() => setDraft(null)} />}
    </div>
  );
}
