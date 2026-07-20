/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { InventoryCountView } from './InventoryCountView'
import { InventoryCountSessionWorkspace } from './InventoryCountSessionWorkspace'

function render(ui) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(ui)
  })

  return {
    container,
    cleanup: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

function getButtonByText(root, text) {
  return Array.from(root.querySelectorAll('button')).find((button) => button.textContent === text)
}

function advanceWizardToSession(container) {
  act(() => {
    getButtonByText(container, 'Start new count').click()
  })

  const dialog = container.querySelector('[role="dialog"]')
  const continueBtn = getButtonByText(dialog, 'Continue')
  const typeCards = dialog.querySelectorAll('[role="radio"]')

  act(() => {
    typeCards[0].click()
  })
  act(() => {
    continueBtn.click()
  })

  const locationCards = dialog.querySelectorAll('[role="checkbox"]')
  act(() => {
    locationCards[0].click()
  })
  act(() => {
    continueBtn.click()
  })
  act(() => {
    continueBtn.click()
  })

  const startBtn = getButtonByText(dialog, 'Start Inventory Count Session')
  act(() => {
    startBtn.click()
  })
}

describe('InventoryCountSessionWorkspace foundation', () => {
  it('renders the demo session shell structure', () => {
    const onExit = vi.fn()
    const { container, cleanup } = render(
      createElement(InventoryCountSessionWorkspace, { onExit }),
    )

    expect(container.textContent).toContain('Inventory Count Session')
    expect(container.textContent).toContain('In Progress')
    expect(container.textContent).toContain('New Count')
    expect(container.textContent).toContain('Blind Count')
    expect(container.textContent).toContain('Just now')
    expect(container.textContent).toContain('Current signed-in operator')

    expect(container.textContent).toContain('Main Bar')
    expect(container.textContent).toContain('Main Storage')
    expect(container.textContent).toContain('Coffee Station')
    expect(container.textContent).toContain('12 / 12')
    expect(container.textContent).toContain('18 / 38')

    expect(container.textContent).toContain('63%')
    expect(container.textContent).toContain('147 / 232 counted')
    expect(container.textContent).toContain('3 / 7 locations complete')
    expect(container.textContent).toContain('8 skipped')

    expect(container.textContent).toContain('Absolut Vodka')
    expect(container.textContent).toContain('Bombay Sapphire')
    expect(container.textContent).toContain("Jack Daniel's")
    expect(container.textContent).toContain('Tonic Water')
    expect(container.querySelectorAll('.inventory-count-session-table tbody tr')).toHaveLength(10)

    expect(container.textContent).toContain('Unsaved changes')
    expect(container.textContent).toContain('None (demo)')
    expect(getButtonByText(container, 'Pause')?.disabled).toBe(true)
    expect(getButtonByText(container, 'Finish Count')?.disabled).toBe(true)
    expect(getButtonByText(container, 'Complete Location')?.disabled).toBe(true)

    act(() => {
      getButtonByText(container, 'Exit').click()
    })
    expect(onExit).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('opens from the wizard Start CTA using local-only Inventory Count routing', () => {
    const { container, cleanup } = render(createElement(InventoryCountView))

    expect(container.querySelector('.inventory-count-session')).toBeNull()
    advanceWizardToSession(container)

    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('.inventory-count-session')).not.toBeNull()
    expect(container.textContent).toContain('Inventory Count Session')
    expect(container.textContent).toContain('Absolut Vodka')

    act(() => {
      getButtonByText(container, 'Exit').click()
    })
    expect(container.querySelector('.inventory-count-session')).toBeNull()
    expect(container.textContent).toContain('Start new count')

    cleanup()
  })

  it('does not introduce persistence or service wiring in the workspace source', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/stock/InventoryCountSessionWorkspace.jsx'),
      'utf8',
    )

    expect(source).not.toMatch(/localStorage|supabase|recordStockMovement|createCount|postCount|fetch\(/i)
  })
})
