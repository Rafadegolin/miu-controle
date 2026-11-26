// Baixa as logos de bancos e as bandeiras de cartão, sanitiza e gera o catálogo.
// Rodar à mão quando quiser atualizar: `node apps/web/scripts/sync-bank-logos.mjs`.
// Sem dependências. Saídas (versionadas):
//   apps/web/public/bancos/<slug>.svg, apps/web/public/bandeiras/<marca>.svg
//   packages/shared/src/institutions.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const BANKS_DIR = join(ROOT, "apps/web/public/bancos");
const BRANDS_DIR = join(ROOT, "apps/web/public/bandeiras");
const OUT_TS = join(ROOT, "packages/shared/src/institutions.ts");

// Logos do diretório do Open Finance Brasil, via github.com/rzmt/logos-bancos-br (commit fixo).
const LOGOS_COMMIT = "3fe9758efda502a3f1d8318e6bbef0f339ff4ded";
const LOGOS_BASE = `https://raw.githubusercontent.com/rzmt/logos-bancos-br/${LOGOS_COMMIT}`;
// Simple Icons (CC0), versão fixa.
const SIMPLE_ICONS = "https://cdn.jsdelivr.net/npm/simple-icons@13.21.0/icons";

/** slug, ISPB, nome exibido, cor da marca (opcional: senão, a predominante do SVG). */
const BANKS = [
  ["nubank", "18236120", "Nubank", "#820ad1"],
  ["itau", "60701190", "Itaú", "#ec7000"],
  ["bradesco", "60746948", "Bradesco", "#cc092f"],
  ["santander", "90400888", "Santander", "#ec0000"],
  ["bb", "00000000", "Banco do Brasil", "#0038a8"],
  ["caixa", "00360305", "Caixa", "#005ca9"],
  ["inter", "00416968", "Inter", "#ff7a00"],
  ["c6", "31872495", "C6 Bank", "#242424"],
  ["btg", "30306294", "BTG Pactual", "#0b2c5f"],
  ["xp", "33264668", "XP", "#1f1f1f"],
  ["picpay", "22896431", "PicPay", "#11a85c"],
  ["mercadopago", "10573521", "Mercado Pago", "#009ee3"],
  ["pagbank", "08561701", "PagBank", "#1a9c46"],
  ["neon", "20855875", "Neon", "#0090f0"],
  ["original", "92894922", "Banco Original", "#00a868"],
  ["sicredi", "01181521", "Sicredi", "#3fa110"],
  ["sicoob", "02038232", "Sicoob", "#00a091"],
  ["banrisul", "92702067", "Banrisul", "#004b8d"],
  ["brb", "00000208", "BRB", "#0057a6"],
  ["banestes", "28127603", "Banestes", "#004b93"],
  ["nordeste", "07237373", "Banco do Nordeste", "#a6192e"],
  ["unicred", "00315557", "Unicred", null],
  ["cresol", "10398952", "Cresol", null],
  ["safra", "58160789", "Safra", "#0d2240"],
  ["stone", "16501555", "Stone", "#00a868"],
  ["pan", "59285411", "Banco Pan", "#0072ce"],
  ["bv", "01858774", "BV", "#1d3b8f"],
  ["digio", "27098060", "Digio", "#0a1e46"],
  ["agibank", "10664513", "Agibank", null],
  ["bmg", "61186680", "BMG", "#e85d0c"],
  ["daycoval", "62232889", "Daycoval", null],
  ["sofisa", "60889128", "Sofisa", null],
  ["cora", "37880206", "Cora", "#fe3e6d"],
  ["infinitepay", "18189547", "InfinitePay", null],
  ["asaas", "19540550", "Asaas", null],
];

/** Bandeiras: as do Simple Icons ganham a cor oficial; Mastercard é desenhada (dois círculos). */
const BRANDS = [
  ["visa", "Visa", "visa", "#1a1f71"],
  ["mastercard", "Mastercard", null, null],
  ["elo", "Elo", null, null],
  ["amex", "American Express", "americanexpress", "#2e77bc"],
  ["hipercard", "Hipercard", null, null],
  ["diners", "Diners Club", "dinersclub", "#004a97"],
];

const MAX_BYTES = 40_000;

/** Remove o que um SVG de terceiro não deveria ter. Também exibimos via <img>, onde nada executa. */
function sanitize(svg) {
  const s = svg
    .replace(/<\?xml[^>]*>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/\s(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "")
    .trim();
  if (!/^<svg[\s>]/.test(s)) throw new Error("não começa com <svg>");
  if (/<script|javascript:|<foreignObject|<image/i.test(s)) throw new Error("conteúdo proibido");
  if (Buffer.byteLength(s) > MAX_BYTES) throw new Error(`grande demais (${Buffer.byteLength(s)} B)`);
  return `${s}\n`;
}

const lum = (hex) => {
  const c = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

/** Cor predominante do SVG, descartando quase-branco (precisa servir de fundo com texto branco). */
function dominantColor(svg) {
  const counts = new Map();
  for (const m of svg.matchAll(/(?:fill|stop-color)\s*[:=]\s*"?\s*(#[0-9a-f]{6}|#[0-9a-f]{3})\b/gi)) {
    let hex = m[1].toLowerCase();
    if (hex.length === 4) hex = `#${[...hex.slice(1)].map((ch) => ch + ch).join("")}`;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  const ok = [...counts].filter(([h]) => lum(h) < 0.45).sort((a, b) => b[1] - a[1]);
  return ok[0]?.[0] ?? "#3a4644";
}

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

mkdirSync(BANKS_DIR, { recursive: true });
mkdirSync(BRANDS_DIR, { recursive: true });

const catalog = [];
let total = 0;
for (const [slug, ispb, name, color] of BANKS) {
  try {
    const svg = sanitize(await get(`${LOGOS_BASE}/logos/svg/${ispb}.svg`));
    writeFileSync(join(BANKS_DIR, `${slug}.svg`), svg);
    total += Buffer.byteLength(svg);
    catalog.push({ slug, name, color: color ?? dominantColor(svg) });
  } catch (e) {
    console.warn(`pulei ${slug}: ${e.message}`);
  }
}

for (const [slug, , icon, color] of BRANDS) {
  if (!icon) continue;
  const raw = await get(`${SIMPLE_ICONS}/${icon}.svg`);
  const svg = sanitize(raw.replace("<svg ", `<svg fill="${color}" `));
  writeFileSync(join(BRANDS_DIR, `${slug}.svg`), svg);
}
writeFileSync(
  join(BRANDS_DIR, "mastercard.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 15"><circle cx="7.5" cy="7.5" r="7.5" fill="#eb001b"/><circle cx="16.5" cy="7.5" r="7.5" fill="#f79e1b"/><path d="M12 1.5a7.5 7.5 0 0 1 0 12 7.5 7.5 0 0 1 0-12z" fill="#ff5f00"/></svg>\n`,
);

writeFileSync(
  join(BANKS_DIR, "LEIAME.md"),
  `# Logos de instituições financeiras

Origem: diretório de participantes do Open Finance Brasil, via
https://github.com/rzmt/logos-bancos-br (commit ${LOGOS_COMMIT}).

As logos são marcas registradas das respectivas instituições e não são cobertas por licença
deste projeto. São usadas apenas para identificar a instituição da conta do próprio usuário
(uso nominativo). Nenhuma afiliação ou endosso é sugerido.

Bandeiras de cartão em ../bandeiras: Simple Icons (CC0); Mastercard desenhada a partir da forma
oficial (dois círculos). Elo e Hipercard aparecem como texto no app.

Para atualizar: \`node apps/web/scripts/sync-bank-logos.mjs\`.
`,
);

const ts = `// Gerado por apps/web/scripts/sync-bank-logos.mjs. Não edite à mão.

/** Instituições com logo em /bancos/<slug>.svg. \`color\` é a cor padrão da conta. */
export const INSTITUTIONS = ${JSON.stringify(catalog, null, 2).replace(/"(slug|name|color)":/g, "$1:")} as const;

export type InstitutionSlug = (typeof INSTITUTIONS)[number]["slug"];
export const INSTITUTION_SLUGS = INSTITUTIONS.map((i) => i.slug) as [InstitutionSlug, ...InstitutionSlug[]];

export const institutionBySlug = (slug: string | null | undefined) =>
  slug ? INSTITUTIONS.find((i) => i.slug === slug) : undefined;

/** Bandeiras de cartão. \`logo\`: há arquivo em /bandeiras/<slug>.svg; senão, mostra o nome. */
export const CARD_BRANDS = ${JSON.stringify(
  BRANDS.map(([slug, name, icon]) => ({ slug, name, logo: Boolean(icon) || slug === "mastercard" })),
  null,
  2,
).replace(/"(slug|name|logo)":/g, "$1:")} as const;

export type CardBrand = (typeof CARD_BRANDS)[number]["slug"];
export const CARD_BRAND_SLUGS = CARD_BRANDS.map((b) => b.slug) as [CardBrand, ...CardBrand[]];
`;
writeFileSync(OUT_TS, ts);
console.log(
  `${catalog.length}/${BANKS.length} logos (${Math.round(total / 1024)} KB), ${BRANDS.length} bandeiras`,
);
