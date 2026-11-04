import { useCallback, useEffect, useState } from 'react'
import { inboxUnreadTotal } from '../../lib/chat'
import { fetchChatInbox, subscribeToChatInbox } from '../../services/chatService'
import { createCoalescedRefresh } from '../../lib/coalescedRefresh'

export const INBOX_REFRESH_WAIT_MS = 3000

export function useChatInbox({ workspaceId = '', memberId = '', enabled = false } = {}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!enabled || !workspaceId) {
      setRows([])
      setError('')
      return []
    }
    setLoading(true)
    try {
      const next = await fetchChatInbox(workspaceId)
      setRows(next)
      setError('')
      return next
    } catch (err) {
      setError(err?.message || 'Unable to load chats.')
      return []
    } finally {
      setLoading(false)
    }
  }, [enabled, workspaceId])

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
    unread: inboxUnreadTotal(rows),
    loading,
    error,
    refresh,
  }
}
