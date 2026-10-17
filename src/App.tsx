import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import AuthGate from "./components/AuthGate";
import ExpensesPage from "./components/ExpensesPage";
import TransactionsPage from "./components/TransactionsPage";
import ChartsPage from "./components/ChartsPage";
import SavingsPage from "./components/SavingsPage";
import SuggestionsPage from "./components/SuggestionsPage";
import FixedExpensesPage from "./components/FixedExpensesPage";
import CardsPage from "./components/CardsPage";
import ConnectPage from "./components/ConnectPage";

export default function App() {
  return (
    <AuthGate>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ExpensesPage />} />
          <Route path="movimientos" element={<TransactionsPage />} />
          <Route path="graficos" element={<ChartsPage />} />
          <Route path="gastos-fijos" element={<FixedExpensesPage />} />
          <Route path="tarjetas" element={<CardsPage />} />
          <Route path="conectar" element={<ConnectPage />} />
          <Route path="conectar-uala" element={<ConnectPage />} />
          <Route path="ahorro" element={<SavingsPage />} />
          <Route path="sugerencias" element={<SuggestionsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </AuthGate>
  );
}
