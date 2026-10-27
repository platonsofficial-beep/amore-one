import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

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
})
