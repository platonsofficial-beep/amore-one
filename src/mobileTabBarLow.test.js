import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const css = readFileSync(new URL('./mobileTabBarLow.css', import.meta.url), 'utf8')
const entry = readFileSync(new URL('./appEntry.jsx', import.meta.url), 'utf8')
const vite = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1]
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')

function headFor(userAgent, maxTouchPoints = 0) {
  const added = []
  const document = { head: { appendChild: (el) => added.push(el) }, createElement: (tag) => ({ tag, attrs: {}, setAttribute(k, v) { this.attrs[k] = v } }) }
  new Function('navigator', 'document', script)({ userAgent, maxTouchPoints }, document)
  return added.map((el) => `${el.tag}:${el.attrs.rel || el.attrs.name}${el.attrs.content ? `=${el.attrs.content}` : ''}`)
}

const IPHONE_26 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1'
const IPHONE_18 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
const IPAD_26 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36'

describe('per-platform web-app markup (WebKit 313800 short viewport)', () => {
  it('ships no static manifest or apple web-app metas', () => {
    expect(html).not.toMatch(/<link rel="manifest"/)
    expect(html).not.toMatch(/<meta name="apple-mobile-web-app-(capable|status-bar-style|title)"/)
    expect(vite).toMatch(/manifest:\s*false/)
  })
  it('iOS / iPadOS 26+ get none of it', () => {
    expect(headFor(IPHONE_26)).toEqual([])
    expect(headFor(IPAD_26, 5)).toEqual([])
  })
  it('older iOS keeps manifest + classic tags', () => {
    expect(headFor(IPHONE_18)).toEqual([
      'link:manifest',
      'meta:apple-mobile-web-app-capable=yes',
      'meta:apple-mobile-web-app-status-bar-style=black-translucent',
      'meta:apple-mobile-web-app-title=ONE',
    ])
  })
  it('Android and desktop get the manifest only', () => {
    expect(headFor(ANDROID)).toEqual(['link:manifest'])
    expect(headFor(IPAD_26, 0)).toEqual(['link:manifest'])
  })
})

describe('low tab bar, Active Count baseline untouched (P8.19.8)', () => {
  it('is wired into the app entry', () => {
    expect(entry).toMatch(/import '\.\/mobileTabBarLow\.css'/)
  })
  it('nav bottom is max(8px, inset - 20px)', () => {
    expect(css).toMatch(/--one-mobile-nav-bottom:\s*max\(8px,\s*calc\(env\(safe-area-inset-bottom,\s*0px\)\s*-\s*20px\)\)/)
    expect(rules).toMatch(/\.mobile-staff-app \.mobile-bottom-nav\s*\{\s*bottom:\s*var\(--one-mobile-nav-bottom\);/)
  })
  it('never sizes html/body/#root/shell and never uses visualViewport', () => {
    expect(rules).not.toMatch(/(^|[\s;{])(min-|max-)?height\s*:/)
    expect(rules).not.toMatch(/visualViewport|(^|[\s,])(html|body|#root)\b/)
  })
  it('every rule is skipped during an inventory count session', () => {
    const selectors = [...rules.matchAll(/([^{}@]+)\{/g)].map((m) => m[1].trim()).filter((s) => s.includes('.app-shell'))
    expect(selectors.length).toBe(3)
    for (const s of selectors) for (const part of s.split(',')) {
      expect(part).toMatch(/:not\(\.stock-focus-mode\):not\(:has\(\.inventory-count-session\)\)/)
    }
  })
})
