import type {
  Account,
  BudgetMonth,
  CardOverview,
  Category,
  CreateAccount,
  CreateCategory,
  CreateGoal,
  CreateRecurring,
  CreateTransaction,
  Goal,
  GoalContribution,
  MonthSummary,
  RecurringRule,
  Statement,
  Transaction,
  TransactionPage,
  UpdateAccount,
  UpdateCategory,
  UpdateGoal,
  UpdateRecurring,
  UpdateTransaction,
} from "@miu/shared";
import { infiniteQueryOptions, type QueryClient, queryOptions } from "@tanstack/react-query";
import { api } from "./api";
import { readJson } from "./http";

/* ---------- leituras ---------- */

export const accountsQuery = queryOptions({
  queryKey: ["accounts"],
  queryFn: async () => readJson<Account[]>(await api.accounts.$get()),
  staleTime: 60_000,
});

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: async () => readJson<Category[]>(await api.categories.$get()),
  staleTime: 10 * 60_000,
});

export const summaryQuery = (month: string) =>
  queryOptions({
    queryKey: ["summary", month],
    queryFn: async () => readJson<MonthSummary>(await api.transactions.summary.$get({ query: { month } })),
    staleTime: 30_000,
  });

export type TxFilters = {
  month: string;
  accountId?: string | undefined;
  kind?: "income" | "expense" | "transfer" | undefined;
  status?: "posted" | "planned" | undefined;
  q?: string | undefined;
};

export const transactionsQuery = (f: TxFilters) =>
  infiniteQueryOptions({
    queryKey: ["transactions", f],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const query: Record<string, string> = { month: f.month, limit: "100" };
      if (f.accountId) query.accountId = f.accountId;
      if (f.kind) query.kind = f.kind;
      if (f.status) query.status = f.status;
      if (f.q) query.q = f.q;
      if (pageParam) query.cursor = pageParam;
      return readJson<TransactionPage>(await api.transactions.$get({ query: query as { month: string } }));
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  });

export const cardOverviewQuery = (id: string) =>
  queryOptions({
    queryKey: ["cards", id, "overview"],
    queryFn: async () => readJson<CardOverview>(await api.cards[":id"].overview.$get({ param: { id } })),
    staleTime: 30_000,
  });

export const statementQuery = (id: string, month: string) =>
  queryOptions({
    queryKey: ["cards", id, "statement", month],
    queryFn: async () =>
      readJson<Statement>(await api.cards[":id"].statements[":month"].$get({ param: { id, month } })),
    staleTime: 30_000,
  });

/* ---------- escritas ---------- */

/** Depois de mexer em lançamentos, saldo, listas e resumos precisam ser recalculados. */
export function invalidateMoney(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["accounts"] }),
    queryClient.invalidateQueries({ queryKey: ["transactions"] }),
    queryClient.invalidateQueries({ queryKey: ["summary"] }),
    queryClient.invalidateQueries({ queryKey: ["cards"] }),
    queryClient.invalidateQueries({ queryKey: ["recurring"] }),
    queryClient.invalidateQueries({ queryKey: ["budgets"] }),
  ]);
}

export const createTransaction = async (body: CreateTransaction) =>
  readJson<Transaction>(await api.transactions.$post({ json: body as never }));
export const updateTransaction = async (id: string, body: UpdateTransaction) =>
  readJson<Transaction>(await api.transactions[":id"].$patch({ param: { id }, json: body }));
export const confirmTransaction = async (id: string) =>
  readJson<Transaction>(await api.transactions[":id"].confirm.$post({ param: { id } }));
export async function deleteTransaction(id: string, scope: "one" | "following" = "one") {
  const res = await api.transactions[":id"].$delete({ param: { id }, query: { scope } });
  if (!res.ok) await readJson(res);
}

export const createAccount = async (body: CreateAccount) =>
  readJson<Account>(await api.accounts.$post({ json: body as never }));
export const updateAccount = async (id: string, body: UpdateAccount) =>
  readJson<Account>(await api.accounts[":id"].$patch({ param: { id }, json: body }));
export const archiveAccount = async (id: string, archived: boolean) =>
  readJson<Account>(
    await (archived
      ? api.accounts[":id"].archive.$post({ param: { id } })
      : api.accounts[":id"].unarchive.$post({ param: { id } })),
  );
export async function deleteAccount(id: string) {
  const res = await api.accounts[":id"].$delete({ param: { id } });
  if (!res.ok) await readJson(res);
}

export const createCategory = async (body: CreateCategory) =>
  readJson<Category>(await api.categories.$post({ json: body as never }));
export const updateCategory = async (id: string, body: UpdateCategory) =>
  readJson<Category>(await api.categories[":id"].$patch({ param: { id }, json: body }));
export const archiveCategory = async (id: string, archived: boolean) =>
  readJson<Category>(
    await (archived
      ? api.categories[":id"].archive.$post({ param: { id } })
      : api.categories[":id"].unarchive.$post({ param: { id } })),
  );

/* ---------- recorrências ---------- */

export const recurringQuery = queryOptions({
  queryKey: ["recurring"],
  queryFn: async () => readJson<RecurringRule[]>(await api.recurring.$get()),
  staleTime: 60_000,
});

export const createRecurring = async (body: CreateRecurring & { firstPosted?: boolean }) =>
  readJson<RecurringRule>(await api.recurring.$post({ json: body as never }));
export const updateRecurring = async (id: string, body: UpdateRecurring) =>
  readJson<RecurringRule>(await api.recurring[":id"].$patch({ param: { id }, json: body }));
export const pauseRecurring = async (id: string, paused: boolean) =>
  readJson<RecurringRule>(
    await (paused
      ? api.recurring[":id"].pause.$post({ param: { id } })
      : api.recurring[":id"].resume.$post({ param: { id } })),
  );
export async function deleteRecurring(id: string) {
  const res = await api.recurring[":id"].$delete({ param: { id } });
  if (!res.ok) await readJson(res);
}

/* ---------- orçamentos e metas ---------- */

export const budgetsQuery = (month: string) =>
  queryOptions({
    queryKey: ["budgets", month],
    queryFn: async () => readJson<BudgetMonth>(await api.budgets.$get({ query: { month } })),
    staleTime: 30_000,
  });

export const setBudget = async (categoryId: string, month: string, amountCents: number | null) =>
  readJson(await api.budgets[":categoryId"].$put({ param: { categoryId }, json: { month, amountCents } }));

export const goalsQuery = queryOptions({
  queryKey: ["goals"],
  queryFn: async () => readJson<Goal[]>(await api.goals.$get()),
  staleTime: 60_000,
});

export const goalHistoryQuery = (id: string) =>
  queryOptions({
    queryKey: ["goals", id, "history"],
    queryFn: async () =>
      readJson<GoalContribution[]>(await api.goals[":id"].contributions.$get({ param: { id } })),
  });

export const createGoal = async (body: CreateGoal) =>
  readJson<Goal>(await api.goals.$post({ json: body as never }));
export const updateGoal = async (id: string, body: UpdateGoal) =>
  readJson<Goal>(await api.goals[":id"].$patch({ param: { id }, json: body }));
export const toggleArchiveGoal = async (id: string) =>
  readJson<Goal>(await api.goals[":id"].archive.$post({ param: { id } }));
export async function deleteGoal(id: string) {
  const res = await api.goals[":id"].$delete({ param: { id } });
  if (!res.ok) await readJson(res);
}
export const contribute = async (id: string, amountCents: number, date: string) =>
  readJson<Goal>(await api.goals[":id"].contributions.$post({ param: { id }, json: { amountCents, date } }));
export const deleteContribution = async (id: string, cid: string) =>
  readJson<Goal>(await api.goals[":id"].contributions[":cid"].$delete({ param: { id, cid } }));
