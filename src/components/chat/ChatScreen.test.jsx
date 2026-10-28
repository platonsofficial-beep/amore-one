/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendChatMessage = vi.fn(async () => 'new-id')
const chatLive = { handlers: null }

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
  subscribeToChatConversation: vi.fn((_id, handlers) => {
    chatLive.handlers = handlers
    return () => {}
  }),
  subscribeToChatTyping: vi.fn(() => ({ setTyping() {}, stop() {} })),
  chatAttachmentUrl: vi.fn(async () => ''),
}))

import { AvatarDirectoryContext } from '../../context/AvatarDirectoryContext'
import { fetchChatMessages, fetchChatParticipants } from '../../services/chatService'
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
    sessionStorage.clear()
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

  it('uses icons for back, mute, and photo in a direct chat', async () => {
    const view = renderChat({ initialConversationId: 'direct-1', layout: 'stack' })
    await act(async () => {
      await Promise.resolve()
    })
    const back = view.container.querySelector('[aria-label="Back"]')
    const mute = view.container.querySelector('[aria-label="Mute"]')
    const photo = view.container.querySelector('[aria-label="Photo"]')
    expect(back?.querySelector('svg')).toBeTruthy()
    expect(back.textContent.trim()).toBe('')
    expect(mute?.querySelector('svg')).toBeTruthy()
    expect(photo?.querySelector('svg')).toBeTruthy()
    expect(photo.textContent.trim()).toBe('')
    expect(view.container.querySelector('.chat-thread-title')?.textContent).toContain('Alex')
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

  it('puts Seen by under an older own bubble after the other person opened the chat', async () => {
    fetchChatMessages.mockResolvedValueOnce([
      {
        id: 'reply',
        author_member_id: 'alex',
        body: 'Private test',
        created_at: '2026-10-27T15:49:14.761089+00:00',
        deleted_at: null,
      },
      {
        id: 'older',
        author_member_id: 'me',
        body: 'Before you opened',
        created_at: '2026-10-27T15:47:56.240279+00:00',
        deleted_at: null,
      },
    ])
    fetchChatParticipants.mockResolvedValueOnce([
      { member_id: 'me', last_read_at: '2026-10-27T16:54:56.505372+00:00' },
      { member_id: 'alex', last_read_at: '2026-10-27T16:54:22.657562+00:00' },
    ])
    const onThreadChange = vi.fn()
    const view = renderChat({ initialConversationId: 'direct-1', onThreadChange })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const seen = view.container.querySelector('.chat-seen')
    expect(seen?.textContent).toBe('Seen by Alex')
    expect(seen?.closest('.chat-bubble')).toBeNull()
    expect(view.container.querySelector('.chat-bubble.is-mine .chat-seen')).toBeNull()
    expect(onThreadChange).toHaveBeenCalledWith(true)
    view.unmount()
    expect(onThreadChange).toHaveBeenCalledWith(false)
  })

  it('hides a direct chat until it has a message', async () => {
    const view = renderChat({
      inboxRows: [
        ...inbox,
        { conversation_id: 'empty-1', kind: 'direct', other_member_id: 'mina', last_body: '', last_message_at: null, unread: 0 },
      ],
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(view.container.querySelectorAll('.chat-row')).toHaveLength(2)
    view.unmount()
  })

  it('filters the list by name', async () => {
    const view = renderChat()
    await act(async () => {
      await Promise.resolve()
    })
    const search = view.container.querySelector('[data-testid="chat-search"]')
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    await act(async () => {
      setValue.call(search, 'Alex')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const titles = [...view.container.querySelectorAll('.chat-row strong')].map((node) => node.textContent)
    expect(titles).toEqual(['Alex'])
    view.unmount()
  })

  it('scrolls with the thread instead of a Latest chip', async () => {
    const scrollTo = vi.fn(function scrollTo(options = {}) {
      this.scrollTop = options.top || 0
      this.dataset.scrollBehavior = options.behavior || 'auto'
    })
    const previousScrollTo = HTMLElement.prototype.scrollTo
    HTMLElement.prototype.scrollTo = scrollTo
    const message = (id, createdAt, body) => ({
      id,
      author_member_id: 'alex',
      body,
      created_at: createdAt,
      deleted_at: null,
    })
    fetchChatMessages.mockResolvedValueOnce([message('m1', '2026-10-27T10:00:00Z', 'Hello')])
    const view = renderChat({ initialConversationId: 'team-1' })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    const scroller = view.container.querySelector('.chat-messages')
    scroller.scrollTo = scrollTo
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 2000 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 400 })

    scroller.scrollTop = 2000 - 400 - 40
    await act(async () => {
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    scrollTo.mockClear()
    fetchChatMessages.mockResolvedValueOnce([
      message('m2', '2026-10-27T10:01:00Z', 'Just in'),
      message('m1', '2026-10-27T10:00:00Z', 'Hello'),
    ])
    await act(async () => {
      chatLive.handlers.onMessage()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(view.container.textContent).toContain('Just in')
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
    expect(view.container.querySelector('[data-testid="chat-scroll-bottom"]')).toBeNull()
    expect(view.container.textContent).not.toContain('Latest')

    scroller.scrollTop = 2000 - 400 - 280
    await act(async () => {
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    scrollTo.mockClear()
    fetchChatMessages.mockResolvedValueOnce([
      message('m3', '2026-10-27T10:02:00Z', 'While you read'),
      message('m2', '2026-10-27T10:01:00Z', 'Just in'),
      message('m1', '2026-10-27T10:00:00Z', 'Hello'),
    ])
    await act(async () => {
      chatLive.handlers.onMessage()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(scrollTo).not.toHaveBeenCalled()
    expect(view.container.querySelector('[data-testid="chat-scroll-badge"]')?.textContent).toBe('1')

    await act(async () => {
      view.container.querySelector('[data-testid="chat-scroll-bottom"]').click()
    })
    expect(view.container.querySelector('[data-testid="chat-scroll-bottom"]')).toBeNull()
    expect(view.container.querySelector('[data-testid="chat-scroll-badge"]')).toBeNull()
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))

    scroller.scrollTop = 2000 - 400 - 20
    await act(async () => {
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    scroller.scrollTop = 2000 - 400 - 900
    await act(async () => {
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    expect(view.container.querySelector('[data-testid="chat-scroll-bottom"]')).toBeTruthy()
    expect(view.container.querySelector('[data-testid="chat-scroll-badge"]')).toBeNull()
    expect(view.container.textContent).not.toContain('Latest')

    const field = view.container.querySelector('textarea')
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    scrollTo.mockClear()
    await act(async () => {
      setValue.call(field, 'On my way')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))
    expect(view.container.querySelector('[data-testid="chat-scroll-bottom"]')).toBeNull()

    HTMLElement.prototype.scrollTo = previousScrollTo
    view.unmount()
  })

  it('opens a chat on the first unread message', async () => {
    const previous = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
      this.dataset.landed = 'unread'
    }
    fetchChatParticipants.mockResolvedValueOnce([
      { member_id: 'me', last_read_at: '2026-10-27T09:00:00Z' },
    ])
    fetchChatMessages.mockResolvedValueOnce([
      { id: 'read', author_member_id: 'alex', body: 'Earlier', created_at: '2026-10-27T08:00:00Z', deleted_at: null },
      { id: 'unread', author_member_id: 'alex', body: 'Since you left', created_at: '2026-10-27T10:00:00Z', deleted_at: null },
    ])
    const view = renderChat({ initialConversationId: 'direct-1' })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(view.container.querySelector('#chat-message-unread')?.dataset.landed).toBe('unread')
    expect(view.container.querySelector('#chat-message-read')?.dataset.landed).toBeUndefined()
    HTMLElement.prototype.scrollIntoView = previous
    view.unmount()
  })

  it('stays pinned when the message log resizes and stays put when reading history', async () => {
    const observers = []
    const previous = globalThis.ResizeObserver
    globalThis.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback
        observers.push(this)
      }
      observe() {}
      disconnect() {}
    }
    fetchChatMessages.mockResolvedValueOnce([
      { id: 'm1', author_member_id: 'alex', body: 'Hello', created_at: '2026-10-27T10:00:00Z', deleted_at: null },
    ])
    const view = renderChat({ initialConversationId: 'team-1' })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    const scroller = view.container.querySelector('.chat-messages')
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 900 })
    scroller.scrollTop = 20
    await act(async () => {
      observers.at(-1)?.callback()
    })
    expect(scroller.scrollTop).toBe(900)

    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 300 })
    scroller.scrollTop = 900 - 300 - 500
    await act(async () => {
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }))
      observers.at(-1)?.callback()
    })
    expect(scroller.scrollTop).toBe(100)
    globalThis.ResizeObserver = previous
    view.unmount()
  })

  it('uses a split layout when asked', () => {
    const view = renderChat({ layout: 'split' })
    expect(view.container.querySelector('.chat-screen')?.classList.contains('is-split')).toBe(true)
    expect(view.container.querySelector('.chat-bubble')?.style.userSelect || getComputedStyle(view.container.querySelector('.chat-bubble') || document.body).userSelect).not.toBe('text')
    view.unmount()
  })
})
