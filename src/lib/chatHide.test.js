import { describe, expect, it } from 'vitest'
import { applyChatHides, visibleChatMessages } from './chatHide'

const rows = [
  { conversation_id: 'team', kind: 'team', last_message_at: '2026-11-01T10:00:00Z', last_body: 'Hello' },
  { conversation_id: 'dm', kind: 'direct', last_message_at: '2026-11-02T10:00:00Z', last_body: 'Hi' },
]

describe('chat hides', () => {
  it('hides a chat until a newer message arrives', () => {
    const hidden = applyChatHides(rows, [{
      conversationId: 'dm',
      hiddenAt: '2026-11-02T10:00:00Z',
      clearedAt: '2026-11-02T10:00:00Z',
    }])
    expect(hidden.map((row) => row.conversation_id)).toEqual(['team'])
    const back = applyChatHides([
      rows[0],
      { ...rows[1], last_message_at: '2026-11-03T10:00:00Z', last_body: 'New' },
    ], [{ conversationId: 'dm', hiddenAt: '2026-11-02T10:00:00Z', clearedAt: '2026-11-02T10:00:00Z' }])
    expect(back.map((row) => row.conversation_id)).toContain('dm')
  })

  it('shows only messages after the clear time', () => {
    const messages = [
      { id: 'old', created_at: '2026-11-01T10:00:00Z' },
      { id: 'new', created_at: '2026-11-03T10:00:00Z' },
    ]
    expect(visibleChatMessages(messages, '2026-11-02T10:00:00Z').map((item) => item.id)).toEqual(['new'])
  })
})
