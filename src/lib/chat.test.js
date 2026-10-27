import { describe, expect, it } from 'vitest'
import {
  buildChatAttachmentPath,
  canDeleteChatMessage,
  canEditChatMessage,
  chatErrorMessage,
  chatIdentityHints,
  conversationTitle,
  dayLabel,
  groupReactions,
  inboxUnreadTotal,
  isChatNotification,
  lastMessagePreview,
  lastMessageTimeLabel,
  muteUntilValue,
  orderInbox,
  seenByLabels,
  seenByText,
  seenReceiptText,
} from './chat'

const inbox = [
  { conversation_id: 'g1', kind: 'group', last_message_at: '2026-10-27T09:00:00Z', unread: 2, muted: false },
  { conversation_id: 't1', kind: 'team', name: 'Team', last_message_at: '2026-10-26T09:00:00Z', unread: 4, muted: false },
  { conversation_id: 'd1', kind: 'direct', other_member_id: 'm2', last_message_at: '2026-10-27T12:00:00Z', unread: 3, muted: true },
]

describe('chat helpers', () => {
  it('pins Team first and skips muted chats in the nav badge', () => {
    expect(orderInbox(inbox).map((row) => row.conversation_id)).toEqual(['t1', 'd1', 'g1'])
    expect(inboxUnreadTotal(inbox)).toBe(6)
  })

  it('names a direct chat after the other person', () => {
    expect(conversationTitle(inbox[2], { m2: { name: 'Alex' } })).toBe('Alex')
    expect(conversationTitle(inbox[1])).toBe('Team')
  })

  it('allows an edit for 15 minutes and a delete for the author or a manager', () => {
    const created = '2026-10-27T10:00:00.000Z'
    const message = { author_member_id: 'me', created_at: created, deleted_at: null }
    const now = Date.parse('2026-10-27T10:14:00.000Z')
    expect(canEditChatMessage(message, 'me', now)).toBe(true)
    expect(canEditChatMessage(message, 'me', Date.parse('2026-10-27T10:16:00.000Z'))).toBe(false)
    expect(canEditChatMessage(message, 'other', now)).toBe(false)
    expect(canDeleteChatMessage(message, 'me', false)).toBe(true)
    expect(canDeleteChatMessage(message, 'other', true)).toBe(true)
    expect(canDeleteChatMessage({ ...message, deleted_at: created }, 'me', true)).toBe(false)
  })

  it('lists who has seen a message and groups reactions', () => {
    const message = { author_member_id: 'me', created_at: '2026-10-27T10:00:00Z' }
    const people = [
      { member_id: 'me', last_read_at: '2026-10-27T11:00:00Z' },
      { member_id: 'm2', last_read_at: '2026-10-27T11:00:00Z' },
      { member_id: 'm3', last_read_at: '2026-10-27T09:00:00Z' },
      { member_id: 'm4', last_read_at: '2026-10-27T12:00:00Z', left_at: '2026-10-27T12:30:00Z' },
    ]
    expect(seenByLabels(people, message, { m2: { name: 'Alex' } })).toEqual(['Alex'])
    expect(seenByText(people, message, { m2: { name: 'Alex' } })).toBe('Seen by Alex')
    expect(seenByText(people, message, {})).toBe('Seen by 1')
    const many = [
      { member_id: 'm2', last_read_at: '2026-10-27T11:00:00Z' },
      { member_id: 'm3', last_read_at: '2026-10-27T11:00:00Z' },
      { member_id: 'm5', last_read_at: '2026-10-27T11:00:00Z' },
    ]
    expect(seenByText(many, message, {
      m2: { name: 'Alex' },
      m3: { name: 'TEST GrokBot' },
      m5: { name: 'Sam' },
    })).toBe('Seen by 3')
    expect(groupReactions([
      { emoji: '👍', member_id: 'me' },
      { emoji: '👍', member_id: 'm2' },
    ], 'me')).toEqual([{ emoji: '👍', count: 2, mine: true }])
  })

  it('marks an older direct message seen when the other person opened the chat later', () => {
    const messages = [
      { id: 'older', author_member_id: 'owner', created_at: '2026-10-27 15:47:56.240279+00' },
      { id: 'reply', author_member_id: 'test', created_at: '2026-10-27T15:49:14.761089+00:00' },
    ]
    const people = [
      { member_id: 'owner', last_read_at: '2026-10-27T16:54:56.505372+00:00' },
      { member_id: 'test', last_read_at: '2026-10-27T16:54:22.657562+00:00' },
    ]
    const names = { test: { name: 'one-test' } }
    expect(seenByText(people, messages[0], names)).toBe('Seen by one-test')
    expect(seenReceiptText(messages, 0, 'owner', people, names)).toBe('Seen by one-test')
    expect(seenReceiptText(messages, 1, 'owner', people, names)).toBe('')
  })

  it('builds mute times, photo paths, day labels and plain errors', () => {
    const now = new Date('2026-10-27T10:00:00Z')
    expect(muteUntilValue('off', now)).toBeNull()
    expect(muteUntilValue('always', now)).toBe('infinity')
    expect(muteUntilValue('1h', now)).toBe('2026-10-27T11:00:00.000Z')
    expect(buildChatAttachmentPath('ws', 'conv', 'file')).toBe('ws/conv/file.jpg')
    expect(dayLabel('2026-10-27T08:00:00', now)).toBe('Today')
    expect(dayLabel('2026-10-26T08:00:00', now)).toBe('Yesterday')
    expect(chatErrorMessage({ message: 'announcement_only' })).toBe('Only managers can post in this channel.')
    expect(isChatNotification({ type: 'chat_direct' })).toBe(true)
    expect(isChatNotification({ type: 'task_assigned' })).toBe(false)
    expect(lastMessagePreview({ last_body: 'Got it' })).toBe('Got it')
    expect(lastMessagePreview({ last_body: null, last_message_at: '2026-10-27T12:00:00Z' })).toBe('📷 Photo')
    expect(lastMessagePreview({ last_body: '  ', last_message_at: null })).toBe('No messages yet')
    expect(lastMessageTimeLabel('2026-10-27T12:05:00Z', new Date('2026-10-27T12:05:00Z'))).toMatch(/^\d{2}:\d{2}$/)
    expect(lastMessageTimeLabel('2026-10-26T12:05:00Z', new Date('2026-10-27T12:05:00Z'))).toBe('26 Oct')
    expect(conversationTitle(
      { kind: 'direct', conversation_id: 'd1', other_member_id: 'm9' },
      {},
      { d1: 'TEST GrokBot' },
    )).toBe('TEST GrokBot')
    expect(chatIdentityHints([
      { type: 'chat_direct', title: 'Platon', data: { conversation_id: 'd1' } },
      { type: 'chat_message', body: 'Platon: 📷 Photo', data: { message_id: 'm1' } },
      { type: 'chat_message', body: 'Someone: Hi', data: { message_id: 'm2' } },
    ])).toEqual({
      byConversation: { d1: 'Platon' },
      byMessage: { m1: 'Platon' },
    })
  })
})
