/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendChatMessage = vi.fn(async () => 'new-id')

vi.mock('../../services/chatService', () => ({
  fetchChatMembers: vi.fn(async () => [
    { id: 'me', name: 'Mina' },
    { id: 'alex', name: 'Alex' },
  ]),
  fetchChatNameHints: vi.fn(async () => []),
  fetchChatMessages: vi.fn(async () => [{
    id: 'm1',
    conversation_id: 'team-1',
    author_member_id: 'alex',
    body: null,
    attachment_path: 'ws/team-1/pic.jpg',
    created_at: '2026-10-27T10:00:00Z',
    deleted_at: '2026-10-27T10:05:00Z',
  }]),
  fetchPinnedChatMessages: vi.fn(async () => []),
  fetchChatParticipants: vi.fn(async () => []),
  fetchChatReactions: vi.fn(async () => []),
  markChatRead: vi.fn(async () => {}),
  sendChatMessage: (...args) => sendChatMessage(...args),
  editChatMessage: vi.fn(),
  deleteChatMessage: vi.fn(),
  setChatPinned: vi.fn(),
  setChatMute: vi.fn(),
  setChatChannelMembers: vi.fn(),
  createChatChannel: vi.fn(),
  getOrCreateDirectChat: vi.fn(),
  addChatReaction: vi.fn(),
  removeChatReaction: vi.fn(),
  uploadChatPhoto: vi.fn(),
  subscribeToChatConversation: vi.fn(() => () => {}),
  chatAttachmentUrl: vi.fn(async () => ''),
}))

import { AvatarDirectoryContext } from '../../context/AvatarDirectoryContext'
import { ChatScreen } from './ChatScreen'

const inbox = [
  { conversation_id: 'direct-1', kind: 'direct', other_member_id: 'alex', last_body: 'Later', last_message_at: '2026-10-27T12:00:00Z', unread: 1 },
  { conversation_id: 'team-1', kind: 'team', name: 'Team', last_body: 'Hello team', last_message_at: '2026-10-26T12:00:00Z', unread: 2 },
]

function renderChat(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(ChatScreen, {
      workspaceId: 'ws-1',
      memberId: 'me',
      inboxRows: inbox,
      layout: 'stack',
      ...props,
    }))
  })
  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('ChatScreen', () => {
  beforeEach(() => {
    sendChatMessage.mockClear()
  })

  it('lists Team above direct chats', async () => {
    const view = renderChat()
    await act(async () => {
      await Promise.resolve()
    })
    const titles = Array.from(view.container.querySelectorAll('.chat-row strong')).map((node) => node.textContent)
    expect(titles[0]).toBe('Team')
    expect(titles).toContain('Alex')
    expect(view.container.textContent).toContain('Hello team')
    view.unmount()
  })

  it('shows Message deleted and does not render the photo', async () => {
    const view = renderChat({ initialConversationId: 'team-1' })
    await act(async () => {
      await Promise.resolve()
    })
    expect(view.container.textContent).toContain('Message deleted')
    expect(view.container.querySelector('.chat-bubble img')).toBeNull()
    view.unmount()
  })

  it('sends the composer text through chat_send_message', async () => {
    const view = renderChat({ initialConversationId: 'team-1' })
    await act(async () => {
      await Promise.resolve()
    })
    const field = view.container.querySelector('textarea')
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    await act(async () => {
      setValue.call(field, 'On my way')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
    })
    expect(sendChatMessage).toHaveBeenCalledWith({
      conversationId: 'team-1',
      body: 'On my way',
      replyToId: null,
    })
    view.unmount()
  })

  it('shows a signed profile photo on the chat list and falls back to initials', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const directory = {
      lookup: ({ memberId }) => (
        memberId === 'alex'
          ? { url: 'https://signed.example/alex.jpg', updatedAt: '9', path: 'user/alex.jpg' }
          : null
      ),
      setOptimistic() {},
      refresh: async () => {},
    }
    act(() => {
      root.render(createElement(AvatarDirectoryContext.Provider, { value: directory },
        createElement(ChatScreen, {
          workspaceId: 'ws-1',
          memberId: 'me',
          inboxRows: inbox,
          layout: 'stack',
        }),
      ))
    })
    await act(async () => {
      await Promise.resolve()
    })

    const rows = [...container.querySelectorAll('.chat-row')]
    const alex = rows.find((row) => row.textContent.includes('Alex'))
    const team = rows.find((row) => row.querySelector('strong')?.textContent === 'Team')
    expect(alex?.querySelector('img')?.getAttribute('src')).toBe('https://signed.example/alex.jpg?v=9')
    expect(team?.querySelector('.chat-avatar')?.textContent).toMatch(/T/)
    expect(team?.querySelector('img')).toBeNull()

    await act(async () => {
      alex.click()
      await Promise.resolve()
    })
    expect(container.querySelector('.chat-avatar-inline img')?.getAttribute('src')).toBe('https://signed.example/alex.jpg?v=9')
    expect(container.querySelector('.chat-bubble img')).toBeNull()
    act(() => root.unmount())
    container.remove()
  })
})
