import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../App.css', import.meta.url), 'utf8')

describe('assign card with the missing-area prompt', () => {
  it('keeps the area choice and Cancel / Save out of the employee scroller', () => {
    const areaAt = app.indexOf('className="assignment-area-warning"')
    const bodyAt = app.indexOf('className="assignment-card-body"')
    const actionsAt = app.indexOf('className="modal-actions"', bodyAt)
    expect(areaAt).toBeGreaterThan(-1)
    expect(bodyAt).toBeGreaterThan(areaAt)
    expect(actionsAt).toBeGreaterThan(bodyAt)
    const area = app.slice(areaAt, bodyAt)
    const middle = app.slice(bodyAt, actionsAt)
    expect(area).toContain('No area saved.')
    expect(area).toContain('Only this assignment')
    expect(area).toContain('Save to template')
    expect(area).not.toContain('shift template')
    expect(middle).toContain('assignment-employee-list')
    expect(middle).not.toContain('assignment-area-warning')
    expect(app.slice(app.indexOf('<h3>Assign employees</h3>'), actionsAt)).not.toContain('Remaining')
  })

  it('lets the middle scroll on a short screen while the footer stays put', () => {
    const bodyRule = css.slice(css.indexOf('.schedule-assignment-modal .assignment-card-body {'), css.indexOf('.schedule-assignment-modal .assignment-card-body {') + 280)
    expect(bodyRule).toContain('min-height: 0')
    expect(bodyRule).toContain('overflow-y: auto')
    expect(css).toContain('.schedule-assignment-modal .assignment-area-warning select')
    expect(css).toContain('.schedule-assignment-modal .assignment-area-apply .ghost-btn')
    const short = css.slice(css.indexOf('@media (orientation: landscape) and (max-height: 520px)'), css.indexOf('@media (orientation: landscape) and (max-height: 520px)') + 700)
    expect(short).toContain('padding-top: 8px')
    expect(short).toContain('padding-bottom: 8px')
    expect(short).toContain('max-height: calc(100dvh - 16px)')
  })
})
