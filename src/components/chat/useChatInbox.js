import { useCallback, useEffect, useState } from 'react'
import { inboxUnreadTotal } from '../../lib/chat'
import { fetchChatInbox, subscribeToChatInbox } from '../../services/chatService'

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
    let timer = 0
    const unsubscribe = subscribeToChatInbox(memberId, workspaceId, () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        refresh()
      }, 500)
    })
    return () => {
      window.clearTimeout(timer)
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
