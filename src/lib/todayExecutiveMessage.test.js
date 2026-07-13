import { describe, expect, it } from 'vitest'
import {
  buildTodayExecutiveMessage,
  hasTodayStockProblems,
  TODAY_EXECUTIVE_MESSAGE_MAX_LENGTH,
} from './todayExecutiveMessage'

const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u

function expectExecutivePresentation(result, { tone, message }) {
  expect(result).toEqual({
    tone,
    indicator: 'dot',
    message,
  })
  expect(result.message).not.toMatch(EMOJI_PATTERN)
  expect(result.message.length).toBeLessThanOrEqual(TODAY_EXECUTIVE_MESSAGE_MAX_LENGTH)
}

describe('todayExecutiveMessage', () => {
  it('selects the highest-priority executive message deterministically', () => {
    expectExecutivePresentation(buildTodayExecutiveMessage({
      hasUrgentAttention: true,
      overdueTaskCount: 4,
      hasScheduleGaps: true,
      reservationsTodayCount: 7,
      firstShiftStartLabel: '16:30',
      isServiceInProgress: true,
      hasStockProblems: true,
    }), {
      tone: 'critical',
      message: 'Service requires immediate attention.',
    })

    expectExecutivePresentation(buildTodayExecutiveMessage({
      hasUrgentAttention: true,
      isServiceInProgress: false,
    }), {
      tone: 'critical',
      message: 'Attention is required before service.',
    })

    expectExecutivePresentation(buildTodayExecutiveMessage({
      overdueTaskCount: 3,
      hasScheduleGaps: true,
      reservationsTodayCount: 7,
    }), {
      tone: 'warning',
      message: '3 overdue tasks need your attention.',
    })

    expectExecutivePresentation(buildTodayExecutiveMessage({
      overdueTaskCount: 1,
    }), {
      tone: 'warning',
      message: '1 overdue task needs your attention.',
    })

    expectExecutivePresentation(buildTodayExecutiveMessage({
      hasScheduleGaps: true,
      reservationsTodayCount: 7,
    }), {
      tone: 'warning',
      message: 'Staffing gaps need attention before service.',
    })

    expectExecutivePresentation(buildTodayExecutiveMessage({
      reservationsTodayCount: 7,
      firstShiftStartLabel: '16:30',
    }), {
      tone: 'neutral',
      message: '7 reservations are expected today.',
    })

    expectExecutivePresentation(buildTodayExecutiveMessage({
      reservationsTodayCount: 1,
    }), {
      tone: 'neutral',
      message: '1 reservation is expected today.',
    })

    expectExecutivePresentation(buildTodayExecutiveMessage({
      firstShiftStartLabel: '16:30',
    }), {
      tone: 'neutral',
      message: 'The first shift starts at 16:30.',
    })

    expectExecutivePresentation(buildTodayExecutiveMessage({
      isServiceInProgress: true,
    }), {
      tone: 'positive',
      message: 'Service is currently in progress.',
    })

    expectExecutivePresentation(buildTodayExecutiveMessage({
      hasStockProblems: true,
    }), {
      tone: 'warning',
      message: 'Stock items require attention.',
    })

    expectExecutivePresentation(buildTodayExecutiveMessage({}), {
      tone: 'positive',
      message: "Everything is ready for today's service.",
    })
  })

  it('assigns presentation tones for each executive state', () => {
    expect(buildTodayExecutiveMessage({ hasUrgentAttention: true }).tone).toBe('critical')
    expect(buildTodayExecutiveMessage({ overdueTaskCount: 2 }).tone).toBe('warning')
    expect(buildTodayExecutiveMessage({ hasScheduleGaps: true }).tone).toBe('warning')
    expect(buildTodayExecutiveMessage({ reservationsTodayCount: 2 }).tone).toBe('neutral')
    expect(buildTodayExecutiveMessage({ firstShiftStartLabel: '16:30' }).tone).toBe('neutral')
    expect(buildTodayExecutiveMessage({ isServiceInProgress: true }).tone).toBe('positive')
    expect(buildTodayExecutiveMessage({ hasStockProblems: true }).tone).toBe('warning')
    expect(buildTodayExecutiveMessage({}).tone).toBe('positive')
  })

  it('returns exactly one dot-indicator presentation object', () => {
    const result = buildTodayExecutiveMessage({ reservationsTodayCount: 4 })
    expect(result.indicator).toBe('dot')
    expect(Object.keys(result).sort()).toEqual(['indicator', 'message', 'tone'])
  })

  it('detects stock problems from existing summary data only', () => {
    expect(hasTodayStockProblems({
      stockSummary: { outOfStock: 1, lowStock: 0 },
      hasStockModuleData: true,
    })).toBe(true)
    expect(hasTodayStockProblems({
      stockSummaryLine: 'Stock levels OK',
      hasStockModuleData: true,
    })).toBe(false)
    expect(hasTodayStockProblems({
      stockSummaryLine: '1 out · 2 low',
      hasStockModuleData: true,
    })).toBe(true)
  })
})
