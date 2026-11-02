/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ReservationAutoClosedBadge } from './ReservationAutoClosedBadge'

function renderBadge(reservation, props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(ReservationAutoClosedBadge, {
      reservation,
      ...props,
    }))
  })

  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('ReservationAutoClosedBadge', () => {
  it('shows the bilingual badge and a manager undo control', () => {
    const onUndo = vi.fn()
    const reservation = {
      id: 'marika',
      guestName: 'Marika',
      status: 'Checked Out',
      autoClosedAt: '2026-10-27T02:15:00.000Z',
    }
    const view = renderBadge(reservation, { canUndo: true, onUndo })

    expect(view.container.textContent).toContain('κλείστηκε αυτόματα / Auto-closed')
    const button = view.container.querySelector('button')
    expect(button?.textContent).toBe('Undo')
    act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onUndo).toHaveBeenCalledWith(reservation)
    view.unmount()
  })

  it('hides the badge when the reservation was checked out by hand', () => {
    const view = renderBadge({
      guestName: 'Alex',
      status: 'Checked Out',
      autoClosedAt: null,
    }, { canUndo: true, onUndo: vi.fn() })

    expect(view.container.textContent).toBe('')
    view.unmount()
  })

  it('shows the badge without undo for non-managers', () => {
    const view = renderBadge({
      guestName: 'Marika',
      status: 'Checked Out',
      autoClosedAt: '2026-10-27T02:15:00.000Z',
    })

    expect(view.container.textContent).toContain('κλείστηκε αυτόματα / Auto-closed')
    expect(view.container.querySelector('button')).toBeNull()
    view.unmount()
  })
})
