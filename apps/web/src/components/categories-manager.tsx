import { CATEGORY_ICONS, type Category, type CategoryIcon, type CategoryKind, PALETTE } from "@miu/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { archiveCategory, categoriesQuery, createCategory, updateCategory } from "@/lib/finance";
import { ApiRequestError } from "@/lib/http";
import { ICONS, IconTile } from "./category-icon";
import { Segmented } from "./controls";
import { Sheet } from "./sheet";
import { toast } from "./toast";
import { Alert, Button, Card, Field, Input } from "./ui";

export function CategoriesManager() {
  const { data: categories = [] } = useQuery(categoriesQuery);
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [sheet, setSheet] = useState<{ open: boolean; category: Category | null }>({
    open: false,
    category: null,
  });
  const list = categories.filter((c) => c.kind === kind);

  return (
    <Card className="lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <h3 className="font-semibold">Categorias</h3>
        <div className="flex items-center gap-2">
          <Segmented
            label="Tipo de categoria"
            value={kind}
            onChange={setKind}
            options={[
              { value: "expense", label: "Despesas" },
              { value: "income", label: "Receitas" },
            ]}
          />
          <Button size="sm" onClick={() => setSheet({ open: true, category: null })}>
            <Plus className="size-4" aria-hidden /> Nova
          </Button>
        </div>
      </div>
      <ul className="mt-3 grid sm:grid-cols-2">
        {list.map((c) => (
          <li key={c.id} className="border-t border-line">
            <button
              type="button"
              onClick={() => setSheet({ open: true, category: c })}
              className={cn(
                "flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-surface-2",
                c.archived && "opacity-55",
              )}
            >
              <IconTile icon={c.icon} color={c.color} />
              <span className="flex-1 truncate font-medium">{c.name}</span>
              {c.archived ? <span className="text-xs text-muted">Arquivada</span> : null}
            </button>
          </li>
        ))}
      </ul>
      <Sheet
        open={sheet.open}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
        title={sheet.category ? "Editar categoria" : "Nova categoria"}
      >
        {sheet.open ? (
          <CategoryForm
            category={sheet.category}
            defaultKind={kind}
            onDone={() => setSheet((s) => ({ ...s, open: false }))}
          />
        ) : null}
      </Sheet>
    </Card>
  );
}

function CategoryForm({
  category,
  defaultKind,
  onDone,
}: {
  category: Category | null;
  defaultKind: CategoryKind;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<CategoryKind>(category?.kind ?? defaultKind);
  const [icon, setIcon] = useState<CategoryIcon>(category?.icon ?? "ellipsis");
  const [color, setColor] = useState(category?.color ?? PALETTE[8]);
  const [error, setError] = useState<string | null>(null);

  const finish = async (msg: string) => {
    await queryClient.invalidateQueries({ queryKey: categoriesQuery.queryKey });
    toast(msg);
    onDone();
  };
  const onError = (e: unknown) =>
    setError(e instanceof ApiRequestError ? e.message : "Não foi possível salvar.");

  const save = useMutation({
    mutationFn: () =>
      category
        ? updateCategory(category.id, { name: name.trim(), icon, color })
        : createCategory({ name: name.trim(), kind, icon, color }),
    onSuccess: () => finish(category ? "Categoria atualizada" : "Categoria criada"),
    onError,
  });
  const archive = useMutation({
    mutationFn: () => archiveCategory(category?.id ?? "", !category?.archived),
    onSuccess: () => finish(category?.archived ? "Categoria reativada" : "Categoria arquivada"),
    onError,
  });

  return (
    <form
      className="flex flex-col gap-[18px]"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError("Dê um nome para a categoria.");
        save.mutate();
      }}
    >
      {!category ? (
        <Segmented
          label="Tipo"
          value={kind}
          onChange={setKind}
          options={[
            { value: "expense", label: "Despesa" },
            { value: "income", label: "Receita" },
          ]}
        />
      ) : null}
      <Field label="Nome">
        {(p) => (
          <Input
            {...p}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Pets"
          />
        )}
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Ícone</span>
        <div className="grid grid-cols-7 gap-1.5">
          {CATEGORY_ICONS.map((name) => {
            const Icon = ICONS[name];
            return (
              <button
                key={name}
                type="button"
                aria-label={name}
                aria-pressed={icon === name}
                onClick={() => setIcon(name)}
                className={cn(
                  "grid aspect-square place-items-center rounded-[10px] border",
                  icon === name
                    ? "border-primary bg-accent-soft text-fg"
                    : "border-line text-muted hover:bg-surface-2",
                )}
              >
                <Icon className="size-[18px]" />
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Cor</span>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={cn("size-8 rounded-full border-2", color === c ? "border-fg" : "border-transparent")}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {category ? (
        <div className="flex flex-col gap-2 rounded-[14px] bg-surface-2 p-3.5 text-sm">
          <div>
            <Button size="sm" loading={archive.isPending} onClick={() => archive.mutate()}>
              {category.archived ? "Reativar categoria" : "Arquivar categoria"}
            </Button>
          </div>
          <span className="text-muted">
            Arquivar tira a categoria das opções, mas os lançamentos antigos continuam com ela.
          </span>
        </div>
      ) : null}
      <div className="sticky -bottom-5 -mx-5 -mb-5 mt-auto flex justify-end gap-2.5 border-t border-line bg-surface px-5 pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]">
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {category ? "Salvar" : "Criar"}
        </Button>
      </div>
    </form>
  );
}
