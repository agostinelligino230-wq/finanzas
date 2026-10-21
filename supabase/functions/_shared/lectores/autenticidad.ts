// ¿El mail lo mandó de verdad la entidad? Se mira la firma DKIM que verificó Gmail.
// Gmail agrega arriba de todo su propio Authentication-Results (authserv-id mx.google.com):
// quien manda el mail no lo puede falsificar, así que se usa solo el primero que dice mx.google.com.
export function dkimDomains(results: string[]) {
  const own = results.find((value) => /^\s*mx\.google\.com\s*;/i.test(value));
  if (!own) return [];
  const domains: string[] = [];
  for (const part of own.split(";").slice(1)) {
    if (!/^\s*dkim\s*=\s*pass\b/i.test(part)) continue;
    const match = part.match(/header\.[di]\s*=\s*(?:[^\s@;]*@)?([a-z0-9.-]+)/i);
    if (match) domains.push(match[1].toLowerCase().replace(/\.$/, ""));
  }
  return domains;
}

// Devuelve el dominio que firmó si es uno oficial (o un subdominio), si no null.
export function officialSignature(results: string[] | undefined, official: string[]) {
  for (const domain of dkimDomains(results ?? [])) {
    if (official.some((item) => domain === item || domain.endsWith("." + item))) return domain;
  }
  return null;
}
