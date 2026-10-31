import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/mobileShell.css'), 'utf8')

describe('App-level dialogs opened from an in-content sheet', () => {
  it('stay above module content that is lifted to z-index 60 while a sheet is open', () => {
    const lifted = css.match(/position: relative;\s*z-index: (\d+);\s*\}\s*\/\* App-level dialogs/)
    expect(lifted).not.toBeNull()
    const rule = css.match(/\.app-shell\.is-mobile-shell \.main-panel > \.employee-modal-backdrop \{\s*z-index: (\d+);/)
    expect(rule).not.toBeNull()
    expect(Number(rule[1])).toBeGreaterThan(Number(lifted[1]))
  })
})

describe('Add / Edit employee phone sheet', () => {
  it('is full height below the status bar with a solid footer pinned flush to the bottom', () => {
    expect(css).toMatch(/\.employee-modal-backdrop\.employee-premium-form-backdrop \{\s*padding: var\(--one-safe-top-chrome\) 0 0;/)
    expect(css).toMatch(/\.employee-modal\.employee-premium-form-modal \{[^}]*height: calc\(100dvh - var\(--one-safe-top-chrome\)\);[^}]*padding-bottom: 0;/)
    expect(css).toMatch(/\.employee-premium-form-modal \.employee-premium-form-actions \{[^}]*position: sticky;[^}]*bottom: 0;[^}]*background: #0b0f17;/)
  })
})
