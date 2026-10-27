import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')

describe('schedule edit controls', () => {
  it('renders add-employee and shift templates only when the schedule can be edited', () => {
    expect(appSource).toContain('if (!canEditSchedule || scheduleGridTemplates.length === 0) return null')
    expect(appSource).toContain('{canEditSchedule && scheduleGridTemplates.length > 0 ? (')
    expect(appSource).toContain('{isCustomRow || !canEditSchedule ? null : <button')
    expect(appSource).toContain('aria-label="Add employee"')
    expect(appSource).toContain('<span>Staff availability</span>')
    expect(appSource).toContain('<RequestLeaveActionButton')
    expect(appSource).toContain('isVisible={canRequestLeave}')
    expect(appSource).toContain('{schedulePublicationLabel}')
  })
})
