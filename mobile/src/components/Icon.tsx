import {
  ArrowDownLeft, ArrowUpRight, Baby, Banknote, BatteryCharging, Beer, Bell, BellRing, Bike, BookOpen, Briefcase, Building2, Bus, CalendarClock, Car, ChartColumn, Check,
  ChevronDown, ChevronLeft, ChevronRight, Cigarette, CircleHelp, Coffee, Coins, CreditCard, Dog, Droplets, Dumbbell, Ellipsis, Eye, EyeOff, Film, Flame, Fuel, Gamepad2,
  Gift, GraduationCap, Hammer, HandCoins, HeartPulse, House, Landmark, Laptop, Lightbulb, ListOrdered, LogOut, Mail, Music, Package, Palette, Percent, PiggyBank, Pill,
  Pizza, Plane, Plus, Receipt, RefreshCw, Scissors, Search, Settings, ShieldAlert, ShieldCheck, Shirt, ShoppingBag, ShoppingCart, Smartphone, Sofa, Sparkles, Stethoscope,
  Store, Tag, Ticket, Train, Trash2, Trees, TrendingUp, Tv, Utensils, Wallet, Wifi, Wrench, X, Zap, type LucideIcon,
} from "lucide-react-native";

// Todos los íconos pasan por acá: los nombres de las categorías son los de la web (lucide), guardados en la base.
const ICONS: Record<string, LucideIcon> = {
  ArrowDownLeft, ArrowUpRight, Baby, Banknote, BatteryCharging, Beer, Bell, BellRing, Bike, BookOpen, Briefcase, Building2, Bus, CalendarClock, Car, ChartColumn, Check,
  ChevronDown, ChevronLeft, ChevronRight, Cigarette, Coffee, Coins, CreditCard, Dog, Droplets, Dumbbell, Ellipsis, Eye, EyeOff, Film, Flame, Fuel, Gamepad2,
  Gift, GraduationCap, Hammer, HandCoins, HeartPulse, House, Landmark, Laptop, Lightbulb, ListOrdered, LogOut, Mail, Music, Package, Palette, Percent, PiggyBank, Pill,
  Pizza, Plane, Plus, Receipt, RefreshCw, Scissors, Search, Settings, ShieldAlert, ShieldCheck, Shirt, ShoppingBag, ShoppingCart, Smartphone, Sofa, Sparkles, Stethoscope,
  Store, Tag, Ticket, Train, Trash2, Trees, TrendingUp, Tv, Utensils, Wallet, Wifi, Wrench, X, Zap,
  // Nombres viejos de lucide que usa la web (0.344).
  Home: House, HelpCircle: CircleHelp, BarChart3: ChartColumn,
};

export type IconName = keyof typeof ICONS | string;

export function Icon({ name, size = 20, color, strokeWidth = 2 }: { name: IconName; size?: number; color: string; strokeWidth?: number }) {
  const Component = ICONS[name] ?? Tag;
  return <Component size={size} color={color} strokeWidth={strokeWidth} />;
}
