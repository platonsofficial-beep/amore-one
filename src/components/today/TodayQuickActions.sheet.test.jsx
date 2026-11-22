/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TodayQuickActions } from './TodayQuickActions'

let container
let root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('Today quick actions sheet', () => {
  it('renders the selected list and the grouped shortcuts when Edit is opened', () => {
    act(() => {
      root.render(createElement(TodayQuickActions, {
        access: 'manager',
        userId: 'elena',
        workspaceId: 'venue-a',
        onRun: () => {},
      }))
    })

    act(() => {
      container.querySelector('.today-quick-edit').click()
    })

    const selected = document.querySelectorAll('.today-quick-selected li')
    const groups = document.querySelectorAll('.today-quick-group')
    expect(selected.length).toBeGreaterThan(0)
    expect(groups.length).toBeGreaterThan(0)
    expect(document.body.textContent).toContain('Reservations')
    expect(document.body.textContent).toContain('6 of 6 selected')

    const css = readFileSync('src/components/today/todayQuickActions.css', 'utf8')
    const bodyRule = css.slice(css.indexOf('.today-quick-sheet-body {'), css.indexOf('}', css.indexOf('.today-quick-sheet-body {')))
    expect(bodyRule).toContain('flex: 1 1 auto')
    expect(bodyRule).toContain('min-height: 0')
    expect(bodyRule).toContain('overflow-y: auto')
    expect(bodyRule).not.toMatch(/(?<!min-)height:\s*0/)
    expect(css).toContain('min(85dvh, calc(100dvh - var(--one-safe-top-chrome, env(safe-area-inset-top, 0px)) - 24px))')
  })
})
