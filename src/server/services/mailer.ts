import nodemailer from "nodemailer";
import { config } from "../config";

// A single shared transport. Created lazily so the app boots fine even when
// SMTP isn't configured (local dev), and reused across requests after that.
let transport: nodemailer.Transporter | null = null;

function getTransport() {
  if (!config.smtp.user || !config.smtp.pass) return null;
  transport ??= nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465, // 465 = implicit TLS (Zoho); 587 = STARTTLS
    auth: { user: config.smtp.user, pass: config.smtp.pass }
  });
  return transport;
}

export function mailerConfigured() {
  return Boolean(config.smtp.user && config.smtp.pass);
}

function loginEmailHtml(loginUrl: string, hubName?: string | null) {
  const intro = hubName
    ? `You asked to open your <strong>${escapeHtml(hubName)}</strong> wallet.`
    : `You asked to open your UEN wallet.`;
  return `
  <div style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
      <div style="background:#ffffff;border-radius:16px;padding:36px 32px;border:1px solid #e7e9ee;">
        <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#7c3aed;font-weight:700;">UEN Wallet</div>
        <h1 style="margin:14px 0 8px;font-size:22px;color:#10182b;">Sign in to your wallet</h1>
        <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#4a5160;">
          ${intro} Tap the button below to open it securely. This link works for the next 15 minutes and can only be opened from this email.
        </p>
        <a href="${loginUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:10px;">Open my wallet</a>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#8a909c;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <span style="color:#7c3aed;word-break:break-all;">${loginUrl}</span>
        </p>
        <hr style="border:none;border-top:1px solid #eceef2;margin:26px 0 18px;">
        <p style="margin:0;font-size:12px;line-height:1.5;color:#a2a8b4;">
          You're receiving this because someone entered this email to access a UEN wallet. If that wasn't you, you can safely ignore this message — no one can open your wallet without this link.
        </p>
      </div>
    </div>
  </div>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

// Sends the one-time sign-in link. When SMTP isn't configured, logs the link to
// the server console instead so the flow is still testable in local dev.
export async function sendHolderLoginEmail(to: string, loginUrl: string, hubName?: string | null) {
  const t = getTransport();
  if (!t) {
    console.log(`[mailer] SMTP not configured — sign-in link for ${to}:\n${loginUrl}`);
    return;
  }
  await t.sendMail({
    from: config.smtp.from,
    to,
    subject: "Your UEN wallet sign-in link",
    html: loginEmailHtml(loginUrl, hubName),
    text: `Sign in to your UEN wallet. This link works for 15 minutes:\n\n${loginUrl}\n\nIf you didn't request this, you can ignore this email.`
  });
}
