import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/safeOverlay.css', 'utf8')
const block = css.slice(css.indexOf('Palette step 4'))

describe('palette step 4: one secondary-button style', () => {
  it('secondary buttons use the fill + strong border tokens', () => {
    expect(block).toMatch(/--one-secondary-fill: var\(--one-fill\)/)
    expect(block).toMatch(/--one-secondary-border: var\(--one-border-strong\)/)
    expect(block).toMatch(/background: var\(--one-secondary-fill\) !important/)
    expect(block).toMatch(/border: 1px solid var\(--one-secondary-border\) !important/)
  })
  it('covers ghost, secondary, phone outline buttons and portrait day nav', () => {
    for (const sel of ['.ghost-btn', '.secondary-btn', '.mobile-secondary-btn', '.shift-reminder-btn-quiet', '.manager-portrait-date-nav > button', '.mobile-host-sticky-date-step-btn']) expect(block).toContain(sel)
  })
  it('leaves primary and danger buttons alone and does not touch focus rings', () => {
    expect(block).toMatch(/:not\(\.primary-btn\):not\(\[class\*='danger'\]\):not\(\[class\*='delete'\]\)/)
    expect(block).not.toMatch(/outline\s*:/)
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
  })
})
