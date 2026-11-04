// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/PublishedFloorPlanContext', () => ({ usePublishedFloorPlan: () => ({ layout: null }) }))

import { MobileManagerReservationsView } from './MobileManagerReservationsView'

const reservation = { id: 'r1', date: '2026-11-04', time: '13:30', guestName: 'Maria Papariga', guests: 4, tableNumber: 'T10 + T11', status: 'Checked In', notes: '' }

Element.prototype.scrollIntoView ??= () => {}

function mount(props) {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(
    <MobileManagerReservationsView reservations={[reservation]} selectedDate="2026-11-04" todayKey="2026-11-04" canManage {...props} />,
  ))
  return { container, root }
}

describe('portrait status pill (Platon t447u)', () => {
  it('opens the status sheet and changes status through onQuickStatusUpdate', async () => {
    const onQuickStatusUpdate = vi.fn(() => Promise.resolve())
    const { container, root } = mount({ onQuickStatusUpdate })
    const pill = container.querySelector('button.manager-portrait-reservation-status')
    expect(pill).not.toBeNull()
    expect(pill.closest('.manager-portrait-reservation')).toBeNull()
    act(() => pill.click())
    const sheet = document.querySelector('.host-status-picker.is-sheet')
    expect(sheet).not.toBeNull()
    expect(sheet.querySelector('.host-status-picker-option.is-active')?.textContent).toContain('Seated')
    expect(document.querySelector('.manager-portrait-reservation-sheet, .mobile-sheet-backdrop')).toBeNull()
    const cancelled = [...sheet.querySelectorAll('.host-status-picker-option')].find((b) => b.textContent.includes('Cancelled'))
    await act(async () => { cancelled.click() })
    expect(onQuickStatusUpdate).toHaveBeenCalledWith(reservation, 'Cancelled')
    expect(document.querySelector('.host-status-picker')).toBeNull()
    act(() => root.unmount())
  })

  it('keeps the pill display-only without a status handler', () => {
    const { container, root } = mount({})
    expect(container.querySelector('button.manager-portrait-reservation-status')).toBeNull()
    expect(container.querySelector('span.manager-portrait-reservation-status')).not.toBeNull()
    act(() => root.unmount())
  })
})
