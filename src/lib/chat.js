export const CHAT_EMOJIS = ['👍', '❤️', '😂', '✅', '👀', '🙏']
export const CHAT_EDIT_WINDOW_MS = 15 * 60 * 1000
export const CHAT_BODY_LIMIT = 4000
export const CHAT_ATTACHMENT_BUCKET = 'chat-attachments'
export const CHAT_SIGNED_URL_SECONDS = 3600

export function isChatNotificationType(type) {
  return `${type ?? ''}`.startsWith('chat_')
}

export function isChatNotification(row) {
  return isChatNotificationType(row?.type)
}

export function inboxUnreadTotal(rows) {
  return (rows ?? []).reduce((sum, row) => {
    if (row?.muted) return sum
    const unread = Number(row?.unread) || 0
    return sum + Math.max(0, unread)
  }, 0)
}

export function orderInbox(rows) {
  const team = []
  const rest = []
  for (const row of rows ?? []) {
    if (row?.kind === 'team') team.push(row)
    else rest.push(row)
  }
  rest.sort((left, right) => `${right?.last_message_at ?? ''}`.localeCompare(`${left?.last_message_at ?? ''}`))
  return [...team, ...rest]
}

export function conversationTitle(row, membersById = {}) {
  if (!row) return 'Chat'
  if (row.kind === 'team') return row.name || 'Team'
  if (row.kind === 'direct') {
    const other = membersById[row.other_member_id]
    return other?.name || 'Direct message'
  }
  return row.name || 'Group'
}

export function lastMessagePreview(row) {
  const body = `${row?.last_body ?? ''}`.trim()
  return body || 'No messages yet'
}

export function canEditChatMessage(message, memberId, now = Date.now()) {
  if (!message || message.deleted_at) return false
  if (`${message.author_member_id ?? ''}` !== `${memberId ?? ''}`) return false
  const created = new Date(message.created_at).getTime()
  if (!Number.isFinite(created)) return false
  return now - created <= CHAT_EDIT_WINDOW_MS
}

export function canDeleteChatMessage(message, memberId, canManage) {
  if (!message || message.deleted_at) return false
  if (canManage) return true
  return `${message.author_member_id ?? ''}` === `${memberId ?? ''}`
}

export function seenByLabels(participants, message, membersById = {}) {
  if (!message?.created_at) return []
  return (participants ?? [])
    .filter((participant) => !participant?.left_at)
    .filter((participant) => `${participant?.member_id ?? ''}` !== `${message.author_member_id ?? ''}`)
    .filter((participant) => participant?.last_read_at && participant.last_read_at >= message.created_at)
    .map((participant) => membersById[participant.member_id]?.name || 'Someone')
}

export function groupReactions(rows, memberId) {
  const grouped = new Map()
  for (const row of rows ?? []) {
    const emoji = `${row?.emoji ?? ''}`
    if (!emoji) continue
    const current = grouped.get(emoji) || { emoji, count: 0, mine: false }
    current.count += 1
    if (`${row.member_id ?? ''}` === `${memberId ?? ''}`) current.mine = true
    grouped.set(emoji, current)
  }
  return [...grouped.values()]
}

export function dayLabel(iso, now = new Date()) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const that = new Date(date)
  that.setHours(0, 0, 0, 0)
  const diff = Math.round((start.getTime() - that.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function muteUntilValue(choice, now = new Date()) {
  if (choice === 'off' || choice == null || choice === '') return null
  if (choice === 'always') return 'infinity'
  const base = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (choice === '1h') return new Date(base + 60 * 60 * 1000).toISOString()
  if (choice === '8h') return new Date(base + 8 * 60 * 60 * 1000).toISOString()
  if (choice === 'tomorrow') {
    const next = new Date(base)
    next.setHours(24, 0, 0, 0)
    return next.toISOString()
  }
  return null
}

export function buildChatAttachmentPath(workspaceId, conversationId, fileId = '') {
  const id = `${fileId ?? ''}`.trim() || (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`)
  return `${workspaceId}/${conversationId}/${id}.jpg`
}

export function clipChatBody(value) {
  return `${value ?? ''}`.slice(0, CHAT_BODY_LIMIT)
}

export function chatErrorMessage(error) {
  const raw = `${error?.message || error?.details || error || ''}`.toLowerCase()
  if (raw.includes('announcement_only')) return 'Only managers can post in this channel.'
  if (raw.includes('not_allowed')) return 'You cannot do that in this chat.'
  if (raw.includes('bad_attachment_path')) return 'That photo could not be sent.'
  if (raw.includes('photo is still too large')) return 'That photo is still too large. Try another one.'
  return 'Something went wrong. Try again.'
}
