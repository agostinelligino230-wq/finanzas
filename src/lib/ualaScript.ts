// Programa que se pega en Google Apps Script (script.google.com) con la cuenta de Gmail donde llegan los mails de Ualá.
// Lee solo los mails de Ualá y manda a la app las transferencias y el total del resumen de la tarjeta.
// El cuerpo del programa está en /public/importador-uala.txt; acá se le agregan los datos de cada usuario.

export async function buildUalaScript(input: { url: string; key: string; token: string; ownName: string }) {
  const response = await fetch("/importador-uala.txt", { cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo cargar el programa");
  const body = await response.text();
  const exclude = input.ownName.trim() ? [input.ownName.trim().toLowerCase()] : [];
  const header = [
    "// Finanzas Personales · importador de Ualá",
    "// Lee SOLO los mails de Ualá de esta cuenta y los carga en la app.",
    "// No tiene acceso a tu cuenta de Ualá ni a tu tarjeta.",
    "",
    "const APP_URL = " + JSON.stringify(input.url) + ";",
    "const APP_KEY = " + JSON.stringify(input.key) + "; // clave pública de la app",
    "const MI_CODIGO = " + JSON.stringify(input.token) + "; // tu código personal (no lo compartas)",
    "const NO_CONTAR = " + JSON.stringify(exclude) + "; // transferencias a vos mismo",
    "",
    "",
  ].join("\n");
  return header + body;
}
