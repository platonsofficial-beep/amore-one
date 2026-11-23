import { canonicalPublicAppUrl } from './publicAppUrl.js'

const ROLE_LABELS = {
  owner: 'Owner',
  general_manager: 'General manager',
  manager: 'Manager',
  host: 'Host',
  staff: 'Staff',
}

function escapeHtml(value) {
  return `${value ?? ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
  const venue = escapeHtml(venueName || 'your venue')
  const person = escapeHtml(employeeName)
  const roleLabel = escapeHtml(ROLE_LABELS[role] || 'Staff')
  const address = escapeHtml(email)
  const link = escapeHtml(inviteUrl)
  let expires = ''
  const expiry = new Date(expiresAt)
  if (!Number.isNaN(expiry.getTime())) {
    expires = escapeHtml(expiry.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }))
  }
  const subject = `You're invited to ${venueName || 'ONE'}`
  const brand = 'ONE'
  const heading = `You're invited to ${venue}`
  const intro = `${person ? `${person}, you` : 'You'} are invited to join ${venue} on ONE as ${roleLabel}${address ? ` (${address})` : ''}.`
  const button = 'Accept invite'
  const fallback = 'Or open this link:'
  const expiryLine = expires ? `This invite expires on ${expires}.` : ''
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#0a1628;color:#f7f4ee;font-family:Inter, Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1628;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:480px;background:#122033;border-radius:16px;padding:28px 24px;">
          <tr><td>
            <p style="margin:0 0 8px;color:#f3d27a;letter-spacing:0.14em;font-size:12px;">${brand}</p>
            <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;">${heading}</h1>
            <p style="margin:0 0 18px;color:#a9c0d6;font-size:15px;line-height:1.5;">${intro}</p>
            <p style="margin:0 0 18px;"><a href="${link}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#d4af37;color:#0a1628;font-weight:700;text-decoration:none;">${button}</a></p>
            <p style="margin:0;color:#a9c0d6;font-size:13px;line-height:1.5;">${fallback}<br><a href="${link}" style="color:#f3d27a;">${link}</a>${expiryLine ? `<br>${expiryLine}` : ''}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
  return { subject, html }
}
