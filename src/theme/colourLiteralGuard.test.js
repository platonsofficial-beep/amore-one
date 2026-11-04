import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { countColourLiterals } from './colourLiterals.js'
import baseline from './colourLiteralBaseline.json'

// Palette step 7 guard: raw colours live in brandTokens.css. Other CSS files may only
// shrink their existing count (see colourLiteralBaseline.json); new files start at 0.
// When you remove literals, lower the baseline in the same change.
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.css') ? [p] : [] })
const files = walk('src').filter((f) => !f.endsWith('brandTokens.css'))

describe('palette guard: no new raw colour literals outside brandTokens.css', () => {
  it.each(files)('%s stays at or below its baseline', (f) => {
    expect(countColourLiterals(readFileSync(f, 'utf8'))).toBeLessThanOrEqual(baseline[f] ?? 0)
  })
  it('counts hex, rgb(a) and hsl(a) and ignores comments', () => {
    expect(countColourLiterals('a{color:#fff;background:rgba(0,0,0,.5);border-color:hsl(0 0% 0%)} /* #123456 */')).toBe(3)
    expect(countColourLiterals('a{color:var(--one-text)}')).toBe(0)
  })
  it('alpha ladders exist in brandTokens.css', () => {
    const t = readFileSync('src/theme/brandTokens.css', 'utf8')
    for (const k of ['04', '08', '12', '16', '24', '32', '45', '55', '72']) expect(t).toContain(`--one-gold-a${k}:`)
    for (const k of ['02', '03', '04', '06', '08', '12', '16']) expect(t).toContain(`--one-overlay-${k}:`)
  })
})
