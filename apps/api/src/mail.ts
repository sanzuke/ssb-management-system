import nodemailer from "nodemailer";
import type { Env } from "./env";

export type Mail = { to: string; subject: string; text: string };
/** Pengirim email. `null` berarti pengiriman email tidak diaktifkan di server ini. */
export type Mailer = { send(mail: Mail): Promise<void> };

/** Pengirim lewat SMTP, aktif hanya bila SMTP_URL diisi (mis. smtps://user:sandi@smtp.contoh.id:465). */
export function createMailer(env: Pick<Env, "SMTP_URL" | "MAIL_FROM">): Mailer | null {
  if (!env.SMTP_URL) return null;
  const transport = nodemailer.createTransport(env.SMTP_URL);
  const from = env.MAIL_FROM ?? "SSB App <no-reply@localhost>";
  return {
    async send(mail) {
      await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text });
    },
  };
}
