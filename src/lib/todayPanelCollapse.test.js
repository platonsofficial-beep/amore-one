import { describe, expect, it } from 'vitest'
import {
  getDefaultTodayPanelExpanded,
  hasTeamTodayShifts,
  hasTodayPanelStoredPreference,
  readTodayPanelExpanded,
  TODAY_PANEL_IDS,
  writeTodayPanelExpanded,
} from './todayPanelCollapse'

describe('todayPanelCollapse team today', () => {
  it('detects whether team today has scheduled shifts from existing group data', () => {
    expect(hasTeamTodayShifts([])).toBe(false)
    expect(hasTeamTodayShifts([{ department: 'Kitchen', members: [] }])).toBe(false)
    expect(hasTeamTodayShifts([
      { department: 'Kitchen', members: [{ name: 'Alex' }] },
    ])).toBe(true)
  })

  it('defaults team today collapsed when no shifts exist and no saved preference', () => {
    expect(getDefaultTodayPanelExpanded(TODAY_PANEL_IDS.TEAM_TODAY, {
      hasShiftsToday: false,
    })).toBe(false)
  })

  it('defaults team today expanded when shifts exist and no saved preference', () => {
    expect(getDefaultTodayPanelExpanded(TODAY_PANEL_IDS.TEAM_TODAY, {
      hasShiftsToday: true,
    })).toBe(true)
  })

  it('restores saved team today preference over automatic defaults', () => {
    const storage = new Map()
    const originalWindow = globalThis.window

    globalThis.window = {
      localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      },
    }

    try {
      writeTodayPanelExpanded(TODAY_PANEL_IDS.TEAM_TODAY, true)
      expect(readTodayPanelExpanded(
        TODAY_PANEL_IDS.TEAM_TODAY,
        getDefaultTodayPanelExpanded(TODAY_PANEL_IDS.TEAM_TODAY, { hasShiftsToday: false }),
      )).toBe(true)
      expect(hasTodayPanelStoredPreference(TODAY_PANEL_IDS.TEAM_TODAY)).toBe(true)

      writeTodayPanelExpanded(TODAY_PANEL_IDS.TEAM_TODAY, false)
      expect(readTodayPanelExpanded(
        TODAY_PANEL_IDS.TEAM_TODAY,
        getDefaultTodayPanelExpanded(TODAY_PANEL_IDS.TEAM_TODAY, { hasShiftsToday: true }),
      )).toBe(false)
    } finally {
      globalThis.window = originalWindow
    }
  })

  it('keeps quick actions default unchanged', () => {
    expect(getDefaultTodayPanelExpanded(TODAY_PANEL_IDS.QUICK_ACTIONS)).toBe(false)
  })

  it('keeps announcements default unchanged', () => {
    expect(getDefaultTodayPanelExpanded(TODAY_PANEL_IDS.ANNOUNCEMENTS)).toBe(true)
  })
})
