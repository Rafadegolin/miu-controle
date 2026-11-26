// Gerado por apps/web/scripts/sync-bank-logos.mjs. Não edite à mão.

/** Instituições com logo em /bancos/<slug>.svg. `color` é a cor padrão da conta. */
export const INSTITUTIONS = [
  {
    slug: "nubank",
    name: "Nubank",
    color: "#820ad1",
  },
  {
    slug: "itau",
    name: "Itaú",
    color: "#ec7000",
  },
  {
    slug: "bradesco",
    name: "Bradesco",
    color: "#cc092f",
  },
  {
    slug: "santander",
    name: "Santander",
    color: "#ec0000",
  },
  {
    slug: "bb",
    name: "Banco do Brasil",
    color: "#0038a8",
  },
  {
    slug: "caixa",
    name: "Caixa",
    color: "#005ca9",
  },
  {
    slug: "inter",
    name: "Inter",
    color: "#ff7a00",
  },
  {
    slug: "c6",
    name: "C6 Bank",
    color: "#242424",
  },
  {
    slug: "btg",
    name: "BTG Pactual",
    color: "#0b2c5f",
  },
  {
    slug: "xp",
    name: "XP",
    color: "#1f1f1f",
  },
  {
    slug: "picpay",
    name: "PicPay",
    color: "#11a85c",
  },
  {
    slug: "mercadopago",
    name: "Mercado Pago",
    color: "#009ee3",
  },
  {
    slug: "pagbank",
    name: "PagBank",
    color: "#1a9c46",
  },
  {
    slug: "neon",
    name: "Neon",
    color: "#0090f0",
  },
  {
    slug: "original",
    name: "Banco Original",
    color: "#00a868",
  },
  {
    slug: "sicredi",
    name: "Sicredi",
    color: "#3fa110",
  },
  {
    slug: "sicoob",
    name: "Sicoob",
    color: "#00a091",
  },
  {
    slug: "banrisul",
    name: "Banrisul",
    color: "#004b8d",
  },
  {
    slug: "brb",
    name: "BRB",
    color: "#0057a6",
  },
  {
    slug: "banestes",
    name: "Banestes",
    color: "#004b93",
  },
  {
    slug: "nordeste",
    name: "Banco do Nordeste",
    color: "#a6192e",
  },
  {
    slug: "unicred",
    name: "Unicred",
    color: "#958146",
  },
  {
    slug: "cresol",
    name: "Cresol",
    color: "#ee8600",
  },
  {
    slug: "safra",
    name: "Safra",
    color: "#0d2240",
  },
  {
    slug: "stone",
    name: "Stone",
    color: "#00a868",
  },
  {
    slug: "pan",
    name: "Banco Pan",
    color: "#0072ce",
  },
  {
    slug: "bv",
    name: "BV",
    color: "#1d3b8f",
  },
  {
    slug: "digio",
    name: "Digio",
    color: "#0a1e46",
  },
  {
    slug: "agibank",
    name: "Agibank",
    color: "#00cd5c",
  },
  {
    slug: "bmg",
    name: "BMG",
    color: "#e85d0c",
  },
  {
    slug: "daycoval",
    name: "Daycoval",
    color: "#001c55",
  },
  {
    slug: "sofisa",
    name: "Sofisa",
    color: "#00a88f",
  },
  {
    slug: "cora",
    name: "Cora",
    color: "#fe3e6d",
  },
  {
    slug: "infinitepay",
    name: "InfinitePay",
    color: "#171527",
  },
  {
    slug: "asaas",
    name: "Asaas",
    color: "#0038e5",
  },
] as const;

export type InstitutionSlug = (typeof INSTITUTIONS)[number]["slug"];
export const INSTITUTION_SLUGS = INSTITUTIONS.map((i) => i.slug) as [InstitutionSlug, ...InstitutionSlug[]];

export const institutionBySlug = (slug: string | null | undefined) =>
  slug ? INSTITUTIONS.find((i) => i.slug === slug) : undefined;

/** Bandeiras de cartão. `logo`: há arquivo em /bandeiras/<slug>.svg; senão, mostra o nome. */
export const CARD_BRANDS = [
  {
    slug: "visa",
    name: "Visa",
    logo: true,
  },
  {
    slug: "mastercard",
    name: "Mastercard",
    logo: true,
  },
  {
    slug: "elo",
    name: "Elo",
    logo: false,
  },
  {
    slug: "amex",
    name: "American Express",
    logo: true,
  },
  {
    slug: "hipercard",
    name: "Hipercard",
    logo: false,
  },
  {
    slug: "diners",
    name: "Diners Club",
    logo: true,
  },
] as const;

export type CardBrand = (typeof CARD_BRANDS)[number]["slug"];
export const CARD_BRAND_SLUGS = CARD_BRANDS.map((b) => b.slug) as [CardBrand, ...CardBrand[]];
