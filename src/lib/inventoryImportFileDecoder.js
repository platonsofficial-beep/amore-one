/**
 * P8.16.2 — Inventory Import browser-side file decoder.
 *
 * Decodes a local CSV / XLS / XLSX File into tabular arrays compatible with
 * the locked Inventory Import tabular parser input contract. Does not call
 * the parser, mutate the File, network, persist, or upload.
 *
 * SheetJS (`xlsx`) is loaded only for spreadsheet paths via dynamic import so
 * the main app bundle stays under the existing Workbox precache size limit.
 */

export class InventoryImportDecoderError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'InventoryImportDecoderError'
    this.code = code
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
 * @returns {{
 *   headers: unknown[],
 *   rows: unknown[][],
 *   headerRowNumber: number,
 *   sourceFormat: 'csv'|'xlsx'|'xls',
 * }}
 */
function toParserCompatibleTable(matrix, sourceFormat) {
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

  return {
    headers,
    rows,
    headerRowNumber: 1,
    sourceFormat,
  }
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
 * @param {import('xlsx').WorkBook} workbook
 * @param {'xlsx'|'xls'} sourceFormat
 */
async function decodeWorkbook(workbook, sourceFormat) {
  const sheetNames = workbook?.SheetNames
  if (!Array.isArray(sheetNames) || sheetNames.length === 0) {
    throw new InventoryImportDecoderError(
      'NO_WORKSHEETS',
      'The selected workbook has no worksheets.',
    )
  }

  const firstSheetName = sheetNames[0]
  const sheet = workbook.Sheets?.[firstSheetName]
  if (!sheet) {
    throw new InventoryImportDecoderError(
      'NO_WORKSHEETS',
      'The selected workbook has no worksheets.',
    )
  }

  const XLSX = await loadXlsx()
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    blankrows: true,
  })

  return toParserCompatibleTable(matrix, sourceFormat)
}

/**
 * Decode a browser File into parser-compatible tabular data.
 *
 * @param {File} file
 * @param {{ readWorkbook?: (buffer: ArrayBuffer) => import('xlsx').WorkBook | Promise<import('xlsx').WorkBook> }} [options]
 * @returns {Promise<{
 *   headers: unknown[],
 *   rows: unknown[][],
 *   headerRowNumber: number,
 *   sourceFormat: 'csv'|'xlsx'|'xls',
 * }>}
 */
export async function decodeInventoryImportFile(file, options = {}) {
  if (typeof File === 'undefined' || !(file instanceof File)) {
    throw new InventoryImportDecoderError(
      'INVALID_FILE',
      'Inventory import decoder expects a browser File.',
    )
  }

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

  let workbook
  try {
    workbook = await readWorkbook(buffer)
  } catch (error) {
    if (error instanceof InventoryImportDecoderError) throw error
    throw new InventoryImportDecoderError(
      'INVALID_WORKBOOK',
      'Unable to read the selected spreadsheet file.',
    )
  }

  return decodeWorkbook(workbook, extension)
}
