import { todayIn } from "@miu/core";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { Card } from "@/components/ui";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/_app/")({
  head: () => ({ meta: [{ title: "Início · Miu Controle" }] }),
  component: Inicio,
});

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function greeting(hour: number) {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function Inicio() {
  const { data: me } = useSuspenseQuery(meQuery);
  const tz = me?.settings.timezone ?? "America/Sao_Paulo";
  const today = todayIn(tz);
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date()),
  );
  const firstName = me?.name.split(" ")[0];

  return (
    <>
      <div>
        <p className="text-sm text-muted">
          {weekday}, {d} {MONTHS[m - 1]}
        </p>
        <h2 className="text-[26px] font-semibold tracking-[-0.03em]">
          {greeting(hour)}
          {firstName ? `, ${firstName}` : ""}
        </h2>
      </div>
      <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
          <Wallet className="size-5" aria-hidden />
        </span>
        <h3 className="text-lg font-semibold">Seu painel aparece aqui</h3>
        <p className="max-w-md text-muted">
          Saldo, faturas, o que vence nos próximos dias e seus orçamentos. Contas e lançamentos são a próxima
          etapa.
        </p>
      </Card>
    </>
  );
}
