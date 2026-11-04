import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../App.css', import.meta.url), 'utf8')

describe('New count wizard in phone landscape', () => {
  it('backdrop padding respects the left/right safe areas', () => {
    const m = css.match(/@media \(max-height: 460px\) \{[\s\S]*?\.inventory-count-wizard-backdrop \{([^}]*)\}/)
    expect(m).toBeTruthy()
    expect(m[1]).toMatch(/max\(8px, var\(--one-safe-area-right, env\(safe-area-inset-right, 0px\)\)\)/)
    expect(m[1]).toMatch(/max\(8px, var\(--one-safe-area-left, env\(safe-area-inset-left, 0px\)\)\)/)
    expect(m[1]).not.toMatch(/padding:\s*8px;/)
  })
})
