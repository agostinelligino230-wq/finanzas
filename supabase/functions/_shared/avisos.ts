// Aviso propio de la app (D2): cuando un movimiento nuevo entra por mail, le llega al celular
// («Gastaste $ 12.400 · Farmacity»), aunque el banco no avise por notificación (iPhone).
// Interruptor: AVISOS_APP=off. Opcional: EXPO_ACCESS_TOKEN si el proyecto de Expo exige token para mandar.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const ON = (Deno.env.get("AVISOS_APP") ?? "on") !== "off";
const EXPO_TOKEN = Deno.env.get("EXPO_ACCESS_TOKEN") ?? "";
const EXPO_URL = "https://exp.host/--/api/v2/push/send";
// Al conectar Gmail se leen 60 días: solo se avisa lo que llegó hace poco.
const RECIENTE_MS = 2 * 60 * 60 * 1000;

export type MovimientoAvisado = { type: string; amount: number; description: string; trust: string };

const pesos = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);

export function textoDelAviso(mov: MovimientoAvisado, entidad: string) {
  const monto = pesos(mov.amount);
  if (mov.trust === "doubtful") return { title: "Para revisar: " + monto + " de " + entidad, body: "Llegó un aviso sin verificar. Tocá para confirmarlo o corregirlo." };
  return { title: (mov.type === "ingreso" ? "Entró " : "Gastaste ") + monto, body: mov.description.slice(0, 100) || entidad };
}

export async function avisarApp(admin: SupabaseClient, userId: string, mov: MovimientoAvisado, entidad: string, recibido: Date) {
  if (Date.now() - recibido.getTime() > RECIENTE_MS) return;
  await enviarPush(admin, userId, textoDelAviso(mov, entidad), "/");
}

// Manda un aviso a todos los celulares de la persona. Nunca frena lo que venía haciendo quien lo llama.
export async function enviarPush(admin: SupabaseClient, userId: string, { title, body }: { title: string; body: string }, url: string) {
  if (!ON) return;
  try {
    const { data: tokens } = await admin.from("push_tokens").select("token").eq("user_id", userId);
    if (!tokens?.length) return;
    const response = await fetch(EXPO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(EXPO_TOKEN ? { Authorization: "Bearer " + EXPO_TOKEN } : {}) },
      body: JSON.stringify(tokens.map(({ token }) => ({ to: token, title, body, sound: "default", channelId: "movimientos", data: { url } }))),
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json().catch(() => null) as { data?: { status?: string; details?: { error?: string } }[] } | null;
    // Celulares que desinstalaron la app: el token ya no sirve y se borra.
    const dead = (result?.data ?? []).flatMap((ticket, index) => (ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered" ? [tokens[index].token] : []));
    if (dead.length) await admin.from("push_tokens").delete().in("token", dead);
  } catch (error) {
    console.error("enviarPush", error instanceof Error ? error.message : error);
  }
}
