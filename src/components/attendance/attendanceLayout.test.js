import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

function mediaBlocks(source, query) {
  const blocks = []
  let from = 0
  while (from < source.length) {
    const start = source.indexOf(query, from)
    if (start < 0) break
    let depth = 0
    let end = -1
    for (let index = source.indexOf('{', start); index < source.length; index += 1) {
      if (source[index] === '{') depth += 1
      if (source[index] === '}') {
        depth -= 1
        if (depth === 0) {
          end = index + 1
          break
        }
      }
    }
    if (end < 0) throw new Error(`Unclosed media block: ${query}`)
    blocks.push(source.slice(start, end))
    from = end
  }
  return blocks
}

describe('attendance layout', () => {
  it('keeps the manager board in three columns on landscape widths', () => {
    expect(css).toContain('.attendance-board-grid {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));')
  })

  it('stacks the board on a portrait phone and keeps clock buttons large', () => {
    const portrait = css.slice(css.lastIndexOf('@media (max-width: 760px)'))
    expect(portrait).toContain('.attendance-board-grid')
    expect(portrait).toContain('grid-template-columns: 1fr;')
    expect(css).toContain('.attendance-action {\n  width: 100%;\n  min-height: 56px;')
  })

  it('compacts attendance and the host sidebar on a short 900px screen', () => {
    const blocks = mediaBlocks(css, '@media (max-width: 900px)')
    const attendance = blocks.find((block) => block.includes('is-attendance-view'))
    const landscape = blocks.find((block) => block.includes('max-height: 500px'))

    expect(attendance).toContain('.app-shell.is-attendance-view:not(.is-mobile-shell)')
    expect(attendance).toContain('grid-template-columns: 72px minmax(0, 1fr)')
    expect(attendance).toContain('.app-shell.is-attendance-view .topbar')
    expect(attendance).toContain('max-height: 56px')
    expect(attendance).toContain('.app-shell.is-attendance-view .attendance-board-grid')
    expect(attendance).toContain('grid-template-columns: 1fr')
    expect(attendance).toContain('.app-shell.is-attendance-view .attendance-person-row')
    expect(attendance).toContain('overflow-x: auto')

    expect(landscape).toContain('.attendance-venue')
    expect(landscape).toContain('.app-shell.is-host-account:not(.is-mobile-shell)')
    expect(landscape).toContain('grid-template-columns: 72px minmax(0, 1fr)')
    expect(landscape).toContain('.app-shell.is-host-account:not(.is-mobile-shell) .nav-link')
    expect(landscape).toContain('.nav-link > span:last-child')
    expect(landscape).toContain('min-height: 44px')

    for (const query of [
      '@media (max-width: 1180px)',
      '@media (max-width: 1280px)',
      '@media (min-width: 1180px)',
      '@media (min-width: 1280px)',
    ]) {
      for (const block of mediaBlocks(css, query)) {
        expect(block).not.toContain('is-attendance-view')
        expect(block).not.toContain('is-host-account')
      }
    }
  })
})
