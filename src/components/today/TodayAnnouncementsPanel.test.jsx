/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { TodayAnnouncementsPanel } from './TodayAnnouncementsPanel'
import { TODAY_PANEL_IDS } from '../../lib/todayPanelCollapse'

const ANNOUNCEMENTS = [
  {
    id: 'a1',
    title: 'Prep reminder',
    message: 'Review the lunch briefing before service starts.',
    priority: 'normal',
    isRead: false,
    createdAt: '2026-07-13T09:00:00.000Z',
    authorName: 'Manager',
  },
]

function renderAnnouncementsPanel(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(TodayAnnouncementsPanel, {
      announcements: ANNOUNCEMENTS,
      role: 'manager',
      onMarkSeen: vi.fn(),
      collapsible: true,
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

describe('TodayAnnouncementsPanel collapse', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('is expanded by default with no saved preference', () => {
    const { container, unmount } = renderAnnouncementsPanel()
    const section = container.querySelector('#today-announcements')

    expect(section?.className).toContain('is-expanded')
    expect(container.querySelector('.today-announcement-card')).not.toBeNull()
    expect(container.querySelector('.today-collapsible-summary')).toBeNull()

    unmount()
  })

  it('collapses and expands from the section header', () => {
    const { container, unmount } = renderAnnouncementsPanel()
    const header = container.querySelector('.today-collapsible-header')

    act(() => {
      header?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('#today-announcements')?.className).toContain('is-collapsed')
    expect(container.querySelector('.today-collapsible-summary')?.textContent).toBe('1 unread announcement')

    act(() => {
      header?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('#today-announcements')?.className).toContain('is-expanded')
    expect(container.querySelector('.today-announcement-card')).not.toBeNull()

    unmount()
  })

  it('restores saved collapsed state after remount', () => {
    const first = renderAnnouncementsPanel()
    act(() => {
      first.container.querySelector('.today-collapsible-header')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    first.unmount()

    const restored = renderAnnouncementsPanel()
    expect(restored.container.querySelector('#today-announcements')?.className).toContain('is-collapsed')
    expect(restored.container.querySelector('.today-collapsible-summary')?.textContent)
      .toBe('1 unread announcement')
    restored.unmount()
  })

  it('shows empty summaries in collapsed and expanded modes', () => {
    const { container, unmount } = renderAnnouncementsPanel({ announcements: [] })
    const header = container.querySelector('.today-collapsible-header')

    act(() => {
      header?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('.today-collapsible-summary')?.textContent).toBe('No announcements')

    act(() => {
      header?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('.today-empty-note')?.textContent).toBe('No announcements right now.')
    unmount()
  })

  it('keeps show more and seen actions working when expanded', () => {
    const onMarkSeen = vi.fn()
    const longMessage = `${'A'.repeat(140)} service note`
    const { container, unmount } = renderAnnouncementsPanel({
      onMarkSeen,
      announcements: [{
        ...ANNOUNCEMENTS[0],
        message: longMessage,
      }],
    })

    const moreButton = container.querySelector('.today-announcement-more-btn')
    act(() => {
      moreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('.today-announcement-card')?.className).toContain('is-expanded')

    const seenButton = container.querySelector('.today-announcement-seen-btn')
    act(() => {
      seenButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onMarkSeen).toHaveBeenCalledTimes(1)

    unmount()
  })

  it('does not persist collapse state when collapsible mode is disabled', () => {
    const { container, unmount } = renderAnnouncementsPanel({ collapsible: false })
    expect(container.querySelector('.today-collapsible-header')).toBeNull()
    expect(window.localStorage.getItem('one.today.panels.v1') ?? '').not.toContain(TODAY_PANEL_IDS.ANNOUNCEMENTS)
    unmount()
  })
})
