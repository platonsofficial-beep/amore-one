/**
 * P8.16.7 — Operational Product Matching Engine Foundation.
 *
 * Pure, deterministic comparison of operational sheet products against a
 * supplied existing-stock list. No UI, network, Supabase, or services.
 *
 * Matching version: operational_product_matcher_v1
 */

export const INVENTORY_OPERATIONAL_PRODUCT_MATCHER_VERSION = 1

export const INVENTORY_OPERATIONAL_MATCH_STATUS = Object.freeze({
  EXACT_MATCH: 'exact_match',
  POSSIBLE_MATCH: 'possible_match',
  NEW_PRODUCT: 'new_product',
  INVALID_SOURCE: 'invalid_source',
})

/** Maximum candidates returned for possible_match rows. */
export const INVENTORY_OPERATIONAL_MATCH_CANDIDATE_LIMIT = 3

export class InventoryOperationalProductMatcherError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'InventoryOperationalProductMatcherError'
    this.code = code
  }
}

/**
 * Deep-freeze a freshly constructed value. Never call on caller-owned inputs.
 * @param {unknown} value
 * @returns {unknown}
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value
  if (Object.isFrozen(value)) return value

  if (Array.isArray(value)) {
    for (const entry of value) deepFreeze(entry)
  } else {
    for (const key of Object.keys(value)) {
      deepFreeze(/** @type {Record<string, unknown>} */ (value)[key])
    }
  }

  return Object.freeze(value)
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Conservative product-name normalization for comparison only.
 * Original display names are never rewritten by the matcher.
 *
 * Rules:
 * - coerce non-strings to empty (caller treats empty as invalid)
 * - trim + collapse internal whitespace
 * - Unicode lowercase (locale-independent via toLowerCase)
 * - normalize common apostrophe / dash code points
 * - strip harmless surrounding punctuation
 *
 * Does not remove brand words, sizes, ages, or flavours.
 *
 * @param {unknown} name
 * @returns {string}
 */
export function normalizeInventoryOperationalProductName(name) {
  if (typeof name !== 'string') return ''

  let value = name.normalize('NFC')

  // Apostrophe / quote variants → ASCII apostrophe
  value = value.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035`´]/g, "'")
  // Dash / minus variants → ASCII hyphen
  value = value.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212－]/g, '-')

  value = value.trim().replace(/\s+/g, ' ')

  // Harmless surrounding punctuation (quotes, brackets, trailing periods)
  value = value.replace(/^[\s"'“”‘’([{<]+/, '').replace(/[\s"'“”‘’)\]}>.,;:!?]+$/, '')
  value = value.trim().replace(/\s+/g, ' ')

  return value.toLowerCase()
}

/**
 * Tokenize a normalized name for conservative candidate discovery.
 * Splits on whitespace and hyphen separators; keeps alphanumeric tokens
 * (including decimal fragments such as "0.0" and age markers like "12").
 *
 * @param {string} normalizedName
 * @returns {string[]}
 */
export function tokenizeInventoryOperationalProductName(normalizedName) {
  if (!normalizedName) return []

  return normalizedName
    .replace(/[-_/]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}.]+|[^\p{L}\p{N}.]+$/gu, ''))
    .filter((token) => token.length > 0)
}

/**
 * @param {string[]} tokens
 * @returns {Set<string>}
 */
function tokenSet(tokens) {
  return new Set(tokens)
}

/**
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {boolean}
 */
function isSubset(a, b) {
  for (const token of a) {
    if (!b.has(token)) return false
  }
  return true
}

/**
 * Deterministic candidate score (internal only — never exposed as certainty).
 *
 * Containment rule: possible match only when one token set is a non-empty
 * subset of the other. That keeps "Johnnie Walker Black" vs "… Red" apart
 * while allowing "Belvedere" ⊆ "Belvedere Vodka".
 *
 * @param {string[]} sourceTokens
 * @param {string[]} candidateTokens
 * @returns {number} 0 when not credible
 */
function scoreTokenContainment(sourceTokens, candidateTokens) {
  if (sourceTokens.length === 0 || candidateTokens.length === 0) return 0

  const source = tokenSet(sourceTokens)
  const candidate = tokenSet(candidateTokens)

  const sourceInCandidate = isSubset(source, candidate)
  const candidateInSource = isSubset(candidate, source)
  if (!sourceInCandidate && !candidateInSource) return 0

  const intersectionSize = [...source].filter((token) => candidate.has(token)).length
  const unionSize = new Set([...source, ...candidate]).size
  const jaccard = unionSize === 0 ? 0 : intersectionSize / unionSize

  // Prefer full set equality, then tighter containment / higher overlap.
  let score = 50 + Math.round(jaccard * 40)
  if (sourceInCandidate && candidateInSource) score += 20
  if (sourceTokens.length === candidateTokens.length) score += 5

  return score
}

/**
 * Locale-stable string compare (en code-unit order via localeCompare options).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareStable(a, b) {
  return a.localeCompare(b, 'en', { sensitivity: 'variant', numeric: true })
}

/**
 * @param {unknown} item
 * @returns {{
 *   id: unknown,
 *   name: string,
 *   category: string|null,
 *   unit: unknown,
 *   sku: unknown,
 *   active: unknown,
 *   normalizedName: string,
 *   tokens: string[],
 * }|null}
 */
function toIndexedStockItem(item) {
  if (!isPlainObject(item)) return null
  if (typeof item.name !== 'string') return null

  const normalizedName = normalizeInventoryOperationalProductName(item.name)
  if (!normalizedName) return null

  return {
    id: item.id,
    name: item.name,
    category: typeof item.category === 'string' ? item.category : item.category == null ? null : String(item.category),
    unit: item.unit ?? null,
    sku: item.sku ?? null,
    active: item.active,
    normalizedName,
    tokens: tokenizeInventoryOperationalProductName(normalizedName),
  }
}

/**
 * Snapshot stock item fields into a new plain object (never freezes input).
 * @param {{
 *   id: unknown,
 *   name: string,
 *   category: string|null,
 *   unit: unknown,
 *   sku: unknown,
 *   active: unknown,
 * }} item
 */
function snapshotStockItem(item) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    unit: item.unit,
    sku: item.sku,
    active: item.active,
  }
}

/**
 * @param {string|null|undefined} sourceCategory
 * @param {string|null|undefined} stockCategory
 * @returns {string[]}
 */
function categoryEvidence(sourceCategory, stockCategory) {
  const evidence = []
  const hasSource = typeof sourceCategory === 'string' && sourceCategory.trim() !== ''
  const hasStock = typeof stockCategory === 'string' && stockCategory.trim() !== ''

  if (!hasStock) {
    evidence.push('category_missing')
    return evidence
  }

  if (
    hasSource
    && normalizeInventoryOperationalProductName(sourceCategory)
      === normalizeInventoryOperationalProductName(stockCategory)
  ) {
    evidence.push('category_consistent')
  }

  return evidence
}

/**
 * @param {ReturnType<typeof toIndexedStockItem>[]} indexed
 * @param {string} normalizedSourceName
 * @param {string[]} sourceTokens
 * @param {string|null} sourceCategory
 */
function findPossibleCandidates(indexed, normalizedSourceName, sourceTokens, sourceCategory) {
  /** @type {Array<{ item: NonNullable<ReturnType<typeof toIndexedStockItem>>, score: number }>} */
  const scored = []

  for (const item of indexed) {
    if (item.normalizedName === normalizedSourceName) continue

    const score = scoreTokenContainment(sourceTokens, item.tokens)
    if (score <= 0) continue

    scored.push({ item, score })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const byName = compareStable(a.item.normalizedName, b.item.normalizedName)
    if (byName !== 0) return byName
    return compareStable(String(a.item.id ?? ''), String(b.item.id ?? ''))
  })

  return scored.slice(0, INVENTORY_OPERATIONAL_MATCH_CANDIDATE_LIMIT).map(({ item }) => {
    const evidence = ['shared_name_tokens', ...categoryEvidence(sourceCategory, item.category)]
    return {
      stockItem: snapshotStockItem(item),
      evidence: Object.freeze(evidence.slice()),
    }
  })
}

/**
 * Match parsed operational products against a supplied stock-item list.
 *
 * @param {{
 *   operationalModel?: unknown,
 *   existingStockItems?: unknown,
 * }} [input]
 * @returns {{
 *   matcherVersion: number,
 *   matches: object[],
 *   summary: {
 *     total: number,
 *     exactMatch: number,
 *     possibleMatch: number,
 *     newProduct: number,
 *     invalidSource: number,
 *   },
 * }}
 */
export function matchInventoryOperationalProducts({
  operationalModel,
  existingStockItems,
} = {}) {
  if (!isPlainObject(operationalModel)) {
    throw new InventoryOperationalProductMatcherError(
      'INVALID_OPERATIONAL_MODEL',
      'Operational product matcher expects an operationalModel object.',
    )
  }

  if (!Array.isArray(operationalModel.categories)) {
    throw new InventoryOperationalProductMatcherError(
      'INVALID_OPERATIONAL_MODEL',
      'Operational product matcher expects operationalModel.categories to be an array.',
    )
  }

  if (!Array.isArray(existingStockItems)) {
    throw new InventoryOperationalProductMatcherError(
      'INVALID_EXISTING_STOCK_ITEMS',
      'Operational product matcher expects existingStockItems to be an array.',
    )
  }

  /** @type {NonNullable<ReturnType<typeof toIndexedStockItem>>[]} */
  const indexed = []
  /** @type {Map<string, NonNullable<ReturnType<typeof toIndexedStockItem>>[]>} */
  const byNormalizedName = new Map()

  for (const raw of existingStockItems) {
    const item = toIndexedStockItem(raw)
    if (!item) continue
    indexed.push(item)
    const bucket = byNormalizedName.get(item.normalizedName)
    if (bucket) bucket.push(item)
    else byNormalizedName.set(item.normalizedName, [item])
  }

  // Deterministic order within each normalized-name bucket.
  for (const bucket of byNormalizedName.values()) {
    bucket.sort((a, b) => {
      const byName = compareStable(a.name, b.name)
      if (byName !== 0) return byName
      return compareStable(String(a.id ?? ''), String(b.id ?? ''))
    })
  }

  /** @type {object[]} */
  const matches = []

  for (const category of operationalModel.categories) {
    if (!isPlainObject(category) || !Array.isArray(category.products)) {
      throw new InventoryOperationalProductMatcherError(
        'INVALID_OPERATIONAL_MODEL',
        'Operational product matcher expects each category to include a products array.',
      )
    }

    const categoryName = category.name == null
      ? null
      : typeof category.name === 'string'
        ? category.name
        : String(category.name)

    for (const product of category.products) {
      if (!isPlainObject(product)) {
        throw new InventoryOperationalProductMatcherError(
          'INVALID_OPERATIONAL_MODEL',
          'Operational product matcher expects each product to be an object.',
        )
      }

      const productName = product.name
      const normalizedSourceName = normalizeInventoryOperationalProductName(productName)
      const sourceSnapshot = {
        category: categoryName,
        product: {
          name: product.name,
          storage: product.storage,
          bar: product.bar,
          weekdays: product.weekdays == null
            ? null
            : isPlainObject(product.weekdays)
              ? { ...product.weekdays }
              : product.weekdays,
          order: product.order,
          stockControl: product.stockControl,
        },
      }

      if (
        productName === null
        || productName === undefined
        || typeof productName !== 'string'
        || normalizedSourceName === ''
      ) {
        matches.push({
          source: sourceSnapshot,
          status: INVENTORY_OPERATIONAL_MATCH_STATUS.INVALID_SOURCE,
          matchedStockItem: null,
          candidates: [],
          evidence: ['invalid_source_name'],
          normalizedSourceName: normalizedSourceName || '',
        })
        continue
      }

      const exactBucket = byNormalizedName.get(normalizedSourceName) ?? []

      if (exactBucket.length === 1) {
        const matched = exactBucket[0]
        matches.push({
          source: sourceSnapshot,
          status: INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH,
          matchedStockItem: snapshotStockItem(matched),
          candidates: [],
          evidence: [
            'normalized_name_equal',
            ...categoryEvidence(categoryName, matched.category),
          ],
          normalizedSourceName,
        })
        continue
      }

      if (exactBucket.length > 1) {
        const candidates = exactBucket.map((item) => ({
          stockItem: snapshotStockItem(item),
          evidence: Object.freeze([
            'normalized_name_equal',
            'duplicate_normalized_name',
            ...categoryEvidence(categoryName, item.category),
          ]),
        }))

        matches.push({
          source: sourceSnapshot,
          status: INVENTORY_OPERATIONAL_MATCH_STATUS.POSSIBLE_MATCH,
          matchedStockItem: null,
          candidates,
          evidence: ['normalized_name_equal', 'duplicate_normalized_name'],
          normalizedSourceName,
        })
        continue
      }

      const sourceTokens = tokenizeInventoryOperationalProductName(normalizedSourceName)
      const possibleCandidates = findPossibleCandidates(
        indexed,
        normalizedSourceName,
        sourceTokens,
        categoryName,
      )

      if (possibleCandidates.length > 0) {
        matches.push({
          source: sourceSnapshot,
          status: INVENTORY_OPERATIONAL_MATCH_STATUS.POSSIBLE_MATCH,
          matchedStockItem: null,
          candidates: possibleCandidates,
          evidence: ['shared_name_tokens'],
          normalizedSourceName,
        })
        continue
      }

      matches.push({
        source: sourceSnapshot,
        status: INVENTORY_OPERATIONAL_MATCH_STATUS.NEW_PRODUCT,
        matchedStockItem: null,
        candidates: [],
        evidence: ['no_credible_candidate'],
        normalizedSourceName,
      })
    }
  }

  const summary = {
    total: matches.length,
    exactMatch: 0,
    possibleMatch: 0,
    newProduct: 0,
    invalidSource: 0,
  }

  for (const match of matches) {
    if (match.status === INVENTORY_OPERATIONAL_MATCH_STATUS.EXACT_MATCH) summary.exactMatch += 1
    else if (match.status === INVENTORY_OPERATIONAL_MATCH_STATUS.POSSIBLE_MATCH) summary.possibleMatch += 1
    else if (match.status === INVENTORY_OPERATIONAL_MATCH_STATUS.NEW_PRODUCT) summary.newProduct += 1
    else if (match.status === INVENTORY_OPERATIONAL_MATCH_STATUS.INVALID_SOURCE) summary.invalidSource += 1
  }

  return /** @type {ReturnType<typeof matchInventoryOperationalProducts>} */ (
    deepFreeze({
      matcherVersion: INVENTORY_OPERATIONAL_PRODUCT_MATCHER_VERSION,
      matches,
      summary,
    })
  )
}
