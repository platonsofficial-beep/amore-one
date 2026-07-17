/**
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')
const appNavigationSource = readFileSync(resolve(process.cwd(), 'src/lib/appNavigation.js'), 'utf8')

describe('Stock full-screen workspace shell wiring', () => {
  it('activates Stock focus mode only outside dedicated mobile shells', () => {
    expect(appSource).toContain('const isStockFocusMode = isStockWorkspaceView(activeView) && !useDedicatedShell')
    expect(appSource).toContain('hideGlobalAppSidebar = useDedicatedShell || useReservationsHostDedicatedShell || isScheduleFocusMode || isStockFocusMode')
    expect(appSource).toContain("${isStockFocusMode ? ' stock-focus-mode' : ''}")
  })

  it('hides the global sidebar and standard topbar while Stock workspace is active', () => {
    expect(appSource).toContain('!hideGlobalAppSidebar ? (')
    expect(appNavigationSource).toContain('|| isStockWorkspaceView(activeView)')
    expect(appSource).toContain('const hideStandardTopbar = shouldHideStandardTopbar(activeView, teamSection)')
  })

  it('renders Stock content with Exit Stock control and preserved search chrome', () => {
    expect(appSource).toContain('aria-label="Exit Stock"')
    expect(appSource).toContain('← Exit Stock')
    expect(appSource).toContain('handleExitStockFocusMode')
    expect(appSource).toContain('resolveExitStockDestination(preStockViewRef.current)')
    expect(appSource).toContain('className="stock-focus-header"')
    expect(appSource).toContain('stock-focus-search')
    expect(appSource).toContain("activeView === 'stock' && stockSection === 'dashboard'")
    expect(appSource).toContain('sections={STOCK_SECTIONS}')
  })

  it('does not use browser history back for Exit Stock', () => {
    expect(appSource).toContain('const handleExitStockFocusMode = useCallback(() => {')
    expect(appSource).not.toMatch(/handleExitStockFocusMode[\s\S]{0,200}history\.back\(/)
    expect(appSource).not.toMatch(/handleExitStockFocusMode[\s\S]{0,200}window\.history/)
  })

  it('collapses the desktop sidebar grid for Stock focus mode', () => {
    expect(appCss).toContain('.app-shell.stock-focus-mode')
    expect(appCss).toMatch(/\.app-shell\.stock-focus-mode\s*\{[\s\S]*?grid-template-columns:\s*1fr;/)
    expect(appCss).toContain('.stock-focus-exit-btn')
    expect(appCss).toMatch(/\.stock-focus-exit-btn\s*\{[\s\S]*?min-height:\s*44px;/)
  })

  it('does not alter Reservations or Schedule focus wiring', () => {
    expect(appSource).toContain('const isScheduleFocusMode = isTeamScheduleView(activeView, teamSection) && !useDedicatedShell')
    expect(appSource).toContain('handleTeamSectionChange(\'members\')')
    expect(appSource).toContain('resolveExitReservationsHostDestination')
    expect(appSource).toContain('useHostStationShell = isHostMobileShell || useReservationsHostDedicatedShell')
  })
})
