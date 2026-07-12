/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { HostReservationMetaLine } from './HostQueueReservationDetails'

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

describe('HostReservationMetaLine', () => {
  it('renders metadata items with bullet separators', () => {
    const { container, unmount } = renderMetaLine('👤 5 guests  •  🍽 T10 + T11  •  🪑 +1')

    const items = container.querySelectorAll('.host-queue-row-meta-item')
    expect(items).toHaveLength(3)
    expect(items[0]?.textContent).toBe('👤 5 guests')
    expect(items[1]?.textContent).toBe('🍽 T10 + T11')
    expect(items[2]?.textContent).toBe('🪑 +1')
    expect(container.querySelectorAll('.host-queue-row-meta-bullet')).toHaveLength(2)

    unmount()
  })

  it('does not render empty bullet placeholders', () => {
    const { container, unmount } = renderMetaLine('👤 3 guests  •  🍽 T110')

    expect(container.querySelectorAll('.host-queue-row-meta-item')).toHaveLength(2)
    expect(container.querySelectorAll('.host-queue-row-meta-bullet')).toHaveLength(1)

    unmount()
  })
})
