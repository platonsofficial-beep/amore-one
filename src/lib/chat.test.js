import { describe, expect, it } from 'vitest'
import {
  buildChatAttachmentPath,
  canDeleteChatMessage,
  canEditChatMessage,
  chatErrorMessage,
  conversationTitle,
  dayLabel,
  groupReactions,
  inboxUnreadTotal,
  isChatNotification,
  muteUntilValue,
  orderInbox,
  seenByLabels,
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
    expect(groupReactions([
      { emoji: '👍', member_id: 'me' },
      { emoji: '👍', member_id: 'm2' },
    ], 'me')).toEqual([{ emoji: '👍', count: 2, mine: true }])
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
  })
})
