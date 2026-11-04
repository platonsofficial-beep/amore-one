/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StockLiveCard } from '../stock/StockLiveCard'
import { TodayStatusCards } from './TodayStatusCards'
import { MobileManagerHomeView } from '../mobile/MobileManagerHomeView'
import { TodayAnnouncementsPanel } from './TodayAnnouncementsPanel'
import { buildTodayExecutiveMessage } from '../../lib/todayExecutiveMessage'
import { areaStatus, combineLoadStatus, loadAreaForCard, nextLoadStatus, stockLiveLoadStatus } from '../../lib/loadStatus'

const FAKE_ALL_GOOD = /Stock levels OK|0 open drafts|Schedule not published|No shifts scheduled today|No inventory counts yet|Everything looks under control/

let container
let root
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container) })
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals() })
const render = (ui) => act(() => root.render(ui))

const summary = {
  onShiftSummary: 'Schedule not published',
  teamScheduledSummary: 'No shifts scheduled today',
  reservationsSummaryLine: '0 reservations',
  tasksSummary: '0 open',
  stockSummaryLine: 'Stock levels OK',
}
const all = (status) => ({ schedule: status, stock: status, tasks: status, reservations: status, attention: status })

describe('loadStatus', () => {
  it('stays loading until the first answer and keeps ready data on background refresh', () => {
    expect(nextLoadStatus(undefined, 'start')).toBe('loading')
    expect(nextLoadStatus('loading', 'success')).toBe('ready')
    expect(nextLoadStatus('ready', 'start')).toBe('ready')
    expect(nextLoadStatus('ready', 'failure')).toBe('error')
    expect(nextLoadStatus('error', 'start')).toBe('loading')
  })
  it('combines statuses and treats never-started as loading', () => {
    expect(combineLoadStatus('ready', undefined)).toBe('loading')
    expect(combineLoadStatus('ready', 'error', 'loading')).toBe('error')
    expect(combineLoadStatus('ready', 'ready')).toBe('ready')
    expect(stockLiveLoadStatus('idle')).toBe('loading')
    expect(loadAreaForCard('on-shift')).toBe('schedule')
    expect(loadAreaForCard('schedule')).toBe('schedule')
    expect(loadAreaForCard('tasks')).toBe('tasks')
    expect(areaStatus(null, 'stock')).toBe('ready')
  })
})

describe('Today cards before data arrives', () => {
  it('StockLiveCard shows shimmer, not "Stock levels OK" / "0 open drafts", while loading', () => {
    render(createElement(StockLiveCard, { loadStatus: 'loading', stockSummary: { outOfStock: 0, lowStock: 0 }, stockOrders: [] }))
    expect(container.textContent).not.toMatch(FAKE_ALL_GOOD)
    expect(container.querySelectorAll('.data-pending-line').length).toBeGreaterThan(0)
  })

  it('StockLiveCard shows Couldn\'t load + Retry on failure', () => {
    const onRetry = vi.fn()
    render(createElement(StockLiveCard, { loadStatus: 'error', onRetry }))
    expect(container.textContent).toContain("Couldn't load")
    expect(container.textContent).not.toMatch(FAKE_ALL_GOOD)
    act(() => container.querySelector('.data-pending-retry').click())
    expect(onRetry).toHaveBeenCalled()
  })

  it('StockLiveCard shows real values once ready', () => {
    render(createElement(StockLiveCard, { loadStatus: 'ready', stockOrders: [], parsReady: true, parsStatus: 'ready' }))
    expect(container.textContent).toMatch(/open drafts/)
  })

  it('TodayStatusCards: placeholders while loading, retry on error, values when ready', () => {
    const onRetryData = vi.fn()
    const onSelect = vi.fn()
    render(createElement(TodayStatusCards, { statusSummary: summary, showStock: true, dataStatus: all('loading') }))
    expect(container.textContent).not.toMatch(FAKE_ALL_GOOD)
    expect(container.querySelector('button button')).toBeNull()

    render(createElement(TodayStatusCards, { statusSummary: summary, showStock: true, dataStatus: all('error'), onRetryData, onSelect }))
    expect(container.textContent).toContain("Couldn't load")
    act(() => container.querySelector('.today-status-premium-card').click())
    expect(onRetryData).toHaveBeenCalledWith('schedule')
    expect(onSelect).not.toHaveBeenCalled()

    render(createElement(TodayStatusCards, { statusSummary: summary, showStock: true, dataStatus: all('ready') }))
    expect(container.textContent).toContain('Schedule not published')
  })

  it('MobileManagerHomeView never claims all good before data arrives', () => {
    const props = {
      statusSummary: summary, attentionItems: [], canOpenStock: true, canOpenTeam: true, hasStockModuleData: true,
      stockLiveSnapshot: { belowParCount: 0, parsReady: false, status: 'loading' }, stockOrders: [],
    }
    render(createElement(MobileManagerHomeView, { ...props, dataStatus: all('loading') }))
    expect(container.textContent).not.toMatch(FAKE_ALL_GOOD)
    expect(container.querySelector('button button')).toBeNull()

    const onRetryData = vi.fn()
    render(createElement(MobileManagerHomeView, { ...props, dataStatus: all('error'), onRetryData }))
    expect(container.textContent).toContain("Couldn't load")
    expect(container.textContent).not.toMatch(FAKE_ALL_GOOD)

    render(createElement(MobileManagerHomeView, { ...props, dataStatus: all('ready') }))
    expect(container.textContent).toContain('Everything looks under control')
  })

  it('executive message never says "Everything is ready" before data arrives', () => {
    expect(buildTodayExecutiveMessage({ dataStatus: 'loading' }).message).not.toMatch(/Everything is ready/)
    expect(buildTodayExecutiveMessage({ dataStatus: 'error' }).message).toMatch(/Couldn't load/)
    expect(buildTodayExecutiveMessage({}).message).toMatch(/Everything is ready/)
  })

  it('announcements: no "No announcements right now" while loading', () => {
    render(createElement(TodayAnnouncementsPanel, { announcements: [], loadStatus: 'loading' }))
    expect(container.textContent).not.toMatch(/No announcements right now/)
    expect(container.textContent).toMatch(/Loading/)
    render(createElement(TodayAnnouncementsPanel, { announcements: [], loadStatus: 'ready' }))
    expect(container.textContent).not.toMatch(/Loading/)
  })

})
