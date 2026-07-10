import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

describe('host station production UI', () => {
  it('does not wire visible production table tap debug markers', () => {
    expect(appSource).not.toContain('HostTableTapDirectMarker')
    expect(appSource).not.toContain('TABLE TAP DIRECT')
    expect(appSource).not.toContain('lastHostTableTapLabel')
    expect(appCss).not.toContain('.host-table-tap-direct-marker')
  })

  it('keeps host floor debug overlay dev-only', () => {
    expect(appSource).toContain('isHostFloorDebugEnabled() ? <HostFloorDebugOverlay /> : null')
  })

  it('keeps table day view above the host shell z-index stack', () => {
    expect(appCss).toMatch(/\.floor-table-seating-dialog-overlay[\s\S]*z-index:\s*1500/)
  })
})
