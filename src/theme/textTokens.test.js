import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Palette step 5: AA-failing warm greys and duplicate whites are text tokens now.
const FAILING_GREYS = ['#6f675c', '#7f776c', '#8f8679', '#8f8678', '#8a8174', '#7d7468', '#5c564d', '#504a42', '#5e5850', '#6a6358', '#635c52', '#5a5349', '#7d7569', '#7a7266', '#7a7268', '#7a7368', '#5f584e', '#4a443c', '#6d655b', '#8a7aaa', '#3d3832', '#8f8468', '#6a6258', '#8a8072', '#8f867a']
// Rules left on purpose: light/gradient backgrounds where the old ink stays.
const ALLOWED_WHITE_RULES = 5

const cssFiles = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [] })
const all = cssFiles('src').map((f) => readFileSync(f, 'utf8')).join('\n')

const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

describe('palette step 5: text tokens', () => {
  it('no AA-failing warm grey is used as a text colour', () => {
    for (const g of FAILING_GREYS) expect(all).not.toMatch(new RegExp(`(?<![-\\w])color\\s*:\\s*${g}\\b`, 'i'))
  })
  it('duplicate whites are collapsed to --one-text (except the few light-background rules)', () => {
    const left = all.match(/(?<![-\w])color\s*:\s*#(fff7e8|f7efe1)\b/gi) || []
    expect(left.length).toBeLessThanOrEqual(ALLOWED_WHITE_RULES)
  })
  it('every text token meets AA (4.5:1) on bg and all three surfaces', () => {
    const tokens = readFileSync('src/theme/brandTokens.css', 'utf8')
    const get = (n) => tokens.match(new RegExp(`--one-${n}:\\s*(#[0-9a-f]{6})`, 'i'))[1]
    const surfaces = ['#0a1628', '#122033', '#18283d', '#21344c']
    for (const t of ['text', 'text-soft', 'text-muted', 'text-subtle']) for (const s of surfaces) expect(ratio(get(t), s)).toBeGreaterThanOrEqual(4.5)
  })
})
