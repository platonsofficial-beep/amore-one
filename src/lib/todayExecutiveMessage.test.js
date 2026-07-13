import { describe, expect, it } from 'vitest'
import {
  buildTodayExecutiveMessage,
  hasTodayStockProblems,
  TODAY_EXECUTIVE_MESSAGE_MAX_LENGTH,
} from './todayExecutiveMessage'

describe('todayExecutiveMessage', () => {
  it('selects the highest-priority executive message deterministically', () => {
    expect(buildTodayExecutiveMessage({
      hasUrgentAttention: true,
      overdueTaskCount: 4,
      hasScheduleGaps: true,
      reservationsTodayCount: 7,
      firstShiftStartLabel: '16:30',
      isServiceInProgress: true,
      hasStockProblems: true,
    })).toBe('🚨 Immediate attention required.')

    expect(buildTodayExecutiveMessage({
      overdueTaskCount: 3,
      hasScheduleGaps: true,
      reservationsTodayCount: 7,
    })).toBe('⚠️ You have 3 overdue tasks.')

    expect(buildTodayExecutiveMessage({
      hasScheduleGaps: true,
      reservationsTodayCount: 7,
    })).toBe('👥 Schedule has staffing gaps.')

    expect(buildTodayExecutiveMessage({
      reservationsTodayCount: 7,
      firstShiftStartLabel: '16:30',
    })).toBe('🍽️ 7 reservations expected today.')

    expect(buildTodayExecutiveMessage({
      firstShiftStartLabel: '16:30',
    })).toBe('🕒 First shift starts at 16:30.')

    expect(buildTodayExecutiveMessage({
      isServiceInProgress: true,
    })).toBe('🟢 Service is currently in progress.')

    expect(buildTodayExecutiveMessage({
      hasStockProblems: true,
    })).toBe('📦 Stock items require attention.')

    expect(buildTodayExecutiveMessage({})).toBe("✨ Everything is ready for today's service.")
  })

  it('keeps messages within the executive subtitle limit', () => {
    expect(buildTodayExecutiveMessage({
      overdueTaskCount: 3,
    }).length).toBeLessThanOrEqual(TODAY_EXECUTIVE_MESSAGE_MAX_LENGTH)
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
