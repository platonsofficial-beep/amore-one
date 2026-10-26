import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
const compactTableSource = readFileSync(resolve(process.cwd(), 'src/components/floor/HostFloorCompactTableContent.jsx'), 'utf8')

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
    expect(appSource).toContain('diningTimerLabelPlacement={diningTimerExternalLabelPlacements.get(tableState.table.id) ?? null}')
    expect(appSource).toContain('data-testid="floor-table-dining-timer-external"')
    expect(appSource).toContain('data-placement={diningTimerLabelPlacement?.position ?? \'below\'}')
    expect(appSource).toContain('diningTimerPresentation?.externalLabel')
    expect(appSource).toContain('{diningTimerPresentation.externalLabel}')
    expect(compactTableSource).not.toContain('floor-table-dining-timer')
    expect(appSource).toContain('buildDiningTimerExternalLabelPlacementMap')
    expect(appSource).toMatch(/buildHostFloorDiningTimerPresentation\([\s\S]*?hostIndicator: hostOperational\?\.hostIndicator,/)
  })

  it('keeps dining timer overlay non-interactive in host floor CSS', () => {
    expect(appCss).toMatch(/\.floor-table-dining-timer-external[\s\S]*pointer-events:\s*none/)
    expect(appCss).toMatch(/\.floor-table-dining-timer-external \{[^}]*white-space:\s*nowrap/)
    expect(appCss).not.toMatch(/\.floor-table-dining-timer-external \{[^}]*text-overflow:\s*ellipsis/)
    expect(appCss).toContain('.floor-table-dining-timer-external')
    expect(appCss).toContain('.floor-table-dining-timer-external.is-placement-above')
    expect(appCss).toContain('.floor-table-dining-timer-external.is-placement-below')
    expect(appCss).toContain('.floor-table-dining-timer-external.is-placement-left')
    expect(appCss).toContain('.floor-table-dining-timer-external.is-placement-right')
    expect(appCss).toContain('.floor-table-dining-timer-external.is-urgency-normal')
    expect(appCss).toContain('.floor-table-dining-timer-external.is-urgency-approaching')
    expect(appCss).toContain('.floor-table-dining-timer-external.is-urgency-overdue')
    expect(appCss).toMatch(/\.floor-table-dining-timer-external[\s\S]*z-index:\s*3/)
    expect(appCss).toMatch(/\.floor-table-dining-timer-external[\s\S]*font-size:\s*0\.75rem/)
    expect(appCss).toMatch(/\.floor-plan-reservation-links[\s\S]*z-index:\s*0/)
    expect(appCss).toMatch(/\.floor-table-node\.shape-round \.floor-table-node-surface[\s\S]*border-radius:\s*999px/)
    expect(appCss).toContain('.floor-table-node.shape-square .floor-table-node-surface')
    expect(appCss).toContain('font-size: clamp(0.58rem, 12cqb, 0.86rem)')
    expect(appCss).toContain('font-size: clamp(0.52rem, 11cqb, 0.72rem)')
  })

  it('does not alter table tap handlers when wiring dining timers', () => {
    expect(appSource).toContain('onHostTableDirectTap')
    expect(appSource).toContain('hostTableTapRegistry')
    expect(appSource).not.toMatch(/diningTimerPresentation[\s\S]{0,120}preventDefault\(/)
  })
})
