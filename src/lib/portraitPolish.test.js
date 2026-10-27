import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
const mobileShellCss = readFileSync(resolve(process.cwd(), 'src/mobileShell.css'), 'utf8')
const chatCss = readFileSync(resolve(process.cwd(), 'src/components/chat/chat.css'), 'utf8')

function mediaBlocks(css, query) {
  const blocks = []
  let from = 0
  while (from < css.length) {
    const start = css.indexOf(query, from)
    if (start < 0) break
    const open = css.indexOf('{', start)
    if (open < 0) break
    let depth = 0
    let end = -1
    for (let index = open; index < css.length; index += 1) {
      if (css[index] === '{') depth += 1
      if (css[index] === '}') {
        depth -= 1
        if (depth === 0) {
          end = index + 1
          break
        }
      }
    }
    if (end < 0) throw new Error(`Unclosed media block: ${query}`)
    blocks.push(css.slice(start, end))
    from = end
  }
  return blocks
}

describe('portrait polish layout', () => {
  it('keeps short week-builder names inside a 900px rule', () => {
    const narrow = mediaBlocks(appCss, '@media (max-width: 900px)')
      .find((block) => block.includes('portrait-week-names'))
    expect(narrow).toContain('word-break: normal')
    expect(narrow).toContain('white-space: normal')
    expect(narrow).toContain('.blend-grid-header-day-name')
    expect(narrow).not.toContain('text-overflow: ellipsis')
    const shortHeader = mediaBlocks(appCss, '@media (max-height: 430px)')
      .find((block) => block.includes('portrait-week-header'))
    expect(shortHeader).toContain('.schedule-focus-workspace .schedule-header')

    for (const query of [
      '@media (max-width: 1180px)',
      '@media (max-width: 1280px)',
      '@media (min-width: 1180px)',
      '@media (min-width: 1280px)',
    ]) {
      for (const block of mediaBlocks(appCss, query)) {
        expect(block).not.toContain('portrait-week-names')
        expect(block).not.toContain('portrait-week-header')
      }
    }
  })

  it('clears the portrait banner, header strip, stock bar, and chat bell', () => {
    expect(mobileShellCss).toContain('margin: 52px 0 8px')
    expect(mobileShellCss).toMatch(/\.manager-portrait-module-header\s*\{[^}]*background:\s*transparent/)
    expect(mobileShellCss).toContain('.mobile-manager-app .manager-portrait-module .module-section-tabs ~ .module-section-tabs')
    expect(mobileShellCss).toContain('-webkit-line-clamp: 2')
    expect(mobileShellCss).toContain('background: #12141c')
    expect(mobileShellCss).toContain('border-top: 1px solid rgba(255, 255, 255, 0.18)')
    expect(mobileShellCss).toContain('.mobile-manager-app .manager-portrait-screen-header')
    expect(mobileShellCss).toContain('padding-right: 56px')
    expect(mobileShellCss).toContain('padding-right: 16px')
    expect(mobileShellCss).toContain('reservation-phone-field-country-picker-trigger')
    expect(mobileShellCss).toContain('grid-template-columns: minmax(0, 1fr)')
    const portrait = mediaBlocks(mobileShellCss, '@media (max-width: 760px) and (orientation: portrait)')
      .find((block) => block.includes('#12141c'))
    expect(portrait).toContain('.mobile-manager-app .mobile-manager-stock-list')
    expect(chatCss).toContain('padding-right: 84px')
    const chatPortrait = mediaBlocks(chatCss, '@media (max-width: 760px) and (orientation: portrait)')
      .find((block) => block.includes('chat-list-header'))
    expect(chatPortrait).toContain('padding-right: 84px')
  })

  it('does not keep notification settings mounted on the chat route', () => {
    expect(appSource).toContain("notificationSettingsOpen && !useDedicatedShell && activeView !== 'chat'")
    expect(appSource).toContain("if (activeView !== 'chat') return")
    expect(appSource).toContain('setNotificationSettingsOpen(false)')
    expect(appSource).toContain("notificationSettings: activeView === 'chat' ? null : notificationSettingsPanel")
    expect(appCss).toContain('.app-shell.is-chat-view .notification-quiet-times')
  })
})
