import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthGate";
import { CategoryIcon, Card, ErrorBox, Tabs } from "./ui";
import { findCategory, useCategories } from "../lib/categories";
import { compactMoney, currentMonthISO, monthLabel, money, shiftMonth, shortMonth } from "../lib/format";
import { useMovements } from "../lib/movements";

type Range = "6" | "12";
const SERIES = [
  { key: "income", label: "Ingresos", color: "var(--chart-income)" },
  { key: "expense", label: "Gastos", color: "var(--chart-expense)" },
  { key: "saving", label: "Ahorro", color: "var(--chart-saving)" },
] as const;
type SeriesKey = (typeof SERIES)[number]["key"];

const H = 240;
const PAD = { top: 16, right: 8, bottom: 28, left: 48 };

function barPath(x: number, y: number, width: number, height: number) {
  if (height <= 0) return "";
  const r = Math.min(4, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

export default function ChartsPage() {
  const { user } = useAuth();
  const { movements, error } = useMovements(user.id);
  const { categories } = useCategories(user.id);
  const [range, setRange] = useState<Range>("6");
  const [selected, setSelected] = useState(currentMonthISO());
  const boxRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(360);
  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const months = useMemo(() => {
    const count = Number(range);
    const last = currentMonthISO();
    return Array.from({ length: count }, (_, index) => shiftMonth(last, index - count + 1));
  }, [range]);

  const data = useMemo(() => months.map((month) => {
    const items = movements.filter((item) => item.date.startsWith(month));
    const income = items.filter((item) => item.type === "ingreso").reduce((sum, item) => sum + item.amount, 0);
    const expense = items.filter((item) => item.type === "gasto").reduce((sum, item) => sum + item.amount, 0);
    const saving = items.filter((item) => item.type === "gasto" && item.category === "ahorro").reduce((sum, item) => sum + item.amount, 0);
    return { month, income, expense, saving, result: income - expense };
  }), [months, movements]);

  const max = Math.max(1, ...data.flatMap((row) => [row.income, row.expense, row.saving]));
  const niceMax = (() => { const step = Math.pow(10, Math.floor(Math.log10(max))); return Math.ceil(max / step) * step; })();
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const groupW = plotW / data.length;
  const barW = Math.max(4, Math.min(18, (groupW - 12) / 3 - 2));
  const y = (value: number) => PAD.top + plotH - (value / niceMax) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ratio * niceMax);

  const current = data.find((row) => row.month === selected) ?? data[data.length - 1];
  const breakdown = useMemo(() => {
    const map = new Map<string, number>();
    movements.filter((item) => item.type === "gasto" && item.date.startsWith(current.month)).forEach((item) => map.set(item.category, (map.get(item.category) ?? 0) + item.amount));
    const total = [...map.values()].reduce((sum, value) => sum + value, 0);
    return { total, rows: [...map.entries()].map(([id, value]) => ({ category: findCategory(categories, "gasto", id), value, percent: total > 0 ? (value / total) * 100 : 0 })).sort((a, b) => b.value - a.value) };
  }, [movements, current.month, categories]);

  // Anillo por categoría con 2px de separación entre segmentos
  const donut = (() => {
    const radius = 70; const stroke = 22; const circumference = 2 * Math.PI * radius; let offset = 0;
    return breakdown.rows.map((row) => { const length = (row.value / (breakdown.total || 1)) * circumference; const segment = { color: row.category.color, dash: Math.max(0, length - 2), offset }; offset += length; return segment; }).map((segment, index) => <circle key={index} cx="90" cy="90" r={radius} fill="none" stroke={segment.color} strokeWidth={stroke} strokeDasharray={`${segment.dash} ${circumference}`} strokeDashoffset={-segment.offset} transform="rotate(-90 90 90)" />);
  })();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ErrorBox message={error} />
      <Tabs value={range} onChange={setRange} options={[{ value: "6", label: "Últimos 6 meses" }, { value: "12", label: "Últimos 12 meses" }]} />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Mes a mes</h2>
          <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
            {SERIES.map((serie) => <span key={serie.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: serie.color }} />{serie.label}</span>)}
          </div>
        </div>
        <div ref={boxRef} className="relative mt-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Ingresos, gastos y ahorro por mes">
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeWidth="1" />
                <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{compactMoney(tick)}</text>
              </g>
            ))}
            {data.map((row, index) => {
              const x0 = PAD.left + index * groupW;
              const start = x0 + (groupW - (barW * 3 + 4)) / 2;
              const active = row.month === current.month;
              return (
                <g key={row.month} onMouseEnter={() => setSelected(row.month)} onClick={() => setSelected(row.month)} style={{ cursor: "pointer" }}>
                  {active && <rect x={x0 + 2} y={PAD.top} width={groupW - 4} height={plotH} rx="8" fill="var(--surface-2)" />}
                  {SERIES.map((serie, serieIndex) => { const value = row[serie.key as SeriesKey]; return <path key={serie.key} d={barPath(start + serieIndex * (barW + 2), y(value), barW, PAD.top + plotH - y(value))} fill={serie.color} />; })}
                  <text x={x0 + groupW / 2} y={H - 8} textAnchor="middle" fontSize="12" fontWeight={active ? 700 : 400} fill={active ? "var(--text)" : "var(--muted)"}>{shortMonth(row.month)}</text>
                  <rect x={x0} y={PAD.top} width={groupW} height={plotH + PAD.bottom} fill="transparent" />
                </g>
              );
            })}
          </svg>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-[var(--surface-2)] p-3 text-sm sm:grid-cols-4">
          <p className="col-span-2 font-semibold sm:col-span-4">{monthLabel(current.month)}</p>
          <p><span className="block text-[var(--muted)]">Ingresos</span><strong className="tabular-nums">{money(current.income)}</strong></p>
          <p><span className="block text-[var(--muted)]">Gastos</span><strong className="tabular-nums">{money(current.expense)}</strong></p>
          <p><span className="block text-[var(--muted)]">Ahorro</span><strong className="tabular-nums">{money(current.saving)}</strong></p>
          <p><span className="block text-[var(--muted)]">Te quedó</span><strong className="tabular-nums" style={{ color: current.result < 0 ? "var(--expense)" : "var(--income)" }}>{money(current.result)}</strong></p>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">Tocá un mes en el gráfico para ver el detalle.</p>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">¿En qué se fue la plata en {monthLabel(current.month).toLowerCase()}?</h2>
        {breakdown.rows.length === 0 ? <p className="mt-4 text-sm text-[var(--muted)]">No hay gastos cargados ese mes.</p> : (
          <div className="mt-4 grid items-center gap-5 sm:grid-cols-[180px_1fr]">
            <div className="relative mx-auto h-[180px] w-[180px]">
              <svg viewBox="0 0 180 180" className="h-full w-full" role="img" aria-label="Gastos por categoría">{donut}</svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xs text-[var(--muted)]">Total</span><span className="text-lg font-bold tabular-nums">{compactMoney(breakdown.total)}</span></div>
            </div>
            <div className="space-y-2">
              {breakdown.rows.map((row) => (
                <div key={row.category.id} className="flex items-center gap-3">
                  <CategoryIcon category={row.category} size={32} />
                  <span className="min-w-0 flex-1 truncate font-medium">{row.category.name}</span>
                  <span className="w-11 text-right text-sm text-[var(--muted)] tabular-nums">{Math.round(row.percent)}%</span>
                  <span className="min-w-24 text-right font-semibold tabular-nums">{money(row.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
