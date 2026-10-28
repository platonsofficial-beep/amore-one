import { describe, expect, it } from 'vitest'
import {
  firstUnreadMessageId,
  isHistoryPrepend,
  planChatScrollPosition,
  planChatScrollUpdate,
  preservedScrollTop,
  shouldShowChatScrollButton,
} from './chatScroll'

const older = { id: 'a', author_member_id: 'alex', created_at: '2026-10-27T09:00:00Z' }
const newer = { id: 'b', author_member_id: 'alex', created_at: '2026-10-27T10:00:00Z' }
const mine = { id: 'c', author_member_id: 'me', created_at: '2026-10-27T11:00:00Z' }

describe('chat scroll', () => {
  it('follows the bottom inside 120px and holds history above that', () => {
    expect(planChatScrollPosition({ distance: 120, clientHeight: 700, pendingCount: 2 }).stick).toBe(true)
    expect(planChatScrollPosition({ distance: 121, clientHeight: 700, pendingCount: 2 })).toMatchObject({
      stick: false,
      pendingCount: 2,
      showButton: true,
    })
  })

  it('shows the button with no badge once the reader is more than a screen up', () => {
    expect(shouldShowChatScrollButton({ distance: 400, clientHeight: 700, pendingCount: 0 })).toBe(false)
    expect(shouldShowChatScrollButton({ distance: 701, clientHeight: 700, pendingCount: 0 })).toBe(true)
  })

  it('smooth-scrolls a new message only while pinned', () => {
    expect(planChatScrollUpdate({
      stick: true,
      previousIds: ['a'],
      nextIds: ['a', 'b'],
    })).toMatchObject({ action: 'bottom-smooth', pendingCount: 0, showButton: false })

    expect(planChatScrollUpdate({
      stick: false,
      pendingCount: 0,
      previousIds: ['a'],
      nextIds: ['a', 'b'],
      distance: 240,
      clientHeight: 700,
    })).toMatchObject({ action: 'hold', pendingCount: 1, showButton: true })
  })

  it('instant-scrolls when a send forces the bottom and resets the badge', () => {
    expect(planChatScrollUpdate({
      forceBottom: true,
      stick: false,
      pendingCount: 4,
      previousIds: ['a'],
      nextIds: ['a', 'b'],
      distance: 900,
      clientHeight: 400,
    })).toMatchObject({ action: 'bottom-instant', pendingCount: 0, showButton: false })
  })

  it('opens on the first unread message, or the bottom when everything is read', () => {
    expect(firstUnreadMessageId([older, newer, mine], {
      memberId: 'me',
      lastReadAt: '2026-10-27T09:30:00Z',
    })).toBe('b')
    expect(planChatScrollUpdate({
      opening: true,
      unreadId: 'b',
    })).toMatchObject({ action: 'unread', unreadId: 'b', pendingCount: 0 })
    expect(firstUnreadMessageId([older, mine], {
      memberId: 'me',
      lastReadAt: '2026-10-27T12:00:00Z',
    })).toBe('')
    expect(planChatScrollUpdate({ opening: true, unreadId: '' }).action).toBe('bottom-instant')
  })

  it('keeps older history from counting as new messages', () => {
    expect(isHistoryPrepend(['b'], ['a', 'b'])).toBe(true)
    expect(planChatScrollUpdate({
      stick: false,
      pendingCount: 0,
      previousIds: ['b'],
      nextIds: ['a', 'b'],
      distance: 800,
      clientHeight: 400,
    })).toMatchObject({ action: 'preserve', pendingCount: 0, showButton: true })
    expect(preservedScrollTop(500, 120, 860)).toBe(480)
  })
})
