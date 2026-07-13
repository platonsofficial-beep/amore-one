import { describe, expect, it } from 'vitest'
import { formatTodayAnnouncementsCollapsedSummary } from './todayAnnouncementsPresentationUtils'
import {
  getDefaultTodayPanelExpanded,
  readTodayPanelExpanded,
  TODAY_PANEL_IDS,
  writeTodayPanelExpanded,
} from './todayPanelCollapse'

describe('todayAnnouncementsPresentationUtils', () => {
  it('formats collapsed summaries from existing announcement data only', () => {
    expect(formatTodayAnnouncementsCollapsedSummary([])).toBe('No announcements')
    expect(formatTodayAnnouncementsCollapsedSummary([
      { id: '1', isRead: true },
    ])).toBe('1 announcement')
    expect(formatTodayAnnouncementsCollapsedSummary([
      { id: '1', isRead: true },
      { id: '2', isRead: true },
    ])).toBe('2 announcements')
    expect(formatTodayAnnouncementsCollapsedSummary([
      { id: '1', isRead: false },
      { id: '2', isRead: true },
    ])).toBe('1 unread announcement')
  })
})

describe('todayPanelCollapse announcements', () => {
  it('defaults announcements to expanded without a saved preference', () => {
    expect(getDefaultTodayPanelExpanded(TODAY_PANEL_IDS.ANNOUNCEMENTS)).toBe(true)
  })

  it('persists announcements panel state in local storage', () => {
    const storage = new Map()
    const originalWindow = globalThis.window

    globalThis.window = {
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
    }

    try {
      writeTodayPanelExpanded(TODAY_PANEL_IDS.ANNOUNCEMENTS, false)
      expect(readTodayPanelExpanded(TODAY_PANEL_IDS.ANNOUNCEMENTS, true)).toBe(false)

      writeTodayPanelExpanded(TODAY_PANEL_IDS.ANNOUNCEMENTS, true)
      expect(readTodayPanelExpanded(TODAY_PANEL_IDS.ANNOUNCEMENTS, false)).toBe(true)
    } finally {
      globalThis.window = originalWindow
    }
  })
})
