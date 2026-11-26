/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileManagerScheduleDayView } from './MobileManagerScheduleDayView'

const sections = [
  { id: 'today', label: 'Today' },
  { id: 'members', label: 'People' },
  { id: 'schedule', label: 'Schedule' },
]

function renderDay(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onSectionChange = props.onSectionChange ?? vi.fn()
  act(() => {
    root.render(createElement(MobileManagerScheduleDayView, {
      dateKey: '2026-11-26',
      todayKey: '2026-11-26',
      shifts: [],
      sections,
      activeSection: 'schedule',
      onSectionChange,
      ...props,
    }))
  })
  return {
    container,
    onSectionChange,
    cleanup() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})

describe('phone day schedule', () => {
  it('keeps Today and People reachable when the day has no shifts', () => {
    const view = renderDay()
    expect(view.container.textContent).toContain('No shifts on this day.')
    const tabs = [...view.container.querySelectorAll('.module-section-tab')].map((tab) => tab.textContent)
    expect(tabs).toEqual(['Today', 'People', 'Schedule'])
    act(() => {
      view.container.querySelectorAll('.module-section-tab')[1].click()
    })
    expect(view.onSectionChange).toHaveBeenCalledWith('members')
    view.cleanup()
  })
})
