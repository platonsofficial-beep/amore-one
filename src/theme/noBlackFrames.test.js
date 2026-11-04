import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Palette step 2: modals, drawers, sheets, dialogs, popovers and their
// footers / action bars use the token surfaces, never a near-black band.
const root = resolve(process.cwd(), 'src')
const files = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  if (statSync(path).isDirectory()) return files(path)
  return name.endsWith('.css') ? [path] : []
})
const COLOR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi
function isNearBlack(value) {
  let r, g, b, a = 1
  if (value.startsWith('#')) {
    let h = value.slice(1)
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return false
    ;[r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255
  } else {
    const n = value.match(/[\d.]+/g)?.map(Number) ?? []
    if (n.length < 3) return false
    ;[r, g, b] = n; if (n.length > 3) a = n[3]
  }
  return Math.max(r, g, b) <= 34 && a >= 0.5 && !(b - r >= 20)
}
const FRAME = /(modal|drawer|sheet|dialog|popover|footer|-actions|action-bar)\b/i
const SKIP = /(backdrop|scrim|mobile-manager|floor-|fpb-|legal)/i

describe('no black frames (palette step 2)', () => {
  it('frames and their button bars use token surfaces', () => {
    const offenders = []
    for (const file of files(root)) {
      const css = readFileSync(file, 'utf8')
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = m[1].trim().split(/\s+/).join(' ')
        const last = selector.split(',').pop().trim().split(' ').pop()
        if (!FRAME.test(last) || SKIP.test(last)) continue
        for (const d of m[2].matchAll(/background(?:-color|-image)?\s*:\s*([^;]+);/g)) {
          if ((d[1].match(COLOR) ?? []).some(isNearBlack)) offenders.push(`${file.replace(root, 'src')}: ${last}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
