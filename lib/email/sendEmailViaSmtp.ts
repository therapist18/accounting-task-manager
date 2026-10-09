// Server-only SMTP sender — the same transport and SMTP_* settings kra-tools uses
// (kra-tools/lib/email/sendEmailViaSmtp.ts), so client emails from the task manager come from the
// same Booksmart mailbox. Never import from a "use client" file.
import nodemailer from "nodemailer"

export interface SmtpEmailOptions {
  to: string[]
  subject: string
  html: string
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>
}

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
  if (transporter) return transporter
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    throw new Error("Email is not configured. Set SMTP_USER and SMTP_PASSWORD.")
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number.parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    tls: { rejectUnauthorized: false },
  })
  return transporter
}

export async function sendEmailViaSmtp(options: SmtpEmailOptions) {
  const from = process.env.SMTP_FROM || `Booksmart Consultancy <${process.env.SMTP_USER}>`
  const result = await getTransporter().sendMail({
    from,
    to: options.to.join(", "),
    subject: options.subject,
    html: options.html,
    attachments: options.attachments,
  })
  return { messageId: result.messageId }
}
