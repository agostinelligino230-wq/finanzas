// Un aviso es lo que llega de una entidad (un mail o una notificación del celular) y un lector lo convierte en movimiento.
export type Canal = "mail" | "push";

export type Aviso = {
  canal: Canal;
  clave: string;        // mail: id de Gmail; push: "dispositivo|clave de Android|hora de publicación"
  remitente: string;    // mail: encabezado From; push: nombre del paquete de Android
  titulo: string;       // asunto o título de la notificación
  texto: string;        // cuerpo del mail o texto de la notificación
  recibido: Date;
  proveedor?: string;   // push: la entidad del paquete (ya se sabe antes de leer)
  autenticacion?: string[]; // mail: encabezados Authentication-Results, en orden
  dispositivo?: string; // push: id del celular
};

export type Movimiento = { tipo: "gasto" | "ingreso"; monto: number; moneda: "ARS" | "USD"; descripcion: string; categoria: string; opRef?: string; idExterno?: string };
export type Resumen = { provider: string; card: string; color: string; month: string; due_date: string; total: number; total_usd: number };

export type Lectura =
  | Movimiento
  | { descartar: string } // promo, recordatorio, transferencia a uno mismo…
  | { resumen: Resumen }  // resumen de tarjeta (no es un movimiento)
  | null;                 // no reconocido

export type Contexto = { nombre: string | null };
export type Lector = { proveedor: string; canal: Canal; reconoce(aviso: Aviso): boolean; leer(aviso: Aviso, ctx: Contexto): Lectura };

export const esMovimiento = (lectura: Lectura): lectura is Movimiento => Boolean(lectura && "tipo" in lectura);
