/**
 * Hash de senha com PBKDF2-SHA256 nativo (WebCrypto).
 *
 * Por que não o scrypt padrão do Better Auth: ele roda em JavaScript puro e estoura o limite de
 * 10 ms de CPU do plano grátis do Workers. O PBKDF2 do WebCrypto é nativo. 100 mil iterações é o
 * máximo que o Workers aceita. O formato guarda o custo para podermos subir no futuro.
 *
 * Formato: pbkdf2_sha256$<iteracoes>$<salt base64>$<hash base64>
 */
/** Custo atual para senhas novas. Pode baixar ou subir sem invalidar hashes antigos. */
const ITERATIONS = 100_000;
/** Máximo aceito pelo PBKDF2 do Workers. */
const MAX_ITERATIONS = 100_000;
const KEY_BITS = 256;
const PREFIX = "pbkdf2_sha256";

const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  const [prefix, iter, salt, expected] = hash.split("$");
  if (prefix !== PREFIX || !iter || !salt || !expected) return false;
  const iterations = Number(iter);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) return false;
  const actual = await derive(password, fromB64(salt), iterations);
  return timingSafeEqual(actual, fromB64(expected));
}
