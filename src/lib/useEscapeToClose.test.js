/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { useEscapeToClose } from './useEscapeToClose'

function Probe({ onClose, enabled = true }) {
  useEscapeToClose(onClose, { enabled })
  return null
}

function Nested({ onOuter, onInner }) {
  const [innerOpen, setInnerOpen] = useState(true)
  useEscapeToClose(onOuter, { enabled: true })
  useEscapeToClose(() => {
    setInnerOpen(false)
    onInner()
  }, { enabled: innerOpen })
  return null
}

describe('useEscapeToClose', () => {
  it('closes on Escape and ignores other keys', async () => {
    const onClose = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(Probe, { onClose }))
    })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onClose).not.toHaveBeenCalled()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.unmount()
    })
  })

  it('lets the nested sheet handle Escape first', async () => {
    const onOuter = vi.fn()
    const onInner = vi.fn()
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(Nested, { onOuter, onInner }))
    })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onInner).toHaveBeenCalledTimes(1)
    expect(onOuter).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })
})
