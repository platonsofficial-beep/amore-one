/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '../../i18n/i18n'

vi.mock('../../services/attendanceService', () => ({
  loadAttendanceEntries: vi.fn(async () => [
    { review_status: 'pending' },
    { review_status: 'pending' },
    { review_status: 'approved' },
  ]),
}))

import { StaffHoursSettingsRow } from './StaffHoursSettingsRow'
import { loadAttendanceEntries } from '../../services/attendanceService'

function renderRow(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onOpen = props.onOpen ?? vi.fn()
  act(() => {
    root.render(createElement(StaffHoursSettingsRow, { onOpen, ...props }))
  })
  return {
    container,
    onOpen,
    cleanup() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})

afterEach(() => {
  setLocale('en')
  vi.clearAllMocks()
})

describe('Staff hours settings row', () => {
  it('shows the label, a pending badge, and opens hours', () => {
    const view = renderRow({ pendingCount: 2 })
    const button = view.container.querySelector('.staff-hours-link')
    expect(button.textContent).toContain('Staff hours')
    expect(button.querySelector('.hours-review-count')?.textContent).toBe('2')
    expect(loadAttendanceEntries).not.toHaveBeenCalled()
    act(() => button.click())
    expect(view.onOpen).toHaveBeenCalledOnce()
    view.cleanup()
  })

  it('hides a zero count', () => {
    const view = renderRow({ pendingCount: 0 })
    expect(view.container.querySelector('.hours-review-count')).toBeNull()
    view.cleanup()
  })

  it('uses the Greek state label', () => {
    setLocale('el')
    const view = renderRow({ pendingCount: 1 })
    expect(view.container.querySelector('.staff-hours-link-label')?.textContent).toBe('Ώρες προσωπικού')
    view.cleanup()
  })

  it('loads this week’s pending count when none is supplied', async () => {
    const view = renderRow({ workspaceId: 'ws-1', timeZone: 'Europe/Nicosia' })
    await act(async () => {
      await Promise.resolve()
    })
    expect(loadAttendanceEntries).toHaveBeenCalledWith('ws-1', expect.objectContaining({
      fromDate: expect.any(String),
      toDate: expect.any(String),
    }))
    expect(view.container.querySelector('.hours-review-count')?.textContent).toBe('2')
    view.cleanup()
  })
})
