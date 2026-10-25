import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const indexCss = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')
const mobileShellCss = readFileSync(new URL('../mobileShell.css', import.meta.url), 'utf8')

describe('safe area insets', () => {
  it('defines the four viewport-fit insets once', () => {
    expect(indexCss).toMatch(/--one-safe-area-top:\s*env\(safe-area-inset-top,\s*0px\)/)
    expect(indexCss).toMatch(/--one-safe-area-right:\s*env\(safe-area-inset-right,\s*0px\)/)
    expect(indexCss).toMatch(/--one-safe-area-bottom:\s*env\(safe-area-inset-bottom,\s*0px\)/)
    expect(indexCss).toMatch(/--one-safe-area-left:\s*env\(safe-area-inset-left,\s*0px\)/)
  })

  it('insets the app shell from the landscape notch without moving stock-count vertical padding', () => {
    expect(appCss).toMatch(/\.app-shell\s*\{[^}]*padding-left:\s*var\(--one-safe-area-left/s)
    expect(appCss).toMatch(/\.app-shell\s*\{[^}]*padding-right:\s*var\(--one-safe-area-right/s)
    expect(appCss).toMatch(
      /\.app-shell:not\(\.is-mobile-shell\):not\(\.is-host-station-shell\):not\(\.stock-focus-mode\)\s*\{[^}]*padding-top:\s*var\(--one-safe-area-top/s,
    )
    expect(appCss).toMatch(
      /\.app-shell\.stock-focus-mode\s+\.main-panel-stock\s*\{[^}]*max\(16px,\s*env\(safe-area-inset-bottom/s,
    )
  })

  it('keeps the fixed bottom nav inside the side safe areas, including short landscape', () => {
    expect(mobileShellCss).toMatch(
      /\.mobile-bottom-nav\s*\{[^}]*left:\s*var\(--one-safe-area-left/s,
    )
    expect(mobileShellCss).toMatch(
      /\.mobile-manager-app\s+\.mobile-bottom-nav\s*\{[^}]*left:\s*max\(14px,\s*var\(--one-safe-area-left/s,
    )
    expect(mobileShellCss).toMatch(
      /\.mobile-manager-app\s+\.mobile-bottom-nav\s*\{[^}]*left:\s*max\(10px,\s*var\(--one-safe-area-left/s,
    )
  })
})
