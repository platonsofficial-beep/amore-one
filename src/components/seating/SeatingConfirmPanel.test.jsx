/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { SeatingConfirmPanel } from './SeatingConfirmPanel'

vi.mock('../../lib/PublishedFloorPlanContext', () => ({
  usePublishedFloorPlan: () => ({
    layout: {
      tables: [{
        id: 'table-10',
        displayLabel: 'Table 10',
        seatedCapacity: 2,
        maxGuestCapacity: 3,
        unitType: 'table',
      }, {
        id: 'table-15',
        displayLabel: 'Table 15',
        seatedCapacity: 2,
        maxGuestCapacity: 4,
        unitType: 'table',
      }],
    },
  }),
}))

const baseReservation = {
  id: 'res-1',
  guestName: 'Xrisanthimos',
  guests: 2,
  time: '17:00',
}

beforeEach(() => {
  global.ResizeObserver = class {
    observe() {}

    disconnect() {}

    unobserve() {}
  }
})

function renderPanel(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(SeatingConfirmPanel, {
      variant: 'host-drawer',
      reservation: baseReservation,
      seating: { id: 'dinner-1', name: 'Dinner 1', startTime: '17:00' },
      selectedUnitIds: [],
      extraChairs: 0,
      standingGuests: 0,
      onExtraChairsChange: vi.fn(),
      onStandingGuestsChange: vi.fn(),
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
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

describe('SeatingConfirmPanel host drawer', () => {
  it('renders dedicated assignment mode with header and close action', () => {
    const { container, unmount } = renderPanel()

    expect(container.querySelector('[data-assignment-mode="true"]')).toBeTruthy()
    expect(container.textContent).toContain('Assign seating')
    expect(container.textContent).toContain('Xrisanthimos')
    expect(container.textContent).toContain('17:00')
    expect(container.textContent).toContain('Dinner 1')
    expect(container.textContent).toContain('2 guests')
    expect(container.querySelector('[data-testid="host-assignment-close"]')).toBeTruthy()

    unmount()
  })

  it('keeps cancel and confirm actions visible in the sticky row', () => {
    const { container, unmount } = renderPanel()

    const actions = container.querySelector('[data-testid="host-assignment-actions"]')
    expect(actions).toBeTruthy()
    expect(container.querySelector('[data-testid="host-assignment-cancel"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="host-assignment-confirm"]')).toBeTruthy()

    unmount()
  })

  it('disables confirm when no tables are selected', () => {
    const { container, unmount } = renderPanel({ selectedUnitIds: [] })

    const confirm = container.querySelector('[data-testid="host-assignment-confirm"]')
    expect(confirm.disabled).toBe(true)
    expect(container.querySelector('[data-testid="host-assignment-advisory"]')?.textContent)
      .toContain('No tables selected')

    unmount()
  })

  it('enables confirm when one or more tables are selected', () => {
    const { container, unmount } = renderPanel({ selectedUnitIds: ['table-10'] })

    const confirm = container.querySelector('[data-testid="host-assignment-confirm"]')
    expect(confirm.disabled).toBe(false)
    expect(container.querySelector('[data-testid="host-assignment-selected-tables"]')?.textContent)
      .toContain('T10')

    unmount()
  })

  it('summarizes multiple selected tables', () => {
    const { container, unmount } = renderPanel({ selectedUnitIds: ['table-15', 'table-10'] })

    expect(container.querySelector('[data-testid="host-assignment-selected-tables"]')?.textContent)
      .toContain('T15 + T10')

    unmount()
  })

  it('uses the scrollable assignment details region', () => {
    const { container, unmount } = renderPanel()

    const scroll = container.querySelector('[data-testid="host-assignment-scroll"]')
    expect(scroll).toBeTruthy()
    expect(scroll.className).toContain('host-seating-drawer-scroll')

    unmount()
  })

  it('uses content-fit scroll policy for standard assignment content', () => {
    const { container, unmount } = renderPanel({ selectedUnitIds: ['table-10'] })

    const scroll = container.querySelector('[data-testid="host-assignment-scroll"]')
    expect(scroll?.getAttribute('data-scroll-policy')).toBe('content-fit')
    expect(scroll?.classList.contains('is-content-fit')).toBe(true)

    unmount()
  })

  it('keeps Guests, Capacity, and Extra chairs on one metrics row', () => {
    const { container, unmount } = renderPanel({ selectedUnitIds: ['table-10'], extraChairs: 1 })

    const metrics = container.querySelector('[data-testid="host-assignment-metrics"]')
    expect(metrics?.children.length).toBe(3)
    expect(metrics?.textContent).toContain('Guests')
    expect(metrics?.textContent).toContain('Capacity')
    expect(metrics?.textContent).toContain('Extra chairs')
    expect(container.querySelector('[data-testid="host-assignment-extra-chairs"]')).toBeTruthy()

    unmount()
  })

  it('keeps cancel and confirm visible without relying on scroll for standard content', () => {
    const { container, unmount } = renderPanel({ selectedUnitIds: ['table-10'] })

    const actions = container.querySelector('[data-testid="host-assignment-actions"]')
    const scroll = container.querySelector('[data-testid="host-assignment-scroll"]')

    expect(actions?.querySelector('[data-testid="host-assignment-cancel"]')).toBeTruthy()
    expect(actions?.querySelector('[data-testid="host-assignment-confirm"]')).toBeTruthy()
    expect(scroll?.getAttribute('data-scroll-policy')).toBe('content-fit')
    expect(container.querySelector('[data-layout-density="tablet"]')).toBeTruthy()

    unmount()
  })

  it('invokes cancel from the close action', () => {
    const onCancel = vi.fn()
    const { container, unmount } = renderPanel({ onCancel })

    act(() => {
      container.querySelector('[data-testid="host-assignment-close"]').click()
    })

    expect(onCancel).toHaveBeenCalledTimes(1)
    unmount()
  })
})
