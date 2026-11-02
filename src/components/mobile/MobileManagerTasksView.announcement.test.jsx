// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { MobileManagerTasksView } from './MobileManagerTasksView'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function render(props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(createElement(MobileManagerTasksView, { todayKey: '2026-11-02', ...props })))
  return { container, unmount: () => { act(() => root.unmount()); container.remove() } }
}

describe('MobileManagerTasksView announcements', () => {
  it('hides + Announcement when the user cannot manage announcements', () => {
    const view = render({})
    expect(view.container.querySelector('[data-testid="mobile-manager-new-announcement"]')).toBeNull()
    view.unmount()
  })

  it('opens the announcement form from + Announcement', async () => {
    const onCreateAnnouncement = vi.fn()
    const view = render({ onCreateAnnouncement })
    const btn = view.container.querySelector('[data-testid="mobile-manager-new-announcement"]')
    expect(btn?.textContent).toBe('+ Announcement')
    await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(document.body.textContent).toContain('Publish')
    view.unmount()
  })
})
