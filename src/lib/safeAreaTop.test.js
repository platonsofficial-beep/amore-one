import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const safeOverlay = readFileSync(new URL('../safeOverlay.css', import.meta.url), 'utf8')
const helpCss = readFileSync(new URL('../help/helpMode.css', import.meta.url), 'utf8')

function rule(css, selector) {
  const start = css.indexOf(selector)
  expect(start).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

describe('top safe area', () => {
  it('fills only the status-bar inset with a solid app background', () => {
    const strip = rule(safeOverlay, 'body::before')
    expect(strip).toContain('height: var(--one-safe-area-top, env(safe-area-inset-top, 0px))')
    expect(strip).toContain('background: var(--one-bg, #0e0e0f)')
    expect(strip).not.toContain('backdrop-filter')
    expect(strip).toContain('z-index: 40')
  })

  it('places the Help mode bar below the status bar and above the strip', () => {
    const banner = rule(helpCss, '.help-mode-banner')
    expect(banner).toContain('top: calc(var(--one-safe-area-top, env(safe-area-inset-top, 0px)) + 6px)')
    expect(banner).toContain('z-index: 90')
    expect(banner).not.toContain('top: 0')
    expect(banner).toContain('background: #1a1408')
  })
})
