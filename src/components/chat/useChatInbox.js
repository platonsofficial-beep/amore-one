import { useCallback, useEffect, useRef, useState } from 'react'
import { inboxUnreadTotal } from '../../lib/chat'
import { fetchChatInbox, fetchChatHides, markChatRead, subscribeToChatInbox } from '../../services/chatService'
import { applyChatHides } from '../../lib/chatHide'
import { createCoalescedRefresh } from '../../lib/coalescedRefresh'
import { t } from '../../i18n/i18n'

export const INBOX_REFRESH_WAIT_MS = 3000
const LAST_UNREAD_KEY = 'one.chat.lastUnread'

function readLastUnread() {
  try {
    const value = Number(sessionStorage.getItem(LAST_UNREAD_KEY))
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}

function writeLastUnread(value) {
  try {
    sessionStorage.setItem(LAST_UNREAD_KEY, String(Math.max(0, Number(value) || 0)))
  } catch {
    // The in-memory count still drives this visit.
  }
}

export function useChatInbox({ workspaceId = '', memberId = '', enabled = false } = {}) {
  const [rows, setRows] = useState([])
  const [hides, setHides] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastUnread, setLastUnread] = useState(readLastUnread)
  const rowsRef = useRef(rows)
  rowsRef.current = rows

  const refresh = useCallback(async () => {
    if (!enabled || !workspaceId) {
      setRows([])
      setHides([])
      setError('')
      return []
    }
    setLoading(true)
    try {
      const [next, stored] = await Promise.all([
        fetchChatInbox(workspaceId),
        fetchChatHides(memberId).catch(() => []),
      ])
      setHides(stored)
      const visible = applyChatHides(next, stored)
      const unread = inboxUnreadTotal(visible)
      setRows(visible)
      setLastUnread(unread)
      writeLastUnread(unread)
      setError('')
      return visible
    } catch (err) {
      // Keep the last list. A failed refresh must not look like an empty inbox.
      setError(err?.message || t("Unable to load chats."))
      return rowsRef.current
    } finally {
      setLoading(false)
    }
  }, [enabled, memberId, workspaceId])

  const markConversationRead = useCallback(async (conversationId) => {
    const id = `${conversationId ?? ''}`.trim()
    if (!id) return
    const next = rowsRef.current.map((row) => (
      row.conversation_id === id ? { ...row, unread: 0 } : row
    ))
    const unread = inboxUnreadTotal(next)
    setRows(next)
    setLastUnread(unread)
    writeLastUnread(unread)
    try {
      await markChatRead(id)
      await refresh()
    } catch {
      // The row stays read for this visit. The next successful load tells the truth.
    }
  }, [refresh])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!enabled || !memberId || !workspaceId) return undefined
    // One inbox reload per burst of messages (max every 3s), none while hidden.
    const coalesced = createCoalescedRefresh(() => { refresh() }, { waitMs: INBOX_REFRESH_WAIT_MS })
    const unsubscribe = subscribeToChatInbox(memberId, workspaceId, () => coalesced.trigger())
    return () => {
      coalesced.cancel()
      unsubscribe()
    }
  }, [enabled, memberId, refresh, workspaceId])

  const liveUnread = inboxUnreadTotal(rows)
  const unread = error && rows.length === 0 ? lastUnread : liveUnread

  return {
    rows,
    hides,
    unread,
    loading,
    error,
    refresh,
    markConversationRead,
  }
}
