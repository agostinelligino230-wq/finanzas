import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, CalendarClock, Home, Lightbulb, ListOrdered, LogOut, Menu, Moon, PiggyBank, Sun, Wallet, X } from "lucide-react";
import { useAuth } from "./AuthGate";
import { prefetchAll } from "../lib/cache";

const items = [
  { to: "/", label: "Inicio", short: "Inicio", icon: Home },
  { to: "/movimientos", label: "Movimientos", short: "Movim.", icon: ListOrdered },
  { to: "/graficos", label: "Gráficos", short: "Gráficos", icon: BarChart3 },
  { to: "/gastos-fijos", label: "Gastos fijos", short: "Fijos", icon: CalendarClock },
  { to: "/ahorro", label: "Ahorro", short: "Ahorro", icon: PiggyBank },
  { to: "/sugerencias", label: "Sugerencias", short: "Ideas", icon: Lightbulb },
];
const bottomItems = items.slice(0, 5);

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const [dark, setDark] = useState(() => {
    try {
      const stored = localStorage.getItem("finanzas-theme");
      return stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch { return false; }
  });
  const location = useLocation();
  const active = items.find((item) => (item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to)));

  useEffect(() => { prefetchAll(user.id); }, [user.id]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try { localStorage.setItem("finanzas-theme", dark ? "dark" : "light"); } catch { /* sin almacenamiento */ }
  }, [dark]);
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const linkClass = ({ isActive }: { isActive: boolean }) => "flex min-h-11 items-center gap-3 rounded-2xl px-3 text-base transition " + (isActive ? "bg-[var(--primary-soft)] font-semibold text-[var(--primary-text)]" : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]");

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {open && <button aria-label="Cerrar menú" className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={"fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-[var(--surface)] p-5 transition-transform lg:translate-x-0 " + (open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--hero)] text-white"><Wallet size={20} /></span>
            <div><p className="font-bold">Finanzas</p><p className="text-sm text-[var(--muted)]">tu mes, más claro</p></div>
          </div>
          <button className="rounded-xl p-2 text-[var(--muted)] lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X size={20} /></button>
        </div>
        <nav className="mt-8 space-y-1" aria-label="Secciones">
          {items.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === "/"} className={linkClass}><Icon size={19} />{label}</NavLink>)}
        </nav>
        <div className="mt-auto rounded-2xl bg-[var(--surface-2)] p-4 text-sm">
          <p className="truncate text-[var(--muted)]" title={user.email ?? ""}>{user.email}</p>
          <button type="button" onClick={signOut} className="mt-2 inline-flex items-center gap-2 font-semibold text-[var(--primary-text)]"><LogOut size={16} />Cerrar sesión</button>
        </div>
      </aside>

      <div className="min-h-screen pb-24 lg:pb-0 lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 bg-[var(--bg)]/90 px-4 backdrop-blur lg:px-8">
          <button className="rounded-xl p-2 text-[var(--muted)] lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu size={22} /></button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{active?.label ?? "Finanzas"}</h1>
          <button type="button" onClick={() => setDark((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface)]" aria-label={dark ? "Activar tema claro" : "Activar tema oscuro"} title={dark ? "Tema claro" : "Tema oscuro"}>{dark ? <Sun size={20} /> : <Moon size={20} />}</button>
        </header>
        <main className="px-4 pb-6 sm:px-6 lg:px-8"><Outlet /></main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Navegación principal">
        {bottomItems.map(({ to, short, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium " + (isActive ? "text-[var(--primary-text)]" : "text-[var(--muted)]")}>
            {({ isActive }) => <><span className={"flex h-7 w-12 items-center justify-center rounded-full " + (isActive ? "bg-[var(--primary-soft)]" : "")}><Icon size={20} /></span>{short}</>}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
