import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../mobileShell.css', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')

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
    expect(app).not.toContain('<WorkspaceReservationSeatingsSection {...reservationSeatingsEditorProps} />')
  })

  it('does not fade the first seating chip', () => {
    expect(css).toContain('mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 18px), transparent)')
    expect(css).not.toContain('linear-gradient(90deg, transparent, #000 12px')
  })

  it('keeps seating actions on their own row and clears the settings chevron', () => {
    expect(appCss).toMatch(/\.workspace-seating-row \.action-group\s*\{[^}]*flex:\s*1 1 100%/)
    expect(appCss).toMatch(/\.workspace-seating-row \.action-group \.workspace-action-btn\s*\{[^}]*min-width:\s*44px/)
    expect(appCss).toContain('margin-right: 52px')
    expect(appCss).toContain('margin-left: 52px')
  })
})
