import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, CalendarClock, CreditCard, Home, Landmark, Lightbulb, ListOrdered, LogOut, Menu, Moon, PiggyBank, Smartphone, Sun, X } from "lucide-react";
import { useAuth } from "./AuthGate";
import { prefetchAll } from "../lib/cache";

const items = [
  { to: "/", label: "Inicio", short: "Inicio", icon: Home },
  { to: "/movimientos", label: "Movimientos", short: "Movim.", icon: ListOrdered },
  { to: "/graficos", label: "Gráficos", short: "Gráficos", icon: BarChart3 },
  { to: "/gastos-fijos", label: "Fijos y tarjetas", short: "Fijos", icon: CalendarClock },
  { to: "/tarjetas", label: "Tarjetas", short: "Tarjetas", icon: CreditCard },
  { to: "/ahorro", label: "Ahorro", short: "Ahorro", icon: PiggyBank },
  { to: "/sugerencias", label: "Sugerencias", short: "Ideas", icon: Lightbulb },
  { to: "/conectar", label: "Conectar cuentas", short: "Cuentas", icon: Landmark },
];
const bottomItems = items.filter((item) => ["/", "/movimientos", "/gastos-fijos", "/tarjetas", "/graficos"].includes(item.to));
// Aviso para pasar a la app: aparece solo cuando hay enlace de la tienda (en el celular, solo el de su sistema).
const stores = [
  { label: "Android", url: import.meta.env.VITE_APP_ANDROID_URL as string | undefined, device: /android/i },
  { label: "iPhone", url: import.meta.env.VITE_APP_IOS_URL as string | undefined, device: /iphone|ipad|ipod/i },
];
const phone = stores.find((store) => store.device.test(navigator.userAgent));
const appLinks = stores.filter((store) => store.url && (!phone || store === phone));

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const [dark, setDark] = useState(() => {
    try {
      const stored = localStorage.getItem("finanzas-theme");
      return stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch { return false; }
  });
  const [appNotice, setAppNotice] = useState(() => {
    try { return localStorage.getItem("finanzas-aviso-app") !== "cerrado"; } catch { return true; }
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
            <img src="/icon.svg" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
            <div><p className="font-bold">Finanzas Personales</p><p className="text-sm text-[var(--muted)]">tu mes, más claro</p></div>
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
          <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{active?.label ?? "Finanzas Personales"}</h1>
          <button type="button" onClick={() => setDark((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface)]" aria-label={dark ? "Activar tema claro" : "Activar tema oscuro"} title={dark ? "Tema claro" : "Tema oscuro"}>{dark ? <Sun size={20} /> : <Moon size={20} />}</button>
        </header>
        <main className="px-4 pb-6 sm:px-6 lg:px-8">
          {appNotice && appLinks.length > 0 && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl bg-[var(--primary-soft)] p-4 text-sm">
              <Smartphone size={20} className="shrink-0 text-[var(--primary-text)]" />
              <p className="min-w-0 flex-1">
                <span className="font-semibold">Bajá la app.</span> Los movimientos llegan al instante, sin abrir la web.{" "}
                {appLinks.map((link, index) => <span key={link.label}>{index > 0 && " · "}<a href={link.url} target="_blank" rel="noreferrer" className="font-semibold text-[var(--primary-text)] underline">{link.label}</a></span>)}
              </p>
              <button type="button" onClick={() => { setAppNotice(false); try { localStorage.setItem("finanzas-aviso-app", "cerrado"); } catch { /* sin almacenamiento */ } }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface)]" aria-label="Cerrar aviso"><X size={18} /></button>
            </div>
          )}
          <Outlet />
        </main>
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
