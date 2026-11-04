import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { installStandaloneViewport, measureStandaloneGap } from './lib/standaloneViewport.js'

const css = readFileSync(new URL('./mobileFullHeight.css', import.meta.url), 'utf8')
const js = readFileSync(new URL('./lib/standaloneViewport.js', import.meta.url), 'utf8')
const entry = readFileSync(new URL('./appEntry.jsx', import.meta.url), 'utf8')
const win = (o) => ({ navigator: { standalone: true }, screen: { width: 440, height: 956 }, innerWidth: 440, innerHeight: 894, ...o })
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('iOS standalone gap measurement', () => {
  it('measures the strip below the short layout viewport', () => {
    expect(measureStandaloneGap(win())).toBe(62)
  })
  it('is 0 outside the home-screen app and when the viewport is full', () => {
    expect(measureStandaloneGap(win({ navigator: {} }))).toBe(0)
    expect(measureStandaloneGap(win({ innerHeight: 956 }))).toBe(0)
  })
  it('uses the short screen side in landscape and ignores keyboard-sized gaps', () => {
    expect(measureStandaloneGap(win({ innerWidth: 956, innerHeight: 440 }))).toBe(0)
    expect(measureStandaloneGap(win({ innerHeight: 600 }))).toBe(0)
  })
  it('only listens to window resize/orientationchange/pageshow', () => {
    const events = []
    const set = {}
    const w = { ...win(), document: { documentElement: { style: { setProperty: (k, v) => { set[k] = v } } } },
      addEventListener: (e) => events.push(e), removeEventListener() {}, setTimeout() {}, clearTimeout() {},
      visualViewport: { addEventListener: () => { throw new Error('visualViewport must not be used') } } }
    installStandaloneViewport(w)
    expect(events.sort()).toEqual(['orientationchange', 'pageshow', 'resize'])
    expect(set['--one-standalone-gap']).toBe('62px')
    expect(js).not.toMatch(/visualViewport\s*(\?\.|\.)\s*addEventListener/)
  })
})

describe('low tab bar without touching the locked Active Count chain (P8.19.8)', () => {
  it('is wired into the app entry', () => {
    expect(entry).toMatch(/import '\.\/mobileFullHeight\.css'/)
    expect(entry).toMatch(/installStandaloneViewport\(\)/)
  })
  it('never sizes html, body, #root or the shell', () => {
    for (const block of rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, sel, body] = block
      if (/(^|[\s,])(html|body|#root)\b|\.app-shell[^{]*$/.test(sel.trim()) && !/mobile-bottom-nav|::after/.test(sel)) {
        expect(body).not.toMatch(/(^|[\s;])(min-|max-)?height\s*:/)
      }
    }
  })
  it('skips everything while an inventory count session is open', () => {
    const selectors = [...rules.matchAll(/([^{}@]+)\{/g)].map((m) => m[1].trim()).filter((s) => s.includes('.app-shell'))
    expect(selectors.length).toBeGreaterThan(0)
    for (const s of selectors) for (const part of s.split(',')) {
      expect(part).toMatch(/:not\(\.stock-focus-mode\):not\(:has\(\.inventory-count-session\)\)/)
    }
  })
  it('stock action bar stays docked on the lowered tab bar', () => {
    expect(css).toMatch(/\.mobile-manager-stock-action-bar\s*\{\s*bottom:\s*calc\(var\(--one-mobile-nav-bottom\)\s*-\s*var\(--one-standalone-gap\)\s*\+\s*56px\)/)
  })
  it('nav sits max(10px, inset - 20px) above the physical bottom', () => {
    expect(css).toMatch(/--one-mobile-nav-bottom:\s*max\(10px,\s*calc\(env\(safe-area-inset-bottom,\s*0px\)\s*-\s*20px\)\)/)
    expect(css).toMatch(/\.mobile-staff-app \.mobile-bottom-nav\s*\{\s*bottom:\s*calc\(var\(--one-mobile-nav-bottom\)\s*-\s*var\(--one-standalone-gap\)\)/)
  })
})
