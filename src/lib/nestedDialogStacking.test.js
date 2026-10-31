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
