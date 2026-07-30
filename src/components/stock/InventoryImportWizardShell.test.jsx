/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import * as previewModule from '../../lib/inventoryOperationalImportPreview'
import * as resolutionModule from '../../lib/inventoryOperationalMatchResolutions'
import {
  INVENTORY_IMPORT_ACCEPTED_EXTENSIONS,
  INVENTORY_IMPORT_WIZARD_STEPS,
  InventoryImportWizardShell,
  formatInventoryImportFileSize,
  getInventoryImportEligibilityBlockerLabel,
  getInventoryImportFileExtension,
  listInventoryImportPreviewContinueMessages,
  listInventoryImportReviewDataContinueMessages,
} from './InventoryImportWizardShell'
import { STOCK_CREATE_STORAGE_OPTION_VALUE } from '../../lib/stockCatalog'
import { INVENTORY_IMPORT_ELIGIBILITY_BLOCKER } from '../../lib/inventoryImportEligibility'

const HERE = dirname(fileURLToPath(import.meta.url))

const { listWorkspaceStoragesMock, createWorkspaceStorageMock } = vi.hoisted(() => ({
  listWorkspaceStoragesMock: vi.fn(),
  createWorkspaceStorageMock: vi.fn(),
}))

vi.mock('../../services/workspaceStorageService', () => ({
  listWorkspaceStorages: (...args) => listWorkspaceStoragesMock(...args),
  createWorkspaceStorage: (...args) => createWorkspaceStorageMock(...args),
}))

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

  beforeEach(() => {
    listWorkspaceStoragesMock.mockReset()
    createWorkspaceStorageMock.mockReset()
    listWorkspaceStoragesMock.mockResolvedValue([
      { id: '1', locationKey: 'Main Storage', name: 'Main Storage', active: true, sortOrder: 0 },
      { id: '2', locationKey: 'Bar', name: 'Bar', active: true, sortOrder: 1 },
      { id: '3', locationKey: 'Wine Cellar', name: 'Wine Cellar', active: true, sortOrder: 2 },
      { id: '4', locationKey: 'Kitchen', name: 'Kitchen', active: true, sortOrder: 3 },
      { id: '5', locationKey: 'Apothiki 2', name: 'Apothiki 2', active: true, sortOrder: 4 },
    ])
  })

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
    const continueBtn = getButton('Continue to Map Columns')
    await act(async () => {
      continueBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  async function continueToValidateImport() {
    await continueToColumnReview()
    await act(async () => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  async function flushMicrotasks(times = 2) {
    await act(async () => {
      for (let index = 0; index < times; index += 1) {
        await Promise.resolve()
      }
    })
  }

  function setSelectValue(select, value) {
    act(() => {
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
      descriptor?.set?.call(select, value)
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  function setLocationFallback(value) {
    const select = container.querySelector('#inventory-import-location-fallback')
    expect(select).toBeTruthy()
    setSelectValue(select, value)
  }

  function getPolicyRadio(label) {
    return Array.from(container.querySelectorAll('[role="radiogroup"][aria-label="Stock quantity policy"] [role="radio"]'))
      .find((button) => button.textContent.includes(label))
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

  it('builds Validate Import continue messages only when blocked', () => {
    expect(listInventoryImportReviewDataContinueMessages({
      canContinue: true,
      previewStatus: 'ready',
      unresolvedPossibleMatches: 0,
    })).toEqual([])

    expect(listInventoryImportReviewDataContinueMessages({
      canContinue: false,
      previewStatus: 'loading',
      unresolvedPossibleMatches: null,
    })).toEqual([
      'Review remaining products.',
      'Finish all required validations to continue',
    ])

    expect(listInventoryImportReviewDataContinueMessages({
      canContinue: false,
      previewStatus: 'ready',
      unresolvedPossibleMatches: 2,
    })).toEqual([
      '2 possible matches require review',
      'Finish all required validations to continue',
    ])
  })

  it('maps eligibility blocker codes to operator-facing Continue copy', () => {
    expect(getInventoryImportEligibilityBlockerLabel(
      INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.UNRESOLVED_CREATE_LOCATION,
    )).toBe('Choose a location or fallback for new products')

    expect(listInventoryImportPreviewContinueMessages({
      canContinue: true,
      eligibility: { isReady: true, blockingReasons: [] },
    })).toEqual([])

    expect(listInventoryImportPreviewContinueMessages({
      canContinue: false,
      eligibility: {
        isReady: false,
        blockingReasons: [
          INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.MISSING_CREATE_UNIT,
          INVENTORY_IMPORT_ELIGIBILITY_BLOCKER.UNRESOLVED_CREATE_LOCATION,
        ],
      },
    })).toEqual([
      'New products need a unit',
      'Choose a location or fallback for new products',
    ])
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
    expect(getButton('Continue to Map Columns')).toBeTruthy()
    expect(getButton('Continue to Map Columns')?.disabled).toBe(false)
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

  it('decodes CSV once, parses once, and opens Map Columns', async () => {
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

    expect(container.textContent).toContain('Map Columns')
    expect(container.textContent).toContain('products.csv')
    expect(container.textContent).toContain('Detected')
    expect(container.textContent).toContain('3')
    expect(container.textContent).toContain('Mapped')
    expect(container.textContent).toContain('Name')
    expect(container.textContent).toContain('Product name')
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
    expect(container.textContent).toContain('Map Columns')
    expect(container.textContent).toContain('Product')
    expect(container.textContent).toContain('Product name')
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
    expect(getButton('Continue to Map Columns')?.disabled).toBe(true)

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

    expect(getButton('Continue to Map Columns')?.disabled).toBe(false)
    await continueToColumnReview()

    expect(worksheetSpy).toHaveBeenCalledTimes(1)
    expect(worksheetSpy.mock.calls[0][1]).toBe('Extras')
    expect(parseSpy).toHaveBeenCalledTimes(1)
    expect(parseSpy.mock.calls[0][0]).toEqual({
      headers: ['Product', 'Amount'],
      rows: [['Salt', 4]],
      headerRowNumber: 1,
    })
    expect(container.textContent).toContain('Map Columns')
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
    expect(getButton('Continue to Map Columns')).toBeTruthy()
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
      getButton('Continue to Map Columns')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Reading file…')
    expect(getButton('Back')?.disabled).toBe(true)
    expect(getButton('Continue to Map Columns')?.disabled).toBe(true)
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

    expect(container.textContent).toContain('Map Columns')
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

    const continueBtn = getButton('Continue to Map Columns')
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
    const mappingRows = container.querySelectorAll(
      '.inventory-import-wizard-map-columns > .inventory-import-wizard-review-table-wrap tbody tr',
    )
    expect(mappingRows).toHaveLength(2)
    expect(mappingRows[0].textContent).toContain('1')
    expect(mappingRows[1].textContent).toContain('2')
    expect(mappingRows[1].textContent).toContain('Blank header')
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
    expect(getButton('Continue to Map Columns')).toBeTruthy()
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
    expect(getButton('Continue to Map Columns')?.disabled).toBe(false)
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

  it('does not import validator, mapper, classifier, unrelated services, RPCs, or FileReader', () => {
    const source = readFileSync(join(HERE, 'InventoryImportWizardShell.jsx'), 'utf8')

    expect(source).toMatch(/inventoryImportFileDecoder/)
    expect(source).toMatch(/inventoryImportTabularParser/)
    expect(source).toMatch(/inventoryImportFormatDetector/)
    expect(source).toMatch(/inventoryOperationalSheetParser/)
    expect(source).toMatch(/inventoryOperationalProductMatcher/)
    expect(source).toMatch(/inventoryOperationalImportPreview/)
    expect(source).toMatch(/inventoryOperationalMatchResolutions/)
    expect(source).toMatch(/inventoryNewProductDrafts/)
    expect(source).toMatch(/inventoryImportWizardUx/)
    expect(source).toMatch(/inventoryImportStagingPayload/)
    expect(source).toMatch(/inventoryImportService/)
    expect(source).toMatch(/useWorkspaceStockCatalog/)
    expect(source).toMatch(/InventoryImportValidateAssistant/)
    expect(source).toMatch(/InventoryOperationalImportPreview/)
    expect(source).toMatch(/InventoryOperationalMatchResolution/)
    expect(source).toMatch(/InventoryNewProductReview/)
    expect(source).not.toMatch(/InventoryOperationalMatchingSummary/)
    expect(source).not.toMatch(/InventoryOperationalReview/)
    expect(source).not.toMatch(/inventoryImportTableValidator/)
    expect(source).not.toMatch(/inventoryImportFieldMapper/)
    expect(source).not.toMatch(/inventoryImportClassifier/)
    expect(source).not.toMatch(/stockCsvImport/)
    expect(source).not.toMatch(/from ['"].*services\/(?!inventoryImportService|workspaceStorageService)/)
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
    expect(container.textContent).toContain('Map Columns')
    expect(container.textContent).toContain('weekday columns detected')
    expect(container.textContent).toContain('Sample preview')
    expect(getButton('Continue')?.disabled).toBe(false)
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
    expect(container.querySelector('.inventory-import-wizard-map-columns')).toBeTruthy()
    expect(container.querySelector('.inventory-operational-review')).toBeNull()
    expect(container.textContent).toContain('Map Columns')
    expect(container.textContent).toContain('Sample preview')
    expect(container.textContent).toContain('Item One')
    expect(container.textContent).toContain('Item Two')
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
    expect(container.querySelector('.inventory-import-step-summary')?.getAttribute('data-step-summary'))
      .toBe('columns')
    expect(container.querySelector('.inventory-import-validate-groups')).toBeNull()
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
    await continueToValidateImport()

    expect(loadWorkspaceStockItems).toHaveBeenCalledTimes(1)
    expect(loadWorkspaceStockItems).toHaveBeenCalledWith('ws-ops')

    await flushMicrotasks()

    const summary = container.querySelector('.inventory-import-step-summary')
    expect(summary?.getAttribute('data-workspace-stock-status')).toBe('success')
    expect(summary?.getAttribute('data-workspace-stock-count')).toBe('2')
    expect(container.textContent).toContain('Validate Import')
    expect(container.textContent).toContain('Products')
    expect(container.textContent).toContain('Ready')
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
    await continueToValidateImport()

    expect(container.textContent).toContain('Loading workspace stock')

    await act(async () => {
      resolveLoad([])
      await Promise.resolve()
    })

    const summary = container.querySelector('.inventory-import-step-summary')
    expect(summary?.getAttribute('data-workspace-stock-status')).toBe('success')
    expect(container.textContent).toContain('Products')
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
    await continueToValidateImport()

    await flushMicrotasks()

    expect(container.querySelector('[data-workspace-stock-status="error"]')).toBeTruthy()
    expect(container.textContent).toContain('Unable to load workspace stock')
    expect(container.textContent).toContain('catalog unavailable')
    expect(container.textContent).toContain('Validate Import')
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
    await continueToValidateImport()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(loadWorkspaceStockItems).toHaveBeenCalledWith('ws-a')
    expect(container.querySelector('.inventory-import-step-summary')
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
    await continueToValidateImport()

    expect(matchSpy).not.toHaveBeenCalled()
    expect(container.querySelector('.inventory-import-validate-groups')).toBeNull()
    expect(container.querySelector('.inventory-import-step-summary')?.getAttribute('data-step-summary'))
      .toBe('data')
    expect(container.querySelector('.inventory-import-step-summary')?.getAttribute('data-workspace-stock-status'))
      .toBe('loading')

    await act(async () => {
      resolveLoad(catalog)
      await Promise.resolve()
    })

    expect(matchSpy).toHaveBeenCalledTimes(1)
    expect(matchSpy.mock.calls[0][0].existingStockItems).toEqual(catalog)
    expect(container.textContent).toContain('Validate Import')
    expect(container.textContent).toContain('Products need a unit')
    expect(container.querySelector('.inventory-import-validate-assistant')).toBeTruthy()
    expect(container.querySelector('[data-assistant-state]')).toBeTruthy()
    expect(container.textContent).not.toContain('unit_missing')
    expect(container.textContent).not.toContain('manual_review')
    expect(container.querySelector('.inventory-import-step-summary')?.getAttribute('data-workspace-stock-status'))
      .toBe('success')

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
    await continueToValidateImport()
    expect(matchSpy).not.toHaveBeenCalled()
    expect(container.querySelector('.inventory-import-validate-groups')).toBeNull()

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
    expect(container.querySelector('.inventory-import-step-summary')?.getAttribute('data-step-summary'))
      .toBe('columns')
    expect(container.querySelector('.inventory-import-validate-groups')).toBeNull()
  })

  it('builds the operational import preview after catalog success and memoizes it', async () => {
    const previewSpy = vi.spyOn(previewModule, 'buildInventoryOperationalImportPreview')
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
      ['Item One', 6, 1.8, '', '', '', '', '', '', '', 2, 4],
    ]))
    await continueToValidateImport()

    expect(previewSpy).not.toHaveBeenCalled()
    expect(container.querySelector('.inventory-operational-import-preview')).toBeNull()

    await act(async () => {
      resolveLoad(catalog)
      await Promise.resolve()
    })

    expect(previewSpy).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Validate Import')
    expect(container.querySelector('.inventory-operational-import-preview')).toBeNull()
    expect(container.querySelector('.inventory-import-validate-assistant')).toBeTruthy()
    expect(container.textContent).toContain('No decisions required.')
    expect(container.querySelector('.inventory-operational-match-resolution')).toBeNull()
    expect(getButton('Continue')?.disabled).toBe(false)

    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Import Preview')
    expect(container.querySelector('.inventory-operational-import-preview')).toBeTruthy()
    expect(container.textContent).toContain('What ONE will do')
    expect(container.textContent).toContain('LINK')
    expect(container.textContent).toContain('CREATE')
    expect(container.textContent).toContain('Storage')
    expect(container.textContent).toContain('6')
    expect(container.textContent).toContain('1.8')
    expect(container.querySelector('.inventory-operational-import-preview button')).toBeNull()
    expect(container.querySelector('.inventory-operational-import-preview input')).toBeNull()
    expect(container.querySelector('.inventory-operational-match-resolution')).toBeNull()
    expect(getButton('Apply Import')).toBeFalsy()
    expect(getButton('Continue')?.disabled).toBe(false)

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

    expect(previewSpy).toHaveBeenCalledTimes(1)
  })

  it('shows a premium preview error state when preview construction fails', async () => {
    vi.spyOn(previewModule, 'buildInventoryOperationalImportPreview').mockImplementation(() => {
      throw new previewModule.InventoryOperationalImportPreviewError(
        'SOURCE_MATCH_ALIGNMENT',
        'Preview alignment failed for test.',
      )
    })

    const loadWorkspaceStockItems = vi.fn(async () => [])

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems,
    })

    selectFile(createSpreadsheetFile('ops.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Item One', 1, 0, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToValidateImport()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Validate Import')
    expect(container.textContent).not.toContain('Unable to build import preview')
    expect(getButton('Continue')?.disabled).toBe(false)

    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Import Preview')
    expect(container.textContent).toContain('Unable to build import preview')
    expect(container.textContent).toContain('Preview alignment failed for test.')
  })

  it('navigates valid operational Map Columns to Validate Import without skipping Import Preview', async () => {
    const loadWorkspaceStockItems = vi.fn(async () => [
      {
        id: '1',
        name: 'Item One',
        category: 'Vodka',
        unit: 'Bottle',
        sku: null,
        active: true,
      },
    ])

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems,
    })

    selectFile(createMultiSheetFile('amore-ops.xlsx', [
      {
        sheetName: 'Cover',
        matrix: [['Notes'], ['ignore']],
      },
      {
        sheetName: 'Inventory',
        matrix: [
          ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
          ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
          ['Absolut Blue', 6, 1.8, '', '', '', '', '', '', '', '', ''],
          ['Belvedere', 2, 1, '', '', '', '', '', '', '', '', ''],
          ['GIN', '', '', '', '', '', '', '', '', '', '', ''],
          ['Tanqueray', 3, 1, '', '', '', '', '', '', '', '', ''],
          ['WHISKEY', '', '', '', '', '', '', '', '', '', '', ''],
          ['Glenfidich 12', '', '', '', '', '', '', '', '', '', '', ''],
          ['Chivas 12 70cl', 1, 0, '', '', '', '', '', '', '', '', ''],
        ],
      },
    ]))
    await continueToColumnReview()

    const inventoryBtn = Array.from(container.querySelectorAll('[role="radio"]'))
      .find((button) => button.textContent.includes('Inventory'))
    act(() => {
      inventoryBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await continueToColumnReview()

    expect(container.textContent).toContain('Map Columns')
    expect(getButton('Continue')?.disabled).toBe(false)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Validate Import')
    expect(container.querySelector('.inventory-import-wizard-validate')).toBeTruthy()
    expect(container.querySelector('.inventory-import-wizard-map-columns')).toBeNull()
    expect(container.querySelector('.inventory-operational-import-preview')).toBeNull()
    expect(container.textContent).toContain('Inventory')
    expect(container.textContent).toContain('Products')
    expect(container.textContent).toContain('5')
    expect(container.textContent).toContain('Glenfidich 12')
    expect(container.textContent).toContain('Decisions')
    expect(container.textContent).toContain('No decisions required.')
    expect(container.querySelector('.inventory-operational-match-resolution')).toBeNull()
    expect(container.querySelector('[data-assistant-state]')).toBeTruthy()

    const steps = container.querySelectorAll('.inventory-import-wizard-step')
    expect(steps[0].className).toContain('is-completed')
    expect(steps[1].className).toContain('is-completed')
    expect(steps[2].className).toContain('is-active')
    expect(steps[3].className).toContain('is-upcoming')
    expect(steps[4].className).toContain('is-upcoming')

    // No possible matches against this catalog → Continue to Import Preview is enabled.
    expect(getButton('Continue')?.disabled).toBe(false)

    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Import Preview')
    expect(container.querySelector('.inventory-operational-import-preview')).toBeTruthy()
    expect(container.querySelector('.inventory-operational-match-resolution')).toBeNull()
    expect(container.querySelectorAll('.inventory-operational-import-preview')).toHaveLength(1)

    const previewSteps = container.querySelectorAll('.inventory-import-wizard-step')
    expect(previewSteps[2].className).toContain('is-completed')
    expect(previewSteps[3].className).toContain('is-active')
    expect(previewSteps[4].className).toContain('is-upcoming')
    expect(container.textContent).toContain('CREATE')
    expect(container.textContent).toContain('What ONE will do')
    // Sheet has create_new rows without units → Continue stays disabled.
    expect(getButton('Continue')?.disabled).toBe(true)

    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Validate Import')
    expect(container.querySelector('.inventory-operational-import-preview')).toBeNull()

    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Map Columns')
    expect(container.textContent).toContain('Map Columns')
    expect(getButton('Continue')?.disabled).toBe(false)
  })

  it('infers units for AMORE volume names and keeps manual overrides across Back', async () => {
    const matchSpy = vi.spyOn(matcherModule, 'matchInventoryOperationalProducts')
    const parseSpy = vi.spyOn(operationalParserModule, 'parseInventoryOperationalSheet')
    const loadWorkspaceStockItems = vi.fn(async () => [])

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems,
    })

    selectFile(createSpreadsheetFile('amore-units.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['APERITIVO', '', '', '', '', '', '', '', '', '', '', ''],
      ['Campari 1lt', 2, 1, '', '', '', '', '', '', '', '', ''],
      ['Aperol 1lt', 1, 0, '', '', '', '', '', '', '', '', ''],
      ['Cynar 1lt', 1, 0, '', '', '', '', '', '', '', '', ''],
      ['Disaronno 1lt', 1, 0, '', '', '', '', '', '', '', '', ''],
      ['Ketel One 70cl', 4, 1, '', '', '', '', '', '', '', '', ''],
      ['Ketel One 1lt', 2, 0, '', '', '', '', '', '', '', '', ''],
      ['Bitter Truth Apricot Liqueur', 1, 0, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Campari 1lt')
    expect(container.textContent).toContain('Suggested from product name')
    expect(container.textContent).toContain('Bottle')
    expect(container.textContent).toContain('Bitter Truth Apricot Liqueur')
    expect(container.querySelector('[data-units-suggested]')?.getAttribute('data-units-suggested'))
      .toBe('6')
    expect(container.querySelector('[data-need-unit-selection]')?.getAttribute('data-need-unit-selection'))
      .toBe('1')

    const matchCalls = matchSpy.mock.calls.length
    const parseCalls = parseSpy.mock.calls.length

    const unitSelects = Array.from(container.querySelectorAll('.inventory-new-product-review select'))
      .filter((select) => Array.from(select.options).some((option) => option.value === 'Bottle'))
    const bitterSelect = unitSelects.find((select) => select.value === '')
    expect(bitterSelect).toBeTruthy()

    const campariSelect = unitSelects.find((select) => select.value === 'Bottle')
    setSelectValue(campariSelect, 'Liter')
    expect(campariSelect.value).toBe('Liter')

    setSelectValue(bitterSelect, 'Bottle')

    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Import Preview')
    expect(getButton('Continue')?.disabled).toBe(true)
    setLocationFallback('Main Storage')
    expect(getButton('Continue')?.disabled).toBe(false)
    expect(matchSpy.mock.calls.length).toBe(matchCalls)
    expect(parseSpy.mock.calls.length).toBe(parseCalls)

    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Validate Import')
    const preservedCampari = Array.from(container.querySelectorAll('.inventory-new-product-review select'))
      .find((select) => select.value === 'Liter')
    expect(preservedCampari).toBeTruthy()

    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('#inventory-import-location-fallback')?.value).toBe('Main Storage')
    expect(getButton('Continue')?.disabled).toBe(false)
    expect(getButton('Apply Import')).toBeFalsy()
  })

  it('reviews new products with unit assignment, updates preview, and preserves drafts on Back', async () => {
    const matchSpy = vi.spyOn(matcherModule, 'matchInventoryOperationalProducts')
    const parseSpy = vi.spyOn(operationalParserModule, 'parseInventoryOperationalSheet')
    const loadWorkspaceStockItems = vi.fn(async () => [
      {
        id: 'ko',
        name: 'KETEL ONE',
        category: 'Vodka',
        unit: 'Bottle',
        sku: null,
        active: true,
      },
    ])

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems,
    })

    selectFile(createSpreadsheetFile('new-products.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Brand New Spirit', 3, 1, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Validate Import')
    expect(container.textContent).toContain('New Products')
    expect(container.textContent).toContain('Brand New Spirit')
    expect(container.textContent).toContain('Unit is required')

    const matchCalls = matchSpy.mock.calls.length
    const parseCalls = parseSpy.mock.calls.length

    const unitSelect = Array.from(container.querySelectorAll('.inventory-new-product-review select'))
      .find((select) => Array.from(select.options).some((option) => option.value === 'Bottle'))
    expect(unitSelect).toBeTruthy()
    setSelectValue(unitSelect, 'Bottle')

    expect(container.textContent).toContain('Unit')
    expect(container.textContent).toContain('Bottle')
    expect(container.textContent).not.toContain('Unit is required')

    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Import Preview')
    expect(container.textContent).toContain('Do not change current stock quantities')
    expect(getPolicyRadio('Do not change current stock quantities')?.getAttribute('aria-checked'))
      .toBe('true')
    expect(getButton('Continue')?.disabled).toBe(true)
    expect(container.querySelector('.inventory-import-wizard-validation-panel')).toBeTruthy()
    expect(container.textContent).toMatch(
      /Choose a location or fallback for new products|Map each quantity column to a workspace storage/,
    )

    const fallbackSelect = container.querySelector('#inventory-import-location-fallback')
    expect(fallbackSelect).toBeTruthy()
    expect(fallbackSelect.value).toBe('')
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(listWorkspaceStoragesMock).toHaveBeenCalledWith('ws-ops')
    expect(Array.from(fallbackSelect.options).map((option) => option.value))
      .toEqual([
        '',
        'Main Storage',
        'Bar',
        'Wine Cellar',
        'Kitchen',
        'Apothiki 2',
        STOCK_CREATE_STORAGE_OPTION_VALUE,
      ])
    expect(container.textContent).toMatch(/unresolved new product|Map each quantity column/)
    setLocationFallback('Kitchen')
    expect(getButton('Continue')?.disabled).toBe(false)
    expect(container.textContent).toContain('Ready to continue')

    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Validate Import')

    const preservedUnit = Array.from(container.querySelectorAll('.inventory-new-product-review select'))
      .find((select) => Array.from(select.options).some((option) => option.value === 'Bottle'))
    expect(preservedUnit?.value).toBe('Bottle')
    expect(container.textContent).toContain('Bottle')

    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('#inventory-import-location-fallback')?.value).toBe('Kitchen')
    expect(matchSpy.mock.calls.length).toBe(matchCalls)
    expect(parseSpy.mock.calls.length).toBe(parseCalls)

    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Ready to Import')
    expect(getButton('Apply Import')?.disabled).toBe(false)
    expect(container.textContent).toContain('Status')
    expect(container.querySelector('.inventory-import-step-summary')?.textContent).toContain('Ready')
  })

  it('resets new product drafts when a different file is selected', async () => {
    const loadWorkspaceStockItems = vi.fn(async () => [])

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems,
    })

    selectFile(createSpreadsheetFile('draft-a.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Brand New Spirit', 1, 0, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const unitSelect = Array.from(container.querySelectorAll('.inventory-new-product-review select'))
      .find((select) => Array.from(select.options).some((option) => option.value === 'Bottle'))
    act(() => {
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
      descriptor?.set?.call(unitSelect, 'Bottle')
      unitSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(unitSelect.value).toBe('Bottle')

    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    selectFile(createSpreadsheetFile('draft-b.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Another New Spirit', 2, 0, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const resetSelect = Array.from(container.querySelectorAll('.inventory-new-product-review select'))
      .find((select) => Array.from(select.options).some((option) => option.value === 'Bottle'))
    expect(resetSelect?.value).toBe('')
    expect(container.textContent).toContain('Another New Spirit')
  })

  it('keeps Continue disabled for operational sheets with zero products', async () => {
    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems: vi.fn(async () => []),
    })

    selectFile(createSpreadsheetFile('empty-ops.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['GIN', '', '', '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()

    expect(container.textContent).toContain('Map Columns')
    expect(getButton('Continue')?.disabled).toBe(true)

    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('.inventory-import-wizard-map-columns')).toBeTruthy()
    expect(container.querySelector('.inventory-import-wizard-validate')).toBeNull()
  })

  it('keeps Continue disabled for standard and unknown layouts', async () => {
    renderShell()

    selectFile(new File(
      ['Name,Quantity,Unit\nFlour,10,kg\n'],
      'flat.csv',
      { type: 'text/csv' },
    ))
    await continueToColumnReview()
    expect(container.textContent).toContain('Standard Inventory Table')
    expect(getButton('Continue')?.disabled).toBe(true)

    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('.inventory-import-wizard-map-columns')).toBeTruthy()
    expect(container.querySelector('.inventory-import-wizard-validate')).toBeNull()

    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    selectFile(new File(
      ['Alpha,Beta\nx,y\n'],
      'odd.csv',
      { type: 'text/csv' },
    ))
    await continueToColumnReview()
    expect(container.textContent).toContain('Unknown Worksheet Layout')
    expect(getButton('Continue')?.disabled).toBe(true)
    expect(container.querySelector('.inventory-import-wizard-validate')).toBeNull()
  })

  it('resolves possible matches locally and keeps decisions across Back navigation', async () => {
    const applySpy = vi.spyOn(resolutionModule, 'applyInventoryOperationalMatchResolutions')
    const matchSpy = vi.spyOn(matcherModule, 'matchInventoryOperationalProducts')
    const parseSpy = vi.spyOn(operationalParserModule, 'parseInventoryOperationalSheet')
    const loadWorkspaceStockItems = vi.fn(async () => [
      {
        id: 'ko',
        name: 'KETEL ONE',
        category: 'Vodka',
        unit: 'Bottle 0.7L',
        sku: null,
        active: true,
      },
    ])

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems,
    })

    selectFile(createSpreadsheetFile('ketel.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Ketel One 70cl', 4, 1, '', '', '', '', '', '', '', '', ''],
      ['Ketel One 1lt', 2, 0, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()

    expect(getButton('Continue')?.disabled).toBe(false)
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const matchCallsAfterData = matchSpy.mock.calls.length
    const parseCallsAfterData = parseSpy.mock.calls.length

    expect(container.textContent).toContain('Resolve Possible Matches')
    expect(container.textContent).toContain('Ketel One 70cl')
    expect(container.textContent).toContain('KETEL ONE')
    expect(container.textContent).toContain('Decisions')
    expect(container.querySelector('[data-assistant-state="decisions_required"], [data-assistant-state="blocked"]'))
      .toBeTruthy()
    expect(container.querySelector('.inventory-operational-import-preview')).toBeNull()
    expect(container.querySelector('.inventory-operational-match-resolution')
      ?.getAttribute('data-possible-count')).toBe('2')
    expect(getButton('Continue')?.disabled).toBe(true)
    expect(container.querySelector('.inventory-import-wizard-validation-panel')).toBeTruthy()
    expect(container.textContent).toContain('2 possible matches require review')
    expect(container.textContent).toContain('Finish all required validations to continue')

    const candidateRadios = Array.from(
      container.querySelectorAll('input[name^="match-resolution-candidate-"]'),
    )
    expect(candidateRadios).toHaveLength(2)
    act(() => {
      candidateRadios[0].click()
    })

    expect(applySpy.mock.calls.length).toBeGreaterThan(0)
    expect(container.querySelector('.inventory-operational-match-resolution')
      ?.getAttribute('data-resolved-count')).toBe('1')
    expect(getButton('Continue')?.disabled).toBe(true)

    act(() => {
      candidateRadios[1].click()
    })
    expect(container.querySelector('.inventory-operational-match-resolution')
      ?.getAttribute('data-resolved-count')).toBe('2')
    expect(getButton('Continue')?.disabled).toBe(false)
    expect(container.querySelector('.inventory-import-wizard-validation-panel')).toBeNull()

    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Import Preview')
    expect(container.querySelector('.inventory-operational-import-preview')).toBeTruthy()
    expect(container.querySelector('.inventory-operational-match-resolution')).toBeNull()
    expect(container.textContent).toContain('LINK')
    expect(container.textContent).toContain('New products0')
    expect(getButton('Apply Import')).toBeFalsy()
    // Both possible matches linked to the same ONE product → Ready is blocked.
    expect(getButton('Continue')?.disabled).toBe(true)
    expect(container.textContent).toContain('More than one row targets the same existing product')

    const steps = container.querySelectorAll('.inventory-import-wizard-step')
    expect(steps[2].className).toContain('is-completed')
    expect(steps[3].className).toContain('is-active')
    expect(steps[4].className).toContain('is-upcoming')

    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Validate Import')
    expect(container.querySelector('.inventory-operational-match-resolution')
      ?.getAttribute('data-resolved-count')).toBe('2')
    expect(container.querySelectorAll('input[name^="match-resolution-candidate-"]:checked'))
      .toHaveLength(2)
    expect(container.querySelector('.inventory-operational-import-preview')).toBeNull()
    expect(matchSpy.mock.calls.length).toBe(matchCallsAfterData)
    expect(parseSpy.mock.calls.length).toBe(parseCallsAfterData)

    const skipRadios = Array.from(container.querySelectorAll('input[value="skip"]'))
    expect(skipRadios.length).toBeGreaterThan(0)
    act(() => {
      skipRadios[1].click()
    })
    expect(getButton('Continue')?.disabled).toBe(false)

    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Import Preview')
    expect(getButton('Continue')?.disabled).toBe(false)
    expect(container.textContent).toContain('Ready to continue')
    expect(container.textContent).not.toContain('More than one row targets the same existing product')

    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Map Columns')

    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('.inventory-operational-match-resolution')
      ?.getAttribute('data-resolved-count')).toBe('2')
  })

  it('resets match resolutions when a different file is selected', async () => {
    const loadWorkspaceStockItems = vi.fn(async () => [
      {
        id: 'ko',
        name: 'KETEL ONE',
        category: 'Vodka',
        unit: 'Bottle',
        sku: null,
        active: true,
      },
    ])

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems,
    })

    selectFile(createSpreadsheetFile('ketel.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Ketel One 70cl', 4, 1, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const candidate = container.querySelector('input[name^="match-resolution-candidate-"]')
    expect(candidate).toBeTruthy()
    act(() => {
      candidate.click()
    })
    expect(container.querySelector('.inventory-operational-match-resolution')
      ?.getAttribute('data-resolved-count')).toBe('1')

    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    selectFile(createSpreadsheetFile('ketel-2.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Ketel One 1lt', 2, 0, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('.inventory-operational-match-resolution')
      ?.getAttribute('data-resolved-count')).toBe('0')
    expect(container.querySelectorAll('input[type="radio"]:checked')).toHaveLength(0)
  })

  it('does not build import preview for standard inventory tables', async () => {
    const previewSpy = vi.spyOn(previewModule, 'buildInventoryOperationalImportPreview')
    const loadWorkspaceStockItems = vi.fn(async () => [
      { id: '1', name: 'Flour', category: null, unit: 'kg', sku: null, active: true },
    ])

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
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(previewSpy).not.toHaveBeenCalled()
    expect(container.querySelector('.inventory-operational-import-preview')).toBeNull()
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
    expect(container.textContent).toContain('You can still map the detected columns below.')
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

  it('defaults to no_change policy, requires location fallback for creates, and enables Apply when ready', async () => {
    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems: vi.fn(async () => []),
    })

    selectFile(createSpreadsheetFile('policy-default.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Brand New Spirit', 3, 1, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const unitSelect = Array.from(container.querySelectorAll('.inventory-new-product-review select'))
      .find((select) => Array.from(select.options).some((option) => option.value === 'Bottle'))
    setSelectValue(unitSelect, 'Bottle')

    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getPolicyRadio('Do not change current stock quantities')?.getAttribute('aria-checked'))
      .toBe('true')
    expect(container.textContent).not.toContain('existing products will be replaced')
    expect(getButton('Continue')?.disabled).toBe(true)

    setLocationFallback('Main Storage')
    expect(getButton('Continue')?.disabled).toBe(false)
    expect(container.textContent).toContain('Ready to continue')
    expect(container.textContent).toContain('1 create')

    setLocationFallback('')
    expect(getButton('Continue')?.disabled).toBe(true)
    expect(container.textContent).toMatch(
      /Choose a location or fallback for new products|Map each quantity column to a workspace storage/,
    )

    setLocationFallback('Main Storage')
    expect(getButton('Continue')?.disabled).toBe(false)
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Ready to Import')
    expect(getButton('Apply Import')?.disabled).toBe(false)
    expect(container.textContent).toContain('Status')
    expect(container.querySelector('.inventory-import-step-summary')?.textContent).toContain('Ready')
  })

  it('requires overwrite confirmation for opening stock on linked items and clears it when returning to no_change', async () => {
    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems: vi.fn(async () => [{
        id: 'ko',
        name: 'Item One',
        category: 'Vodka',
        unit: 'Bottle',
        sku: null,
        active: true,
        storageLocation: 'Main Storage',
      }]),
    })

    selectFile(createSpreadsheetFile('opening-stock.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Item One', 6, 1.8, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await flushMicrotasks(6)

    expect(getButton('Continue')?.disabled).toBe(false)
    expect(container.textContent).not.toContain('existing products will be replaced')

    act(() => {
      getPolicyRadio('Apply spreadsheet quantities as opening stock').click()
    })
    expect(getPolicyRadio('Apply spreadsheet quantities as opening stock')?.getAttribute('aria-checked'))
      .toBe('true')
    expect(getButton('Continue')?.disabled).toBe(true)
    expect(container.textContent).toContain('Confirm replacing quantities on existing products')
    expect(container.textContent).toContain('existing products will be replaced')

    act(() => {
      getPolicyRadio('Do not change current stock quantities').click()
    })
    expect(getButton('Continue')?.disabled).toBe(false)
    expect(container.textContent).toContain('Ready to continue')
    expect(container.textContent).not.toContain('Confirm replacing quantities on existing products')
  })

  it('resets import policy defaults when a different file is selected', async () => {
    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems: vi.fn(async () => []),
    })

    selectFile(createSpreadsheetFile('policy-a.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Brand New Spirit', 1, 0, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    act(() => {
      getPolicyRadio('Apply spreadsheet quantities as opening stock').click()
    })
    setLocationFallback('Kitchen')
    expect(container.querySelector('#inventory-import-location-fallback')?.value).toBe('Kitchen')

    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    act(() => {
      getButton('Back').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    selectFile(createSpreadsheetFile('policy-b.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Another New Spirit', 2, 0, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(getPolicyRadio('Do not change current stock quantities')?.getAttribute('aria-checked'))
      .toBe('true')
    expect(container.querySelector('#inventory-import-location-fallback')?.value).toBe('')
    expect(container.textContent).toContain('Another New Spirit')
  })

  async function continueReadyCreateOnlyFlow() {
    selectFile(createSpreadsheetFile('apply-ready.xlsx', [
      ['', 'Storage Tasos', 'BAR', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Order', 'Stock Control'],
      ['VODKA', '', '', '', '', '', '', '', '', '', '', ''],
      ['Brand New Spirit', 3, 1, '', '', '', '', '', '', '', '', ''],
    ]))
    await continueToColumnReview()
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const unitSelect = Array.from(container.querySelectorAll('.inventory-new-product-review select'))
      .find((select) => Array.from(select.options).some((option) => option.value === 'Bottle'))
    setSelectValue(unitSelect, 'Bottle')
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    setLocationFallback('Main Storage')
    act(() => {
      getButton('Continue').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }

  it('applies import through create → stage → ready → apply and shows completion from RPC', async () => {
    const createInventoryImportSession = vi.fn(async () => ({
      sessionId: 'sess-apply-1',
      status: 'draft',
    }))
    const stageInventoryImportRows = vi.fn(async () => ({
      sessionId: 'sess-apply-1',
      status: 'review',
    }))
    const markInventoryImportSessionReady = vi.fn(async () => ({
      sessionId: 'sess-apply-1',
      status: 'ready',
    }))
    const applyInventoryImportSession = vi.fn(async ({ applyIdempotencyKey }) => ({
      sessionId: 'sess-apply-1',
      status: 'completed',
      createdCount: 1,
      linkedCount: 2,
      skippedCount: 3,
      movementCount: 4,
      eligibleRowCount: 6,
      applyIdempotencyKey,
    }))

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems: vi.fn(async () => []),
      createInventoryImportSession,
      stageInventoryImportRows,
      markInventoryImportSessionReady,
      applyInventoryImportSession,
    })

    await continueReadyCreateOnlyFlow()
    expect(getButton('Apply Import')?.disabled).toBe(false)

    await act(async () => {
      getButton('Apply Import').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createInventoryImportSession).toHaveBeenCalledTimes(1)
    expect(stageInventoryImportRows).toHaveBeenCalledTimes(1)
    expect(markInventoryImportSessionReady).toHaveBeenCalledTimes(1)
    expect(applyInventoryImportSession).toHaveBeenCalledTimes(1)
    expect(applyInventoryImportSession.mock.calls[0][0].sessionId).toBe('sess-apply-1')
    expect(applyInventoryImportSession.mock.calls[0][0].workspaceId).toBe('ws-ops')
    expect(`${applyInventoryImportSession.mock.calls[0][0].applyIdempotencyKey ?? ''}`.length)
      .toBeGreaterThan(0)
    expect(stageInventoryImportRows.mock.calls[0][0].rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selected_action: 'create' }),
      ]),
    )

    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Import Complete')
    expect(container.textContent).toContain('Products created: 1')
    expect(container.textContent).toContain('Products linked: 2')
    expect(container.textContent).toContain('Skipped rows: 3')
    expect(container.textContent).toContain('Opening stock movements: 4')
    expect(container.textContent).toContain('Total processed: 6')
    expect(getButton('Apply Import')).toBeFalsy()
    expect(getButton('Done')).toBeTruthy()
  })

  it('keeps review state on apply failure, allows retry, and creates the session only once', async () => {
    const createInventoryImportSession = vi.fn(async () => ({
      sessionId: 'sess-retry-1',
      status: 'draft',
    }))
    const stageInventoryImportRows = vi.fn(async () => ({
      sessionId: 'sess-retry-1',
      status: 'review',
    }))
    const markInventoryImportSessionReady = vi.fn(async () => ({
      sessionId: 'sess-retry-1',
      status: 'ready',
    }))
    const applyInventoryImportSession = vi.fn()
      .mockRejectedValueOnce(new Error('Apply failed: stock write blocked'))
      .mockResolvedValueOnce({
        sessionId: 'sess-retry-1',
        status: 'completed',
        createdCount: 1,
        linkedCount: 0,
        skippedCount: 0,
        movementCount: 0,
        eligibleRowCount: 1,
      })

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems: vi.fn(async () => []),
      createInventoryImportSession,
      stageInventoryImportRows,
      markInventoryImportSessionReady,
      applyInventoryImportSession,
    })

    await continueReadyCreateOnlyFlow()

    await act(async () => {
      getButton('Apply Import').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Ready to Import')
    expect(container.textContent).toContain('Apply failed: stock write blocked')
    expect(getButton('Apply Import')?.disabled).toBe(false)
    expect(createInventoryImportSession).toHaveBeenCalledTimes(1)
    expect(stageInventoryImportRows).toHaveBeenCalledTimes(1)
    expect(markInventoryImportSessionReady).toHaveBeenCalledTimes(1)
    expect(applyInventoryImportSession).toHaveBeenCalledTimes(1)

    const firstKey = applyInventoryImportSession.mock.calls[0][0].applyIdempotencyKey

    await act(async () => {
      getButton('Apply Import').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(createInventoryImportSession).toHaveBeenCalledTimes(1)
    expect(stageInventoryImportRows).toHaveBeenCalledTimes(1)
    expect(markInventoryImportSessionReady).toHaveBeenCalledTimes(1)
    expect(applyInventoryImportSession).toHaveBeenCalledTimes(2)
    expect(applyInventoryImportSession.mock.calls[1][0].applyIdempotencyKey).not.toBe(firstKey)
    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Import Complete')
    expect(container.textContent).toContain('Products created: 1')
  })

  it('prevents double Apply while a request is running', async () => {
    let resolveApply
    const applyPromise = new Promise((resolve) => {
      resolveApply = resolve
    })
    const createInventoryImportSession = vi.fn(async () => ({
      sessionId: 'sess-lock-1',
      status: 'draft',
    }))
    const stageInventoryImportRows = vi.fn(async () => ({
      sessionId: 'sess-lock-1',
      status: 'review',
    }))
    const markInventoryImportSessionReady = vi.fn(async () => ({
      sessionId: 'sess-lock-1',
      status: 'ready',
    }))
    const applyInventoryImportSession = vi.fn(async () => applyPromise)

    renderShell({
      workspaceId: 'ws-ops',
      loadWorkspaceStockItems: vi.fn(async () => []),
      createInventoryImportSession,
      stageInventoryImportRows,
      markInventoryImportSessionReady,
      applyInventoryImportSession,
    })

    await continueReadyCreateOnlyFlow()

    await act(async () => {
      getButton('Apply Import').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(getButton('Applying…')?.disabled).toBe(true)

    await act(async () => {
      getButton('Applying…').dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(createInventoryImportSession).toHaveBeenCalledTimes(1)
    expect(applyInventoryImportSession).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveApply({
        sessionId: 'sess-lock-1',
        status: 'completed',
        createdCount: 1,
        linkedCount: 0,
        skippedCount: 0,
        movementCount: 0,
        eligibleRowCount: 1,
      })
      await applyPromise
      await Promise.resolve()
    })

    expect(container.querySelector('.inventory-import-wizard-review-title')?.textContent)
      .toBe('Import Complete')
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
