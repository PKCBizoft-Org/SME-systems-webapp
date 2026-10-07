import nodemailer from 'nodemailer'

// Sends mail through any SMTP account (Gmail app password, Brevo, ...).
// Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (and optionally SMTP_FROM).
export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

export async function sendCodeEmail(to: string, code: string, purpose: 'login' | 'users' | 'signup') {
  const port = Number(process.env.SMTP_PORT || 465)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })

  const reason =
    purpose === 'signup'
      ? 'verify your new PKC BIZOFT account'
      : purpose === 'login'
        ? 'sign in to PKC BIZOFT'
        : 'open User Management in PKC BIZOFT'

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `PKC BIZOFT <${process.env.SMTP_USER}>`,
    to,
    subject: `Your PKC BIZOFT verification code: ${code}`,
    text: `Your verification code is ${code}.\n\nUse it to ${reason}. It expires in 10 minutes. If you did not request this, change your password and tell your administrator.`,
    html: emailHtml(code, reason),
  })
}

// Table-based layout with inline styles so it renders in Gmail, Outlook and phones.
function emailHtml(code: string, reason: string) {
  const digits = code
    .split('')
    .map(
      (digit) =>
        `<td style="width:46px;height:58px;text-align:center;font-size:30px;font-weight:700;color:#e8fbff;background:#0b2230;border:1px solid #1f5a73;border-radius:10px;font-family:'Courier New',monospace">${digit}</td><td style="width:8px"></td>`,
    )
    .join('')

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#030b11">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#030b11;padding:32px 12px">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#071a24;border:1px solid #17475c;border-radius:18px;overflow:hidden;font-family:Segoe UI,Arial,sans-serif">
      <tr><td style="height:5px;background:linear-gradient(90deg,#17c3e8,#0b86b5,#5fe5ff);font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding:28px 32px 6px">
        <div style="font-size:13px;font-weight:700;letter-spacing:3px;color:#5fe5ff">PKC <span style="color:#ffffff">BIZOFT</span></div>
      </td></tr>
      <tr><td style="padding:10px 32px 0">
        <h1 style="margin:0;font-size:24px;line-height:1.3;color:#ffffff;font-weight:700">Your verification code</h1>
        <p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:#9db9c6">Use this code to ${reason}.</p>
      </td></tr>
      <tr><td align="center" style="padding:26px 32px 8px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>${digits}</tr></table>
      </td></tr>
      <tr><td align="center" style="padding:14px 32px 0">
        <span style="display:inline-block;padding:6px 14px;border-radius:999px;background:#0b2230;border:1px solid #1f5a73;font-size:12px;color:#8fd8ea">Expires in 10 minutes &middot; one use only</span>
      </td></tr>
      <tr><td style="padding:26px 32px 0">
        <div style="padding:14px 16px;border-radius:12px;background:#2a1a10;border:1px solid #6b3f1d;font-size:13px;line-height:1.55;color:#f3c9a0">
          <strong style="color:#ffd9b0">Never share this code.</strong> PKC BIZOFT staff will never ask you for it. If you did not try to sign in, change your password and tell your administrator.
        </div>
      </td></tr>
      <tr><td style="padding:24px 32px 28px">
        <div style="border-top:1px solid #17475c;padding-top:16px;font-size:12px;color:#5d7684;line-height:1.6">
          This is an automated security message from PKC BIZOFT. Please do not reply.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}
