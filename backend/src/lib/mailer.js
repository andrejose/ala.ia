import nodemailer from "nodemailer";
import { env } from "../config/env.js";

// Envio de e-mail por SMTP. Sem SMTP configurado, enabled() é falso e o app
// segue sem e-mail (o convite continua aparecendo para a pessoa no Ala.ia).
let transport;

function getTransport() {
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // 465 é SMTP com TLS direto; nas outras portas, STARTTLS
    secure: env.SMTP_PORT === 465,
    ...(env.SMTP_USER && { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } }),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return transport;
}

export const mailer = {
  enabled() {
    return Boolean(env.SMTP_HOST && env.MAIL_FROM && env.APP_URL);
  },
  appUrl() {
    return env.APP_URL?.replace(/\/+$/, "");
  },
  // message: { to, subject, text, html }
  async send(message) {
    await getTransport().sendMail({ from: env.MAIL_FROM, ...message });
  },
};
