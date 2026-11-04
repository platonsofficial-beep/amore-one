/**
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

const ruleBody = (selector) => {
  const at = appCss.lastIndexOf(`${selector} {`)
  if (at < 0) return null
  return appCss.slice(at, appCss.indexOf('}', at))
}

describe('Schedule focus header leaves room for the floating Help "?" (0045)', () => {
  const block = appCss.slice(appCss.lastIndexOf('@media (max-height: 460px) {\n  .app-shell.schedule-focus-mode'))

  it('reserves the ? width at the end of the toolbar row in phone landscape', () => {
    expect(block.startsWith('@media (max-height: 460px)')).toBe(true)
    const body = ruleBody('.app-shell.schedule-focus-mode:not(.is-mobile-shell):has(.help-mode-fallback) .schedule-focus-header')
    expect(body).toMatch(/padding-inline-end:\s*48px/)
  })

  it('reserves room for the ? and the bell when both float', () => {
    const body = ruleBody('.app-shell.schedule-focus-mode:not(.is-mobile-shell):has(.help-mode-fallback):has(.notification-bell-btn) .schedule-focus-header')
    expect(body).toMatch(/padding-inline-end:\s*100px/)
  })
})
