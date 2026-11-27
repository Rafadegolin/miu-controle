/*
 * Web Push sem dependência: criptografia do conteúdo (RFC 8291, aes128gcm) e identificação do
 * servidor por VAPID (RFC 8292, JWT ES256), tudo com a WebCrypto nativa do Workers.
 */

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };

export type Vapid = {
  /** Chave pública P-256 sem compressão (65 bytes), em base64url. É a que o navegador recebe. */
  publicKey: string;
  /** Chave privada em JWK (JSON com x, y e d). Fica em secret do Worker. */
  privateKeyJwk: string;
  /** Contato do servidor (URL https ou mailto:). */
  subject: string;
};

export type PushMessage = {
  title: string;
  body: string;
  /** Tela que abre ao tocar na notificação. */
  url?: string;
  /** Notificação com a mesma tag substitui a anterior em vez de empilhar. */
  tag?: string;
};

export type PushResult = {
  ok: boolean;
  status: number;
  /** 404/410: o aparelho cancelou a inscrição. Apagar do banco. */
  gone: boolean;
  /** Resposta do serviço de push quando recusa (ex.: Apple {"reason":"BadJwtToken"}). Sem segredos. */
  reason?: string;
};

export type PushSender = (sub: PushSubscriptionKeys, message: PushMessage) => Promise<PushResult>;

type Bytes = Uint8Array<ArrayBuffer>;

const enc = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(text: string): Bytes {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

/** HKDF (extract + expand) com SHA-256. */
export async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm as Bytes, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as Bytes, info: info as Bytes },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** Informações do RFC 8291 para derivar a chave e o nonce. */
export const keyInfo = (uaPublic: Uint8Array, asPublic: Uint8Array) =>
  concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
export const CEK_INFO = enc.encode("Content-Encoding: aes128gcm\0");
export const NONCE_INFO = enc.encode("Content-Encoding: nonce\0");

/** Criptografa o conteúdo para um aparelho (um registro só, como manda o Web Push). */
export async function encryptPayload(
  sub: { p256dh: string; auth: string },
  plaintext: Uint8Array,
): Promise<Bytes> {
  const uaPublic = b64urlDecode(sub.p256dh);
  const authSecret = b64urlDecode(sub.auth);
  const ua = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer);
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: ua } as never /* os tipos do Workers chamam de $public; o runtime usa public */,
      local.privateKey,
      256,
    ),
  );
  const ikm = await hkdf(authSecret, ecdh, keyInfo(uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, CEK_INFO, 16);
  const nonce = await hkdf(salt, ikm, NONCE_INFO, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // 0x02 = último registro (sem preenchimento extra)
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(plaintext, new Uint8Array([2]))),
  );
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** JWT do VAPID, assinado com ES256, para a origem do serviço de push. */
export async function vapidJwt(vapid: Vapid, audience: string, now = Date.now()): Promise<string> {
  const jwk = JSON.parse(vapid.privateKeyJwk) as JsonWebKey;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(
    enc.encode(
      JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject }),
    ),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`)),
  );
  return `${header}.${claims}.${b64urlEncode(signature)}`;
}

/** Envia uma notificação. Erros de rede viram `ok: false` (quem chama decide se tenta de novo). */
export function webPushSender(
  vapid: Vapid,
  fetcher: (url: string, init: RequestInit) => Promise<Response> = (u, i) => fetch(u, i),
): PushSender {
  return async (sub, message) => {
    try {
      const body = await encryptPayload(sub, enc.encode(JSON.stringify(message)));
      const jwt = await vapidJwt(vapid, new URL(sub.endpoint).origin);
      const headers: Record<string, string> = {
        Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(24 * 3600),
        Urgency: "normal",
      };
      // Sem o cabeçalho Topic: a Apple recusa (400 BadWebPushTopic). Quem evita notificação repetida
      // empilhada é a `tag`, aplicada no aparelho pelo push-sw.js.
      const res = await fetcher(sub.endpoint, { method: "POST", headers, body });
      const gone = res.status === 404 || res.status === 410;
      if (res.ok) return { ok: true, status: res.status, gone };
      const reason = (await res.text().catch(() => "")).slice(0, 300);
      console.error("push_recusado", { host: new URL(sub.endpoint).host, status: res.status, reason });
      return { ok: false, status: res.status, gone, reason };
    } catch (err) {
      console.error("push_falhou", err);
      return { ok: false, status: 0, gone: false };
    }
  };
}

/** Gera um par de chaves VAPID (para o script de configuração e para testes). */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKeyJwk: string }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const raw = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  return {
    publicKey: b64urlEncode(raw),
    privateKeyJwk: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }),
  };
}
