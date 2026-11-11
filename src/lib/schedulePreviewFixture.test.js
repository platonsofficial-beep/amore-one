import { describe, expect, it } from 'vitest'
import { buildSchedulePreviewTemplates, shouldUseSchedulePreviewFixture } from './schedulePreviewFixture'

describe('schedule preview fixture', () => {
  it('stays off unless auth is disabled and the page asks for it', () => {
    expect(shouldUseSchedulePreviewFixture('?scheduleFixture=1')).toBe(import.meta.env.VITE_AUTH_DISABLED === 'true')
    expect(shouldUseSchedulePreviewFixture('')).toBe(false)
  })

  it('builds a Service morning and evening for a 7-day grid', () => {
    const templates = buildSchedulePreviewTemplates()
    expect(templates.map((template) => template.name)).toEqual(['Morning', 'Evening'])
    expect(templates[0].defaultArea).toBe('Service')
    expect(templates[1].defaultArea).toBe('')
    expect(templates[0].defaultRequiredCount).toBe(1)
  })
})
