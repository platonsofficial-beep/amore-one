import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
const mobileShellCss = readFileSync(resolve(process.cwd(), 'src/mobileShell.css'), 'utf8')

function mediaBlocks(css, query) {
  const blocks = []
  let from = 0
  while (from < css.length) {
    const start = css.indexOf(query, from)
    if (start < 0) break
    const nextQuery = css.indexOf('@media', start + query.length)
    const sliceEnd = nextQuery < 0 ? css.length : nextQuery
    const open = css.indexOf('{', start)
    if (open < 0 || open > sliceEnd) break
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

describe('personal compact layout', () => {
  it('uses a one-row header for My week, Profile, and Clock on short wide screens', () => {
    const compact = mediaBlocks(appCss, '@media (max-width: 900px) and (max-height: 500px)')
      .find((block) => block.includes('is-personal-view'))

    expect(compact).toContain('.app-shell.is-personal-view:not(.is-mobile-shell) .topbar')
    expect(compact).toContain('flex-wrap: nowrap')
    expect(compact).toContain('max-height: 56px')
    expect(compact).toContain('.app-shell.is-personal-view:not(.is-mobile-shell) .topbar .welcome-subtitle')
    expect(compact).toContain('.app-shell.is-personal-view:not(.is-mobile-shell) .topbar .date-pill')
    expect(compact).toContain('.app-shell.is-personal-view:not(.is-mobile-shell) .topbar .search-bar')
    expect(compact).toContain('.app-shell.is-personal-view:not(.is-mobile-shell) .topbar .profile-chip')
    expect(compact).toContain('min-height: 44px')
    expect(compact).toContain('.app-shell.is-chat-view:not(.is-mobile-shell) .topbar')
    expect(compact).toContain('.app-shell.is-chat-view.is-chat-thread:not(.is-mobile-shell) .topbar')
    expect(compact).toContain('.app-shell.is-chat-view:not(.is-mobile-shell) .topbar .welcome-subtitle')
    expect(compact).toContain('max-height: 56px')
    expect(compact).toContain('.app-shell.is-personal-view .mobile-availability .mobile-screen-eyebrow')
    expect(compact).toContain('.app-shell.is-personal-view .staff-host-personal-page .attendance-clock-kicker')
    expect(compact).toContain('.user-menu-item')

    for (const query of [
      '@media (max-width: 1180px)',
      '@media (max-width: 1280px)',
      '@media (min-width: 1180px)',
      '@media (min-width: 1280px)',
    ]) {
      for (const block of mediaBlocks(appCss, query)) {
        expect(block).not.toContain('is-personal-view')
        expect(block).not.toContain('is-chat-view')
        expect(block).not.toContain('is-chat-thread')
        expect(block).not.toContain('is-settings-view')
      }
    }
  })

  it('caps the portaled avatar menu to the viewport safe area', () => {
    expect(appCss).toContain('.user-menu-panel-portaled')
    expect(appCss).toContain('calc(100dvh - 16px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))')
    expect(appCss).toContain('z-index: 1320')
    expect(appCss).toContain('overscroll-behavior: contain')
  })

  it('shows Profile once, gives Clock back its own row, and slims Save Availability', () => {
    const compact = mediaBlocks(appCss, '@media (max-width: 900px) and (max-height: 500px)')
      .find((block) => block.includes('is-personal-view'))

    expect(compact).toMatch(/\.mobile-profile-header h1\s*\{[^}]*display:\s*none/)
    expect(compact).toMatch(/\.staff-host-clock-page\s*\{[^}]*flex-direction:\s*column/)
    expect(compact).toMatch(/\.staff-host-clock-page > \.mobile-back-btn\s*\{[^}]*position:\s*static/)
    expect(compact).toContain('.app-shell.is-personal-view .mobile-availability .mobile-availability-actions')
    expect(compact).toContain('justify-content: flex-end')
    expect(compact).toContain('height: 48px')
    expect(compact).toContain('.app-shell.is-personal-view .mobile-availability .mobile-availability-save-btn')
    expect(compact).not.toContain('padding-left: 88px')
  })

  it('compacts the phone-landscape personal headers without dropping actions', () => {
    const compact = mediaBlocks(mobileShellCss, '@media (max-width: 900px) and (max-height: 500px)')
      .find((block) => block.includes('mobile-availability'))
    expect(compact).toContain('.mobile-availability .mobile-screen-eyebrow')
    expect(compact).toContain('.mobile-profile-header')
    expect(compact).toContain('.attendance-clock-screen .attendance-clock-kicker')
    expect(compact).toContain('min-height: 44px')
    expect(compact).toContain('.mobile-availability .mobile-availability-actions')
    expect(compact).toContain('justify-content: flex-end')
    expect(compact).toContain('height: 48px')
  })
})
