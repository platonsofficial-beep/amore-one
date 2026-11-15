const STORAGE_KEY = 'one.chatHides.v1'

export function isMissingChatHideTable(error) {
  const message = `${error?.message ?? ''}`.toLowerCase()
  const code = `${error?.code ?? ''}`
  return code === '42P01'
    || code === 'PGRST205'
    || message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('could not find')
    || message.includes('chat_conversation_hides')
}

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function readLocalChatHides(memberId) {
  const bucket = readAll()[`${memberId ?? ''}`] || {}
  return Object.entries(bucket).map(([conversationId, value]) => ({
    conversationId,
    memberId,
    clearedAt: value?.clearedAt || '',
    hiddenAt: value?.hiddenAt || '',
  }))
}

export function writeLocalChatHide(record) {
  const all = readAll()
  const memberId = `${record.memberId ?? ''}`
  const bucket = { ...(all[memberId] || {}) }
  bucket[record.conversationId] = {
    clearedAt: record.clearedAt,
    hiddenAt: record.hiddenAt,
  }
  all[memberId] = bucket
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // The in-memory list still updates for this visit.
  }
}

export function mergeChatHides(...lists) {
  const map = new Map()
  for (const list of lists) {
    for (const item of list ?? []) {
      const conversationId = `${item.conversationId ?? item.conversation_id ?? ''}`
      if (!conversationId) continue
      const next = {
        conversationId,
        memberId: item.memberId ?? item.member_id ?? '',
        clearedAt: item.clearedAt ?? item.cleared_at ?? '',
        hiddenAt: item.hiddenAt ?? item.hidden_at ?? '',
      }
      const prev = map.get(conversationId)
      if (!prev || `${next.hiddenAt}` > `${prev.hiddenAt}`) map.set(conversationId, next)
    }
  }
  return [...map.values()]
}

export function chatHideFor(hides, conversationId) {
  return (hides ?? []).find((item) => item.conversationId === conversationId) || null
}

/** Hidden until a message newer than hiddenAt arrives. */
export function applyChatHides(rows, hides) {
  const byId = new Map((hides ?? []).map((item) => [item.conversationId, item]))
  return (rows ?? []).filter((row) => {
    const hide = byId.get(row?.conversation_id)
    if (!hide?.hiddenAt) return true
    const last = Date.parse(row?.last_message_at || '')
    const cut = Date.parse(hide.hiddenAt)
    if (!Number.isFinite(last)) return false
    return last > cut
  })
}

export function visibleChatMessages(messages, clearedAt) {
  if (!clearedAt) return messages ?? []
  const cut = Date.parse(clearedAt)
  if (!Number.isFinite(cut)) return messages ?? []
  return (messages ?? []).filter((message) => {
    const created = Date.parse(message?.created_at || '')
    return Number.isFinite(created) && created > cut
  })
}
