import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

describe('host floor dining timer wiring', () => {
  it('defaults dining timers to off on initial load', () => {
    expect(appSource).toContain('const [showDiningTimers, setShowDiningTimers] = useState(false)')
  })

  it('adds a compact host floor toolbar toggle with a touch-friendly test id', () => {
    expect(appSource).toContain('data-testid="host-floor-dining-timers-toggle"')
    expect(appSource).toContain('⏱ Timers')
    expect(appCss).toContain('.floor-plan-dining-timers-btn')
  })

  it('uses one shared dining timer clock only when compact host timers are enabled', () => {
    expect(appSource).toContain('useHostDiningTimerClock(')
    expect(appSource).toContain('isCompact && !isHeatmap && showDiningTimers')
  })

  it('passes dining timer props only through the compact host floor table node', () => {
    expect(appSource).toContain('showDiningTimers={showDiningTimers}')
    expect(appSource).toContain('diningTimerNowMinutes={diningTimerNowMinutes}')
    expect(appSource).toContain('diningTimerPresentation={diningTimerPresentation}')
    expect(appSource).toMatch(/buildHostFloorDiningTimerPresentation\([\s\S]*?hostIndicator: hostOperational\?\.hostIndicator,/)
  })

  it('keeps dining timer overlay non-interactive in host floor CSS', () => {
    expect(appCss).toMatch(/\.floor-table-dining-timer[\s\S]*pointer-events:\s*none/)
  })

  it('does not alter table tap handlers when wiring dining timers', () => {
    expect(appSource).toContain('onHostTableDirectTap')
    expect(appSource).toContain('hostTableTapRegistry')
    expect(appSource).not.toMatch(/diningTimerPresentation[\s\S]{0,120}preventDefault\(/)
  })
})
