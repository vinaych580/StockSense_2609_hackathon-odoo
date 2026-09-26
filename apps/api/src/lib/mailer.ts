/**
 * Outgoing email over SMTP (Mailpit locally: http://localhost:8025). If the SMTP server isn't
 * reachable (the embedded-Postgres setup runs no Mailpit), the message is printed to the API log
 * instead, so an OTP code is never lost in development. Tests swap the transport for an outbox.
 */
import nodemailer from 'nodemailer';
import { logger } from './logger';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

type Sender = (mail: Mail) => Promise<void>;

const FROM = process.env.MAIL_FROM ?? 'StockSense <no-reply@stocksense.local>';

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'localhost',
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: false,
  connectionTimeout: 3_000,
  greetingTimeout: 3_000,
});

const smtp: Sender = async (mail) => {
  try {
    await transport.sendMail({ from: FROM, ...mail });
  } catch (err) {
    if (process.env.NODE_ENV === 'production') throw err;
    logger.warn({ err: (err as Error).message, to: mail.to, subject: mail.subject, text: mail.text }, 'SMTP unreachable; email printed here instead');
  }
};

let sender: Sender = smtp;

export function sendMail(mail: Mail): Promise<void> {
  return sender(mail);
}

/** Tests: capture mail in memory. Pass nothing to restore SMTP. */
export function setMailSender(next?: Sender): void {
  sender = next ?? smtp;
}
