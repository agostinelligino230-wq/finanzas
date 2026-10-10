import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X, CircleDollarSign, Receipt, PiggyBank, Lightbulb, Sun, Moon, CalendarClock } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const cn = (...inputs: (string | undefined | false | null)[]) => twMerge(clsx(inputs));
const items = [
  { to: "/", label: "Movimientos", icon: Receipt },
  { to: "/gastos-fijos", label: "Gastos fijos", icon: CalendarClock },
  { to: "/ahorro", label: "Ahorro", icon: PiggyBank },
  { to: "/sugerencias", label: "Sugerencias", icon: Lightbulb },
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("finanzas-theme") === "dark";
  });
  const location = useLocation();
  const active = items.find((item) => item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to));

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("finanzas-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <div className="min-h-screen bg-[#f3f0eb] text-[#3f3b39] transition-colors dark:bg-[#1d1b1a] dark:text-[#eee9e3]">
      {open && <button aria-label="Cerrar navegación" className="fixed inset-0 z-40 bg-[#3f3b39]/20 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cn("fixed inset-y-0 left-0 z-50 w-72 border-r border-[#ded8d0] bg-[#f8f6f2] p-5 transition-transform dark:border-[#3a3532] dark:bg-[#252220] lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#d8cceb] text-[#51465d]"><CircleDollarSign size={21} /></span><div><p className="font-semibold">Finanzas</p><p className="text-sm text-[#8b837c] dark:text-[#b5aca5]">tu mes, más claro</p></div></div>
          <button className="rounded-xl p-2 text-[#8b837c] lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X size={20} /></button>
        </div>
        <nav className="mt-10 space-y-2" aria-label="Secciones"><p className="px-3 text-xs font-semibold uppercase tracking-[.16em] text-[#a39a91]">Tu espacio</p>{items.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === "/"} onClick={() => setOpen(false)} className={({ isActive }) => cn("flex min-h-11 items-center gap-3 rounded-2xl px-3 text-base transition", isActive ? "bg-[#e4dced] font-semibold text-[#51465d] dark:bg-[#41374a] dark:text-[#eee3f4]" : "text-[#776f68] hover:bg-[#eee9e3] dark:text-[#c7beb7] dark:hover:bg-[#322e2b]")}><Icon size={19} />{label}</NavLink>)}</nav>
        <div className="absolute bottom-5 left-5 right-5 rounded-2xl bg-[#eee9e3] p-4 text-sm leading-6 text-[#776f68] dark:bg-[#322e2b] dark:text-[#c7beb7]">Tus datos quedan asociados a tu cuenta y se sincronizan de forma segura.</div>
      </aside>
      <div className="min-h-screen lg:pl-72"><header className="sticky top-0 z-30 flex h-16 items-center border-b border-[#ded8d0]/80 bg-[#f3f0eb]/90 px-4 backdrop-blur dark:border-[#3a3532]/80 dark:bg-[#1d1b1a]/90 lg:px-8"><button className="mr-3 rounded-xl p-2 text-[#655d56] dark:text-[#d2c8c0] lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir navegación"><Menu size={21} /></button><div className="flex min-w-0 flex-1 items-center gap-2"><span className="text-[#8d7ca1]">{active?.icon && (() => { const Icon = active.icon; return <Icon size={18} />; })()}</span><h1 className="truncate text-lg font-semibold">{active?.label}</h1></div><button type="button" onClick={() => setDark((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-xl text-[#655d56] hover:bg-[#eee9e3] dark:text-[#d2c8c0] dark:hover:bg-[#322e2b]" aria-label={dark ? "Activar tema claro" : "Activar tema oscuro"} title={dark ? "Tema claro" : "Tema oscuro"}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button><button type="button" disabled={loggingOut} onClick={async () => { if (!supabase) return; setLoggingOut(true); await supabase.auth.signOut(); setLoggingOut(false); }} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[#776f68] hover:bg-[#eee9e3] disabled:opacity-60 dark:text-[#c7beb7] dark:hover:bg-[#322e2b]">{loggingOut ? "Saliendo…" : "Cerrar sesión"}</button></header><main className="p-4 sm:p-6 lg:p-10"><Outlet /></main></div>
    </div>
  );
}
