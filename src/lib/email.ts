import "server-only";

export type Email = { to: string; subject: string; html: string; text: string; replyTo?: string };

/**
 * Sends a transactional email through Resend's HTTP API.
 * Without RESEND_API_KEY (local development) the email is printed to the console.
 */
export async function sendEmail(mail: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Cape Avra <hello@capeavra.com>";
  if (!key) {
    console.info(`[email] (not sent, RESEND_API_KEY missing)\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text, reply_to: mail.replyTo }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Minimal branded HTML wrapper (inline styles for email clients). */
export function emailLayout(
  title: string,
  rows: [string, string][],
  intro?: string,
  extra?: { outro?: string; cta?: { label: string; url: string }; note?: string },
): { html: string; text: string } {
  const htmlRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 16px 8px 0;color:#4a524f;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:8px 0;color:#1d2220">${esc(v).replace(/\n/g, "<br>")}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f6f2ea;font-family:Georgia,serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f2ea;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;padding:32px">
<tr><td style="letter-spacing:0.3em;font-size:14px;color:#1f4d55">CAPE AVRA</td></tr>
<tr><td style="padding-top:20px;font-size:22px;color:#1f4d55">${esc(title)}</td></tr>
${intro ? `<tr><td style="padding-top:12px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1d2220">${esc(intro).replace(/\n/g, "<br>")}</td></tr>` : ""}
<tr><td style="padding-top:20px"><table role="presentation" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${htmlRows}</table></td></tr>
${extra?.cta ? `<tr><td style="padding-top:24px"><a href="${esc(extra.cta.url)}" style="display:inline-block;background:#1f4d55;color:#f6f2ea;font-family:Arial,sans-serif;font-size:13px;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none;padding:14px 24px">${esc(extra.cta.label)}</a></td></tr>` : ""}
${extra?.outro ? `<tr><td style="padding-top:24px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1d2220">${esc(extra.outro).replace(/\n/g, "<br>")}</td></tr>` : ""}
${extra?.note ? `<tr><td style="padding-top:16px;font-family:Arial,sans-serif;font-size:13px;color:#9a4a2a">${esc(extra.note)}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
  const text = [
    title,
    intro ?? "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    extra?.cta ? `${extra.cta.label}: ${extra.cta.url}` : "",
    extra?.outro ?? "",
    extra?.note ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { html, text };
}
