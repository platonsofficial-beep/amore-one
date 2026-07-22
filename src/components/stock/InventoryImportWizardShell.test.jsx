/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import * as decoderModule from '../../lib/inventoryImportFileDecoder'
import * as formatDetectorModule from '../../lib/inventoryImportFormatDetector'
import * as operationalParserModule from '../../lib/inventoryOperationalSheetParser'
import * as parserModule from '../../lib/inventoryImportTabularParser'
import * as matcherModule from '../../lib/inventoryOperationalProductMatcher'
import {
  INVENTORY_IMPORT_ACCEPTED_EXTENSIONS,
  INVENTORY_IMPORT_WIZARD_STEPS,
  InventoryImportWizardShell,
  formatInventoryImportFileSize,
  getInventoryImportFileExtension,
} from './InventoryImportWizardShell'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * @param {string} name
 * @param {unknown[][]} matrix
 * @param {'xlsx'|'xls'} bookType
 */
function createSpreadsheetFile(name, matrix, bookType = 'xlsx') {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(matrix)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Inventory')
  const bytes = XLSX.write(workbook, { type: 'array', bookType })
  return new File([bytes], name, {
    type: bookType === 'xls'
      ? 'application/vnd.ms-excel'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/**
 * @param {string} name
 * @param {Array<{ sheetName: string, matrix: unknown[][] }>} sheets
 */
function createMultiSheetFile(name, sheets) {
  const workbook = XLSX.utils.book_new()
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(sheet.matrix),
      sheet.sheetName,
    )
  }
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  return new File([bytes], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

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
    vi.restoreAllMocks()
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

  function getButton(label) {
    return Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === label)
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

  async function continueToColumnReview() {
    const continueBtn = getButton('Continue to Column Review')
    await act(async () => {
      continueBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  it('renders the initial Inventory Import wizard state', () => {
    renderShell()

    expect(container.querySelector('[role="dialog"]')).toBeTruthy()
    expect(container.textContent).toContain('Inventory Import')
    expect(container.textContent).toContain('Upload Inventory File')
    expect(container.querySelector('.inventory-import-wizard-footer')).toBeNull()
    expect(container.textContent).not.toContain('Drag & drop coming soon')
  })

  it('shows five steps with only Step 1 active initially', () => {
    renderShell()

    expect(INVENTORY_IMPORT_WIZARD_STEPS).toHaveLength(5)
    const steps = container.querySelectorAll('.inventory-import-wizard-step')
    expect(steps).toHaveLength(5)
    expect(steps[0].className).toContain('is-active')
    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index].className).toContain('is-upcoming')
    }
  })

  it('exposes a hidden file picker input with accepted extensions', () => {
    renderShell()

    const input = getFileInput()
    expect(input.getAttribute('type')).toBe('file')
    expect(input.getAttribute('accept')).toBe('.csv,.xlsx,.xls')
    expect(INVENTORY_IMPORT_ACCEPTED_EXTENSIONS).toEqual(['csv', 'xlsx', 'xls'])
  })

  it('opens the native file picker when Choose File is activated', () => {
    renderShell()

    const input = getFileInput()
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {})
    act(() => {
      getButton('Choose File').dispatchEvent(new MouseEvent('click', { bubbles: true }))
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
    expect(container.textContent).toContain(formatInventoryImportFileSize(csvBytes))
    expect(getButton('Continue to Column Review')).toBeTruthy()
    expect(getButton('Continue to Column Review')?.disabled).toBe(false)
  })

  it('displays filename after a valid XLSX selection', () => {
    renderShell()
    selectFile(new File(
      [new Uint8Array(32)],
      'Inventory_July.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    ))
    expect(container.textContent).toContain('Inventory_July.xlsx')
    expect(container.textContent).toContain('.xlsx')
  })

  it('clears selection when Back is pressed on Step 1', () => {
    renderShell()
    selectFile(new File(['name,unit'], 'stock.csv', { type: 'text/csv' }))

    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('.inventory-import-wizard-footer')).toBeNull()
    expect(container.textContent).toContain('Upload Inventory File')
    expect(container.textContent).not.toContain('stock.csv')
  })

  it('shows an inline error for unsupported extensions and stays on step 1', () => {
    renderShell()
    selectFile(new File(['{}'], 'notes.json', { type: 'application/json' }))

    expect(container.textContent).toContain('Unsupported file type')
    expect(container.querySelector('.inventory-import-wizard-footer')).toBeNull()
    expect(container.querySelectorAll('.inventory-import-wizard-step')[0].className)
      .toContain('is-active')
  })

  it('decodes CSV once, parses once, and opens Review Columns', async () => {
    renderShell()

    const decodeSpy = vi.spyOn(decoderModule, 'decodeInventoryImportFile')
    const parseSpy = vi.spyOn(parserModule, 'parseInventoryImportTable')

    selectFile(new File(
      ['Name,Unit,Name\nFlour,kg,x\n'],
      'products.csv',
      { type: 'text/csv' },
    ))
    await continueToColumnReview()

    expect(decodeSpy).toHaveBeenCalledTimes(1)
    expect(parseSpy).toHaveBeenCalledTimes(1)
    expect(parseSpy.mock.calls[0][0]).toEqual({
      headers: ['Name', 'Unit', 'Name'],
      rows: [['Flour', 'kg', 'x']],
      headerRowNumber: 1,
    })

    const steps = container.querySelectorAll('.inventory-import-wizard-step')
    expect(steps[0].className).toContain('is-completed')
    expect(steps[1].className).toContain('is-active')
    expect(steps[2].className).toContain('is-upcoming')
    expect(steps[3].className).toContain('is-upcoming')
    expect(steps[4].className).toContain('is-upcoming')

    expect(container.textContent).toContain('Review Columns')
    expect(container.textContent).toContain('products.csv')
    expect(container.textContent).toContain('3 columns')
    expect(container.textContent).toContain('1 data rows')
    expect(container.textContent).toContain('Name')
    expect(container.textContent).toContain('name')
    expect(container.textContent).toContain('Duplicate header')
    expect(getButton('Continue')?.disabled).toBe(true)
  })

  it('decodes single-sheet XLSX once and supplies correct parser input', async () => {
    renderShell()
    const inspectSpy = vi.spyOn(decoderModule, 'inspectInventoryImportWorkbook')
    const worksheetSpy = vi.spyOn(decoderModule, 'decodeInventoryImportWorksheet')
    const parseSpy = vi.spyOn(parserModule, 'parseInventoryImportTable')

    selectFile(createSpreadsheetFile('inventory.xlsx', [
      ['Product', 'Qty'],
      ['Salt', 4],
    ]))
    await continueToColumnReview()

    expect(inspectSpy).toHaveBeenCalledTimes(1)
    expect(worksheetSpy).toHaveBeenCalledTimes(1)
    expect(parseSpy).toHaveBeenCalledTimes(1)
    expect(parseSpy.mock.calls[0][0]).toEqual({
      headers: ['Product', 'Qty'],
      rows: [['Salt', 4]],
      headerRowNumber: 1,
    })
    expect(container.textContent).toContain('Review Columns')
    expect(container.textContent).toContain('Product')
    expect(container.textContent).toContain('product')
    expect(container.textContent).toContain('Ready')
  })

  it('shows worksheet selection for multi-sheet workbooks and keeps Continue disabled until a sheet is chosen', async () => {
    renderShell()
    const parseSpy = vi.spyOn(parserModule, 'parseInventoryImportTable')
    const worksheetSpy = vi.spyOn(decoderModule, 'decodeInventoryImportWorksheet')

    selectFile(createMultiSheetFile('multi.xlsx', [
      {
        sheetName: 'Stock',
        matrix: [['Name', 'Qty'], ['Flour', 1]],
      },
      {
        sheetName: 'Extras',
        matrix: [['Product', 'Amount'], ['Salt', 4], ['Oil', 2]],
      },
    ]))
    await continueToColumnReview()

    expect(container.textContent).toContain('Choose Worksheet')
    expect(container.textContent).toContain('Stock')
    expect(container.textContent).toContain('Extras')
    expect(parseSpy).not.toHaveBeenCalled()
    expect(worksheetSpy).not.toHaveBeenCalled()
    expect(getButton('Continue to Column Review')?.disabled).toBe(true)

    const steps = container.querySelectorAll('.inventory-import-wizard-step')
    expect(steps[0].className).toContain('is-active')
    expect(steps[1].className).toContain('is-upcoming')
  })

  it('decodes only the selected worksheet after multi-sheet Continue', async () => {
    renderShell()
    const parseSpy = vi.spyOn(parserModule, 'parseInventoryImportTable')
    const worksheetSpy = vi.spyOn(decoderModule, 'decodeInventoryImportWorksheet')

    selectFile(createMultiSheetFile('multi.xlsx', [
      {
        sheetName: 'Stock',
        matrix: [['Name', 'Qty'], ['Flour', 1]],
      },
      {
        sheetName: 'Extras',
        matrix: [['Product', 'Amount'], ['Salt', 4]],
      },
    ]))
    await continueToColumnReview()

    const extrasBtn = Array.from(container.querySelectorAll('[role="radio"]'))
      .find((button) => button.textContent.includes('Extras'))
    expect(extrasBtn).toBeTruthy()

    act(() => {
      extrasBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getButton('Continue to Column Review')?.disabled).toBe(false)
    await continueToColumnReview()

    expect(worksheetSpy).toHaveBeenCalledTimes(1)
    expect(worksheetSpy.mock.calls[0][1]).toBe('Extras')
    expect(parseSpy).toHaveBeenCalledTimes(1)
    expect(parseSpy.mock.calls[0][0]).toEqual({
      headers: ['Product', 'Amount'],
      rows: [['Salt', 4]],
      headerRowNumber: 1,
    })
    expect(container.textContent).toContain('Review Columns')
    expect(container.textContent).toContain('Product')
    expect(container.textContent).not.toContain('Flour')
  })

  it('returns to Step 1 from worksheet selection and keeps the selected file', async () => {
    renderShell()

    selectFile(createMultiSheetFile('multi.xlsx', [
      { sheetName: 'A', matrix: [['H'], ['1']] },
      { sheetName: 'B', matrix: [['H'], ['2']] },
    ]))
    await continueToColumnReview()
    expect(container.textContent).toContain('Choose Worksheet')

    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('File selected')
    expect(container.textContent).toContain('multi.xlsx')
    expect(getButton('Continue to Column Review')).toBeTruthy()
  })

  it('shows loading state and disables controls while processing', async () => {
    renderShell()

    let release
    const pending = new Promise((resolve) => {
      release = resolve
    })
    vi.spyOn(decoderModule, 'decodeInventoryImportFile').mockImplementation(() => pending)

    selectFile(new File(['Name\nA\n'], 'wait.csv', { type: 'text/csv' }))

    act(() => {
      getButton('Continue to Column Review')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Reading file…')
    expect(getButton('Back')?.disabled).toBe(true)
    expect(getButton('Continue to Column Review')?.disabled).toBe(true)
    expect(getButton('Choose Different File')?.disabled).toBe(true)

    await act(async () => {
      release({
        headers: ['Name'],
        rows: [['A']],
        headerRowNumber: 1,
        sourceFormat: 'csv',
      })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Review Columns')
  })

  it('protects Continue against duplicate rapid activation', async () => {
    renderShell()

    let release
    const pending = new Promise((resolve) => {
      release = resolve
    })
    const decodeSpy = vi.spyOn(decoderModule, 'decodeInventoryImportFile')
      .mockImplementation(() => pending)

    selectFile(new File(['Name\nA\n'], 'once.csv', { type: 'text/csv' }))

    const continueBtn = getButton('Continue to Column Review')
    act(() => {
      continueBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      continueBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      continueBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(decodeSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      release({
        headers: ['Name'],
        rows: [['A']],
        headerRowNumber: 1,
        sourceFormat: 'csv',
      })
      await Promise.resolve()
      await Promise.resolve()
    })
  })

  it('renders blank header status from parser output', async () => {
    renderShell()
    selectFile(new File(['Name,\nFlour,\n'], 'blank.csv', { type: 'text/csv' }))
    await continueToColumnReview()

    expect(container.textContent).toContain('Blank header')
    const rows = container.querySelectorAll('.inventory-import-wizard-review-table tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('1')
    expect(rows[1].textContent).toContain('2')
    expect(rows[1].textContent).toContain('Blank header')
  })

  it('returns to Step 1 with the selected file preserved after Back', async () => {
    renderShell()
    selectFile(new File(['Name\nA\n'], 'keep.csv', { type: 'text/csv' }))
    await continueToColumnReview()

    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('File selected')
    expect(container.textContent).toContain('keep.csv')
    expect(getButton('Continue to Column Review')).toBeTruthy()
    expect(container.querySelectorAll('.inventory-import-wizard-step')[0].className)
      .toContain('is-active')
  })

  it('keeps Step 1 and shows a safe error when decode fails', async () => {
    renderShell()
    vi.spyOn(decoderModule, 'decodeInventoryImportFile').mockRejectedValue(
      new decoderModule.InventoryImportDecoderError(
        'MALFORMED_CSV',
        'CSV has an unclosed quoted field.',
      ),
    )

    selectFile(new File(['bad'], 'bad.csv', { type: 'text/csv' }))
    await continueToColumnReview()

    expect(container.textContent).toContain('CSV has an unclosed quoted field.')
    expect(container.textContent).toContain('File selected')
    expect(container.textContent).toContain('bad.csv')
    expect(getButton('Continue to Column Review')?.disabled).toBe(false)
    expect(container.querySelectorAll('.inventory-import-wizard-step')[0].className)
      .toContain('is-active')
  })

  it('keeps Step 1 and recovers when parser fails', async () => {
    renderShell()
    vi.spyOn(decoderModule, 'decodeInventoryImportFile').mockResolvedValue({
      headers: [],
      rows: [],
      headerRowNumber: 1,
      sourceFormat: 'csv',
    })

    selectFile(new File(['x'], 'empty-headers.csv', { type: 'text/csv' }))
    await continueToColumnReview()

    expect(container.textContent).toMatch(/header/i)
    expect(container.textContent).toContain('File selected')
    expect(getButton('Choose Different File')?.disabled).toBe(false)
    expect(container.querySelectorAll('.inventory-import-wizard-step')[0].className)
      .toContain('is-active')
  })

  it('invokes onClose from Close (Exit)', () => {
    const onClose = vi.fn()
    renderShell({ onClose })

    act(() => {
      getButton('Close (Exit)').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not import validator, mapper, classifier, services, RPCs, or FileReader', () => {
    const source = readFileSync(join(HERE, 'InventoryImportWizardShell.jsx'), 'utf8')

    expect(source).toMatch(/inventoryImportFileDecoder/)
    expect(source).toMatch(/inventoryImportTabularParser/)
    expect(source).toMatch(/inventoryImportFormatDetector/)
    expect(source).toMatch(/inventoryOperationalSheetParser/)
    expect(source).toMatch(/inventoryOperationalProductMatcher/)
    expect(source).toMatch(/useWorkspaceStockCatalog/)
    expect(source).toMatch(/InventoryOperationalMatchingSummary/)
    expect(source).not.toMatch(/inventoryImportTableValidator/)
    expect(source).not.toMatch(/inventoryImportFieldMapper/)
    expect(source).not.toMatch(/inventoryImportClassifier/)
    expect(source).not.toMatch(/stockCsvImport/)
    expect(source).not.toMatch(/from ['"].*services\//)
    expect(source).not.toMatch(/supabase/i)
    expect(source).not.toMatch(/\.rpc\(/i)
    expect(source).not.toMatch(/FileReader/)
    expect(source).not.toMatch(/createObjectURL/)
  })

  it('runs the format detector once after CSV decode and renders the standard format card', async () => {
    renderShell()
    const detectSpy = vi.spyOn(formatDetectorModule, 'detectInventoryImportFormat')
    const parseSpy = vi.spyOn(parserModule, 'parseInventoryImportTable')

    selectFile(new File(
      ['Name,Quantity,Unit\nFlour,10,kg\n'],
      'flat.csv',
      { type: 'text/csv' },
    ))
    await continueToColumnReview()

    expect(detectSpy).toHaveBeenCalledTimes(1)
    expect(parseSpy).toHaveBeenCalledTimes(1)
    expect(detectSpy.mock.calls[0][0]).toMatchObject({
      headers: ['Name', 'Quantity', 'Unit'],
      rows: [['Flour', '10', 'kg']],
      headerRowNumber: 1,
      sourceFormat: 'csv',
    })
    expect(parseSpy.mock.calls[0][0]).toEqual({
      headers: ['Name', 'Quantity', 'Unit'],
      rows: [['Flour', '10', 'kg']],
      headerRowNumber: 1,
    })
    expect(container.textContent).toContain('Standard Inventory Table')
    expect(container.textContent).toContain('Product-name column pattern detected')
    expect(container.textContent).not.toMatch(/\d{2,3}%/)
  })

  it('does not run the detector during multi-sheet inspection, then runs once after sheet selection', async () => {
    renderShell()
    const detectSpy = vi.spyOn(formatDetectorModule, 'detectInventoryImportFormat')
    const inspectSpy = vi.spyOn(decoderModule, 'inspectInventoryImportWorkbook')

    selectFile(createMultiSheetFile('multi.xlsx', [
      {
        sheetName: 'Orders',
        matrix: [['A'], ['1']],
      },
      {
        sheetName: 'Inventory',
        matrix: [
          ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
          ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
          ['Item One', 1, 0, '', '', '', '', '', '', '', '', ''],
        ],
      },
    ]))
    await continueToColumnReview()

    expect(inspectSpy).toHaveBeenCalledTimes(1)
    expect(detectSpy).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Choose Worksheet')

    const inventoryBtn = Array.from(container.querySelectorAll('[role="radio"]'))
      .find((button) => button.textContent.includes('Inventory'))
    act(() => {
      inventoryBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await continueToColumnReview()

    expect(detectSpy).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Operational Weekly Stock Sheet')
    expect(container.textContent).toContain('weekday columns detected')
    expect(container.textContent).toContain(
      'A specialized operational-stock import flow will handle this layout in a later step.',
    )
    expect(container.textContent).toContain('Review Columns')
    expect(getButton('Continue')?.disabled).toBe(true)
  })

  it('runs the operational sheet parser only for operational layouts and stores the model', async () => {
    renderShell()
    const operationalSpy = vi.spyOn(operationalParserModule, 'parseInventoryOperationalSheet')

    selectFile(createMultiSheetFile('multi.xlsx', [
      {
        sheetName: 'Orders',
        matrix: [['A'], ['1']],
      },
      {
        sheetName: 'Inventory',
        matrix: [
          ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
          ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
          ['Item One', 1, 0, '', '', '', '', '', '', '', '', ''],
          ['GIN', '', '', '', '', '', '', '', '', '', '', ''],
          ['Item Two', 2, 1, '', '', '', '', '', '', '', 3, 4],
        ],
      },
    ]))
    await continueToColumnReview()

    expect(operationalSpy).not.toHaveBeenCalled()

    const inventoryBtn = Array.from(container.querySelectorAll('[role="radio"]'))
      .find((button) => button.textContent.includes('Inventory'))
    act(() => {
      inventoryBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await continueToColumnReview()

    expect(operationalSpy).toHaveBeenCalledTimes(1)
    const card = container.querySelector('.inventory-import-wizard-format-card')
    expect(card?.getAttribute('data-operational-category-count')).toBe('2')
    expect(card?.getAttribute('data-operational-product-count')).toBe('2')
    expect(container.querySelector('.inventory-import-wizard-review-table')).toBeTruthy()
    expect(container.querySelector('.inventory-operational-review')).toBeTruthy()
    expect(container.textContent).toContain('Categories: 2')
    expect(container.textContent).toContain('Products: 2')
    expect(container.textContent).toContain('VODKA')
    expect(container.textContent).toContain('Item One')
    const operationalReview = container.querySelector('.inventory-operational-review')
    expect(operationalReview?.textContent).not.toContain('Monday')
    expect(operationalReview?.textContent).not.toContain('Tuesday')
  })

  it('does not run the operational parser for standard inventory tables', async () => {
    renderShell()
    const operationalSpy = vi.spyOn(operationalParserModule, 'parseInventoryOperationalSheet')

    selectFile(new File(
      ['Name,Quantity,Unit\nFlour,10,kg\n'],
      'flat.csv',
      { type: 'text/csv' },
    ))
    await continueToColumnReview()

    expect(operationalSpy).not.toHaveBeenCalled()
    expect(container.querySelector('.inventory-import-wizard-format-card')
      ?.getAttribute('data-operational-product-count')).toBe('')
    expect(container.querySelector('.inventory-operational-review')).toBeNull()
    expect(container.querySelector('.inventory-workspace-stock-card')).toBeNull()
  })

  it('loads workspace stock only for operational layouts and shows the summary card', async () => {
    const loadWorkspaceStockItems = vi.fn(async (id) => {
      expect(id).toBe('ws-ops')
      return [
        {
          id: '1',
          name: 'Belvedere',
          category: 'Vodka',
          unit: 'Bottle',
          sku: null,
          active: true,
        },
        {
          id: '2',
          name: 'Tanqueray',
          category: 'Gin',
          unit: 'Bottle',
          sku: null,
          active: false,
        },
      ]
    })

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems,
    })

    selectFile(createSpreadsheetFile('ops.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Item One', 1, 0, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()

    expect(loadWorkspaceStockItems).toHaveBeenCalledTimes(1)
    expect(loadWorkspaceStockItems).toHaveBeenCalledWith('ws-ops')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const stockCard = container.querySelector('.inventory-workspace-stock-card')
    expect(stockCard?.getAttribute('data-workspace-stock-status')).toBe('success')
    expect(stockCard?.getAttribute('data-workspace-stock-count')).toBe('2')
    expect(container.textContent).toContain('Workspace Stock')
    expect(container.textContent).toContain('Loaded products: 2')
    expect(container.textContent).toContain('Read-only')
  })

  it('shows a loading state while workspace stock is fetching', async () => {
    let resolveLoad
    const loadWorkspaceStockItems = vi.fn(() => new Promise((resolve) => {
      resolveLoad = resolve
    }))

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems,
    })

    selectFile(createSpreadsheetFile('ops.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Item One', 1, 0, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()

    expect(container.querySelector('.inventory-workspace-stock-card')
      ?.getAttribute('data-workspace-stock-status')).toBe('loading')
    expect(container.textContent).toContain('Loading workspace stock')

    await act(async () => {
      resolveLoad([])
      await Promise.resolve()
    })

    expect(container.querySelector('.inventory-workspace-stock-card')
      ?.getAttribute('data-workspace-stock-status')).toBe('success')
    expect(container.textContent).toContain('Loaded products: 0')
  })

  it('shows a premium error state when workspace stock loading fails', async () => {
    const loadWorkspaceStockItems = vi.fn(async () => {
      throw new Error('catalog unavailable')
    })

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems,
    })

    selectFile(createSpreadsheetFile('ops.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Item One', 1, 0, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('.inventory-workspace-stock-card')
      ?.getAttribute('data-workspace-stock-status')).toBe('error')
    expect(container.textContent).toContain('Unable to load workspace stock')
    expect(container.textContent).toContain('catalog unavailable')
    expect(container.querySelector('.inventory-operational-review')).toBeTruthy()
  })

  it('does not load workspace stock for standard inventory tables', async () => {
    const loadWorkspaceStockItems = vi.fn(async () => [])

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems,
    })

    selectFile(new File(
      ['Name,Quantity,Unit\nFlour,10,kg\n'],
      'flat.csv',
      { type: 'text/csv' },
    ))
    await continueToColumnReview()

    expect(loadWorkspaceStockItems).not.toHaveBeenCalled()
    expect(container.querySelector('.inventory-workspace-stock-card')).toBeNull()
  })

  it('isolates workspace stock loading by workspace id', async () => {
    const loadWorkspaceStockItems = vi.fn(async (workspaceId) => [
      {
        id: workspaceId,
        name: workspaceId,
        category: null,
        unit: '',
        sku: null,
        active: true,
      },
    ])

    renderShell({
      workspaceId: 'ws-a',
      loadWorkspaceStockItems,
    })

    selectFile(createSpreadsheetFile('ops.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Item One', 1, 0, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(loadWorkspaceStockItems).toHaveBeenCalledWith('ws-a')
    expect(container.querySelector('.inventory-workspace-stock-card')
      ?.getAttribute('data-workspace-stock-count')).toBe('1')
  })

  it('runs the operational matcher once when model and catalog are ready', async () => {
    const matchSpy = vi.spyOn(matcherModule, 'matchInventoryOperationalProducts')
    let resolveLoad
    const catalog = [
      {
        id: '1',
        name: 'Item One',
        category: 'Vodka',
        unit: 'Bottle',
        sku: null,
        active: true,
      },
      {
        id: '2',
        name: 'Other Spirit',
        category: 'Vodka',
        unit: 'Bottle',
        sku: null,
        active: true,
      },
    ]
    const loadWorkspaceStockItems = vi.fn(() => new Promise((resolve) => {
      resolveLoad = resolve
    }))

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems,
    })

    selectFile(createSpreadsheetFile('ops.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Item One', 1, 0, '', '', '', '', '', '', '', '', ''],
      ['Brand New', 2, 1, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()

    expect(matchSpy).not.toHaveBeenCalled()
    expect(container.querySelector('.inventory-operational-matching')).toBeNull()

    await act(async () => {
      resolveLoad(catalog)
      await Promise.resolve()
    })

    expect(matchSpy).toHaveBeenCalledTimes(1)
    expect(matchSpy.mock.calls[0][0].existingStockItems).toEqual(catalog)
    expect(container.querySelector('.inventory-operational-matching')).toBeTruthy()
    expect(container.textContent).toContain('Operational Matching')
    expect(container.textContent).toContain('✓ Exact Matches: 1')
    expect(container.textContent).toContain('➕ New Products: 1')
    expect(container.textContent).toContain('✓ Exact Match')
    expect(container.textContent).toContain('➕ New Product')
    expect(container.querySelector('.inventory-operational-matching button')).toBeNull()

    act(() => {
      root.render(createElement(InventoryImportWizardShell, {
        workspaceId: 'ws-ops',
        loadWorkspaceStockItems,
      }))
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(matchSpy).toHaveBeenCalledTimes(1)
  })

  it('does not run the matcher before catalog success or for standard tables', async () => {
    const matchSpy = vi.spyOn(matcherModule, 'matchInventoryOperationalProducts')
    let resolveLoad
    const loadWorkspaceStockItems = vi.fn(() => new Promise((resolve) => {
      resolveLoad = resolve
    }))

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems,
    })

    selectFile(createSpreadsheetFile('ops.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Item One', 1, 0, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()
    expect(matchSpy).not.toHaveBeenCalled()
    expect(container.querySelector('.inventory-operational-matching')).toBeNull()

    await act(async () => {
      resolveLoad([])
      await Promise.resolve()
    })
    expect(matchSpy).toHaveBeenCalledTimes(1)

    act(() => {
      root.unmount()
    })
    matchSpy.mockClear()

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems: vi.fn(async () => [{ id: '1', name: 'Flour', category: null, unit: 'kg', sku: null, active: true }]),
    })
    selectFile(new File(
      ['Name,Quantity,Unit\nFlour,10,kg\n'],
      'flat.csv',
      { type: 'text/csv' },
    ))
    await continueToColumnReview()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(matchSpy).not.toHaveBeenCalled()
    expect(container.querySelector('.inventory-operational-matching')).toBeNull()
  })

  it('renders unknown layout notice without fake confidence percentages', async () => {
    renderShell()

    selectFile(new File(
      ['Alpha,Beta\nx,y\n'],
      'odd.csv',
      { type: 'text/csv' },
    ))
    await continueToColumnReview()

    expect(container.textContent).toContain('Unknown Worksheet Layout')
    expect(container.textContent).toContain('You can still review the detected columns below.')
    expect(container.textContent).not.toMatch(/\d{2,3}%/)
  })

  it('keeps Step 1 and clears detection UI when the detector fails', async () => {
    renderShell()
    vi.spyOn(formatDetectorModule, 'detectInventoryImportFormat').mockImplementation(() => {
      throw new formatDetectorModule.InventoryImportFormatDetectorError(
        'INVALID_INPUT',
        'Format detector expects an object with headers and rows.',
      )
    })

    selectFile(new File(['Name\nA\n'], 'fail.csv', { type: 'text/csv' }))
    await continueToColumnReview()

    expect(container.textContent).toContain('Format detector expects an object with headers and rows.')
    expect(container.textContent).toContain('File selected')
    expect(container.textContent).not.toContain('Standard Inventory Table')
    expect(container.querySelector('.inventory-import-wizard-review-table')).toBeNull()
    expect(container.querySelector('.inventory-import-wizard-format-card')).toBeNull()
    expect(container.querySelectorAll('.inventory-import-wizard-step')[0].className)
      .toContain('is-active')
  })

  it('does not run the detector when decode fails', async () => {
    renderShell()
    const detectSpy = vi.spyOn(formatDetectorModule, 'detectInventoryImportFormat')
    vi.spyOn(decoderModule, 'decodeInventoryImportFile').mockRejectedValue(
      new decoderModule.InventoryImportDecoderError(
        'MALFORMED_CSV',
        'CSV has an unclosed quoted field.',
      ),
    )

    selectFile(new File(['bad'], 'bad.csv', { type: 'text/csv' }))
    await continueToColumnReview()

    expect(detectSpy).not.toHaveBeenCalled()
    expect(container.textContent).toContain('CSV has an unclosed quoted field.')
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
