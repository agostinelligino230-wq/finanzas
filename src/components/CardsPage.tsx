import { useEffect, useState } from "react";
import { Check, CreditCard as CardIcon, Mail, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "./AuthGate";
import { Card, ErrorBox, MonthPicker } from "./ui";
import { CardItemSheet, NewCardSheet, PaySheet, ProviderIcon, type ItemDraft } from "./sheets";
import { currentMonthISO, money, monthLabel, usd } from "../lib/format";
import { cardMonthSummary, cardsMonthTotal, installmentNumber, itemsForMonth, lastMonth, useCards, type CreditCard } from "../lib/cards";

export default function CardsPage() {
  const { user } = useAuth();
  const { cards, items, statements, payments, error, addCard, removeCard, saveItem, removeItem, payCard, unpayCard } = useCards(user.id);
  const [month, setMonth] = useState(currentMonthISO());
  const [newCard, setNewCard] = useState(false);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [paying, setPaying] = useState<CreditCard | null>(null);
  const total = cardsMonthTotal(cards, items, statements, month, payments);

  useEffect(() => { setDraft(null); setPaying(null); }, [month]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ErrorBox message={error} />
      <MonthPicker month={month} onChange={setMonth} />
      <section className="rounded-[28px] bg-[var(--hero)] p-5 text-[var(--hero-text)]">
        <p className="text-sm opacity-80">A pagar con tarjetas en {monthLabel(month).toLowerCase()}</p>
        <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{money(total)}</p>
        <p className="mt-3 text-xs opacity-75">Cada mes muestra lo que pagás ese mes (el resumen que vence en ese mes). También aparece en <Link to="/gastos-fijos" className="underline">Fijos y tarjetas</Link> y en lo que falta pagar de Inicio.</p>
      </section>

      {cards.length === 0 && (
        <Card className="py-10 text-center">
          <CardIcon className="mx-auto text-[var(--muted)]" size={32} />
          <p className="mt-3 text-base font-semibold">Todavía no cargaste tarjetas</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Agregá tu tarjeta (Ualá, Naranja X, Santander…) y después las compras en cuotas o los débitos fijos.</p>
        </Card>
      )}

      {cards.map((card) => {
        const summary = cardMonthSummary(items, statements, card.id, month, payments);
        const monthItems = itemsForMonth(items, card.id, month).sort((a, b) => b.amount - a.amount);
        const diff = summary.statement ? summary.statement.total - summary.loaded : 0;
        // Lo que todavía falta pagar de compras en cuotas (después de este mes).
        const remaining = items.filter((item) => item.cardId === card.id && item.kind === "cuotas").reduce((sum, item) => {
          const n = installmentNumber(item, month);
          const left = n === null ? (item.firstMonth > month ? item.installments ?? 0 : 0) : (item.installments ?? 1) - n;
          return sum + item.amount * left;
        }, 0);
        return (
          <Card key={card.id} className="space-y-3">
            <div className="flex items-center gap-3">
              <ProviderIcon name={card.name} color={card.color} provider={card.provider} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold">{card.name}</p>
                <p className="text-xs text-[var(--muted)]">{card.dueDay ? "Vence el día " + card.dueDay : "Tarjeta de crédito"}</p>
              </div>
              <p className="text-xl font-bold tabular-nums">{money(summary.total)}</p>
            </div>

            {summary.statement && (
              <div className="flex items-start gap-2 rounded-2xl bg-[var(--surface-2)] p-3 text-sm">
                <Mail size={16} className="mt-0.5 shrink-0 text-[var(--primary-text)]" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Resumen {summary.statement.source === "pdf" ? "leído del PDF" : summary.statement.source === "gmail" ? "que llegó por mail" : "del mes"}: {money(summary.statement.total)}{summary.statement.totalUsd > 0 && " + " + usd(summary.statement.totalUsd)}</p>
                  {(summary.statement.dueDate || summary.statement.minPayment) && <p className="text-[var(--muted)]">{[summary.statement.dueDate && "Vence el " + new Date(summary.statement.dueDate + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" }), summary.statement.minPayment && "pago mínimo " + money(summary.statement.minPayment)].filter(Boolean).join(" · ")}</p>}
                  {summary.statement.source !== "pdf" && Math.abs(diff) >= 1 && <p className="mt-1 text-[var(--muted)]">Cargado en la app: {money(summary.loaded)} · {diff > 0 ? "hay " + money(diff) + " de compras que no están cargadas acá" : "cargaste " + money(-diff) + " de más (¿alguna cuota ya terminó?)"}</p>}
                  {summary.statement.lines.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer font-semibold text-[var(--primary-text)]">Ver los {summary.statement.lines.filter((line) => line.kind !== "pago").length} gastos del resumen</summary>
                      <div className="mt-2 divide-y divide-[var(--border)]">
                        {summary.statement.lines.map((line, index) => (
                          <div key={index} className="flex items-center gap-2 py-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate">{line.description}</p>
                              <p className="text-xs text-[var(--muted)]">{[line.date && new Date(line.date + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" }), line.cuota && "cuota " + line.cuota.n + " de " + line.cuota.m, line.kind === "cargo" && "impuesto o cargo", line.kind === "pago" && "pago"].filter(Boolean).join(" · ")}</p>
                            </div>
                            <span className={"shrink-0 tabular-nums " + (line.kind === "pago" ? "text-[var(--income)]" : "")}>{line.kind === "pago" ? "−" : ""}{line.currency === "USD" ? usd(line.amount) : money(line.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            )}

            {monthItems.length === 0 ? (
              <p className="px-1 text-sm text-[var(--muted)]">No hay cuotas ni débitos fijos para este mes.</p>
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

            {remaining > 0 && <p className="px-1 text-sm text-[var(--muted)]">Después de este mes te quedan <strong className="text-[var(--text)]">{money(remaining)}</strong> en cuotas por pagar.</p>}

            {summary.payment ? (
              <button type="button" onClick={() => { if (window.confirm("¿Desmarcar el pago de " + card.name + "? También se quita de tus gastos del mes.")) unpayCard(card, month); }} className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--surface-2)] font-semibold text-[var(--income)]"><Check size={18} />Pagaste {money(summary.payment.amount)}</button>
            ) : summary.total > 0 && (
              <button type="button" onClick={() => setPaying(card)} className="h-11 w-full rounded-2xl bg-[var(--primary)] font-semibold text-white">Marcar el resumen como pagado</button>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => setDraft({ card })} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--primary-soft)] font-semibold text-[var(--primary-text)]"><Plus size={18} />Agregar cuota o débito</button>
              <button type="button" onClick={() => { if (window.confirm("¿Eliminar la tarjeta " + card.name + " con todas sus cuotas y resúmenes?")) removeCard(card); }} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--expense)]" aria-label={"Eliminar " + card.name}><Trash2 size={18} /></button>
            </div>
          </Card>
        );
      })}

      <button type="button" onClick={() => setNewCard(true)} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] font-semibold text-[var(--muted)] hover:text-[var(--text)]"><Plus size={18} />Agregar tarjeta</button>

      {newCard && <NewCardSheet onSave={addCard} onClose={() => setNewCard(false)} />}
      {draft && <CardItemSheet key={(draft.item?.id ?? "new") + month} draft={draft} cards={cards} month={month} onSave={saveItem} onRemove={removeItem} onNewCard={() => { setDraft(null); setNewCard(true); }} onClose={() => setDraft(null)} />}
      {paying && <PaySheet title={paying.name} detail={"Resumen de " + monthLabel(month).toLowerCase()} month={month} suggested={cardMonthSummary(items, statements, paying.id, month, payments).total} onConfirm={(amount, add) => payCard(paying, month, amount, add)} onClose={() => setPaying(null)} />}
    </div>
  );
}
