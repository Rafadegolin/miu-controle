import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Monitor, Share, Smartphone, SquarePlus } from "lucide-react";
import { useState } from "react";
import { ApiRequestError } from "@/lib/http";
import { meQuery, updateMe } from "@/lib/me";
import {
  disablePush,
  enablePush,
  permission,
  pushConfigQuery,
  pushDevicesQuery,
  pushSubscriptionQuery,
  pushSupport,
  testPush,
} from "@/lib/push";
import { Switch } from "./controls";
import { toast } from "./toast";
import { Alert, Button, Card } from "./ui";

const rel = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
function since(date: string) {
  const days = Math.round((new Date(date).getTime() - Date.now()) / 86_400_000);
  return days === 0 ? "hoje" : rel.format(days, "day");
}

/** Notificações no celular: ativar neste aparelho, testar, e escolher o que recebe. */
export function PushCard() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery(meQuery);
  const config = useQuery(pushConfigQuery);
  const sub = useQuery(pushSubscriptionQuery);
  const devices = useQuery(pushDevicesQuery);
  const [error, setError] = useState<string | null>(null);
  const support = pushSupport();
  const endpoint = sub.data ?? null;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["push", "subscription"] }),
      queryClient.invalidateQueries({ queryKey: ["push", "devices"] }),
    ]);

  const enable = useMutation({
    mutationFn: () => enablePush(config.data?.publicKey ?? ""),
    onSuccess: async () => {
      setError(null);
      await refresh();
      toast("Notificações ativadas neste aparelho");
    },
    onError: (e) => {
      const m = e instanceof Error ? e.message : "";
      setError(
        m === "negado"
          ? "O aparelho bloqueou as notificações do Miu. Libere nos ajustes e tente de novo."
          : m === "ignorado"
            ? "Para receber os avisos, toque em Permitir quando o aparelho perguntar."
            : m === "inscricao_recusada"
              ? "O navegador não conseguiu ativar as notificações. Se estiver numa janela anônima, use uma normal ou o app instalado."
              : m === "sem_service_worker"
                ? "O Miu ainda está terminando de instalar neste aparelho. Recarregue a página e tente de novo."
                : e instanceof ApiRequestError
                  ? e.message
                  : "Não foi possível ativar. Tente de novo.",
      );
    },
  });
  const disable = useMutation({
    mutationFn: () => disablePush(endpoint ?? ""),
    onSuccess: async () => {
      await refresh();
      toast("Notificações desativadas neste aparelho");
    },
  });
  const test = useMutation({
    mutationFn: () => testPush(endpoint ?? ""),
    onSuccess: () => {
      setError(null);
      toast("Notificação enviada! Deve chegar em alguns segundos.");
    },
    onError: async (e) => {
      setError(e instanceof ApiRequestError ? e.message : "Não foi possível enviar o teste.");
      await refresh();
    },
  });
  const prefs = useMutation({
    mutationFn: (p: { pushAlerts?: boolean; pushReminder?: boolean }) => updateMe(p),
    onSuccess: (data) => queryClient.setQueryData(meQuery.queryKey, data),
  });

  const serverOff = config.isSuccess && !config.data.publicKey;
  const denied = support === "ok" && permission() === "denied";

  let body: React.ReactNode;
  if (serverOff) {
    body = <p className="text-sm text-muted">As notificações ainda não estão disponíveis no servidor.</p>;
  } else if (support === "ios-install") {
    body = (
      <ol className="flex flex-col gap-2 rounded-[14px] bg-surface-2 p-3.5 text-sm">
        <li className="text-fg-2">No iPhone, as notificações funcionam com o Miu instalado:</li>
        <li className="flex items-center gap-2">
          <Share className="size-4 shrink-0 text-primary" aria-hidden /> No Safari, toque em Compartilhar.
        </li>
        <li className="flex items-center gap-2">
          <SquarePlus className="size-4 shrink-0 text-primary" aria-hidden /> Escolha "Adicionar à Tela de
          Início".
        </li>
        <li className="flex items-center gap-2">
          <Smartphone className="size-4 shrink-0 text-primary" aria-hidden /> Abra o Miu pelo ícone e volte
          aqui.
        </li>
      </ol>
    );
  } else if (support === "unsupported") {
    body = (
      <p className="text-sm text-muted">
        Este navegador não aceita notificações. Tente pelo Chrome ou pelo app instalado.
      </p>
    );
  } else if (denied) {
    body = (
      <p className="text-sm text-muted">
        As notificações do Miu estão bloqueadas neste aparelho. Libere nos ajustes do navegador (ou em Ajustes
        → Notificações → Miu, no celular) e recarregue a página.
      </p>
    );
  } else if (endpoint) {
    body = (
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={test.isPending} onClick={() => test.mutate()}>
          <BellRing className="size-4" aria-hidden /> Enviar notificação de teste
        </Button>
        <Button variant="ghost" loading={disable.isPending} onClick={() => disable.mutate()}>
          Desativar neste aparelho
        </Button>
      </div>
    );
  } else {
    body = (
      <Button
        variant="primary"
        className="self-start"
        loading={enable.isPending || sub.isPending}
        disabled={!config.data?.publicKey}
        onClick={() => enable.mutate()}
      >
        <BellRing className="size-4" aria-hidden /> Ativar notificações neste aparelho
      </Button>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex gap-3">
        <BellRing className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
        <span>
          <span className="block font-semibold">Notificações no celular</span>
          <span className="mt-1 block text-sm text-muted">
            {endpoint
              ? "Ativadas neste aparelho."
              : "Receba os avisos do Miu como notificação, mesmo com o app fechado."}
          </span>
        </span>
      </div>
      {body}
      {error ? <Alert>{error}</Alert> : null}

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex items-start justify-between gap-4">
          <span className="text-sm">
            <span className="block font-medium">Faturas e orçamentos</span>
            <span className="text-muted">Fatura vencendo ou vencida, orçamento em 80% ou estourado.</span>
          </span>
          <Switch
            checked={me?.settings.pushAlerts ?? true}
            disabled={prefs.isPending}
            onChange={(v) => prefs.mutate({ pushAlerts: v })}
            label="Notificações de faturas e orçamentos"
          />
        </div>
        <div className="flex items-start justify-between gap-4">
          <span className="text-sm">
            <span className="block font-medium">Lembrete à noite</span>
            <span className="text-muted">
              Às 20h, "Lançou tudo hoje?", só nos dias em que você não lançou nada.
            </span>
          </span>
          <Switch
            checked={me?.settings.pushReminder ?? false}
            disabled={prefs.isPending}
            onChange={(v) => prefs.mutate({ pushReminder: v })}
            label="Lembrete à noite"
          />
        </div>
      </div>

      {devices.data?.length ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Aparelhos que recebem</span>
          <ul className="overflow-hidden rounded-[14px] bg-surface-2">
            {devices.data.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-3 border-t border-line px-3.5 py-2.5 text-sm first:border-t-0"
              >
                {/iPhone|iPad|Android/.test(d.device ?? "") ? (
                  <Smartphone className="size-4 text-muted" aria-hidden />
                ) : (
                  <Monitor className="size-4 text-muted" aria-hidden />
                )}
                <span className="flex-1">{d.device ?? "Aparelho"}</span>
                <span className="text-[13px] text-muted">desde {since(d.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
