// Metas de ahorro y guía de presupuesto: datos y reglas que comparten la web y la app del celular.
export type GoalPeriod = "mensual" | "semestral" | "anual";
export type GoalIcon = "phone" | "laptop" | "trip" | "piggy";
export type Goal = { id: string; name: string; target: number; saved: number; period: GoalPeriod; icon: GoalIcon };
export type GoalRow = { id: string; name: string; target: number | string; saved: number | string; period: GoalPeriod; icon: string };

export const GOAL_PERIODS: GoalPeriod[] = ["mensual", "semestral", "anual"];
export const goalFromRow = (row: GoalRow): Goal => ({ id: row.id, name: row.name, target: Number(row.target), saved: Number(row.saved), period: row.period, icon: (["phone", "laptop", "trip", "piggy"].includes(row.icon) ? row.icon : "piggy") as GoalIcon });
export const normalizeDigits = (value: string) => value.replace(/^0+(?=\d)/, "");

// El ícono se elige solo según el nombre de la meta.
export const detectGoalIcon = (name: string): GoalIcon => {
  const value = name.toLowerCase();
  if (/(iphone|celular|teléfono|telefono|móvil|movil|smartphone)/.test(value)) return "phone";
  if (/(notebook|laptop|computadora|pc|ordenador)/.test(value)) return "laptop";
  if (/(viaje|vacaciones|avión|avion|vuelo|turismo)/.test(value)) return "trip";
  return "piggy";
};

export type BudgetKey = "hogar" | "comida" | "impuestos" | "deudas" | "transporte" | "personal" | "ahorro";
export const BUDGET_GUIDE: { key: BudgetKey; label: string; percentage: number; color: string; note: string }[] = [
  { key: "hogar", label: "Hogar", percentage: 30, color: "#66864f", note: "Alquiler, expensas, servicios y mantenimiento." },
  { key: "comida", label: "Comida", percentage: 15, color: "#b4863f", note: "Compras del hogar y comidas cotidianas." },
  { key: "deudas", label: "Deudas", percentage: 15, color: "#b46b78", note: "Intentá que las cuotas no comprometan todo tu ingreso." },
  { key: "impuestos", label: "Impuestos", percentage: 10, color: "#8b6d55", note: "Separá una parte para obligaciones previsibles." },
  { key: "transporte", label: "Transporte", percentage: 10, color: "#4f7d98", note: "Movilidad, combustible y mantenimiento." },
  { key: "personal", label: "Personal y salidas", percentage: 10, color: "#7a6190", note: "Gastos personales, deporte y entretenimiento." },
  { key: "ahorro", label: "Ahorro", percentage: 10, color: "#4d8565", note: "Fondo de emergencia y objetivos." },
];
export const BUDGET_COUNTRIES = ["Argentina", "Brasil", "Chile", "Uruguay", "Otro país"];
