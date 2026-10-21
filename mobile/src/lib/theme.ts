import { useColorScheme } from "react-native";

// Los mismos colores que la web (src/styles.css): morado uva y acento amarillo, claro y oscuro.
const light = {
  bg: "#f4f2f7", surface: "#ffffff", surface2: "#eeebf3", border: "#e2dde9", text: "#1e1b24", muted: "#6e6779",
  primary: "#5b3fa0", primaryStrong: "#4a3288", primarySoft: "#ebe4f8", primaryText: "#5b3fa0",
  hero: "#3a2866", heroText: "#ffffff", accent: "#f5b72e", accentText: "#2b1e00",
  income: "#17885b", expense: "#c9344d", expenseSoft: "#fbe8eb",
  chartIncome: "#2f6fd6", chartExpense: "#d9701f", chartSaving: "#7b5bd0",
};

const dark: typeof light = {
  bg: "#111013", surface: "#1b1a1f", surface2: "#25232b", border: "#302c37", text: "#f2eff7", muted: "#a39cb0",
  primary: "#7c5fd6", primaryStrong: "#9a80ec", primarySoft: "#2c2443", primaryText: "#c3b4f6",
  hero: "#2b1f4a", heroText: "#ffffff", accent: "#f5b72e", accentText: "#2b1e00",
  income: "#45c98c", expense: "#ff7086", expenseSoft: "#3a1f26",
  chartIncome: "#4c8df0", chartExpense: "#d9742a", chartSaving: "#9174e0",
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

export const radius = { card: 24, field: 16, pill: 999 };
