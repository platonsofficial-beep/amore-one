/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import {
  HostMultiTableSelectionBar,
  getHostMultiTableCapacityTotals,
  getHostMultiTableConfirmLabels,
} from '../components/floor/HostMultiTableSelectionBar'

const LAYOUT = {
  units: [
    { id: 't15', label: 'T15', zoneId: 'main', seatedCapacity: 2, maxGuestCapacity: 4 },
    { id: 't16', label: 'T16', zoneId: 'main', seatedCapacity: 2, maxGuestCapacity: 4 },
  ],
}

describe('HostMultiTableSelectionBar', () => {
  it('renders selected table summary and actions', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(HostMultiTableSelectionBar, {
        selectedUnitIds: ['t15', 't16'],
        reservation: { guests: 5 },
        layout: LAYOUT,
        onCancel: () => {},
        onContinue: () => {},
      }))
    })

    expect(container.querySelector('[data-testid="host-multi-table-selection-bar"]')).toBeTruthy()
    expect(container.textContent).toContain('2 tables selected')
    expect(container.textContent).toContain('T15 + T16')
    expect(container.textContent).toContain('Capacity 8')
    expect(container.textContent).toContain('Guests 5')
    expect(container.querySelector('[data-testid="host-multi-table-cancel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="host-multi-table-continue"]')).toBeTruthy()

    act(() => root.unmount())
    container.remove()
  })

  it('builds confirm labels and capacity totals for multiple tables', () => {
    expect(getHostMultiTableConfirmLabels(['t15', 't16'], LAYOUT)).toBe('T15 + T16')

    const totals = getHostMultiTableCapacityTotals(['t15', 't16'], LAYOUT, 5)
    expect(totals.totalGuestCapacity).toBe(8)
    expect(totals.isOverCapacity).toBe(false)
  })
})
