import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const rule = (css, selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...css.matchAll(new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join('\n')
}

describe('full-bleed background on iOS home-screen app', () => {
  it('keeps viewport-fit=cover and the translucent status bar', () => {
    const html = read('../index.html')
    expect(html).toMatch(/viewport-fit=cover/)
    expect(html).toMatch(/black-translucent/)
  })

  it('paints the html canvas the app navy', () => {
    expect(rule(read('./index.css'), 'html')).toMatch(/background-color:\s*var\(--one-bg\)/)
  })

  it('mobile shell uses the same navy as the canvas (no seam)', () => {
    const body = rule(read('./mobileShell.css'), '.app-shell.is-mobile-shell')
    expect(body).toMatch(/background:\s*var\(--one-bg\)/)
    expect(body).not.toMatch(/--one-surface/)
  })

  it('splash reaches the physical bottom and the canvas matches it', () => {
    const css = read('./components/shell/coldStartSplash.css')
    const splash = rule(css, '.cold-start-splash')
    expect(splash).toMatch(/inset:\s*0/)
    expect(splash).toMatch(/height:\s*100lvh/)
    expect(splash).toMatch(/background:\s*var\(--cold-start-bg\)/)
    expect(css).toMatch(/html:has\(\.cold-start-splash\)[\s\S]*?background-color:\s*var\(--cold-start-bg\)/)
  })

  it('chat list has no stray right hairline when shown alone', () => {
    expect(rule(read('./components/chat/chat.css'), '.chat-screen:not(.is-split) .chat-list')).toMatch(/border-right:\s*0/)
  })
})
