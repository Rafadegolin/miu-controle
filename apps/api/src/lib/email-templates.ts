import type { Email } from "./mailer";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch,
  );

/** Layout em tabela com CSS inline: é o que funciona em todos os clientes de e-mail. */
function layout({
  title,
  intro,
  cta,
  url,
  outro,
}: {
  title: string;
  intro: string;
  cta: string;
  url: string;
  outro: string;
}) {
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f7f6;font-family:Arial,Helvetica,sans-serif;color:#0b1412">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f6;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e1e7e4;border-radius:14px">
<tr><td style="padding:28px 28px 8px;font-size:15px;font-weight:bold">Miu Controle</td></tr>
<tr><td style="padding:8px 28px 0;font-size:22px;font-weight:bold;line-height:1.3">${esc(title)}</td></tr>
<tr><td style="padding:12px 28px 0;font-size:15px;line-height:1.6;color:#33413d">${esc(intro)}</td></tr>
<tr><td style="padding:24px 28px"><a href="${esc(url)}" style="display:inline-block;background:#32d6a5;color:#032219;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">${esc(cta)}</a></td></tr>
<tr><td style="padding:0 28px 28px;font-size:13px;line-height:1.6;color:#63716c">${esc(outro)}<br><br>Se o botão não funcionar, copie este link:<br><span style="word-break:break-all">${esc(url)}</span></td></tr>
</table></td></tr></table></body></html>`;
  const text = `${title}\n\n${intro}\n\n${cta}: ${url}\n\n${outro}`;
  return { html, text };
}

export function verifyEmail(to: string, name: string, url: string): Email {
  return {
    to,
    subject: "Confirme seu e-mail no Miu Controle",
    ...layout({
      title: `Olá, ${name.split(" ")[0] || "tudo bem"}! Confirme seu e-mail`,
      intro: "Falta só um passo para começar a usar o Miu Controle.",
      cta: "Confirmar e-mail",
      url,
      outro: "Se você não criou uma conta, ignore este e-mail.",
    }),
  };
}

export function resetPassword(to: string, url: string): Email {
  return {
    to,
    subject: "Redefinir sua senha do Miu Controle",
    ...layout({
      title: "Redefinir senha",
      intro: "Recebemos um pedido para trocar a senha da sua conta. O link vale por 1 hora.",
      cta: "Criar nova senha",
      url,
      outro: "Se não foi você, ignore este e-mail. Sua senha continua a mesma.",
    }),
  };
}
