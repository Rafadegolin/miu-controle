import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarClock,
  Check,
  CreditCard,
  Download,
  FileUp,
  Gauge,
  KeyRound,
  Lock,
  PiggyBank,
  ShieldCheck,
  Smartphone,
  Target,
  Trash2,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { MockCard, PaceMock, ProjectionMock, StatementMock } from "@/components/auth-layout";
import { Donut } from "@/components/charts";
import { Wordmark } from "@/components/ui";
import { meQuery } from "@/lib/me";

export const Route = createFileRoute("/")({
  // Quem já está logado vai direto para o app.
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery).catch(() => null);
    if (me) throw redirect({ to: "/inicio" });
  },
  head: () => ({
    meta: [
      { title: "Miu Controle · Veja seu mês com clareza" },
      {
        name: "description",
        content:
          "Controle financeiro pessoal: cartão com a fatura certa, parcelas, contas fixas, ritmo de gastos, orçamentos e metas. Sem conectar banco.",
      },
    ],
  }),
  component: Landing,
});

const NAV = [
  ["#recursos", "Recursos"],
  ["#como-funciona", "Como funciona"],
  ["#seguranca", "Segurança"],
  ["#duvidas", "Dúvidas"],
] as const;

function Landing() {
  return (
    <div className="min-h-dvh bg-surface text-fg">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-surface/85 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1160px] items-center gap-6 px-4 sm:px-6">
          <a href="#topo" aria-label="Miu Controle">
            <Wordmark />
          </a>
          <nav
            className="hidden flex-1 items-center justify-center gap-7 text-[15px] text-fg-2 md:flex"
            aria-label="Seções"
          >
            {NAV.map(([href, label]) => (
              <a key={href} href={href} className="hover:text-fg">
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Link
              to="/entrar"
              className="rounded-control px-3 py-2 text-[15px] font-medium hover:bg-surface-2"
            >
              Entrar
            </Link>
            <Link
              to="/cadastro"
              className="hidden h-10 items-center rounded-control bg-primary px-4 text-[15px] font-medium text-on-primary hover:bg-primary-hover sm:inline-flex"
            >
              Criar conta grátis
            </Link>
          </div>
        </div>
      </header>

      <main id="topo">
        <Hero />
        <Facts />
        <Features />
        <HowItWorks />
        <Security />
        <Faq />
        <FinalCta />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1160px] flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <Wordmark />
          <span>Controle financeiro pessoal, feito no Brasil.</span>
          <div className="flex gap-4">
            <Link to="/entrar" className="hover:text-fg">
              Entrar
            </Link>
            <Link to="/cadastro" className="hover:text-fg">
              Criar conta
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------- hero ---------- */

function CtaButtons({ center }: { center?: boolean }) {
  return (
    <div className={`flex flex-wrap gap-3 ${center ? "justify-center" : ""}`}>
      <Link
        to="/cadastro"
        className="inline-flex h-12 items-center gap-2 rounded-control bg-primary px-6 text-base font-medium text-on-primary hover:bg-primary-hover"
      >
        Criar conta grátis <ArrowRight className="size-[18px]" aria-hidden />
      </Link>
      <a
        href="#recursos"
        className="inline-flex h-12 items-center rounded-control bg-surface px-6 text-base font-medium ring-1 ring-line-strong hover:bg-surface-2"
      >
        Ver recursos
      </a>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(55%_60%_at_50%_0%,var(--accent-soft),transparent)]"
        aria-hidden
      />
      <div className="relative mx-auto flex max-w-[1160px] flex-col items-center px-4 pt-16 pb-10 text-center sm:px-6 sm:pt-24">
        <span className="rounded-full bg-surface px-3 py-1 text-sm font-medium text-primary shadow-card ring-1 ring-line">
          Sem conectar banco · seus dados só seus
        </span>
        <h1 className="mt-6 max-w-[820px] text-[40px] font-semibold leading-[1.05] tracking-[-0.045em] sm:text-[64px]">
          Veja seu mês com <Underline>clareza</Underline>, antes dele acabar
        </h1>
        <p className="mt-6 max-w-[600px] text-lg text-muted">
          Cartão com a fatura certa, parcelas, contas fixas e o ritmo dos seus gastos num só lugar. Você sabe
          hoje quanto vai sobrar no fim do mês.
        </p>
        <div className="mt-8">
          <CtaButtons center />
        </div>
      </div>
      <div className="relative mx-auto max-w-[1160px] px-4 pb-20 sm:px-6">
        <HeroMock />
      </div>
    </section>
  );
}

function Underline({ children }: { children: ReactNode }) {
  return (
    <span className="relative whitespace-nowrap">
      {children}
      <svg
        className="absolute -bottom-2 left-0 h-3 w-full text-primary"
        viewBox="0 0 200 10"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d="M2 7 Q 100 1 198 6"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** Recorte da Visão geral com dados ilustrativos, montado com os mesmos componentes do app. */
function HeroMock() {
  const cats = [
    { key: "m", label: "Moradia", value: 210_000, color: "#6b8afd" },
    { key: "s", label: "Mercado", value: 98_000, color: "#1fbf8f" },
    { key: "r", label: "Restaurantes", value: 54_000, color: "#f08a4b" },
    { key: "t", label: "Transporte", value: 31_000, color: "#4ab3e8" },
  ];
  const total = cats.reduce((s, c) => s + c.value, 0);
  return (
    <div className="rounded-[28px] bg-bg p-3 shadow-pop ring-1 ring-line sm:p-5" aria-hidden>
      <div className="grid gap-3 sm:gap-5 lg:grid-cols-3">
        <PaceMock />
        <MockCard className="lg:col-span-2">
          <p className="text-sm text-muted">Distribuição de gastos</p>
          <div className="mt-4 flex flex-col items-center gap-6 md:flex-row">
            <Donut segments={cats} size={180} thickness={20}>
              <div>
                <p className="text-xs text-muted">Gasto total</p>
                <p className="num-display text-2xl">R$ {(total / 100).toLocaleString("pt-BR")}</p>
              </div>
            </Donut>
            <ul className="w-full flex-1 divide-y divide-line text-left">
              {cats.map((c) => (
                <li key={c.key} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                  <span className="flex-1 font-medium">{c.label}</span>
                  <span className="num rounded-full bg-surface-2 px-2 text-xs text-muted">
                    {Math.round((c.value / total) * 100)}%
                  </span>
                  <span className="num w-24 text-right font-semibold">
                    R$ {(c.value / 100).toLocaleString("pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </MockCard>
      </div>
    </div>
  );
}

/* ---------- fatos do produto ---------- */

function Facts() {
  const items: [ReactNode, string][] = [
    [<CreditCard key="c" className="size-5" />, "Cada compra na fatura certa, com parcelas em até 48x"],
    [<FileUp key="f" className="size-5" />, "Importa o extrato do banco em OFX ou CSV"],
    [<Smartphone key="s" className="size-5" />, "Instala no celular e funciona como app"],
  ];
  return (
    <section className="border-y border-line bg-bg">
      <div className="mx-auto grid max-w-[1160px] gap-6 px-4 py-10 sm:grid-cols-3 sm:px-6">
        {items.map(([icon, text]) => (
          <div key={text} className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-primary">
              {icon}
            </span>
            <p className="text-[15px] font-medium text-fg-2">{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- recursos ---------- */

function Features() {
  return (
    <section
      id="recursos"
      className="mx-auto flex max-w-[1160px] scroll-mt-20 flex-col gap-24 px-4 py-24 sm:px-6"
    >
      <SectionTitle kicker="Recursos" title="Tudo o que pesa no seu mês, no lugar certo" />
      <Feature
        icon={<CreditCard className="size-5" />}
        title="Cartão de crédito sem surpresa"
        text="Informe o dia de fechamento e o de vencimento. Cada compra entra na fatura certa, parcelas aparecem nos meses seguintes e você vê o limite usado de verdade."
        bullets={[
          "Faturas aberta, fechada, paga e vencida",
          "Parcelado com o valor certo em cada mês",
          "Pagamento da fatura sai da conta",
        ]}
        visual={<StatementMock />}
      />
      <Feature
        reverse
        icon={<Gauge className="size-5" />}
        title="Ritmo de gastos e limite do mês"
        text="Compare o que você já gastou com o mês passado até o mesmo dia. Defina um limite e o Miu diz quanto ainda dá para gastar por dia."
        bullets={[
          "Verde, amarelo ou vermelho, sem planilha",
          "Sugestão de limite pela sua média",
          "Resumo do mês em poucas telas",
        ]}
        visual={<PaceMock />}
      />
      <Feature
        icon={<CalendarClock className="size-5" />}
        title="Previsto x realizado"
        text="Salário, aluguel e assinaturas entram como previstos. O saldo do fim do mês já desconta o que vai acontecer, e você confirma com um toque quando acontece."
        bullets={[
          "Contas fixas e assinaturas em um lugar",
          "Compromissos do ano: parcelas e contas fixas",
          "Pausar uma assinatura mostra quanto economiza",
        ]}
        visual={<ProjectionMock />}
      />
      <div className="grid gap-5 md:grid-cols-3">
        <SmallFeature
          icon={<PiggyBank className="size-5" />}
          title="Orçamentos por categoria"
          text="Limite por categoria, aviso perto de estourar e quanto dá por dia até o fim do mês."
        />
        <SmallFeature
          icon={<FileUp className="size-5" />}
          title="Importação de extrato"
          text="OFX ou CSV, com categorias sugeridas e sem duplicar o que já entrou. Dá para desfazer."
        />
        <SmallFeature
          icon={<Target className="size-5" />}
          title="Metas"
          text="Viagem, reserva, carro: quanto falta e quanto guardar por mês para chegar na data."
        />
      </div>
    </section>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mx-auto max-w-[680px] text-center">
      <p className="text-sm font-semibold text-primary">{kicker}</p>
      <h2 className="mt-3 text-[32px] font-semibold leading-tight tracking-[-0.035em] sm:text-[44px]">
        {title}
      </h2>
    </div>
  );
}

function Feature({
  icon,
  title,
  text,
  bullets,
  visual,
  reverse,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  bullets: string[];
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
      <div className={reverse ? "md:order-2" : ""}>
        <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-primary">{icon}</span>
        <h3 className="mt-5 text-[28px] font-semibold leading-tight tracking-[-0.03em]">{title}</h3>
        <p className="mt-4 text-[17px] text-muted">{text}</p>
        <ul className="mt-6 flex flex-col gap-3">
          {bullets.map((b) => (
            <li key={b} className="flex items-center gap-3 text-[15px] text-fg-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-on-primary">
                <Check className="size-3" strokeWidth={3} aria-hidden />
              </span>
              {b}
            </li>
          ))}
        </ul>
      </div>
      <div className={`rounded-[28px] bg-bg p-6 sm:p-10 ${reverse ? "md:order-1" : ""}`} aria-hidden>
        <div className="mx-auto max-w-[420px]">{visual}</div>
      </div>
    </div>
  );
}

function SmallFeature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-[22px] bg-bg p-6">
      <span className="grid size-10 place-items-center rounded-xl bg-surface text-primary shadow-card">
        {icon}
      </span>
      <h3 className="mt-4 text-lg font-semibold tracking-[-0.02em]">{title}</h3>
      <p className="mt-2 text-[15px] text-muted">{text}</p>
    </div>
  );
}

/* ---------- como funciona ---------- */

function HowItWorks() {
  const steps = [
    [
      "Cadastre suas contas e cartões",
      "Informe o saldo de hoje e os dias de fechamento e vencimento dos cartões.",
    ],
    ["Lance ou importe", "Lançamento rápido em segundos (atalho N) ou importe o extrato do banco."],
    ["Acompanhe o mês", "Veja o previsto, o ritmo de gastos e quanto vai sobrar, todo dia."],
  ];
  return (
    <section id="como-funciona" className="scroll-mt-20 bg-bg">
      <div className="mx-auto max-w-[1160px] px-4 py-24 sm:px-6">
        <SectionTitle kicker="Como funciona" title="Comece em poucos minutos" />
        <ol className="mt-14 grid gap-5 md:grid-cols-3">
          {steps.map(([title, text], i) => (
            <li key={title} className="rounded-[22px] bg-surface p-6 shadow-card">
              <span className="num grid size-10 place-items-center rounded-full bg-primary text-lg font-semibold text-on-primary">
                {i + 1}
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-[-0.02em]">{title}</h3>
              <p className="mt-2 text-[15px] text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- segurança ---------- */

function Security() {
  const items: [ReactNode, string, string][] = [
    [
      <Wallet key="w" className="size-5" />,
      "Sem conectar banco",
      "Você decide o que entra. Nenhuma senha de banco passa pelo Miu.",
    ],
    [
      <Lock key="l" className="size-5" />,
      "Dados isolados",
      "Cada conta só enxerga os próprios dados, verificado em testes automáticos.",
    ],
    [
      <KeyRound key="k" className="size-5" />,
      "Sessão segura",
      "Confirmação de e-mail, senha com hash forte e sair dos outros aparelhos na hora.",
    ],
    [
      <Download key="d" className="size-5" />,
      "Exporte quando quiser",
      "Baixe todos os seus lançamentos em CSV, a qualquer momento.",
    ],
    [
      <Trash2 key="t" className="size-5" />,
      "Exclua tudo",
      "Excluir a conta apaga seus dados de verdade, como manda a LGPD.",
    ],
    [
      <ShieldCheck key="s" className="size-5" />,
      "Modo privacidade",
      "Um toque esconde os valores da tela para usar em público.",
    ],
  ];
  return (
    <section id="seguranca" className="mx-auto max-w-[1160px] scroll-mt-20 px-4 py-24 sm:px-6">
      <SectionTitle kicker="Segurança" title="Seu dinheiro é assunto seu" />
      <div className="mt-14 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([icon, title, text]) => (
          <div key={title} className="flex gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-primary">
              {icon}
            </span>
            <div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-[15px] text-muted">{text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- dúvidas ---------- */

function Faq() {
  const qs = [
    [
      "Preciso conectar minha conta do banco?",
      "Não. Você lança ou importa o extrato (OFX ou CSV). Nada de senha de banco.",
    ],
    [
      "Como o Miu sabe em qual fatura cai uma compra?",
      "Pelo dia de fechamento do cartão. Compras a partir desse dia vão para a fatura do mês seguinte, e parcelas seguem mês a mês.",
    ],
    [
      "O que é previsto?",
      "É o que ainda vai acontecer: salário, aluguel, assinaturas. Entra na previsão do fim do mês, mas só mexe no saldo quando você confirma.",
    ],
    ["Funciona no celular?", "Sim. Abra no navegador do celular e use a opção de instalar na tela inicial."],
    [
      "Posso levar meus dados embora?",
      "Sim. Em Configurações você exporta tudo em CSV e pode excluir a conta, apagando seus dados.",
    ],
  ];
  return (
    <section id="duvidas" className="scroll-mt-20 bg-bg">
      <div className="mx-auto max-w-[760px] px-4 py-24 sm:px-6">
        <SectionTitle kicker="Dúvidas" title="Perguntas frequentes" />
        <div className="mt-12 flex flex-col gap-3">
          {qs.map(([q, a]) => (
            <details key={q} className="group rounded-[18px] bg-surface px-5 py-4 shadow-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {q}
                <span className="text-xl text-muted transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 text-[15px] text-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- chamada final ---------- */

function FinalCta() {
  return (
    <section className="mx-auto max-w-[1160px] px-4 py-24 sm:px-6">
      <div className="relative overflow-hidden rounded-[32px] bg-primary px-6 py-16 text-center text-on-primary sm:px-12">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgba(255,255,255,.18),transparent)]"
          aria-hidden
        />
        <h2 className="relative text-[32px] font-semibold leading-tight tracking-[-0.035em] sm:text-[44px]">
          Comece hoje e veja o fim do mês antes dele chegar
        </h2>
        <p className="relative mx-auto mt-4 max-w-[520px] text-lg opacity-85">
          Leva poucos minutos para cadastrar suas contas e cartões.
        </p>
        <Link
          to="/cadastro"
          className="relative mt-8 inline-flex h-12 items-center gap-2 rounded-control bg-surface px-6 text-base font-medium text-fg hover:bg-surface-2"
        >
          Criar conta grátis <ArrowRight className="size-[18px]" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
