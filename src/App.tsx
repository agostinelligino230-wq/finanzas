import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import Layout from "./components/Layout";
import AuthPage from "./components/AuthPage";
import ExpensesPage from "./components/ExpensesPage";
import SavingsPage from "./components/SavingsPage";
import SuggestionsPage from "./components/SuggestionsPage";
import FixedExpensesPage from "./components/FixedExpensesPage";
import { supabase } from "./lib/supabase";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f3f0eb] text-base text-[#776f68] dark:bg-[#1d1b1a] dark:text-[#c7beb7]">Cargando tu sesión…</main>;
  }

  if (!session) return <AuthPage />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ExpensesPage />} />
          <Route path="gastos-fijos" element={<FixedExpensesPage />} />
          <Route path="ahorro" element={<SavingsPage />} />
          <Route path="sugerencias" element={<SuggestionsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
