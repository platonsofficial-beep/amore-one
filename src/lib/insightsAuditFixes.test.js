import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')
const overlayCss = readFileSync(new URL('../safeOverlay.css', import.meta.url), 'utf8')
const helpCss = readFileSync(new URL('../help/helpMode.css', import.meta.url), 'utf8')
const reportsView = readFileSync(new URL('../components/reports/ReportsView.jsx', import.meta.url), 'utf8')

describe('Insights audit fixes', () => {
  it('uses one compact header row and one scroll area on short phone landscape', () => {
    expect(app).toMatch(/insightsCompactHeader/)
    expect(app).toMatch(/topbar-insights-compact/)
    const headerRule = overlayCss.indexOf('.topbar.topbar-insights-compact')
    expect(headerRule).toBeGreaterThan(0)
    expect(overlayCss.lastIndexOf(
      '@media (orientation: landscape) and (max-height: 520px) and (max-width: 1100px)',
      headerRule,
    )).toBeGreaterThan(0)
    expect(overlayCss).toMatch(/\.topbar-insights-compact \.welcome-subtitle/)
    expect(appCss).toMatch(/\.app-shell:not\(\.is-mobile-shell\) \.reports-page \{[^}]*overflow:\s*visible/)
  })

  it('filters insight cards from the header search', () => {
    expect(app).toMatch(/searchTerm=\{searchTerm\}/)
    expect(reportsView).toMatch(/searchTerm = ''/)
    expect(reportsView).toMatch(/No insights match that search/)
  })

  it('keeps the Insights supplier deep link through the stock entry reset', () => {
    expect(app).toMatch(/stockEntryRequestRef\.current = route\.stockSection/)
    expect(app).toMatch(/requestedSection/)
  })

  it('shows the live-data line once and gives help a 44px target', () => {
    expect(reportsView).toContain("const MODULE_FOOTER = 'Powered by live ONE data'")
    expect(reportsView).toContain('<p className="reports-page-footer">{MODULE_FOOTER}</p>')
    expect(reportsView).not.toContain('reports-section-footer')
    expect(reportsView).not.toMatch(/Module summary/)
    expect(helpCss).toMatch(/min-width:\s*44px/)
    expect(helpCss).toMatch(/min-height:\s*44px/)
  })

  it('puts Today and This Week on one row and the brief on two columns on a phone', () => {
    expect(appCss).toMatch(/\.reports-overview-grid \{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/)
    expect(appCss).toMatch(/\.app-shell\.is-mobile-shell \.reports-period-filters \{\s*flex-wrap:\s*nowrap;/)
    expect(reportsView).toMatch(/attentionFirst \? attentionPanel/)
  })
})
