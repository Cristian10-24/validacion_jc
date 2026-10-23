// Reglas de correo: se usan en el navegador, en la API y en los scripts.

/** Dominios personales conocidos: nunca se sugiere corregirlos. */
const DOMINIOS_COMUNES = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "live.com",
  "hotmail.es",
  "outlook.es",
  "yahoo.es",
];
const DOMINIOS_VALIDOS = new Set([
  ...DOMINIOS_COMUNES,
  "mail.com",
  "msn.com",
  "aol.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com.co",
  "hotmail.com.co",
  "outlook.com.co",
]);

/** Errores frecuentes con su corrección. */
const TIPEOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmail.es": "gmail.com",
  "gmail.com.co": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmil.com": "hotmail.com",
  "homail.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "outloo.com": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "icloud.co": "icloud.com",
  "iclod.com": "icloud.com",
};

/** Dominios educativos o institucionales concretos (además de las reglas .edu / .gov). */
const DOMINIOS_BLOQUEADOS = ["misena.edu.co", "soy.sena.edu.co", "sena.edu.co"];

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

export function normalizeEmail(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
}

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_RE.test(email) && !email.includes("..");
}

export function isEducationalDomain(domain: string): boolean {
  if (DOMINIOS_BLOQUEADOS.some((d) => domain === d || domain.endsWith("." + d))) return true;
  // .edu, .edu.co, colegio.edu.co, ... y también .gov / .gov.co / .mil.co
  return /(^|\.)(edu|gov|gob|mil)(\.[a-z]{2})?$/.test(domain);
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Devuelve el dominio sugerido o null si el dominio parece correcto. */
export function suggestDomain(domain: string): string | null {
  if (DOMINIOS_VALIDOS.has(domain)) return null;
  if (TIPEOS[domain]) return TIPEOS[domain];
  let best: string | null = null;
  let bestDist = Infinity;
  for (const d of DOMINIOS_COMUNES) {
    const dist = levenshtein(domain, d);
    if (dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  const max = domain.length >= 8 ? 2 : 1;
  return bestDist <= max ? best : null;
}

export type EmailCheck = {
  email: string; // normalizado
  valid: boolean;
  educational: boolean;
  suggestion: string | null; // correo completo sugerido
};

export function checkEmail(value: string): EmailCheck {
  const email = normalizeEmail(value);
  const valid = isValidEmailFormat(email);
  if (!valid) return { email, valid, educational: false, suggestion: null };
  const domain = domainOf(email);
  const fixed = suggestDomain(domain);
  return {
    email,
    valid,
    educational: isEducationalDomain(domain),
    suggestion: fixed ? email.slice(0, email.lastIndexOf("@") + 1) + fixed : null,
  };
}

/** Mensaje de error que impide guardar, o null si el correo es aceptable. */
export function emailError(check: EmailCheck): string | null {
  if (!check.email) return "Escribe tu correo electrónico.";
  if (!check.valid) return "El correo no tiene un formato válido (ejemplo: nombre@gmail.com).";
  if (check.educational)
    return "Ese correo es de un colegio o institución. Usa un correo personal que seguirás usando (por ejemplo Gmail u Outlook).";
  return null;
}
