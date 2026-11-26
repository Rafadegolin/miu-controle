import { todayIn } from "@miu/core";
import { eq, schema } from "@miu/db";
import type { Account, Category } from "@miu/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAlerts } from "../src/lib/alerts";
import type { Email, Mailer } from "../src/lib/mailer";
import { APP_URL, setup, signUpVerified } from "./harness";

let t: Awaited<ReturnType<typeof setup>>;
let ana: string;
let conta: Account;
let cats: Category[];
const today = todayIn("America/Sao_Paulo");
const month = today.slice(0, 7);

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  if (r.status !== status) throw new Error(`esperava ${status}, veio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}
const post = <T>(path: string, body: object = {}, status = 201) =>
  json<T>(t.req(path, { method: "POST", cookie: ana, json: body }), status);
const cat = (name: string) => cats.find((c) => c.name === name)?.id ?? "";
const spend = (amountCents: number, categoryId: string) =>
  post("/api/transactions", { kind: "expense", amountCents, accountId: conta.id, categoryId, date: today });

function recorder() {
  const sent: Email[] = [];
  const mailer: Mailer = {
    async send(e) {
      sent.push(e);
    },
  };
  return { sent, mailer };
}

beforeEach(async () => {
  t = await setup();
  ana = await signUpVerified(t);
  conta = await post<Account>("/api/accounts", {
    name: "Conta",
    kind: "checking",
    initialBalanceCents: 1_000_000,
  });
  cats = await json<Category[]>(t.req("/api/categories", { cookie: ana }));
});
afterEach(async () => t?.close());

describe("avisos por e-mail", () => {
  it("avisa em 80% e de novo quando estoura, uma vez cada", async () => {
    await json(
      t.req(`/api/budgets/${cat("Mercado")}`, {
        method: "PUT",
        cookie: ana,
        json: { month, amountCents: 100_000 },
      }),
    );
    const r = recorder();

    await spend(50_000, cat("Mercado"));
    await runAlerts(t.db, r.mailer, APP_URL);
    expect(r.sent).toHaveLength(0);

    await spend(35_000, cat("Mercado"));
    await runAlerts(t.db, r.mailer, APP_URL);
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0]?.subject).toContain("Mercado: 85% do orçamento");
    expect(r.sent[0]?.to).toBe("ana@exemplo.com");

    await runAlerts(t.db, r.mailer, APP_URL); // de novo no mesmo dia: nada
    expect(r.sent).toHaveLength(1);

    await spend(20_000, cat("Mercado"));
    await runAlerts(t.db, r.mailer, APP_URL);
    expect(r.sent).toHaveLength(2);
    expect(r.sent[1]?.subject).toContain("estourado");
  });

  it("avisa fatura vencendo em até 3 dias (e junta tudo num e-mail só)", async () => {
    const day = Number(today.slice(8, 10));
    // fechou ontem, vence daqui a 2 dias (dentro do mês, quando possível)
    const closing = Math.min(28, Math.max(1, day - 1));
    const due = Math.min(28, day + 2);
    if (due <= closing) return; // fim de mês: cenário não se monta; os outros testes cobrem
    const cartao = await post<Account>("/api/accounts", {
      name: "Grafite",
      kind: "credit_card",
      creditLimitCents: 100_000,
      closingDay: closing,
      dueDay: due,
    });
    await post("/api/transactions", {
      kind: "expense",
      amountCents: 12_345,
      accountId: cartao.id,
      categoryId: cat("Compras"),
      date: `${month}-${String(Math.max(1, closing - 1)).padStart(2, "0")}`,
    });
    await json(
      t.req(`/api/budgets/${cat("Lazer")}`, {
        method: "PUT",
        cookie: ana,
        json: { month, amountCents: 1_000 },
      }),
    );
    await spend(2_000, cat("Lazer"));

    const r = recorder();
    await runAlerts(t.db, r.mailer, APP_URL);
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0]?.subject).toBe("2 avisos sobre o seu mês");
    expect(r.sent[0]?.text).toContain("Fatura do Grafite vence");
    expect(r.sent[0]?.text).toContain("R$ 123,45");
  });

  it("não manda nada para quem desligou os avisos", async () => {
    await json(t.req("/api/me", { method: "PATCH", cookie: ana, json: { emailAlerts: false } }));
    await json(
      t.req(`/api/budgets/${cat("Mercado")}`, {
        method: "PUT",
        cookie: ana,
        json: { month, amountCents: 1_000 },
      }),
    );
    await spend(5_000, cat("Mercado"));
    const r = recorder();
    await runAlerts(t.db, r.mailer, APP_URL);
    expect(r.sent).toHaveLength(0);
  });

  it("se o envio falhar, tenta de novo na próxima vez", async () => {
    await json(
      t.req(`/api/budgets/${cat("Mercado")}`, {
        method: "PUT",
        cookie: ana,
        json: { month, amountCents: 1_000 },
      }),
    );
    await spend(5_000, cat("Mercado"));
    const failing: Mailer = {
      async send() {
        throw new Error("provedor fora");
      },
    };
    await runAlerts(t.db, failing, APP_URL);
    const r = recorder();
    await runAlerts(t.db, r.mailer, APP_URL);
    expect(r.sent).toHaveLength(1);
  });
});

describe("segurança", () => {
  it("excluir a conta apaga tudo do usuário (e só dele)", async () => {
    await spend(1_000, cat("Mercado"));
    const bia = await signUpVerified(t, "bia@exemplo.com");
    const biaConta = await json<Account>(
      t.req("/api/accounts", { method: "POST", cookie: bia, json: { name: "Bia", kind: "checking" } }),
      201,
    );

    const del = await t.req("/api/auth/delete-user", {
      method: "POST",
      cookie: ana,
      json: { password: "senha-bem-forte-123" },
    });
    expect(del.status).toBe(200);

    const users = await t.db.select().from(schema.user);
    expect(users.map((u) => u.email)).toEqual(["bia@exemplo.com"]);
    const anaTx = await t.db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.accountId, conta.id));
    expect(anaTx).toEqual([]);
    expect((await t.db.select().from(schema.accounts)).map((a) => a.id)).toEqual([biaConta.id]);
    expect((await t.req("/api/me", { cookie: ana })).status).toBe(401);
  });

  it("exportação neutraliza fórmulas (=, +, -, @) no texto", async () => {
    await post("/api/transactions", {
      kind: "expense",
      amountCents: 100,
      accountId: conta.id,
      categoryId: cat("Mercado"),
      date: today,
      description: '=HYPERLINK("http://mal.example","clique")',
    });
    const text = await (await t.req("/api/export/transactions.csv", { cookie: ana })).text();
    const line = text.trim().split("\r\n")[1] ?? "";
    expect(line).toContain(`"'=HYPERLINK(""http://mal.example"",""clique"")"`);
    expect(line.split(";")[2]).toBe("-1,00"); // valor negativo continua número
  });

  it("toda rota de dados exige login", async () => {
    const paths = [
      "/api/me",
      "/api/accounts",
      "/api/categories",
      `/api/transactions?month=${month}`,
      `/api/transactions/summary?month=${month}`,
      "/api/recurring",
      `/api/budgets?month=${month}`,
      "/api/goals",
      "/api/dashboard",
      `/api/reports/cashflow?end=${month}`,
      `/api/reports/categories?month=${month}`,
      "/api/import/batches",
      "/api/export/transactions.csv",
    ];
    for (const p of paths) {
      const res = await t.req(p);
      expect(res.status, p).toBe(401);
    }
  });
});
