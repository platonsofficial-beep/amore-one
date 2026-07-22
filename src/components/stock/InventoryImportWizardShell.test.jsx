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
  INVENTORY_IMPORT_ACCEPTED_EXTENSIONS,
  INVENTORY_IMPORT_WIZARD_STEPS,
  InventoryImportWizardShell,
  formatInventoryImportFileSize,
  getInventoryImportFileExtension,
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

  function getFileInput() {
    return container.querySelector('#inventory-import-file-input')
  }

  function getChooseButton() {
    return Array.from(container.querySelectorAll('button'))
      .find((button) => (
        button.textContent === 'Choose File'
        || button.textContent === 'Choose Different File'
      ))
  }

  function selectFile(file) {
    const input = getFileInput()
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: {
        0: file,
        length: 1,
        item: (index) => (index === 0 ? file : null),
      },
    })
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  it('renders the initial Inventory Import wizard state', () => {
    renderShell()

    expect(container.querySelector('[role="dialog"]')).toBeTruthy()
    expect(container.textContent).toContain('Inventory Import')
    expect(container.textContent).toContain('Import inventory from CSV or Excel')
    expect(container.textContent).toContain('Upload Inventory File')
    expect(container.textContent).toContain(
      'Choose a CSV or Excel file to begin importing your inventory.',
    )
    expect(container.querySelector('.inventory-import-wizard-footer')).toBeNull()
    expect(container.textContent).not.toContain('Drag & drop coming soon')
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
      expect(steps[index].getAttribute('aria-current')).toBeNull()
    }
  })

  it('exposes a hidden file picker input with accepted extensions', () => {
    renderShell()

    const input = getFileInput()
    expect(input).toBeTruthy()
    expect(input.getAttribute('type')).toBe('file')
    expect(input.getAttribute('accept')).toBe('.csv,.xlsx,.xls')
    expect(INVENTORY_IMPORT_ACCEPTED_EXTENSIONS).toEqual(['csv', 'xlsx', 'xls'])
    expect(container.querySelector(`label[for="${input.id}"]`)).toBeTruthy()
  })

  it('opens the native file picker when Choose File is activated', () => {
    renderShell()

    const input = getFileInput()
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {})
    const chooseBtn = getChooseButton()

    expect(chooseBtn).toBeTruthy()
    expect(chooseBtn.disabled).toBe(false)

    act(() => {
      chooseBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('displays filename, size, and footer after a valid CSV selection', () => {
    renderShell()

    const csvBytes = 1024 * 100
    selectFile(new File([new Uint8Array(csvBytes)], 'products.csv', {
      type: 'text/csv',
    }))

    expect(container.textContent).toContain('File selected')
    expect(container.textContent).toContain('products.csv')
    expect(container.textContent).toContain('.csv')
    expect(container.textContent).toContain(formatInventoryImportFileSize(csvBytes))
    expect(container.querySelector('.inventory-import-wizard-footer')).toBeTruthy()

    const continueBtn = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Continue')
    expect(continueBtn?.disabled).toBe(false)

    const steps = container.querySelectorAll('.inventory-import-wizard-step')
    expect(steps[0].className).toContain('is-active')
    expect(container.textContent).toContain('Upload File')
  })

  it('displays filename, size, and extension after a valid XLSX selection', () => {
    renderShell()

    const xlsxBytes = Math.round(1.8 * 1024 * 1024)
    selectFile(new File(
      [new Uint8Array(xlsxBytes)],
      'Inventory_July.xlsx',
      {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ))

    expect(container.textContent).toContain('Inventory_July.xlsx')
    expect(container.textContent).toContain('.xlsx')
    expect(container.textContent).toContain('1.8 MB')
    expect(container.textContent).toContain('Choose Different File')
  })

  it('clears selection when Back is pressed', () => {
    renderShell()

    selectFile(new File(['name,unit'], 'stock.csv', { type: 'text/csv' }))
    expect(container.querySelector('.inventory-import-wizard-footer')).toBeTruthy()

    const backBtn = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Back')

    act(() => {
      backBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('.inventory-import-wizard-footer')).toBeNull()
    expect(container.textContent).toContain('Upload Inventory File')
    expect(container.textContent).toContain('Choose File')
    expect(container.textContent).not.toContain('stock.csv')
  })

  it('shows an inline error for unsupported extensions and stays on step 1', () => {
    renderShell()

    selectFile(new File(['{}'], 'notes.json', { type: 'application/json' }))

    expect(container.textContent).toContain('Unsupported file type')
    expect(container.querySelector('.inventory-import-wizard-footer')).toBeNull()
    expect(container.textContent).toContain('Upload Inventory File')

    const steps = container.querySelectorAll('.inventory-import-wizard-step')
    expect(steps[0].className).toContain('is-active')
    expect(steps[0].getAttribute('aria-current')).toBe('step')
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

  it('does not import parser, validator, mapper, classifier, services, or FileReader', () => {
    const source = readFileSync(join(HERE, 'InventoryImportWizardShell.jsx'), 'utf8')

    expect(source).not.toMatch(/inventoryImportTabularParser/)
    expect(source).not.toMatch(/inventoryImportTableValidator/)
    expect(source).not.toMatch(/inventoryImportFieldMapper/)
    expect(source).not.toMatch(/inventoryImportClassifier/)
    expect(source).not.toMatch(/stockCsvImport/)
    expect(source).not.toMatch(/from ['"].*services\//)
    expect(source).not.toMatch(/supabase/i)
    expect(source).not.toMatch(/\.rpc\(/i)
    expect(source).not.toMatch(/FileReader/)
    expect(source).not.toMatch(/createObjectURL/)
    expect(source).not.toMatch(/file\.text\(|arrayBuffer\(|readAs/)
  })
})

describe('inventory import file helpers', () => {
  it('extracts lowercase file extensions', () => {
    expect(getInventoryImportFileExtension('Inventory_July.XLSX')).toBe('xlsx')
    expect(getInventoryImportFileExtension('a.b.csv')).toBe('csv')
    expect(getInventoryImportFileExtension('noext')).toBe('')
  })

  it('formats readable file sizes', () => {
    expect(formatInventoryImportFileSize(512)).toBe('512 B')
    expect(formatInventoryImportFileSize(1536)).toBe('1.5 KB')
    expect(formatInventoryImportFileSize(Math.round(1.8 * 1024 * 1024))).toBe('1.8 MB')
  })
})
