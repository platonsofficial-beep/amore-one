import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../mobileShell.css', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')
const seatingsSection = readFileSync(
  new URL('../components/workspace/WorkspaceReservationSeatingsSection.jsx', import.meta.url),
  'utf8',
)

describe('seating hours stay inside Reservations', () => {
  it('opens a sheet instead of leaving for Settings', () => {
    const handler = app.slice(
      app.indexOf('const handleOpenReservationServices'),
      app.indexOf('const workspaceTimeZone'),
    )
    expect(handler).toContain('setIsSeatingHoursOpen(true)')
    expect(handler).not.toContain("handleActiveViewChange('settings')")
    expect(handler).not.toContain('setMobileReservationsHostMode(false)')
    expect(app).toContain('className="employee-modal seating-hours-sheet"')
    expect(app).toContain('hoursOnly')
    expect(app).toContain('canEdit={canConfigureReservationSeatingsRole}')
    expect(app).toContain('canOpenReservationsHostMode(permissionAccess)')
    expect(app).toContain('seating-hours-followup')
    expect(appCss).toMatch(/\.employee-modal-backdrop\.seating-hours-overlay\s*\{[^}]*z-index:\s*80/)
    expect(appCss).toMatch(/\.employee-modal-backdrop\.seating-hours-followup\s*\{[^}]*z-index:\s*100/)
    expect(appCss).toMatch(/\.app-shell\.is-mobile-shell \.main-panel > \.employee-modal-backdrop\.seating-hours-followup\s*\{[^}]*z-index:\s*100/)
    expect(app).not.toContain('<WorkspaceReservationSeatingsSection {...reservationSeatingsEditorProps} />')
  })

  it('does not fade the first seating chip', () => {
    expect(css).toContain('mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 18px), transparent)')
    expect(css).not.toContain('linear-gradient(90deg, transparent, #000 12px')
  })

  it('keeps day chips beside the edit buttons on a short screen', () => {
    const editor = seatingsSection.slice(
      seatingsSection.indexOf('className="seating-hours-editor-fields"'),
      seatingsSection.indexOf('type="submit"'),
    )
    expect(editor.indexOf('seating-hours-editor-fields')).toBeLessThan(editor.indexOf('seating-hours-editor-days'))
    expect(editor.indexOf('</div>\n        </div>')).toBeLessThan(editor.indexOf('seating-hours-editor-days'))
    expect(appCss).toMatch(/\.seating-hours-editor-days,\s*\.seating-hours-editor \.modal-actions\s*\{[^}]*flex:\s*0 0 auto/)
    expect(appCss).toMatch(/\.seating-hours-editor \.workspace-seating-day-chip,\s*\.seating-hours-editor \.modal-actions \.workspace-action-btn\s*\{[^}]*min-height:\s*44px/)
    expect(appCss).toMatch(/@media \(max-height: 520px\)\s*\{[^}]*\.employee-modal\.seating-hours-editor/)
  })

  it('keeps seating actions on their own row and clears the settings chevron', () => {
    expect(appCss).toMatch(/\.workspace-seating-row \.action-group\s*\{[^}]*flex:\s*1 1 100%/)
    expect(appCss).toMatch(/\.workspace-seating-row \.action-group \.workspace-action-btn\s*\{[^}]*min-width:\s*44px/)
    expect(appCss).toContain('margin-right: 52px')
    expect(appCss).toContain('margin-left: 52px')
  })
})
