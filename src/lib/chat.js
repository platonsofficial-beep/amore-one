export const CHAT_EMOJIS = ['👍', '❤️', '😂', '✅', '👀', '🙏']
export const CHAT_COMPOSER_EMOJIS = [
  '😀', '😁', '😂', '😊', '😍', '😘', '😎', '🤔', '😴', '👍',
  '👏', '🙏', '❤️', '🔥', '✅', '🎉', '⭐', '😢', '😡', '👀',
]
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

export function conversationTitle(row, membersById = {}, aliases = {}) {
  if (!row) return 'Chat'
  if (row.kind === 'team') return row.name || 'Team'
  if (row.kind === 'direct') {
    const other = membersById[row.other_member_id]
    return other?.name
      || aliases[row.other_member_id]
      || aliases[row.conversation_id]
      || 'Direct message'
  }
  return row.name || 'Group'
}

export function lastMessagePreview(row) {
  const body = `${row?.last_body ?? ''}`.trim()
  if (body) return body
  if (row?.last_message_at) return '📷 Photo'
  return 'No messages yet'
}

export function lastMessageTimeLabel(iso, now = new Date()) {
  const date = new Date(iso)
  if (!iso || Number.isNaN(date.getTime())) return ''
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (date.toDateString() === now.toDateString()) return time
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function chatIdentityHints(rows) {
  const byConversation = {}
  const byMessage = {}
  for (const row of rows ?? []) {
    const type = `${row?.type ?? ''}`
    const data = row?.data && typeof row.data === 'object' ? row.data : {}
    const conversationId = `${data.conversation_id ?? ''}`.trim()
    const messageId = `${data.message_id ?? ''}`.trim()
    if (type === 'chat_direct') {
      const name = `${row?.title ?? ''}`.trim()
      if (conversationId && name && name !== 'Someone' && name !== 'Direct message') {
        byConversation[conversationId] = name
      }
    }
    if (type === 'chat_message') {
      const match = `${row?.body ?? ''}`.match(/^([^:]{1,80}):\s/)
      const name = `${match?.[1] ?? ''}`.trim()
      if (messageId && name && name !== 'Someone') byMessage[messageId] = name
    }
  }
  return { byConversation, byMessage }
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
  if (`${message.author_member_id ?? ''}` === `${memberId ?? ''}`) return true
  // chat_delete_message allows another person's message only when
  // can_manage_workspace_chat is true (chat manage permission).
  return canManage === true
}

function readInstant(value) {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function seenReaders(participants, message) {
  const created = readInstant(message?.created_at)
  if (created == null) return []
  return (participants ?? [])
    .filter((participant) => !participant?.left_at)
    .filter((participant) => `${participant?.member_id ?? ''}` !== `${message.author_member_id ?? ''}`)
    .filter((participant) => {
      const readAt = readInstant(participant?.last_read_at)
      return readAt != null && readAt >= created
    })
}

export function seenReceiptText(messages, index, memberId, participants, membersById = {}, aliases = {}) {
  const message = messages?.[index]
  if (!message || message.deleted_at) return ''
  if (`${message.author_member_id ?? ''}` !== `${memberId ?? ''}`) return ''
  const text = seenByText(participants, message, membersById, aliases)
  if (!text) return ''
  for (let later = index + 1; later < messages.length; later += 1) {
    const next = messages[later]
    if (`${next?.author_member_id ?? ''}` !== `${memberId ?? ''}` || next?.deleted_at) continue
    if (seenByText(participants, next, membersById, aliases)) return ''
  }
  return text
}

export function seenByLabels(participants, message, membersById = {}, aliases = {}) {
  return seenReaders(participants, message).map((participant) => (
    membersById[participant.member_id]?.name || aliases[participant.member_id] || ''
  )).filter((name) => name && name !== 'Someone')
}

export function seenByText(participants, message, membersById = {}, aliases = {}) {
  const readers = seenReaders(participants, message)
  if (readers.length === 0) return ''
  const names = readers.map((participant) => (
    membersById[participant.member_id]?.name || aliases[participant.member_id] || ''
  )).filter((name) => name && name !== 'Someone')
  if (names.length === readers.length && names.length <= 2) return `Seen by ${names.join(', ')}`
  return `Seen by ${readers.length}`
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

export function shouldUseWideChatLayout(width = 0, height = 0) {
  if (width >= 980) return true
  return width > height && width >= 700
}

export function filterInboxByName(rows, query, membersById = {}, aliases = {}) {
  const needle = `${query ?? ''}`.trim().toLowerCase()
  if (!needle) return rows ?? []
  return (rows ?? []).filter((row) => conversationTitle(row, membersById, aliases).toLowerCase().includes(needle))
}

export function messageGroupPosition(messages, index) {
  const current = messages?.[index]
  if (!current) return 'single'
  const sameRun = (left, right) => {
    if (!left || !right || left.deleted_at || right.deleted_at) return false
    if (`${left.author_member_id ?? ''}` !== `${right.author_member_id ?? ''}`) return false
    if (dayLabel(left.created_at) !== dayLabel(right.created_at)) return false
    const gap = Math.abs(Date.parse(left.created_at) - Date.parse(right.created_at))
    return Number.isFinite(gap) && gap <= 5 * 60 * 1000
  }
  const withPrevious = sameRun(messages[index - 1], current)
  const withNext = sameRun(current, messages[index + 1])
  if (withPrevious && withNext) return 'middle'
  if (withPrevious) return 'last'
  if (withNext) return 'first'
  return 'single'
}

export function readTickState(message, memberId, participants) {
  if (!message || message.deleted_at) return ''
  if (`${message.author_member_id ?? ''}` !== `${memberId ?? ''}`) return ''
  return seenByText(participants, message) ? 'read' : 'sent'
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
