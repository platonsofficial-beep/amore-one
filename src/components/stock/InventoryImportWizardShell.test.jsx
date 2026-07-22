/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  INVENTORY_IMPORT_WIZARD_STEPS,
  InventoryImportWizardShell,
} from './InventoryImportWizardShell'

const HERE = dirname(fileURLToPath(import.meta.url))

describe('InventoryImportWizardShell', () => {
  let container
  let root

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    container = null
    root = null
  })

  function renderShell(props = {}) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(InventoryImportWizardShell, props))
    })
  }

  it('renders the Inventory Import wizard shell', () => {
    renderShell()

    expect(container.querySelector('[role="dialog"]')).toBeTruthy()
    expect(container.textContent).toContain('Inventory Import')
    expect(container.textContent).toContain('Import inventory from CSV or Excel')
    expect(container.textContent).toContain('Upload Inventory File')
    expect(container.textContent).toContain(
      'Choose a CSV or Excel file to begin importing your inventory.',
    )
  })

  it('shows five steps with only Step 1 active and others upcoming', () => {
    renderShell()

    expect(INVENTORY_IMPORT_WIZARD_STEPS).toHaveLength(5)
    expect(container.textContent).toContain('Upload File')
    expect(container.textContent).toContain('Review Columns')
    expect(container.textContent).toContain('Review Data')
    expect(container.textContent).toContain('Import Preview')
    expect(container.textContent).toContain('Ready to Import')

    const steps = container.querySelectorAll('.inventory-import-wizard-step')
    expect(steps).toHaveLength(5)
    expect(steps[0].className).toContain('is-active')
    expect(steps[0].getAttribute('aria-current')).toBe('step')

    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index].className).toContain('is-upcoming')
      expect(steps[index].className).not.toContain('is-disabled')
      expect(steps[index].getAttribute('aria-current')).toBeNull()
    }
  })

  it('hides the footer before file selection', () => {
    renderShell()

    expect(container.querySelector('.inventory-import-wizard-footer')).toBeNull()
    expect(container.textContent).not.toContain('Back')
    expect(container.textContent).not.toContain('Continue')
  })

  it('removes the drag and drop placeholder completely', () => {
    renderShell()

    expect(container.textContent).not.toContain('Drag & drop coming soon')
    expect(container.querySelector('.inventory-import-wizard-dropzone')).toBeNull()
  })

  it('keeps Choose File disabled with no runtime action', () => {
    renderShell()

    const chooseBtn = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Choose File')

    expect(chooseBtn?.disabled).toBe(true)
    expect(chooseBtn?.onclick).toBeNull()
  })

  it('invokes onClose from Close (Exit)', () => {
    const onClose = vi.fn()
    renderShell({ onClose })

    const exitBtn = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Close (Exit)'))

    expect(exitBtn).toBeTruthy()
    act(() => {
      exitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not import parser, validator, mapper, classifier, or services', () => {
    const source = readFileSync(join(HERE, 'InventoryImportWizardShell.jsx'), 'utf8')

    expect(source).not.toMatch(/inventoryImportTabularParser/)
    expect(source).not.toMatch(/inventoryImportTableValidator/)
    expect(source).not.toMatch(/inventoryImportFieldMapper/)
    expect(source).not.toMatch(/inventoryImportClassifier/)
    expect(source).not.toMatch(/stockCsvImport/)
    expect(source).not.toMatch(/from ['"].*services\//)
    expect(source).not.toMatch(/supabase/i)
    expect(source).not.toMatch(/createObjectURL|FileReader|input type=["']file["']/i)
  })
})
