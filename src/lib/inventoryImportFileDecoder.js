/**
 * P8.16.2 / P8.16.3 — Inventory Import browser-side file decoder.
 *
 * Decodes a local CSV / XLS / XLSX File into tabular arrays compatible with
 * the locked Inventory Import tabular parser input contract. Does not call
 * the parser, mutate the File, network, persist, or upload.
 *
 * SheetJS (`xlsx`) is loaded only for spreadsheet paths via dynamic import so
 * the main app bundle stays under the existing Workbox precache size limit.
 *
 * P8.16.3: multi-worksheet workbooks require explicit sheet selection via
 * `inspectInventoryImportWorkbook` + `decodeInventoryImportWorksheet`.
 */

export class InventoryImportDecoderError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   */
  constructor(code, message, details = undefined) {
    super(message)
    this.name = 'InventoryImportDecoderError'
    this.code = code
    if (details && typeof details === 'object') {
      this.details = details
    }
  }
}

const ACCEPTED_EXTENSIONS = new Set(['csv', 'xlsx', 'xls'])

/**
 * @returns {Promise<typeof import('xlsx')>}
 */
async function loadXlsx() {
  return import('xlsx')
}

/**
 * @param {string} filename
 * @returns {string}
 */
function getExtension(filename) {
  const match = /\.([^.]+)$/.exec(String(filename || '').trim())
  return match ? match[1].toLowerCase() : ''
}

/**
 * @param {File} file
 */
function assertBrowserFile(file) {
  if (typeof File === 'undefined' || !(file instanceof File)) {
    throw new InventoryImportDecoderError(
      'INVALID_FILE',
      'Inventory import decoder expects a browser File.',
    )
  }
}

/**
 * @param {string} extension
 * @returns {'xlsx'|'xls'}
 */
function assertSpreadsheetExtension(extension) {
  if (extension !== 'xlsx' && extension !== 'xls') {
    throw new InventoryImportDecoderError(
      'UNSUPPORTED_EXTENSION',
      'Unsupported file type. Choose a .csv, .xlsx, or .xls file.',
    )
  }
  return extension
}

/**
 * Dependency-free CSV text → row arrays.
 * Supports commas, quotes, escaped quotes, CRLF/LF, empty cells, BOM,
 * multiline quoted fields. Rejects unclosed quotes.
 *
 * @param {string} text
 * @returns {unknown[][]}
 */
export function parseInventoryImportCsvText(text) {
  if (typeof text !== 'string') {
    throw new InventoryImportDecoderError(
      'INVALID_CSV_TEXT',
      'CSV decoder expects a text string.',
    )
  }

  let input = text
  if (input.charCodeAt(0) === 0xfeff) {
    input = input.slice(1)
  }

  if (input.length === 0) {
    throw new InventoryImportDecoderError(
      'EMPTY_FILE',
      'The selected CSV file is empty.',
    )
  }

  /** @type {string[][]} */
  const rows = []
  /** @type {string[]} */
  let row = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < input.length) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += char
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = true
      i += 1
      continue
    }

    if (char === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }

    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }

    if (char === '\r') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      if (input[i] === '\n') i += 1
      continue
    }

    field += char
    i += 1
  }

  if (inQuotes) {
    throw new InventoryImportDecoderError(
      'MALFORMED_CSV',
      'CSV has an unclosed quoted field.',
    )
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  if (rows.length === 0) {
    throw new InventoryImportDecoderError(
      'EMPTY_FILE',
      'The selected CSV file is empty.',
    )
  }

  return rows
}

/**
 * @param {unknown[][]} matrix
 * @param {'csv'|'xlsx'|'xls'} sourceFormat
 * @param {{ worksheetName?: string }} [meta]
 * @returns {{
 *   headers: unknown[],
 *   rows: unknown[][],
 *   headerRowNumber: number,
 *   sourceFormat: 'csv'|'xlsx'|'xls',
 *   worksheetName?: string,
 * }}
 */
function toParserCompatibleTable(matrix, sourceFormat, meta = {}) {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new InventoryImportDecoderError(
      'EMPTY_WORKSHEET',
      'The selected file has no rows to import.',
    )
  }

  const headerRow = matrix[0]
  if (!Array.isArray(headerRow) || headerRow.length === 0) {
    throw new InventoryImportDecoderError(
      'MISSING_HEADERS',
      'The selected file is missing a header row.',
    )
  }

  const headers = []
  for (let index = 0; index < headerRow.length; index += 1) {
    const cell = headerRow[index]
    headers.push(cell === undefined ? null : cell)
  }

  const rows = matrix.slice(1).map((row) => {
    if (!Array.isArray(row)) return []
    const next = []
    for (let index = 0; index < row.length; index += 1) {
      const cell = row[index]
      next.push(cell === undefined ? null : cell)
    }
    return next
  })

  const result = {
    headers,
    rows,
    headerRowNumber: 1,
    sourceFormat,
  }

  if (typeof meta.worksheetName === 'string' && meta.worksheetName) {
    result.worksheetName = meta.worksheetName
  }

  return result
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {Promise<import('xlsx').WorkBook>}
 */
async function readWorkbookFromArrayBuffer(buffer) {
  const XLSX = await loadXlsx()
  return XLSX.read(buffer, {
    type: 'array',
    raw: true,
    cellDates: false,
    dense: false,
  })
}

/**
 * @param {File} file
 * @param {{ readWorkbook?: (buffer: ArrayBuffer) => import('xlsx').WorkBook | Promise<import('xlsx').WorkBook> }} [options]
 */
async function readWorkbookFromFile(file, options = {}) {
  let buffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    throw new InventoryImportDecoderError(
      'FILE_READ_FAILED',
      'Unable to read the selected spreadsheet file.',
    )
  }

  const readWorkbook = typeof options.readWorkbook === 'function'
    ? options.readWorkbook
    : readWorkbookFromArrayBuffer

  try {
    return await readWorkbook(buffer)
  } catch (error) {
    if (error instanceof InventoryImportDecoderError) throw error
    throw new InventoryImportDecoderError(
      'INVALID_WORKBOOK',
      'Unable to read the selected spreadsheet file.',
    )
  }
}

/**
 * @param {import('xlsx').WorkSheet | undefined} sheet
 * @param {typeof import('xlsx')} XLSX
 * @returns {{ estimatedRowCount: number, estimatedColumnCount: number }}
 */
function estimateSheetDimensions(sheet, XLSX) {
  if (!sheet || typeof sheet !== 'object') {
    return { estimatedRowCount: 0, estimatedColumnCount: 0 }
  }

  const ref = sheet['!ref']
  if (typeof ref !== 'string' || !ref) {
    return { estimatedRowCount: 0, estimatedColumnCount: 0 }
  }

  try {
    const range = XLSX.utils.decode_range(ref)
    return {
      estimatedRowCount: Math.max(0, range.e.r - range.s.r + 1),
      estimatedColumnCount: Math.max(0, range.e.c - range.s.c + 1),
    }
  } catch {
    return { estimatedRowCount: 0, estimatedColumnCount: 0 }
  }
}

/**
 * @param {import('xlsx').WorkBook} workbook
 * @param {string} worksheetName
 * @param {'xlsx'|'xls'} sourceFormat
 */
async function decodeNamedWorksheet(workbook, worksheetName, sourceFormat) {
  const sheetNames = workbook?.SheetNames
  if (!Array.isArray(sheetNames) || sheetNames.length === 0) {
    throw new InventoryImportDecoderError(
      'NO_WORKSHEETS',
      'The selected workbook has no worksheets.',
    )
  }

  if (!sheetNames.includes(worksheetName)) {
    throw new InventoryImportDecoderError(
      'WORKSHEET_NOT_FOUND',
      `Worksheet "${worksheetName}" was not found in the workbook.`,
    )
  }

  const sheet = workbook.Sheets?.[worksheetName]
  if (!sheet) {
    throw new InventoryImportDecoderError(
      'WORKSHEET_NOT_FOUND',
      `Worksheet "${worksheetName}" was not found in the workbook.`,
    )
  }

  const XLSX = await loadXlsx()
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    blankrows: true,
  })

  return toParserCompatibleTable(matrix, sourceFormat, { worksheetName })
}

/**
 * Inspect an Excel workbook without decoding sheet cell matrices when
 * multiple worksheets are present.
 *
 * @param {File} file
 * @param {{ readWorkbook?: (buffer: ArrayBuffer) => import('xlsx').WorkBook | Promise<import('xlsx').WorkBook> }} [options]
 * @returns {Promise<{
 *   sourceFormat: 'xlsx'|'xls',
 *   worksheetCount: number,
 *   worksheets: Array<{
 *     name: string,
 *     estimatedRowCount: number,
 *     estimatedColumnCount: number,
 *   }>,
 * }>}
 */
export async function inspectInventoryImportWorkbook(file, options = {}) {
  assertBrowserFile(file)
  const extension = assertSpreadsheetExtension(getExtension(file.name))
  const workbook = await readWorkbookFromFile(file, options)
  const sheetNames = workbook?.SheetNames

  if (!Array.isArray(sheetNames) || sheetNames.length === 0) {
    throw new InventoryImportDecoderError(
      'NO_WORKSHEETS',
      'The selected workbook has no worksheets.',
    )
  }

  const XLSX = await loadXlsx()
  const worksheets = sheetNames.map((name) => {
    const dims = estimateSheetDimensions(workbook.Sheets?.[name], XLSX)
    return {
      name,
      estimatedRowCount: dims.estimatedRowCount,
      estimatedColumnCount: dims.estimatedColumnCount,
    }
  })

  return {
    sourceFormat: extension,
    worksheetCount: worksheets.length,
    worksheets,
  }
}

/**
 * Decode one named worksheet from an Excel workbook.
 *
 * @param {File} file
 * @param {string} worksheetName
 * @param {{ readWorkbook?: (buffer: ArrayBuffer) => import('xlsx').WorkBook | Promise<import('xlsx').WorkBook> }} [options]
 */
export async function decodeInventoryImportWorksheet(
  file,
  worksheetName,
  options = {},
) {
  assertBrowserFile(file)

  if (typeof worksheetName !== 'string' || !worksheetName.trim()) {
    throw new InventoryImportDecoderError(
      'INVALID_WORKSHEET_NAME',
      'A worksheet name is required.',
    )
  }

  const extension = assertSpreadsheetExtension(getExtension(file.name))
  const workbook = await readWorkbookFromFile(file, options)
  return decodeNamedWorksheet(workbook, worksheetName.trim(), extension)
}

/**
 * Decode a browser File into parser-compatible tabular data.
 *
 * CSV: always decodes immediately.
 * Excel with exactly one worksheet: decodes that sheet.
 * Excel with multiple worksheets: fails with MULTIPLE_WORKSHEETS — use
 * inspect + decodeInventoryImportWorksheet instead.
 *
 * @param {File} file
 * @param {{ readWorkbook?: (buffer: ArrayBuffer) => import('xlsx').WorkBook | Promise<import('xlsx').WorkBook> }} [options]
 */
export async function decodeInventoryImportFile(file, options = {}) {
  assertBrowserFile(file)

  const extension = getExtension(file.name)
  if (!ACCEPTED_EXTENSIONS.has(extension)) {
    throw new InventoryImportDecoderError(
      'UNSUPPORTED_EXTENSION',
      'Unsupported file type. Choose a .csv, .xlsx, or .xls file.',
    )
  }

  if (extension === 'csv') {
    let text
    try {
      text = await file.text()
    } catch {
      throw new InventoryImportDecoderError(
        'FILE_READ_FAILED',
        'Unable to read the selected CSV file.',
      )
    }
    const matrix = parseInventoryImportCsvText(text)
    return toParserCompatibleTable(matrix, 'csv')
  }

  const workbook = await readWorkbookFromFile(file, options)
  const sheetNames = workbook?.SheetNames

  if (!Array.isArray(sheetNames) || sheetNames.length === 0) {
    throw new InventoryImportDecoderError(
      'NO_WORKSHEETS',
      'The selected workbook has no worksheets.',
    )
  }

  if (sheetNames.length > 1) {
    throw new InventoryImportDecoderError(
      'MULTIPLE_WORKSHEETS',
      'This workbook contains multiple worksheets. Choose one worksheet to import.',
      { worksheetNames: sheetNames.slice() },
    )
  }

  return decodeNamedWorksheet(workbook, sheetNames[0], extension)
}
