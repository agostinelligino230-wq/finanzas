import { Check } from "lucide-react";
import { COLORS, ICON_GROUPS, ICONS } from "../lib/categories";

// Elegir ícono y color: lo usan categorías, gastos fijos y destinatarios. Los datos viven en shared/categorias.ts;
// el celular tiene su propia versión porque los componentes de la web y de React Native no se comparten.
export default function IconColorPicker({ icon, color, onIcon, onColor }: { icon: string; color: string; onIcon: (icon: string) => void; onColor: (color: string) => void }) {
  return (
    <>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Color</p>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((value) => <button key={value} type="button" onClick={() => onColor(value)} aria-label={"Color " + value} className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ backgroundColor: value }}>{color === value && <Check size={16} />}</button>)}
        </div>
      </div>
      <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
        {ICON_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{group.label}</p>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {group.icons.map((name) => { const Icon = ICONS[name]; const active = icon === name; return <button key={name} type="button" onClick={() => onIcon(name)} aria-label={name} className="flex aspect-square items-center justify-center rounded-full border" style={active ? { backgroundColor: color, borderColor: color, color: "#fff" } : { borderColor: "var(--border)" }}><Icon size={18} /></button>; })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
