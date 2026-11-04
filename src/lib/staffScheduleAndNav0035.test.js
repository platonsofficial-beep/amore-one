import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { canEditSchedule } from './permissions'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const app = read('../App.jsx')
const css = read('../safeOverlay.css')
const staffApp = read('../components/mobile/MobileStaffApp.jsx')

describe('0035 staff schedule gating', () => {
  it('uses the existing schedule permission helper', () => {
    expect(canEditSchedule('staff')).toBe(false)
    expect(canEditSchedule('host')).toBe(false)
    expect(canEditSchedule('manager')).toBe(true)
    expect(canEditSchedule('owner')).toBe(true)
  })

  it('issues banner, Staff availability panel and availability load are gated on canEditSchedule', () => {
    expect(app).toContain('{canEditSchedule && scheduleIssueNotice.count > 0 ? (')
    expect(app).toMatch(/\{canEditSchedule \? \(\s*<details className="schedule-staff-availability/)
    expect(app).toContain('if (!canEditSchedule || !`${workspaceId')
    expect(app).toContain('canEditScheduleRole = useMemo(\n    () => canEditSchedule(permissionAccess)')
  })
})

describe('0035 staff bottom bar', () => {
  it('staff app roots carry mobile-staff-app (not the host station)', () => {
    expect(staffApp).toContain('mobile-app mobile-app-expanded mobile-staff-app')
    expect(staffApp).toContain(": ' mobile-staff-app'}`}")
  })
  it('staff bar floats like the manager bar', () => {
    const block = css.slice(css.indexOf('0035 (1)'))
    expect(block).toMatch(/\.mobile-staff-app \.mobile-bottom-nav \{[^}]*border-radius: 24px[^}]*background: rgba\(18, 32, 51, 0\.92\)/)
    expect(block).toContain('bottom: calc(10px + env(safe-area-inset-bottom, 0px))')
  })
})
