import "server-only";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { env } from "../env";

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  /** When set, the attachment is inline and referenced as <img src="cid:..."> */
  cid?: string;
};

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
};

async function sendWithResend(mail: Mail) {
  if (!env.resendApiKey) throw new Error("RESEND_API_KEY is not set");
  const { error } = await new Resend(env.resendApiKey).emails.send({
    from: env.emailFrom,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    attachments: mail.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
      contentId: a.cid,
    })),
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}

/** Zoho Mail (smtp.zoho.in / smtp.zoho.com) or any other SMTP server. */
async function sendWithSmtp(mail: Mail) {
  const { host, port, user, password } = env.smtp;
  if (!host || !user || !password) throw new Error("SMTP settings are incomplete");
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: password },
  });
  await transport.sendMail({
    from: env.emailFrom,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    attachments: mail.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
      cid: a.cid,
    })),
  });
}

export async function sendMail(mail: Mail) {
  switch (env.emailProvider) {
    case "resend":
      return sendWithResend(mail);
    case "smtp":
      return sendWithSmtp(mail);
    default:
      console.log(
        `[mail:console] to=${mail.to} subject="${mail.subject}" attachments=${
          mail.attachments?.map((a) => a.filename).join(", ") ?? "none"
        }\n${mail.text}`,
      );
  }
}
