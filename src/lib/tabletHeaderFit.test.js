import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../safeOverlay.css', import.meta.url), 'utf8')

describe('tablet header fit (0024)', () => {
  const i = css.indexOf('0024 — Tablet header fit')
  const block = css.slice(i)
  it('is scoped to tablet widths and skips the compact phone header', () => {
    expect(i).toBeGreaterThan(0)
    expect(block).toMatch(/@media \(min-width: 601px\) and \(max-width: 1100px\) and \(min-height: 521px\)/)
    expect(block).toMatch(/\.topbar:not\(\.topbar-operations-compact\)/)
  })
  it('lets search shrink and truncates the user name', () => {
    expect(block).toMatch(/\.search-bar \{\s*flex: 1 1 140px;\s*min-width: 0;/)
    expect(block).toMatch(/\.profile-chip strong \{[^}]*text-overflow: ellipsis/)
  })
})
