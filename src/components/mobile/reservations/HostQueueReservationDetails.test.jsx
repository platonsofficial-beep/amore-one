/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import {
  buildHostQueueMetaGroups,
  HostQueueReservationDetails,
  HostReservationMetaGroups,
  HostReservationMetaLine,
} from './HostQueueReservationDetails'

const LAYOUT = {
  zones: [{ id: 'main', label: 'Main Dining' }],
}

function renderMetaLine(metaLine) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(HostReservationMetaLine, { metaLine }))
  })

  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function renderMetaGroups(groups) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(HostReservationMetaGroups, { groups }))
  })

  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function renderReservationDetails(reservation) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(HostQueueReservationDetails, {
      reservation,
      layout: LAYOUT,
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

function getGroupLabel(group) {
  const icon = group.querySelector('.host-queue-row-meta-icon')?.textContent ?? ''
  const text = group.querySelector('.host-queue-row-meta-text')?.textContent ?? ''
  return { icon, text }
}

describe('buildHostQueueMetaGroups', () => {
  it('builds guest, table, and extra-chair groups from reservation data', () => {
    const groups = buildHostQueueMetaGroups({
      guests: 5,
      seatingAssignment: {
        assignedUnits: [
          { id: 't10', label: 'T10' },
          { id: 't11', label: 'T11' },
        ],
        extraChairs: 1,
        standingGuests: 0,
      },
    }, LAYOUT)

    expect(groups).toEqual([
      { id: 'guests', icon: '👤', text: '5 guests' },
      { id: 'table', icon: '🍽', text: 'T10 + T11' },
      { id: 'extra-chair', icon: '🪑', text: '+1' },
    ])
  })

  it('omits extra-chair group when no extra chairs exist', () => {
    const groups = buildHostQueueMetaGroups({
      guests: 4,
      seatingAssignment: {
        assignedUnits: [{ id: 't15', label: 'T15' }, { id: 't16', label: 'T16' }],
        extraChairs: 0,
        standingGuests: 0,
      },
    }, LAYOUT)

    expect(groups.map((group) => group.id)).toEqual(['guests', 'table'])
  })
})

describe('HostReservationMetaGroups', () => {
  it('renders independent metadata groups and separator nodes', () => {
    const { container, unmount } = renderMetaGroups([
      { id: 'guests', icon: '👤', text: '5 guests' },
      { id: 'table', icon: '🍽', text: 'T10 + T11' },
      { id: 'extra-chair', icon: '🪑', text: '+1' },
    ])

    expect(container.querySelector('.host-queue-row-meta-line')?.tagName).toBe('DIV')
    expect(container.querySelectorAll('.host-queue-row-meta-group')).toHaveLength(3)
    expect(container.querySelectorAll('.host-queue-row-meta-bullet')).toHaveLength(2)
    expect(container.querySelector('.host-queue-row-meta-line')?.firstElementChild?.className)
      .toBe('host-queue-row-meta-group')
    expect(container.querySelector('.host-queue-row-meta-line')?.lastElementChild?.className)
      .toBe('host-queue-row-meta-group')

    unmount()
  })
})

describe('HostQueueReservationDetails metadata row', () => {
  it('renders structured metadata directly from reservation data', () => {
    const { container, unmount } = renderReservationDetails({
      guests: 5,
      seatingAssignment: {
        assignedUnits: [
          { id: 't10', label: 'T10' },
          { id: 't11', label: 'T11' },
        ],
        extraChairs: 1,
        standingGuests: 0,
      },
    })

    const groups = container.querySelectorAll('.host-queue-row-meta-group')
    expect(getGroupLabel(groups[0])).toEqual({ icon: '👤', text: '5 guests' })
    expect(getGroupLabel(groups[1])).toEqual({ icon: '🍽', text: 'T10 + T11' })
    expect(getGroupLabel(groups[2])).toEqual({ icon: '🪑', text: '+1' })
    expect(container.querySelectorAll('.host-queue-row-meta-bullet')).toHaveLength(2)

    unmount()
  })
})

describe('HostReservationMetaLine legacy string path', () => {
  it('renders guest, table, and extra-chair metadata unchanged', () => {
    const { container, unmount } = renderMetaLine('👤 5 guests  •  🍽 T10 + T11  •  🪑 +1')

    const groups = container.querySelectorAll('.host-queue-row-meta-group')
    expect(getGroupLabel(groups[0])).toEqual({ icon: '👤', text: '5 guests' })
    expect(getGroupLabel(groups[1])).toEqual({ icon: '🍽', text: 'T10 + T11' })
    expect(getGroupLabel(groups[2])).toEqual({ icon: '🪑', text: '+1' })

    unmount()
  })

  it('renders emoji and text as separate DOM elements inside each group', () => {
    const { container, unmount } = renderMetaLine('👤 5 guests  •  🍽 T10 + T11  •  🪑 +1')

    const groups = container.querySelectorAll('.host-queue-row-meta-group')
    expect(groups).toHaveLength(3)
    expect(container.querySelectorAll('.host-queue-row-meta-icon')).toHaveLength(3)
    expect(container.querySelectorAll('.host-queue-row-meta-text')).toHaveLength(3)
    expect(groups[1]?.querySelector('.host-queue-row-meta-icon')?.textContent).toBe('🍽')
    expect(groups[1]?.querySelector('.host-queue-row-meta-text')?.textContent).toBe('T10 + T11')

    unmount()
  })

  it('renders two separate bullet separators when all three groups exist', () => {
    const { container, unmount } = renderMetaLine('👤 5 guests  •  🍽 T10 + T11  •  🪑 +1')

    const bullets = [...container.querySelectorAll('.host-queue-row-meta-bullet')]
    expect(bullets).toHaveLength(2)
    expect(bullets.every((bullet) => bullet.textContent === '•')).toBe(true)

    unmount()
  })

  it('renders one separator when only two groups exist', () => {
    const { container, unmount } = renderMetaLine('👤 3 guests  •  🍽 T110')

    expect(container.querySelectorAll('.host-queue-row-meta-group')).toHaveLength(2)
    expect(container.querySelectorAll('.host-queue-row-meta-bullet')).toHaveLength(1)

    unmount()
  })

  it('renders no separator when only one group exists', () => {
    const { container, unmount } = renderMetaLine('👤 2 guests')

    expect(container.querySelectorAll('.host-queue-row-meta-group')).toHaveLength(1)
    expect(container.querySelectorAll('.host-queue-row-meta-bullet')).toHaveLength(0)

    unmount()
  })

  it('does not render duplicate separators when extra-chair data is absent', () => {
    const { container, unmount } = renderMetaLine('👤 4 guests  •  🍽 T15 + T16')

    expect(container.querySelectorAll('.host-queue-row-meta-group')).toHaveLength(2)
    expect(container.querySelectorAll('.host-queue-row-meta-bullet')).toHaveLength(1)

    unmount()
  })

  it('supports legacy host-list metadata without emoji icons', () => {
    const { container, unmount } = renderMetaLine('4 • T15 + T16')

    const groups = container.querySelectorAll('.host-queue-row-meta-group')
    expect(groups).toHaveLength(2)
    expect(groups[0]?.querySelector('.host-queue-row-meta-icon')).toBeNull()
    expect(groups[0]?.querySelector('.host-queue-row-meta-text')?.textContent).toBe('4')
    expect(groups[1]?.querySelector('.host-queue-row-meta-text')?.textContent).toBe('T15 + T16')

    unmount()
  })
})
