// Programa que se pega en Google Apps Script (script.google.com) con la cuenta de Gmail donde llegan los avisos.
// Lee solo los mails de las cuentas elegidas (Ualá, Mercado Pago, Wallbit, Nación, Macro) y los manda a la app.
// El cuerpo del programa está en /public/importador-cuentas.txt; acá se le agregan los datos de cada usuario.

export async function buildAccountsScript(input: { url: string; key: string; token: string; ownName: string; providers: string[] }) {
  const response = await fetch("/importador-cuentas.txt", { cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo cargar el programa");
  const body = await response.text();
  const header = [
    "// Finanzas Personales · importador de cuentas",
    "// Lee SOLO los avisos por mail de las cuentas elegidas y los carga en la app.",
    "// No tiene acceso a tus cuentas ni a tus tarjetas.",
    "",
    "const APP_URL = " + JSON.stringify(input.url) + ";",
    "const APP_KEY = " + JSON.stringify(input.key) + "; // clave pública de la app",
    "const MI_CODIGO = " + JSON.stringify(input.token) + "; // tu código personal (no lo compartas)",
    "const MI_NOMBRE = " + JSON.stringify(input.ownName.trim()) + "; // para no contar transferencias a vos mismo",
    "const LEER = " + JSON.stringify(input.providers) + "; // cuentas que se leen",
    "",
    "",
  ].join("\n");
  return header + body;
}
