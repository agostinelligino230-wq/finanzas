import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import ExpensesPage from "./components/ExpensesPage";
import SavingsPage from "./components/SavingsPage";
import SuggestionsPage from "./components/SuggestionsPage";
import FixedExpensesPage from "./components/FixedExpensesPage";

export default function App() {
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