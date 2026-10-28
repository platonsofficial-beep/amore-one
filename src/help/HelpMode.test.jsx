/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { HelpModeChrome } from './HelpMode'

function render(node) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return {
    container,
    cleanup() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('help mode', () => {
  it('blocks the clicked action and shows a popover that can be dismissed', () => {
    sessionStorage.clear()
    let ran = 0
    const { container, cleanup } = render(createElement('div', null,
      createElement(HelpModeChrome),
      createElement('button', {
        type: 'button',
        'data-help': 'reservations.add',
        onClick: () => { ran += 1 },
      }, 'Add reservation'),
    ))

    const toggle = container.querySelector('[data-testid="help-mode-toggle"]')
    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(document.body.textContent).toContain('Help mode — tap anything to see what it does')

    const action = container.querySelector('[data-help="reservations.add"]')
    act(() => {
      action.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
      action.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(ran).toBe(0)
    const popover = document.body.querySelector('.help-mode-popover')
    expect(popover?.textContent).toContain('Add reservation')
    expect(action.classList.contains('help-mode-target')).toBe(true)

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    expect(document.body.querySelector('.help-mode-banner')).toBeNull()
    cleanup()
  })
})
