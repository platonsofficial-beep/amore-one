import { useCallback, useEffect, useState } from 'react'
import { inboxUnreadTotal } from '../../lib/chat'
import { fetchChatInbox, fetchChatHides, subscribeToChatInbox } from '../../services/chatService'
import { applyChatHides } from '../../lib/chatHide'
import { createCoalescedRefresh } from '../../lib/coalescedRefresh'
import { t } from '../../i18n/i18n'

export const INBOX_REFRESH_WAIT_MS = 3000

export function useChatInbox({ workspaceId = '', memberId = '', enabled = false } = {}) {
  const [rows, setRows] = useState([])
  const [hides, setHides] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
      setRows(visible)
      setError('')
      return visible
    } catch (err) {
      setError(err?.message || t("Unable to load chats."))
      return []
    } finally {
      setLoading(false)
    }
  }, [enabled, memberId, workspaceId])

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

  return {
    rows,
    hides,
    unread: inboxUnreadTotal(rows),
    loading,
    error,
    refresh,
  }
}
