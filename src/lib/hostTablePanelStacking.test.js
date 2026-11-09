import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mobileShell = readFileSync(new URL('../mobileShell.css', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')
const safeOverlay = readFileSync(new URL('../safeOverlay.css', import.meta.url), 'utf8')

function rule(css, selector) {
  const start = css.indexOf(selector)
  expect(start, selector).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

function zIndex(css, selector) {
  const block = rule(css, selector)
  const match = block.match(/z-index:\s*(\d+)/)
  expect(match, `${selector} z-index`).not.toBeNull()
  return Number(match[1])
}

describe('table panel stacking above the multi-table bar', () => {
  it('lifts the drawer above the bar and the gold floor handle', () => {
    const panel = zIndex(mobileShell, '.host-table-inspector {')
    const floor = zIndex(mobileShell, '.mobile-host-reservations-right-pane.has-table-inspector > .mobile-host-floor-stage {')
    const bar = zIndex(appCss, '.host-multi-table-selection-bar {')
    const handle = zIndex(safeOverlay, '.floor-edge-scrollbars {')
    const dialog = zIndex(appCss, '.floor-table-seating-dialog-overlay {')

    expect(panel).toBeGreaterThan(bar)
    expect(panel).toBeGreaterThan(handle)
    expect(panel).toBeGreaterThan(floor)
    expect(dialog).toBeGreaterThan(bar)
    expect(dialog).toBeGreaterThan(handle)
  })

  it('traps floor chrome only while the table panel is open', () => {
    const openFloor = rule(mobileShell, '.mobile-host-reservations-right-pane.has-table-inspector > .mobile-host-floor-stage {')
    expect(openFloor).toContain('isolation: isolate')
    expect(openFloor).toContain('z-index: 0')

    const floor = rule(mobileShell, '.mobile-host-floor-stage {')
    expect(floor).not.toContain('isolation')
    expect(floor).not.toContain('z-index')
  })
})
