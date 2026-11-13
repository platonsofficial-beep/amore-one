import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildManagerPortraitMoreItems } from './managerPortrait'

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')
const overlayCss = readFileSync(new URL('../safeOverlay.css', import.meta.url), 'utf8')
const view = readFileSync(new URL('../components/workspace/WorkspaceView.jsx', import.meta.url), 'utf8')
const privacy = readFileSync(new URL('../components/privacy/PrivacySections.jsx', import.meta.url), 'utf8')
const venue = readFileSync(new URL('../components/workspace/VenueManager.jsx', import.meta.url), 'utf8')
const system = readFileSync(new URL('../components/workspace/WorkspaceSystemSection.jsx', import.meta.url), 'utf8')
const menu = readFileSync(new URL('../components/auth/UserMenu.jsx', import.meta.url), 'utf8')

describe('Settings audit fixes', () => {
  it('SET-01 uses one compact header row and one scroll area on short phone landscape', () => {
    expect(app).toMatch(/settingsCompactHeader/)
    expect(app).toMatch(/topbar-settings-compact/)
    const headerRule = overlayCss.indexOf('.topbar.topbar-settings-compact')
    expect(headerRule).toBeGreaterThan(0)
    expect(overlayCss.lastIndexOf(
      '@media (orientation: landscape) and (max-height: 520px) and (max-width: 1100px)',
      headerRule,
    )).toBeGreaterThan(0)
    expect(overlayCss).toMatch(/\.topbar-settings-compact \.welcome-subtitle/)
    expect(overlayCss).toMatch(/max-height:\s*56px/)
    expect(appCss).toMatch(/\.app-shell:not\(\.is-mobile-shell\) \.workspace-page \{[^}]*overflow:\s*visible/)
  })

  it('SET-02 shortens phone chips and shows a scroll cue', () => {
    expect(view).toMatch(/shortLabel: 'Profile'/)
    expect(view).toMatch(/shortLabel: 'Privacy'/)
    expect(view).toMatch(/aria-label=\{t\("More settings sections"\)\}/)
    expect(appCss).toMatch(/@media \(max-width: 640px\) and \(orientation: portrait\)/)
    expect(appCss).toMatch(/\.workspace-nav-label-short/)
    expect(appCss).toMatch(/mask-image:\s*linear-gradient/)
    expect(appCss).toMatch(/\.workspace-nav-chevron \{[^}]*min-height:\s*44px/)
  })

  it('SET-03 and SET-04 keep Settings chrome in English', () => {
    expect(view).toMatch(/label: 'Privacy'/)
    expect(view).not.toMatch(/Απόρρητο/)
    expect(privacy).toMatch(/Privacy & data/)
    expect(privacy).toMatch(/Download my data/)
    expect(privacy).toMatch(/Venue data/)
    expect(privacy).not.toMatch(/Απόρρητο|Λήψη|Διαγραφή|Κλείσιμο venue/)
    expect(venue).toMatch(/\+ New venue/)
    expect(venue).toMatch(/New venue/)
    expect(venue).not.toMatch(/Νέο venue/)
  })

  it('SET-05 keeps quiet-hours selects at least 44px tall', () => {
    expect(appCss).toMatch(/\.notification-quiet-time \.hour-minute-field select \{[^}]*min-height:\s*44px/)
  })

  it('SET-06 distinguishes device alerts from the Settings entry', () => {
    const notifications = buildManagerPortraitMoreItems('owner').find((item) => item.id === 'notifications')
    expect(notifications.subtitle).toMatch(/Device alerts/)
    expect(readFileSync(new URL('../components/notifications/NotificationCenter.jsx', import.meta.url), 'utf8'))
      .toMatch(/Device alerts for your account/)
  })

  it('SET-07 says Settings in the user menu', () => {
    expect(menu).toMatch(/Open Settings/)
    expect(menu).not.toMatch(/Open Workspace Profile/)
  })

  it('SET-08 tells a limited manager which sections they get, and staff get none', () => {
    expect(buildManagerPortraitMoreItems('manager').find((item) => item.id === 'settings').subtitle)
      .toBe('Seatings, notifications & privacy')
    expect(buildManagerPortraitMoreItems('staff').some((item) => item.id === 'settings')).toBe(false)
    expect(app).toMatch(/limitedAccess=\{settingsLimited\}/)
  })

  it('SET-09 explains Connected and does not invent an Insights connection', () => {
    expect(system).toMatch(/No live check/)
    expect(system).toMatch(/Part of Stock/)
    expect(system).not.toMatch(/label: 'Available'/)
    expect(app).toMatch(/reports:\s*null/)
  })
})
