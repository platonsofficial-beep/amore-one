import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const mobileShell = read('../mobileShell.css')
const safeOverlay = read('../safeOverlay.css')

function rule(css, selector) {
  const start = css.indexOf(`${selector} {`)
  expect(start).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

describe('sheet and sub-page tops', () => {
  it('starts the stock product sheet below the shared top gap', () => {
    expect(rule(mobileShell, '.mobile-stock-detail-card')).toContain('var(--one-safe-top-chrome)')
  })

  it('keeps sticky headers at 0 inside scrollers that already pad by the top gap', () => {
    expect(rule(mobileShell, '.mobile-expanded-header')).toContain('top: 0;')
    expect(rule(mobileShell, '.mobile-manager-stock-sticky-tools')).toContain('top: 0;')
    expect(mobileShell).toMatch(/\n\.mobile-expanded-scroll \{[^}]*padding-top: var\(--one-safe-top-chrome\)/)
  })

  it('hides the floating Help and bell while a full-height sheet is open', () => {
    expect(safeOverlay).toContain('body.has-one-overlay .app-shell .help-mode-fallback')
    expect(safeOverlay).toMatch(/body:has\(\.mobile-stock-detail-sheet[^)]*\) \.app-shell \.mobile-shell-bell/)
  })

  it('lets date and time inputs shrink inside their card', () => {
    expect(safeOverlay).toMatch(/input\[type="date"\],[\s\S]*?min-width: 0;/)
  })
})
