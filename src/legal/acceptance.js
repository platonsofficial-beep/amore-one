import { LEGAL_BUNDLE, requiresDpa } from './provider'

export const ACCEPTANCE_STORAGE_KEY = 'one.legalAcceptance.v1'
export const PENDING_SIGNUP_KEY = 'one.legalAcceptance.pendingSignup'

export function isMissingLegalTable(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || code === 'PGRST205'
    || message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('could not find the table')
    || message.includes('legal_acceptances')
}

export function isCurrentAcceptance(record, { userId, role, bundleId = LEGAL_BUNDLE.id } = {}) {
  if (!record) return false
  if (`${record.userId ?? ''}` !== `${userId ?? ''}`) return false
  if (`${record.bundleId ?? ''}` !== `${bundleId ?? ''}`) return false
  if (requiresDpa(role) && record.includesDpa !== true) return false
  return true
}

function readList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function readLocalAcceptances() {
  return readList(ACCEPTANCE_STORAGE_KEY)
}

export function writeLocalAcceptance(record) {
  const next = readLocalAcceptances().filter((item) => !(
    item.userId === record.userId && item.bundleId === record.bundleId
  ))
  next.push(record)
  try {
    localStorage.setItem(ACCEPTANCE_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Private mode still keeps the in-memory gate closed for this visit via the caller.
  }
  return record
}

export function readPendingSignup() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_SIGNUP_KEY) || 'null')
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function writePendingSignup(record) {
  try {
    localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(record))
  } catch {
    // The signed-in gate still asks if this cannot be stored.
  }
}

export function clearPendingSignup() {
  try {
    localStorage.removeItem(PENDING_SIGNUP_KEY)
  } catch {
    // Ignore.
  }
}

export function buildAcceptanceRecord({
  userId,
  workspaceId = null,
  email = '',
  role = '',
  locale = 'en',
  userAgent = '',
  acceptedAt = new Date().toISOString(),
} = {}) {
  return {
    userId,
    workspaceId: workspaceId || null,
    email,
    role,
    bundleId: LEGAL_BUNDLE.id,
    documentVersions: { ...LEGAL_BUNDLE.documents },
    includesDpa: requiresDpa(role),
    acceptedAt,
    locale,
    userAgent,
  }
}

function mapRow(row) {
  return {
    userId: row.user_id,
    workspaceId: row.workspace_id || null,
    bundleId: row.bundle_id,
    documentVersions: row.document_versions || {},
    includesDpa: row.includes_dpa === true,
    acceptedAt: row.accepted_at,
    locale: row.locale || '',
    userAgent: row.user_agent || '',
  }
}

async function readRemote(client, userId) {
  if (!client?.from) return { rows: [], missing: true }
  const { data, error } = await client
    .from('legal_acceptances')
    .select('user_id, workspace_id, bundle_id, document_versions, includes_dpa, accepted_at, locale, user_agent')
    .eq('user_id', userId)
  if (error) return { rows: [], missing: isMissingLegalTable(error), error }
  return { rows: data || [], missing: false }
}

export async function loadAcceptance({ userId, workspaceId, email, role, client } = {}) {
  const local = readLocalAcceptances().find((item) => isCurrentAcceptance(item, { userId, role }))
  if (local) return { accepted: true, source: 'local', record: local }

  const pending = readPendingSignup()
  if (pending && pending.email && email && pending.email === email && pending.bundleId === LEGAL_BUNDLE.id) {
    const record = buildAcceptanceRecord({
      userId,
      workspaceId,
      email,
      role,
      locale: pending.locale,
      userAgent: pending.userAgent,
      acceptedAt: pending.acceptedAt,
    })
    writeLocalAcceptance(record)
    clearPendingSignup()
    await saveAcceptance(record, client)
    return { accepted: true, source: 'signup', record }
  }

  const remote = await readRemote(client, userId)
  if (remote.missing) return { accepted: false, source: 'no-table' }
  const match = remote.rows.map(mapRow).find((item) => isCurrentAcceptance(item, { userId, role }))
  if (match) {
    writeLocalAcceptance(match)
    return { accepted: true, source: 'remote', record: match }
  }
  return { accepted: false, source: remote.error ? 'error' : 'none' }
}

export async function saveAcceptance(record, client) {
  writeLocalAcceptance(record)
  if (!client?.from) return { stored: 'local', missing: true }
  const { error } = await client.from('legal_acceptances').insert([{
    user_id: record.userId,
    workspace_id: record.workspaceId,
    bundle_id: record.bundleId,
    document_versions: record.documentVersions,
    includes_dpa: record.includesDpa,
    accepted_at: record.acceptedAt,
    locale: record.locale,
    user_agent: record.userAgent,
  }])
  if (error && isMissingLegalTable(error)) return { stored: 'local', missing: true }
  if (error) return { stored: 'local', missing: false, error }
  return { stored: 'remote', missing: false }
}
