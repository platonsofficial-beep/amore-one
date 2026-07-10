/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { HostTableTapDirectMarker } from './HostTableTapDirectMarker'

describe('HostTableTapDirectMarker', () => {
  it('renders the production marker and last tap label', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(HostTableTapDirectMarker, { lastTableTap: 'T10' }))
    })

    const marker = container.querySelector('[data-testid="host-table-tap-direct-marker"]')
    expect(marker?.textContent).toContain('TABLE TAP DIRECT v1')
    expect(marker?.textContent).toContain('Last table tap: T10')

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('defaults last tap to none', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(HostTableTapDirectMarker))
    })

    expect(container.textContent).toContain('Last table tap: none')

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})
