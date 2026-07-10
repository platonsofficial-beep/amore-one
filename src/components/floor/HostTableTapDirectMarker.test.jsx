/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { HostTableTapDirectMarker } from './HostTableTapDirectMarker'

describe('HostTableTapDirectMarker', () => {
  it('renders v2 lifecycle fields', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(HostTableTapDirectMarker, {
        lastTableTap: 'T10',
        openedTable: 'T10',
        lastDismissSource: 'none',
        openDurationMs: 2400,
      }))
    })

    const marker = container.querySelector('[data-testid="host-table-tap-direct-marker"]')
    expect(marker?.textContent).toContain('TABLE TAP DIRECT v2')
    expect(marker?.textContent).toContain('Opened table: T10')
    expect(marker?.textContent).toContain('Last dismiss: none')
    expect(marker?.textContent).toContain('Duration: 2400ms')

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
