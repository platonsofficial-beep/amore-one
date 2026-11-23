import { canonicalPublicAppUrl } from '../src/lib/publicAppUrl.js'
import { buildWorkspaceInviteEmail, workspaceInviteUrl } from '../src/lib/workspaceInviteEmail.js'

const FROM_FALLBACK = 'ONE <no-reply@onehospitality.app>'

function serviceHeaders(extra = {}) {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

function supabaseBase() {
  return `${process.env.SUPABASE_URL ?? ''}`.replace(/\/$/, '')
}

async function readCaller(jwt) {
  const base = supabaseBase()
  if (!base || !process.env.SUPABASE_SERVICE_ROLE_KEY || !jwt) return null
  const response = await fetch(`${base}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${jwt}`,
    },
  })
  if (!response.ok) return null
  const user = await response.json()
  return `${user?.id ?? ''}`.trim() || null
}

async function readInvite(inviteId, userId) {
  const base = supabaseBase()
  const url = new URL(`${base}/rest/v1/workspace_invites`)
  url.searchParams.set('id', `eq.${inviteId}`)
  url.searchParams.set('invited_by', `eq.${userId}`)
  url.searchParams.set('select', 'id,email,role,token,expires_at,accepted_at,revoked_at,workspace_id,employee_id')
  const response = await fetch(url, { headers: serviceHeaders() })
  if (!response.ok) return null
  const rows = await response.json()
  return Array.isArray(rows) ? rows[0] : null
}

async function readVenueName(workspaceId) {
  const base = supabaseBase()
  const url = new URL(`${base}/rest/v1/workspace_profiles`)
  url.searchParams.set('workspace_id', `eq.${workspaceId}`)
  url.searchParams.set('select', 'business_name')
  url.searchParams.set('order', 'updated_at.desc')
  url.searchParams.set('limit', '1')
  const response = await fetch(url, { headers: serviceHeaders() })
  if (response.ok) {
    const rows = await response.json()
    const business = `${rows?.[0]?.business_name ?? ''}`.trim()
    if (business) return business
  }
  return readName('workspaces', workspaceId, 'name')
}

async function readName(table, id, column) {
  const base = supabaseBase()
  const url = new URL(`${base}/rest/v1/${table}`)
  url.searchParams.set('id', `eq.${id}`)
  url.searchParams.set('select', column)
  const response = await fetch(url, { headers: serviceHeaders() })
  if (!response.ok) return ''
  const rows = await response.json()
  return `${rows?.[0]?.[column] ?? ''}`.trim()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed.' })
    return
  }
  const header = `${req.headers?.authorization ?? req.headers?.Authorization ?? ''}`
  const jwt = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const inviteId = `${req.body?.inviteId ?? ''}`.trim()
  if (!jwt || !inviteId) {
    res.status(401).json({ ok: false, message: 'Sign in again, then send the invite.' })
    return
  }
  const key = process.env.RESEND_API_KEY
  const from = `${process.env.ONLINE_BOOKING_FROM_EMAIL ?? ''}`.trim() || FROM_FALLBACK
  if (!key || !supabaseBase() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    res.status(503).json({ ok: false, message: 'Invite email is not configured.' })
    return
  }
  try {
    const userId = await readCaller(jwt)
    if (!userId) {
      res.status(401).json({ ok: false, message: 'Sign in again, then send the invite.' })
      return
    }
    const invite = await readInvite(inviteId, userId)
    if (!invite?.token || !`${invite.email ?? ''}`.trim()) {
      res.status(404).json({ ok: false, message: 'This invite cannot be emailed.' })
      return
    }
    if (invite.accepted_at || invite.revoked_at || new Date(invite.expires_at).getTime() <= Date.now()) {
      res.status(409).json({ ok: false, message: 'This invite is no longer active.' })
      return
    }
    const [venueName, employeeName] = await Promise.all([
      readVenueName(invite.workspace_id),
      readName('employees', invite.employee_id, 'full_name'),
    ])
    const mail = buildWorkspaceInviteEmail({
      venueName,
      employeeName,
      role: invite.role,
      email: invite.email,
      expiresAt: invite.expires_at,
      inviteUrl: workspaceInviteUrl(invite.token, canonicalPublicAppUrl()),
    })
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [`${invite.email}`.trim()],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    })
    if (!response.ok) {
      res.status(503).json({ ok: false, message: 'The invite email could not be sent.' })
      return
    }
    res.status(200).json({ ok: true })
  } catch {
    res.status(503).json({ ok: false, message: 'The invite email could not be sent.' })
  }
}
