import { canonicalPublicAppUrl } from './publicAppUrl.js'

const ROLE_LABELS = {
  owner: 'Owner',
  general_manager: 'General manager',
  manager: 'Manager',
  host: 'Host',
  staff: 'Staff',
}

const PAGE = '#0a1628'
const CARD = '#0f1b2d'
const WHITE = '#ffffff'
const GOLD = '#d4af37'
const GOLD_LIGHT = '#f3d27a'
const INK = '#0a1628'
const MUTED = '#8ea6bf'

function escapeHtml(value) {
  return `${value ?? ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatExpiry(expiresAt) {
  const expiry = new Date(expiresAt)
  if (Number.isNaN(expiry.getTime())) return ''
  return expiry.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Gmail app dark mode inverts background-color but not background-image. */
function solidPaint(color) {
  return `background-color:${color};background-image:linear-gradient(${color},${color});`
}

function goldPaint() {
  return `background-color:${GOLD};background-image:linear-gradient(${GOLD_LIGHT},${GOLD});`
}

/**
 * Gmail inverts text colors after CSS. The screen/difference pair under
 * u + .body undoes that inversion. Other clients ignore those selectors.
 */
function lockedText(content, color) {
  const lock = `color:${color};background-image:linear-gradient(${color},${color});-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;`
  return `<span style="${lock}">${content}</span>`
}

function gmailText(content, color) {
  return `<span class="gmail-blend-screen gmail-screen"><span class="gmail-blend-difference">${lockedText(content, color)}</span></span>`
}

export function workspaceInviteUrl(token, appUrl = canonicalPublicAppUrl()) {
  const base = `${appUrl ?? ''}`.trim().replace(/\/$/, '') || canonicalPublicAppUrl()
  return `${base}/?invite=${encodeURIComponent(`${token ?? ''}`.trim())}`
}

export function buildWorkspaceInviteEmail({
  venueName = '',
  employeeName = '',
  role = 'staff',
  email = '',
  expiresAt = '',
  inviteUrl = '',
} = {}) {
  const venueText = `${venueName ?? ''}`.trim() || 'ONE'
  const roleText = ROLE_LABELS[role] || 'Staff'
  const person = `${employeeName ?? ''}`.trim()
  const address = `${email ?? ''}`.trim()
  const expires = formatExpiry(expiresAt)
  const subject = `You're invited to ${venueText}`
  const headline = `You're invited to ${escapeHtml(venueText)}`
  const roleLine = `Role: ${escapeHtml(roleText)}`
  const button = 'Accept invite'
  const fallbackLabel = 'Or open this link'
  const expiryLine = expires ? `This invite expires on ${escapeHtml(expires)}.` : ''
  const footer = 'ONE · onehospitality.app'
  const link = escapeHtml(inviteUrl)
  const greeting = person
    ? `${escapeHtml(person)}, this invite connects you to ${escapeHtml(venueText)} on ONE.`
    : `This invite connects you to ${escapeHtml(venueText)} on ONE.`
  const sentTo = address ? `Sent to ${escapeHtml(address)}.` : ''
  const pagePaint = solidPaint(PAGE)
  const cardPaint = solidPaint(CARD)
  const rulePaint = solidPaint(GOLD)
  const buttonPaint = goldPaint()

  const textLines = [
    subject,
    '',
    person ? `${person}, this invite connects you to ${venueText} on ONE.` : `This invite connects you to ${venueText} on ONE.`,
    `Role: ${roleText}`,
    address ? `Sent to ${address}.` : '',
    '',
    `${button}:`,
    inviteUrl,
    '',
    expires ? `This invite expires on ${expires}.` : '',
    '',
    footer,
  ]
  const compact = []
  for (const line of textLines) {
    if (line === '' && compact[compact.length - 1] === '') continue
    compact.push(line)
  }
  const text = compact.join('\n')

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(subject)}</title>
  <style>
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body { margin: 0; padding: 0; }
    u + .body .gmail-blend-screen,
    u + .body .gmail-screen { background:#000000; mix-blend-mode:screen; }
    u + .body .gmail-blend-difference { background:#000000; mix-blend-mode:difference; }
    [data-ogsc] .invite-headline { color:${WHITE} !important; }
    [data-ogsc] .invite-role { color:${WHITE} !important; }
    [data-ogsc] .invite-muted { color:${MUTED} !important; }
    [data-ogsc] .invite-btn a { color:${INK} !important; -webkit-text-fill-color:${INK} !important; }
    [data-ogsb] .invite-page,
    [data-ogsb] .invite-card { background-color:${CARD} !important; background-image:linear-gradient(${CARD},${CARD}) !important; }
  </style>
</head>
<body class="body invite-page" bgcolor="${PAGE}" style="margin:0;padding:0;${pagePaint}">
  <table role="presentation" class="invite-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="${pagePaint}margin:0;padding:0;">
    <tr>
      <td align="center" class="invite-page" bgcolor="${PAGE}" style="${pagePaint}padding:28px 16px;">
        <table role="presentation" class="invite-card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" style="max-width:480px;${cardPaint}border-radius:20px;">
          <tr>
            <td align="center" class="invite-card" bgcolor="${CARD}" style="${cardPaint}padding:32px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1;font-weight:700;letter-spacing:0.32em;color:${WHITE};">
              ${gmailText('ONE', WHITE)}
            </td>
          </tr>
          <tr>
            <td align="center" class="invite-card" bgcolor="${CARD}" style="${cardPaint}padding:0 28px 22px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="56" height="2" bgcolor="${GOLD}" style="${rulePaint}font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" class="invite-headline invite-card" bgcolor="${CARD}" style="${cardPaint}padding:0 28px 12px;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.25;font-weight:700;color:${WHITE};">
              ${gmailText(headline, WHITE)}
            </td>
          </tr>
          <tr>
            <td align="center" class="invite-muted invite-card" bgcolor="${CARD}" style="${cardPaint}padding:0 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:${MUTED};">
              ${gmailText(greeting, MUTED)}
            </td>
          </tr>
          <tr>
            <td align="center" class="invite-role invite-card" bgcolor="${CARD}" style="${cardPaint}padding:0 28px 22px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;font-weight:700;color:${WHITE};">
              ${gmailText(roleLine, WHITE)}
            </td>
          </tr>
          <tr>
            <td align="center" class="invite-card" bgcolor="${CARD}" style="${cardPaint}padding:0 28px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" class="invite-btn" bgcolor="${GOLD}" style="border-radius:999px;${buttonPaint}">
                    <a href="${link}" style="display:block;padding:16px 24px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.2;font-weight:700;color:${INK};text-decoration:none;border-radius:999px;${buttonPaint}">${lockedText(button, INK)}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" class="invite-muted invite-card" bgcolor="${CARD}" style="${cardPaint}padding:0 28px 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:${MUTED};">
              ${gmailText(fallbackLabel, MUTED)}
            </td>
          </tr>
          <tr>
            <td align="center" class="invite-muted invite-card" bgcolor="${CARD}" style="${cardPaint}padding:0 28px 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;color:${MUTED};word-break:break-all;">
              <a href="${link}" style="color:${MUTED};-webkit-text-fill-color:${MUTED};text-decoration:underline;">${gmailText(link, MUTED)}</a>
            </td>
          </tr>
          ${expiryLine ? `<tr>
            <td align="center" class="invite-muted invite-card" bgcolor="${CARD}" style="${cardPaint}padding:0 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;color:${MUTED};">
              ${gmailText(expiryLine, MUTED)}
            </td>
          </tr>` : ''}
          ${sentTo ? `<tr>
            <td align="center" class="invite-muted invite-card" bgcolor="${CARD}" style="${cardPaint}padding:0 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:${MUTED};">
              ${gmailText(sentTo, MUTED)}
            </td>
          </tr>` : ''}
          <tr>
            <td align="center" class="invite-muted invite-card" bgcolor="${CARD}" style="${cardPaint}padding:18px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;color:${MUTED};">
              ${gmailText(footer, MUTED)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html, text }
}
