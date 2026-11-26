import type { Bindings } from "../env";

export type Email = { to: string; subject: string; html: string; text: string };

export interface Mailer {
  send(email: Email): Promise<void>;
}

/** Sem provedor configurado: escreve no log (o link aparece no terminal do `pnpm dev`). */
export const consoleMailer: Mailer = {
  async send(email) {
    console.log(`\n[email] para: ${email.to}\n[email] assunto: ${email.subject}\n${email.text}\n`);
  },
};

function resendMailer(apiKey: string, from: string): Mailer {
  return {
    async send(email) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to: email.to,
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      });
      if (!res.ok) throw new Error(`Resend respondeu ${res.status}: ${await res.text()}`);
    },
  };
}

export function mailerFor(env: Bindings): Mailer {
  if (env.RESEND_API_KEY) {
    return resendMailer(
      env.RESEND_API_KEY,
      env.EMAIL_FROM ?? "Miu Controle <nao-responda@miucontrole.com.br>",
    );
  }
  return consoleMailer;
}
