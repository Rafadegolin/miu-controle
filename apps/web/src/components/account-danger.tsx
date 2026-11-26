import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Trash2 } from "lucide-react";
import { useState } from "react";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { exportUrl } from "@/lib/finance";
import { meQuery, updateMe } from "@/lib/me";
import { clearOfflineData } from "@/lib/offline";
import { Switch } from "./controls";
import { toast } from "./toast";
import { Alert, Button, Card, Field, Input } from "./ui";

/** Ligar/desligar os avisos por e-mail. */
export function AlertsCard() {
  const { data: me } = useSuspenseQuery(meQuery);
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (emailAlerts: boolean) => updateMe({ emailAlerts }),
    onSuccess: (data) => {
      queryClient.setQueryData(meQuery.queryKey, data);
      toast(data.settings.emailAlerts ? "Avisos por e-mail ligados" : "Avisos por e-mail desligados");
    },
  });
  const on = me?.settings.emailAlerts ?? true;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <span className="flex gap-3">
          <Bell className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
          <span>
            <span className="block font-semibold">Avisos por e-mail</span>
            <span className="mt-1 block text-sm text-muted">
              No máximo um e-mail por dia, só quando há algo novo: orçamento em 80% ou estourado, fatura
              vencendo em até 3 dias ou vencida.
            </span>
          </span>
        </span>
        <Switch
          checked={on}
          disabled={toggle.isPending}
          onChange={(v) => toggle.mutate(v)}
          label="Avisos por e-mail"
        />
      </div>
    </Card>
  );
}

/** Excluir a conta e todos os dados (com senha, e sugerindo exportar antes). */
export function DeleteAccountCard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.deleteUser({ password });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.clear();
      clearOfflineData();
      navigate({ to: "/entrar" });
    },
    onError: (e) =>
      setError(authErrorMessage(e as { code?: string; status?: number }) ?? "Não foi possível excluir."),
  });

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h3 className="font-semibold">Excluir minha conta</h3>
      <p className="text-sm text-muted">
        Apaga para sempre sua conta e todos os dados: contas, lançamentos, cartões, metas. Não dá para
        desfazer.
      </p>
      {open ? (
        <form
          className="flex flex-col gap-3 rounded-xl border border-danger/40 bg-danger-soft/40 p-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            remove.mutate();
          }}
        >
          <p className="text-sm">
            Antes, se quiser guardar seu histórico,{" "}
            <a href={exportUrl()} className="font-medium text-accent hover:underline">
              baixe seus lançamentos em CSV
            </a>
            .
          </p>
          <Field label="Digite sua senha para confirmar">
            {(p) => (
              <Input
                {...p}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          {error ? <Alert>{error}</Alert> : null}
          <div className="flex gap-2">
            <Button type="submit" variant="danger" loading={remove.isPending} disabled={!password}>
              <Trash2 className="size-4" aria-hidden /> Excluir tudo
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
            Quero excluir minha conta
          </Button>
        </div>
      )}
    </Card>
  );
}
