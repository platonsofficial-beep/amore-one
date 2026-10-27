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
    let depth = 0
    let end = -1
    for (let index = css.indexOf('{', start); index < css.length; index += 1) {
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

describe('settings compact layout', () => {
  it('uses a narrow nav and top tabs at 900px and leaves 1180 and 1280 alone', () => {
    const compact = mediaBlocks(appCss, '@media (max-width: 900px)')
      .find((block) => block.includes('is-settings-view'))
    expect(compact).toContain('.app-shell.is-settings-view:not(.is-mobile-shell)')
    expect(compact).toContain('grid-template-columns: 72px minmax(0, 1fr)')
    expect(compact).toContain('.app-shell.is-settings-view .workspace-nav-links')
    expect(compact).toContain('flex-wrap: nowrap')
    expect(compact).toContain('min-height: 44px')
    expect(compact).toContain('.app-shell.is-settings-view .topbar')
    expect(compact).toContain('max-height: 56px')
    expect(compact).toContain('.app-shell.is-settings-view .topbar .date-pill')
    expect(compact).toContain('.app-shell.is-settings-view .topbar .welcome-subtitle')
    expect(compact).toContain('.app-shell.is-settings-view .topbar .profile-chip')

    for (const query of [
      '@media (max-width: 1180px)',
      '@media (max-width: 1280px)',
      '@media (min-width: 1180px)',
      '@media (min-width: 1280px)',
    ]) {
      for (const block of mediaBlocks(appCss, query)) {
        expect(block).not.toContain('is-settings-view')
      }
    }
  })

  it('keeps phone-landscape settings sections on one scrolling tab row', () => {
    const landscape = mediaBlocks(mobileShellCss, '@media (orientation: landscape) and (max-height: 500px)')
      .find((block) => block.includes('is-settings-view'))
    expect(landscape).toContain('.app-shell.is-mobile-shell.is-settings-view .workspace-nav-links')
    expect(landscape).toContain('flex-wrap: nowrap')
    expect(landscape).toContain('min-height: 44px')
  })

  it('keeps a pressed weekday chip visibly selected', () => {
    expect(appCss).toContain(".workspace-seating-day-chip[aria-pressed='true']")
    expect(appCss).toMatch(/\.workspace-seating-day-chip\.is-active[\s\S]*background:\s*rgba\(212,\s*175,\s*55,\s*0\.38\)/)
  })
})
