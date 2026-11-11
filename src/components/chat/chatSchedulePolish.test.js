import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
const chatCss = readFileSync(resolve(process.cwd(), 'src/components/chat/chat.css'), 'utf8')

describe('chat and schedule screen use', () => {
  it('keeps one Chat title on the command-center shell', () => {
    expect(appCss).toContain('.app-shell.is-chat-view:not(.is-mobile-shell) .topbar-title-block')
    expect(appCss).toContain('.app-shell.is-chat-view:not(.is-mobile-shell) .main-panel.main-panel-chat > .topbar')
    expect(chatCss).toContain('min-height: 44px')
  })

  it('does not ellipsis the short-landscape draft note or shrink the week controls under 44px', () => {
    const start = appCss.indexOf('@media (max-height: 460px)')
    const next = appCss.indexOf('@media', start + 10)
    const block = appCss.slice(start, next)
    expect(block).toContain('min-height: 44px')
    expect(block).toContain('text-overflow: clip')
    expect(block).not.toContain('max-width: min(100%, 240px)')
    expect(block).not.toContain('height: 32px')
    expect(block).not.toMatch(/\.schedule-day-grid\s*\{[^}]*height:\s*100%/)
  })
})
