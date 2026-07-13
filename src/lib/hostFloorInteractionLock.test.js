import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

describe('host floor interaction lock', () => {
  it('defaults the host floor to locked on initial load', () => {
    expect(appSource).toContain('const [floorInteractionLocked, setFloorInteractionLocked] = useState(true)')
  })

  it('replaces reset with a touch-friendly lock toggle in zoom controls', () => {
    expect(appSource).toContain('data-testid="host-floor-interaction-lock"')
    expect(appSource).toContain('floor-plan-zoom-lock')
    expect(appSource).toContain('🔒')
    expect(appSource).toContain('🔓')
    expect(appSource).not.toContain('floor-plan-zoom-reset')
    expect(appSource).not.toContain('handleFloorZoomReset')
    expect(appCss).toContain('.floor-plan-zoom-lock')
    expect(appCss).not.toContain('.floor-plan-zoom-reset')
  })

  it('gates pan handlers through interactionLocked without forking the viewport', () => {
    expect(appSource).toContain('interactionLocked: floorInteractionLocked')
    expect(appSource).toContain('is-floor-interaction-locked')
    expect(appSource).toMatch(/floorInteractionLocked \? null : getHostFloorPanOffset/)
    expect(appSource).not.toMatch(/floorInteractionLocked[\s\S]{0,240}floor-plan-viewport[\s\S]{0,240}floor-plan-viewport/)
  })

  it('allows page scroll and pinch zoom touch actions while locked', () => {
    expect(appCss).toMatch(/\.floor-plan-viewport\.is-host-viewport\.is-floor-interaction-locked[\s\S]*touch-action:\s*pan-y pinch-zoom/)
  })
})
