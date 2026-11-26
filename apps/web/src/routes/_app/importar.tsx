import { decodeFile, ImportError, parseStatementFile, todayIn } from "@miu/core";
import { type ImportPreview, MAX_IMPORT_ROWS, type PreviewRow } from "@miu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FileUp, RotateCcw } from "lucide-react";
import { type DragEvent, useId, useState } from "react";
import { Switch } from "@/components/controls";
import { toast } from "@/components/toast";
import { byId } from "@/components/transaction-row";
import { Alert, Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  accountsQuery,
  categoriesQuery,
  confirmImport,
  exportUrl,
  importBatchesQuery,
  invalidateMoney,
  previewImport,
  undoImport,
} from "@/lib/finance";
import { dayShort, money } from "@/lib/format";
import { ApiRequestError } from "@/lib/http";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/_app/importar")({
  head: () => ({ meta: [{ title: "Importar extrato · Miu Controle" }] }),
  component: Importar,
});

type Row = PreviewRow & { selected: boolean };
type State = {
  fileName: string;
  parsed: Parameters<typeof previewImport>[0]["rows"];
  preview: ImportPreview;
  rows: Row[];
};

function Importar() {
  const uid = useId();
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const { data: accounts = [] } = useQuery(accountsQuery);
  const { data: categories = [] } = useQuery(categoriesQuery);
  const batches = useQuery(importBatchesQuery);
  const active = accounts.filter((a) => !a.archived);
  const [accountId, setAccountId] = useState("");
  const account = active.find((a) => a.id === accountId) ?? active[0];
  const [state, setState] = useState<State | null>(null);
  const [positiveIsExpense, setPositiveIsExpense] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const accMap = byId(accounts);
  const isCard = Boolean(account?.card);
  const posExpense = positiveIsExpense ?? isCard;

  const load = useMutation({
    mutationFn: async ({ file, flip }: { file?: File; flip?: boolean }) => {
      if (!account) throw new ImportError("Escolha uma conta.");
      let fileName = state?.fileName ?? "";
      let parsed = state?.parsed ?? [];
      if (file) {
        fileName = file.name;
        if (file.size > 5 * 1024 * 1024) throw new ImportError("Arquivo grande demais (máx. 5 MB).");
        parsed = parseStatementFile(decodeFile(await file.arrayBuffer())).rows;
        if (parsed.length > MAX_IMPORT_ROWS)
          throw new ImportError(
            `O arquivo tem ${parsed.length} linhas; o máximo é ${MAX_IMPORT_ROWS} por vez.`,
          );
      }
      const preview = await previewImport({
        accountId: account.id,
        rows: parsed,
        positiveIsExpense: flip ?? posExpense,
      });
      return { fileName, parsed, preview };
    },
    onSuccess: ({ fileName, parsed, preview }) => {
      setError(null);
      setState({
        fileName,
        parsed,
        preview,
        rows: preview.rows.map((r) => ({ ...r, selected: !r.match })),
      });
    },
    onError: (e) =>
      setError(
        e instanceof ImportError || e instanceof ApiRequestError
          ? e.message
          : "Não consegui ler esse arquivo.",
      ),
  });

  const save = useMutation({
    mutationFn: () => {
      if (!state) throw new Error("sem prévia");
      const chosen = state.rows.filter((r) => r.selected);
      return confirmImport({
        accountId: state.preview.accountId,
        fileName: state.fileName,
        rows: chosen.map((r) => ({
          date: r.date,
          kind: r.kind,
          amountCents: r.amountCents,
          description: r.description,
          categoryId: r.categoryId,
          fitid: r.fitid,
        })),
      });
    },
    onSuccess: async (res) => {
      await invalidateMoney(queryClient);
      toast(
        res.skipped
          ? `${res.inserted} importados · ${res.skipped} já existiam`
          : `${res.inserted} ${res.inserted === 1 ? "lançamento importado" : "lançamentos importados"}`,
      );
      setState(null);
    },
    onError: (e) => setError(e instanceof ApiRequestError ? e.message : "Não foi possível importar."),
  });

  const undo = useMutation({
    mutationFn: undoImport,
    onSuccess: async (r) => {
      await invalidateMoney(queryClient);
      toast(`Importação desfeita (${r.removed} removidos)`);
    },
  });

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) load.mutate({ file });
  }

  const update = (index: number, patch: Partial<Row>) =>
    setState((s) =>
      s ? { ...s, rows: s.rows.map((r) => (r.index === index ? { ...r, ...patch } : r)) } : s,
    );
  const selected = state?.rows.filter((r) => r.selected) ?? [];
  const missingCat = selected.filter((r) => !r.categoryId).length;
  const net = selected.reduce((s, r) => s + (r.kind === "income" ? r.amountCents : -r.amountCents), 0);

  if (state) {
    const dupes = state.rows.filter((r) => r.match).length;
    return (
      <>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-semibold">{state.fileName}</h3>
              <p className="text-[13px] text-muted">
                {state.rows.length} linhas para {accMap.get(state.preview.accountId)?.name}
                {dupes ? ` · ${dupes} parecem já lançadas e foram desmarcadas` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setState(null)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                loading={save.isPending}
                disabled={selected.length === 0}
                onClick={() => save.mutate()}
              >
                Importar {selected.length}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13.5px]">
            <span className="text-muted">
              Selecionados: <b className={cn("num", net < 0 ? "text-fg" : "text-accent")}>{money(net)}</b>
              {missingCat ? ` · ${missingCat} sem categoria` : ""}
            </span>
            <span className="flex items-center gap-2">
              <Switch
                checked={posExpense}
                onChange={(v) => {
                  setPositiveIsExpense(v);
                  load.mutate({ flip: v });
                }}
                label="Valores positivos são despesas"
              />
              Valores positivos são despesas {isCard ? "(comum em fatura de cartão)" : ""}
            </span>
          </div>
          {error ? (
            <div className="px-5 pb-3">
              <Alert>{error}</Alert>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line text-left text-[12.5px] text-muted">
                  <th className="w-10 px-5 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos"
                      checked={selected.length === state.rows.length}
                      onChange={(e) =>
                        setState((s) =>
                          s ? { ...s, rows: s.rows.map((r) => ({ ...r, selected: e.target.checked })) } : s,
                        )
                      }
                    />
                  </th>
                  <th className="px-2 py-2.5 font-medium">Data</th>
                  <th className="px-2 py-2.5 font-medium">Descrição</th>
                  <th className="px-2 py-2.5 font-medium">Categoria</th>
                  <th className="px-2 py-2.5 text-right font-medium">Valor</th>
                  <th className="px-5 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r) => (
                  <tr key={r.index} className={cn("border-t border-line", !r.selected && "text-faint")}>
                    <td className="px-5 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Importar ${r.description}`}
                        checked={r.selected}
                        onChange={(e) => update(r.index, { selected: e.target.checked })}
                      />
                    </td>
                    <td className="num px-2 py-2 whitespace-nowrap">{dayShort(r.date)}</td>
                    <td className="px-2 py-2">
                      <input
                        aria-label="Descrição"
                        value={r.description}
                        maxLength={120}
                        onChange={(e) => update(r.index, { description: e.target.value })}
                        className="h-8 w-full min-w-[180px] rounded-md border border-transparent bg-transparent px-1.5 hover:border-line focus:border-primary"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        aria-label="Categoria"
                        value={r.categoryId ?? ""}
                        onChange={(e) =>
                          update(r.index, { categoryId: e.target.value || null, categorySource: null })
                        }
                        className={cn(
                          "h-8 min-w-[150px] rounded-md border bg-surface px-1.5",
                          r.categoryId ? "border-line-strong" : "border-warn",
                        )}
                      >
                        <option value="">Sem categoria</option>
                        {categories
                          .filter((c) => c.kind === r.kind && !c.archived)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td
                      className={cn(
                        "num px-2 py-2 text-right whitespace-nowrap",
                        r.kind === "income" && r.selected && "text-accent",
                      )}
                    >
                      {r.kind === "income" ? "+ " : "− "}
                      {money(r.amountCents)}
                    </td>
                    <td className="px-5 py-2 text-xs whitespace-nowrap">
                      {r.match ? (
                        <span
                          className="rounded-full bg-surface-2 px-2 py-0.5 text-muted"
                          title={`Parece com "${r.match.description}" em ${dayShort(r.match.date)}`}
                        >
                          {r.match.level === "exact" ? "Já existe" : "Parece repetido"}
                        </span>
                      ) : r.categorySource === "history" ? (
                        <span className="text-muted">pelo histórico</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="text-[13px] text-muted">
          Nada é salvo antes de você clicar em Importar. Depois, dá para desfazer a importação inteira.
        </p>
      </>
    );
  }

  const today = todayIn(me?.settings.timezone);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card className="flex flex-col gap-5 p-5">
        <div>
          <h3 className="text-[17px] font-semibold">Importar extrato</h3>
          <p className="mt-1 text-muted">
            Arquivo OFX ou CSV exportado do app do banco ou do cartão. Você revisa tudo antes de salvar, e o
            que já foi lançado não entra de novo.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-acc`} className="text-[13px] font-medium text-muted">
            Para qual conta ou cartão?
          </label>
          <select
            id={`${uid}-acc`}
            value={account?.id ?? ""}
            onChange={(e) => {
              setAccountId(e.target.value);
              setPositiveIsExpense(null);
            }}
            className="h-[42px] w-full rounded-control border border-line-strong bg-surface px-3"
          >
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.card ? " (cartão)" : ""}
              </option>
            ))}
          </select>
        </div>
        <label
          htmlFor={`${uid}-file`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2.5 rounded-2xl border-[1.5px] border-dashed px-5 py-9 text-center",
            dragging ? "border-primary bg-accent-soft" : "border-line-strong bg-surface-2",
          )}
        >
          <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
            <FileUp className="size-5" aria-hidden />
          </span>
          <b>{load.isPending ? "Lendo o arquivo…" : "Escolher ou arrastar arquivo .ofx ou .csv"}</b>
          <span className="text-[13px] text-muted">
            CSV com data, descrição e valor (o Miu descobre as colunas)
          </span>
          <input
            id={`${uid}-file`}
            type="file"
            accept=".ofx,.csv,.txt,text/csv"
            className="sr-only"
            disabled={!account || load.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) load.mutate({ file });
              e.target.value = "";
            }}
          />
        </label>
        {!account ? <Alert tone="info">Crie uma conta primeiro, em Contas.</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <div className="px-5 pt-4">
            <h3 className="text-[15px] font-medium text-muted">Importações recentes</h3>
          </div>
          <div className="mt-2">
            {batches.data?.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted">Nenhuma importação ainda.</p>
            ) : null}
            {batches.data?.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 border-t border-line px-5 py-3 first:border-t-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium">{b.fileName}</span>
                  <span className="text-[13px] text-muted">
                    {b.remaining} de {b.rowCount} lançamentos · {accMap.get(b.accountId)?.name ?? "conta"} ·{" "}
                    {dayShort(b.createdAt.slice(0, 10))}
                  </span>
                </span>
                {b.remaining > 0 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={undo.isPending && undo.variables === b.id}
                    onClick={() => undo.mutate(b.id)}
                  >
                    <RotateCcw className="size-4" aria-hidden /> Desfazer
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <h3 className="text-[15px] font-medium text-muted">Exportar lançamentos</h3>
          <p className="text-[13.5px] text-muted">
            Planilha CSV (abre no Excel e no Google Planilhas), com todos os campos.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={exportUrl(`${today.slice(0, 4)}-01-01`, `${today.slice(0, 4)}-12-31`)}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] font-medium hover:bg-surface-2"
            >
              <Download className="size-4" aria-hidden /> Este ano
            </a>
            <a
              href={exportUrl()}
              className="inline-flex h-8 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] font-medium hover:bg-surface-2"
            >
              <Download className="size-4" aria-hidden /> Tudo
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
