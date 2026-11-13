/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { HelpModeChrome } from './HelpMode'
import { closeHelpAssistant, isHelpAssistantOpen } from './helpAssistantStore'

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
  it('opens the help sheet from the question mark', () => {
    sessionStorage.clear()
    closeHelpAssistant()
    const { container, cleanup } = render(createElement(HelpModeChrome))
    const toggle = container.querySelector('[data-testid="help-assistant-open"]')
    expect(toggle.textContent).toBe('?')
    expect(toggle.getAttribute('aria-label')).toBe('Help')
    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(isHelpAssistantOpen()).toBe(true)
    expect(document.body.textContent).not.toContain('Help mode — tap anything')
    cleanup()
    closeHelpAssistant()
  })
})
