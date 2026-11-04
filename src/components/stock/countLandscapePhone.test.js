import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../countLandscapePhone.css'), 'utf8')
const entry = readFileSync(resolve(__dirname, '../../appEntry.jsx'), 'utf8')

describe('phone-landscape Active Count compaction (authorised t462u)', () => {
  it('is imported by the app entry', () => {
    expect(entry).toMatch(/import ['"]\.\/countLandscapePhone\.css['"]/)
  })
  it('every rule is gated by html.one-phone-landscape (no media query)', () => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(stripped).not.toMatch(/@media/)
    const selectors = stripped.split('}').map((r) => r.split('{')[0]).filter((x) => x.trim())
    expect(selectors.length).toBeGreaterThan(10)
    for (const sel of selectors) for (const part of sel.split(',')) expect(part.trim().startsWith('html.one-phone-landscape ')).toBe(true)
  })
  it('the app entry binds the class before rendering', () => {
    expect(entry).toMatch(/bindPhoneLandscapeClass\(\)/)
  })
  it('gives STATUS 16px of right padding', () => {
    expect(css).toMatch(/\.inventory-count-session-spreadsheet\s*\{[^}]*padding-right:\s*16px/)
  })
  it('hides chrome only while a counted input is focused', () => {
    expect(css).toMatch(/:has\(\.inventory-count-session-counted-input:focus\)/)
    expect(css).toMatch(/stock-focus-chrome/)
  })
  it('never touches viewport/keyboard maths', () => {
    expect(css).not.toMatch(/visualViewport|100dvh|100svh|100vh|position:\s*(fixed|sticky)|--inventory-count-sheet-end-runway/)
  })
})

describe('Complete Location note in phone landscape', () => {
  it('is visually hidden but kept for screen readers (not display:none)', () => {
    const rule = css.match(/\.inventory-count-complete-disabled-reason\s*\{[^}]*clip-path[^}]*\}/)
    expect(rule).toBeTruthy()
    expect(rule[0]).not.toMatch(/display:\s*none/)
  })
})

describe('phone-landscape help button and Finish preview', () => {
  it('hides the help toggle only while a counted input is focused', () => {
    expect(css).toMatch(/:has\([^)]*counted-input:focus\)\s*\.help-mode-toggle\s*\{[^}]*visibility:\s*hidden/)
  })
  it('only hides header meta labels, not the Finish preview summary labels', () => {
    expect(css).toMatch(/\.inventory-count-session-header \.inventory-count-session-meta-label\s*\{\s*display:\s*none/)
    expect(css).not.toMatch(/is-high-density \.inventory-count-session-meta-label\s*\{/)
    expect(css).toMatch(/summary-card \.inventory-count-session-meta-label\s*\{[^}]*display:\s*block/)
  })
  it('fits the Finish preview between the side safe areas with a 4-column summary', () => {
    expect(css).toMatch(/finish-preview-overlay\s*\{[^}]*var\(--one-safe-area-right\)[^}]*var\(--one-safe-area-left\)/)
    expect(css).toMatch(/finish-preview\s*\{[^}]*max-width:\s*100%/)
    expect(css).toMatch(/finish-preview-summary\s*\{[^}]*repeat\(4,/)
  })
})
