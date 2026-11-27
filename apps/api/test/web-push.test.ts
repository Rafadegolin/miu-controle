import { describe, expect, it } from "vitest";
import {
  b64urlDecode,
  b64urlEncode,
  CEK_INFO,
  encryptPayload,
  generateVapidKeys,
  hkdf,
  keyInfo,
  NONCE_INFO,
  vapidJwt,
  webPushSender,
} from "../src/lib/web-push";

/** Um "aparelho": chaves ECDH e segredo, como o navegador cria na inscrição. */
async function device() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, p256dh: b64urlEncode(pub), auth: b64urlEncode(auth) };
}

/** Descriptografa como o aparelho faria (RFC 8291), para conferir o que foi enviado. */
async function decrypt(d: Awaited<ReturnType<typeof device>>, body: Uint8Array) {
  const view = new DataView(body.buffer, body.byteOffset);
  const salt = body.slice(0, 16);
  expect(view.getUint32(16)).toBe(4096);
  const idlen = body[20] as number;
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const as = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: as } as never, d.pair.privateKey, 256),
  );
  const uaPublic = b64urlDecode(d.p256dh);
  const ikm = await hkdf(b64urlDecode(d.auth), ecdh, keyInfo(uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, CEK_INFO, 16);
  const nonce = await hkdf(salt, ikm, NONCE_INFO, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, cipher));
  expect(plain.at(-1)).toBe(2); // delimitador do último registro
  return new TextDecoder().decode(plain.slice(0, -1));
}

describe("web push", () => {
  it("o aparelho consegue ler o que foi criptografado", async () => {
    const d = await device();
    const body = await encryptPayload(d, new TextEncoder().encode('{"title":"Oi"}'));
    expect(await decrypt(d, body)).toBe('{"title":"Oi"}');
  });

  it("o JWT do VAPID é ES256 válido, com aud, exp e sub", async () => {
    const keys = await generateVapidKeys();
    const jwt = await vapidJwt(
      { ...keys, subject: "https://miu.exemplo" },
      "https://push.exemplo",
      1_000_000,
    );
    const [h, c, s] = jwt.split(".") as [string, string, string];
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(c)))).toEqual({
      aud: "https://push.exemplo",
      exp: 1000 + 12 * 3600,
      sub: "https://miu.exemplo",
    });
    const pub = await crypto.subtle.importKey(
      "raw",
      b64urlDecode(keys.publicKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pub,
      b64urlDecode(s),
      new TextEncoder().encode(`${h}.${c}`),
    );
    expect(ok).toBe(true);
  });

  it("envia com os cabeçalhos certos e reconhece aparelho que saiu", async () => {
    const keys = await generateVapidKeys();
    const d = await device();
    const calls: { url: string; init: RequestInit }[] = [];
    let status = 201;
    const send = webPushSender({ ...keys, subject: "https://miu.exemplo" }, async (url, init) => {
      calls.push({ url, init });
      return new Response(null, { status });
    });
    const sub = { endpoint: "https://push.exemplo/abc", p256dh: d.p256dh, auth: d.auth };
    const r = await send(sub, { title: "Teste", body: "Funcionou", url: "/inicio", tag: "teste" });
    expect(r).toEqual({ ok: true, status: 201, gone: false });
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(new RegExp(`^vapid t=.+, k=${keys.publicKey}$`));
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.Topic).toBeUndefined(); // a Apple recusa o Topic (BadWebPushTopic)
    const payload = JSON.parse(await decrypt(d, calls[0]?.init.body as Uint8Array));
    expect(payload).toEqual({ title: "Teste", body: "Funcionou", url: "/inicio", tag: "teste" });

    status = 410;
    expect(await send(sub, { title: "x", body: "y" })).toMatchObject({ ok: false, status: 410, gone: true });
  });
});
