import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../App.css', import.meta.url), 'utf8')
const block = css.match(/@media \(orientation: landscape\) and \(max-height: 500px\) \{\s*\.inventory-count-complete-disabled-reason \{[\s\S]*?\n\}\n/)?.[0] ?? ''

describe('Complete Location pending note in phone landscape', () => {
  it('is styled as a compact muted note', () => {
    expect(block).toMatch(/font-size:\s*0\.74rem/)
    expect(block).toMatch(/color:\s*var\(--one-text-muted\)/)
    expect(block).toMatch(/strong \{[^}]*color:\s*var\(--one-gold-light\)/)
  })
  it('stays inside the P8.19.8 allowed list (no layout / viewport properties)', () => {
    const body = block.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(body).not.toMatch(/(^|[\s;{])(position|display|flex|grid|overflow|height|min-height|max-height|bottom|inset|top|margin|padding|sticky)\s*:/)
  })
})
