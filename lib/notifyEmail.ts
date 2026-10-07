import nodemailer from 'nodemailer'

// Customer-facing emails: payment decisions and bill reminders. Same dark PKC
// look as the verification codes, and narrow enough for a 360px phone.

function transport() {
  const port = Number(process.env.SMTP_PORT || 465)
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
}

export async function sendMail(opts: { to: string; subject: string; text: string; html: string }) {
  await transport().sendMail({
    from: process.env.SMTP_FROM || `PKC BIZOFT <${process.env.SMTP_USER}>`,
    ...opts,
  })
}

function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function peso(value: unknown) {
  const n = Number(value || 0)
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function row(label: string, value: string) {
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid #17475c;font-size:13px;color:#8fa8b8;width:42%">${esc(label)}</td>
    <td style="padding:9px 0;border-bottom:1px solid #17475c;font-size:14px;color:#eaf7ff;font-weight:600;text-align:right">${esc(value)}</td>
  </tr>`
}

function shell(opts: { badge: string; badgeColor: string; title: string; intro: string; rows?: string[][]; note?: string; noteTone?: 'good' | 'warn' | 'bad' }) {
  const tones = {
    good: { bg: '#082a1f', border: '#115b49', text: '#9be8c8' },
    warn: { bg: '#2a1a10', border: '#6b3f1d', text: '#f3c9a0' },
    bad: { bg: '#2b101a', border: '#5e1f31', text: '#ffb4c2' },
  }
  const tone = tones[opts.noteTone || 'warn']
  const rows = (opts.rows || []).map(([l, v]) => row(l, v)).join('')

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#030b11">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#030b11;padding:24px 10px">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#071a24;border:1px solid #17475c;border-radius:18px;overflow:hidden;font-family:Segoe UI,Arial,sans-serif">
      <tr><td style="height:5px;background:linear-gradient(90deg,#17c3e8,#0b86b5,#5fe5ff);font-size:0;line-height:0">&nbsp;</td></tr>
      <tr><td style="padding:26px 20px 6px">
        <div style="font-size:13px;font-weight:700;letter-spacing:3px;color:#5fe5ff">PKC <span style="color:#ffffff">BIZOFT</span></div>
      </td></tr>
      <tr><td style="padding:14px 20px 0">
        <span style="display:inline-block;padding:5px 12px;border-radius:999px;background:${opts.badgeColor}22;border:1px solid ${opts.badgeColor};font-size:11px;font-weight:700;letter-spacing:1px;color:${opts.badgeColor}">${esc(opts.badge)}</span>
        <h1 style="margin:12px 0 0;font-size:23px;line-height:1.3;color:#ffffff;font-weight:700">${esc(opts.title)}</h1>
        <p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:#9db9c6">${opts.intro}</p>
      </td></tr>
      ${rows ? `<tr><td style="padding:18px 20px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>` : ''}
      ${opts.note ? `<tr><td style="padding:20px 20px 0"><div style="padding:14px 16px;border-radius:12px;background:${tone.bg};border:1px solid ${tone.border};font-size:13px;line-height:1.55;color:${tone.text}">${opts.note}</div></td></tr>` : ''}
      <tr><td style="padding:24px 20px 26px">
        <div style="border-top:1px solid #17475c;padding-top:16px;font-size:12px;color:#5d7684;line-height:1.6">
          This is an automated message from PKC BIZOFT. Please do not reply to this email.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

export async function sendApprovedEmail(to: string, d: { name?: string | null; amount: unknown; plan?: string | null; reference?: string | null; receipt?: string | null; newCustomer: boolean }) {
  const first = (d.name || 'there').split(' ')[0]
  const note = d.newCustomer
    ? 'Next step: a PKC technician will be assigned to <strong>install your connection</strong>. You can follow it in the app under Repair status. We will tell you who is coming.'
    : 'Your plan is now set up. You can see it in the app under Payment.'
  await sendMail({
    to,
    subject: `Payment verified - ${peso(d.amount)}`,
    text: `Hi ${first}, your payment of ${peso(d.amount)} for ${d.plan || 'your plan'} was verified (receipt ${d.receipt || '-'}).`,
    html: shell({
      badge: 'PAYMENT VERIFIED',
      badgeColor: '#34d399',
      title: 'Your payment is verified',
      intro: `Hi ${esc(first)}, Accounting checked your payment and it is confirmed. Thank you!`,
      rows: [
        ['Amount', peso(d.amount)],
        ['Plan', d.plan || '-'],
        ['Reference no.', d.reference || '-'],
        ['Receipt no.', d.receipt || '-'],
      ],
      note,
      noteTone: 'good',
    }),
  })
}

export async function sendRejectedEmail(to: string, d: { name?: string | null; amount: unknown; plan?: string | null; reference?: string | null; reason: string; note?: string | null }) {
  const first = (d.name || 'there').split(' ')[0]
  await sendMail({
    to,
    subject: 'Your payment was not accepted',
    text: `Hi ${first}, we could not accept your payment of ${peso(d.amount)}. Reason: ${d.reason}${d.note ? ` - ${d.note}` : ''}. Please submit it again in the app.`,
    html: shell({
      badge: 'NOT ACCEPTED',
      badgeColor: '#fb7185',
      title: 'We could not accept your payment',
      intro: `Hi ${esc(first)}, Accounting could not verify this payment.`,
      rows: [
        ['Amount', peso(d.amount)],
        ['Plan', d.plan || '-'],
        ['Reference no.', d.reference || '-'],
        ['Reason', d.reason],
      ],
      note: `${d.note ? `<strong>Note from Accounting:</strong> ${esc(d.note)}<br><br>` : ''}What to do: open the app, go to <strong>Payment</strong> and apply for your plan again with the correct amount, reference number and a clear receipt.`,
      noteTone: 'bad',
    }),
  })
}

const REMINDERS: Record<string, { badge: string; color: string; title: string; tone: 'good' | 'warn' | 'bad'; note: string }> = {
  due5: { badge: 'DUE SOON', color: '#fbbf24', title: 'Your bill is due in 5 days', tone: 'warn', note: 'Pay in the app under <strong>Payment</strong> to avoid any interruption.' },
  due0: { badge: 'DUE TODAY', color: '#fbbf24', title: 'Your bill is due today', tone: 'warn', note: 'Please pay today in the app under <strong>Payment</strong>.' },
  late1: { badge: 'OVERDUE', color: '#fb7185', title: 'Your bill is overdue', tone: 'bad', note: 'Your bill was due yesterday. Please pay as soon as you can in the app under <strong>Payment</strong>.' },
  late7: { badge: 'FINAL NOTICE', color: '#fb7185', title: 'Your bill is 7 days overdue', tone: 'bad', note: 'Your account may be disconnected if this stays unpaid. Please pay now in the app under <strong>Payment</strong>, or contact us if you already did.' },
}

export async function sendReminderEmail(to: string, kind: string, d: { name?: string | null; amount: unknown; due: string | null; ref?: string | null }) {
  const cfg = REMINDERS[kind]
  if (!cfg) return
  const first = (d.name || 'there').split(' ')[0]
  const dueText = d.due ? new Date(`${d.due}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : '-'
  await sendMail({
    to,
    subject: `${cfg.title} - ${peso(d.amount)}`,
    text: `Hi ${first}, ${cfg.title.toLowerCase()}. Amount ${peso(d.amount)}, due ${dueText}.`,
    html: shell({
      badge: cfg.badge,
      badgeColor: cfg.color,
      title: cfg.title,
      intro: `Hi ${esc(first)}, here is a reminder about your PKC internet bill.`,
      rows: [
        ['Amount due', peso(d.amount)],
        ['Due date', dueText],
        ['Bill no.', d.ref || '-'],
      ],
      note: cfg.note,
      noteTone: cfg.tone,
    }),
  })
}
