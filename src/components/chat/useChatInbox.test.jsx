/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchChatInbox = vi.fn()
const fetchChatHides = vi.fn(async () => [])
const markChatRead = vi.fn(async () => {})
const subscribeToChatInbox = vi.fn(() => () => {})

vi.mock('../../services/chatService', () => ({
  fetchChatInbox: (...args) => fetchChatInbox(...args),
  fetchChatHides: (...args) => fetchChatHides(...args),
  markChatRead: (...args) => markChatRead(...args),
  subscribeToChatInbox: (...args) => subscribeToChatInbox(...args),
}))

import { useChatInbox } from './useChatInbox'

function Harness({ apiRef }) {
  const api = useChatInbox({ workspaceId: 'ws-1', memberId: 'me', enabled: true })
  apiRef.current = api
  return createElement('div', null, `${api.error}|${api.unread}|${api.rows.map((row) => row.unread).join(',')}`)
}

describe('useChatInbox', () => {
  beforeEach(() => {
    fetchChatInbox.mockReset()
    markChatRead.mockReset()
    markChatRead.mockResolvedValue()
    sessionStorage.clear()
  })

  it('keeps the last list and unread badge when a later load fails', async () => {
    fetchChatInbox.mockResolvedValueOnce([
      { conversation_id: 'team-1', kind: 'team', unread: 1, muted: false },
    ])
    const apiRef = { current: null }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(Harness, { apiRef }))
      await Promise.resolve()
    })
    expect(container.textContent).toContain('|1|1')

    fetchChatInbox.mockRejectedValueOnce(new Error('TypeError: failed to fetch'))
    await act(async () => {
      await apiRef.current.refresh()
    })
    expect(container.textContent).toContain('TypeError: failed to fetch|1|1')
    act(() => root.unmount())
    container.remove()
  })

  it('marks a conversation read immediately and asks the server to persist it', async () => {
    fetchChatInbox
      .mockResolvedValueOnce([{ conversation_id: 'team-1', kind: 'team', unread: 1, muted: false }])
      .mockResolvedValue([{ conversation_id: 'team-1', kind: 'team', unread: 0, muted: false }])
    const apiRef = { current: null }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(Harness, { apiRef }))
      await Promise.resolve()
    })
    await act(async () => {
      await apiRef.current.markConversationRead('team-1')
    })
    expect(markChatRead).toHaveBeenCalledWith('team-1')
    expect(container.textContent).toContain('|0|0')
    act(() => root.unmount())
    container.remove()
  })
})
