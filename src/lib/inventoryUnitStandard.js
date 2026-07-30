/**
 * P8.31.1 — Consumable Inventory Unit Product Contract Lock
 *
 * Pure source of truth for inventory-unit semantics.
 * Classifies unit text only. No quantity conversion. No I/O. No mutations.
 *
 * Not wired into production UI/Import/Count/Orders in this sprint.
 * Legacy preset arrays in stockCatalog / inventoryNewProductDrafts / inventoryUtils
 * remain the live sources until later consolidation sprints.
 */

/** @typedef {'canonical_physical_unit'|'legacy_composite_physical_unit'|'packaging_only_unit'|'ambiguous_unit'|'unknown_unit'|'empty_unit'} InventoryUnitClassification */

/**
 * @typedef {{
 *   normalizedInput: string,
 *   classification: InventoryUnitClassification,
 *   canonicalUnit: string|null,
 *   packagingEvidence: string|null,
 *   requiresReview: boolean,
 *   reasonCode: string,
 * }} InventoryUnitClassificationResult
 */

/**
 * Canonical physical inventory units (V1).
 * Operators count, receive, transfer, adjust, and consume these objects as one unit.
 *
 * Optional inclusions (documented):
 * - Keg — venues count whole kegs as physical stock objects
 * - Roll — venues count consumable rolls (paper, foil) as physical stock objects
 *
 * Explicitly NOT canonical in V1:
 * - Portion — portion size varies; not a stable physical stock object
 * - Bag — may be physical (coffee bag) or packaging; ambiguous → review
 * - Pack — allowed later only when pack itself is the counted object; ambiguous now
 * - Container — vague supplier packaging / vessel label; ambiguous → review
 * - Box — typically supplier packaging containing units; ambiguous → review
 */
export const CANONICAL_PHYSICAL_INVENTORY_UNITS = Object.freeze([
  'Bottle',
  'Can',
  'Piece',
  'Kilogram',
  'Gram',
  'Liter',
  'Milliliter',
  'Keg',
  'Roll',
])

/**
 * Case-insensitive aliases → canonical label.
 * Size composites (Bottle 700ml) are NOT aliases; they are legacy composites.
 */
export const CANONICAL_PHYSICAL_UNIT_ALIASES = Object.freeze({
  bottle: 'Bottle',
  bottles: 'Bottle',
  can: 'Can',
  cans: 'Can',
  piece: 'Piece',
  pieces: 'Piece',
  pc: 'Piece',
  pcs: 'Piece',
  kilogram: 'Kilogram',
  kilograms: 'Kilogram',
  kilo: 'Kilogram',
  kilos: 'Kilogram',
  kg: 'Kilogram',
  gram: 'Gram',
  grams: 'Gram',
  g: 'Gram',
  liter: 'Liter',
  liters: 'Liter',
  litre: 'Liter',
  litres: 'Liter',
  l: 'Liter',
  milliliter: 'Milliliter',
  milliliters: 'Milliliter',
  millilitre: 'Milliliter',
  millilitres: 'Milliliter',
  ml: 'Milliliter',
  keg: 'Keg',
  kegs: 'Keg',
  roll: 'Roll',
  rolls: 'Roll',
})

/**
 * Terms that must never be inventory units.
 * Compound Case/Box forms are detected separately.
 */
export const PACKAGING_ONLY_INVENTORY_UNIT_TERMS = Object.freeze([
  'case',
  'carton',
  'tray',
  'pallet',
])

/**
 * Ambiguous terms — may be physical or packaging depending on venue practice.
 * Never silently accepted as canonical without operator review.
 */
export const AMBIGUOUS_INVENTORY_UNIT_TERMS = Object.freeze([
  'pack',
  'packs',
  'box',
  'boxes',
  'bag',
  'bags',
  'container',
  'containers',
  'portion',
  'portions',
])

/**
 * Future conceptual field — not a DB column in this sprint (deferred to P8.31.3).
 * Optional free-text packaging note. No calculation / multiplier semantics.
 */
export const PACKAGING_NOTE_CONTRACT = Object.freeze({
  fieldName: 'packaging_note',
  optional: true,
  freeText: true,
  maxLength: 240,
  affectsQuantity: false,
  affectsValuation: false,
  affectsStockOperations: false,
  examples: Object.freeze([
    'Usually supplied in cases of 6',
    'Supplier packaging varies',
    'May arrive loose or in cases of 12',
    'Case 24',
  ]),
})

/**
 * Later repair classification labels for existing non-canonical catalog rows.
 * Tooling is deferred; constants lock the vocabulary only.
 */
export const EXISTING_UNIT_DATA_REPAIR_CLASSES = Object.freeze({
  LABEL_ONLY_SAFE: 'label_only_safe',
  QUANTITY_CONVERSION_REQUIRED: 'quantity_conversion_required',
  AMBIGUOUS_MANUAL_REVIEW: 'ambiguous_manual_review',
  ALREADY_PHYSICAL_UNIT: 'already_physical_unit',
  HISTORICAL_ONLY: 'historical_only',
})

/**
 * Historical compatibility locks (documentation constants).
 * Movement unit-freeze decision deferred to P8.31.9.
 */
export const INVENTORY_UNIT_HISTORICAL_CONTRACT = Object.freeze({
  inventoryCountUnitFrozen: true,
  orderLineUnitCopied: true,
  importPayloadEvidenceImmutable: true,
  stockMovementsDisplayLiveCatalogUnit: true,
  movementUnitFreezeDeferredTo: 'P8.31.9',
  neverRewritePostedCountUnitText: true,
  neverAutoMultiplyQuantities: true,
})

/**
 * Known legacy preset module paths — remain live until consolidation sprints.
 * This module must not replace them in P8.31.1.
 */
export const LEGACY_UNIT_PRESET_SOURCES = Object.freeze([
  'src/lib/stockCatalog.js#STOCK_GENERAL_UNIT_PRESETS',
  'src/lib/stockCatalog.js#STOCK_UNIT_PRESETS_BY_CATEGORY',
  'src/lib/inventoryNewProductDrafts.js#INVENTORY_NEW_PRODUCT_UNITS',
  'src/lib/inventoryUtils.js#INVENTORY_UNIT_PRESETS',
])

export const INVENTORY_UNIT_REASON = Object.freeze({
  EMPTY: 'empty_unit',
  CANONICAL: 'canonical_physical_unit',
  CANONICAL_ALIAS: 'canonical_physical_alias',
  LEGACY_COMPOSITE: 'legacy_composite_physical_unit',
  PACKAGING_ONLY: 'packaging_only_unit',
  PACKAGING_COMPOUND: 'packaging_compound_unit',
  AMBIGUOUS: 'ambiguous_unit',
  UNKNOWN: 'unknown_unit',
})

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeInventoryUnitInput(value) {
  if (value == null) return ''
  return `${value}`.replace(/\s+/g, ' ').trim()
}

/**
 * @param {string} normalized
 * @returns {string}
 */
function compactKey(normalized) {
  return normalized.toLowerCase()
}

/**
 * Bottle 700ml / Can 330ml / Bottle 1L style size composites.
 * Locked safe rule: classify as legacy composite; requiresReview true
 * (normalization to bare Bottle/Can only after explicit product review).
 *
 * @param {string} normalized
 * @returns {{ canonicalUnit: string, packagingEvidence: string }|null}
 */
function matchLegacyCompositePhysicalUnit(normalized) {
  const text = compactKey(normalized)

  const bottleMatch = text.match(
    /^(?:bottle|bottles)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(ml|milliliter|milliliters|millilitre|millilitres|l|liter|liters|litre|litres)$/i,
  )
  if (bottleMatch) {
    return {
      canonicalUnit: 'Bottle',
      packagingEvidence: `legacy size composite; suggests Bottle (${bottleMatch[1]}${bottleMatch[2]})`,
    }
  }

  const canMatch = text.match(
    /^(?:can|cans)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(ml|milliliter|milliliters|millilitre|millilitres|l|liter|liters|litre|litres)$/i,
  )
  if (canMatch) {
    return {
      canonicalUnit: 'Can',
      packagingEvidence: `legacy size composite; suggests Can (${canMatch[1]}${canMatch[2]})`,
    }
  }

  // Common catalog forms: "Bottle 700ml", "Bottle 1L", "Can 330ml"
  const spacedBottle = text.match(
    /^(?:bottle|bottles)\s+(\d+(?:\.\d+)?)\s*(ml|l)$/,
  )
  if (spacedBottle) {
    return {
      canonicalUnit: 'Bottle',
      packagingEvidence: `legacy size composite; suggests Bottle (${spacedBottle[1]}${spacedBottle[2]})`,
    }
  }

  const spacedCan = text.match(/^(?:can|cans)\s+(\d+(?:\.\d+)?)\s*(ml|l)$/)
  if (spacedCan) {
    return {
      canonicalUnit: 'Can',
      packagingEvidence: `legacy size composite; suggests Can (${spacedCan[1]}${spacedCan[2]})`,
    }
  }

  return null
}

/**
 * Case / Carton / Tray / Pallet and compound packaging forms.
 * Never multiplies. May suggest a physical unit as evidence only.
 *
 * @param {string} normalized
 * @returns {{ packagingEvidence: string, suggestedPhysicalUnit: string|null }|null}
 */
function matchPackagingOnlyUnit(normalized) {
  const text = compactKey(normalized)

  if (PACKAGING_ONLY_INVENTORY_UNIT_TERMS.includes(text)) {
    return {
      packagingEvidence: `packaging-only term: ${normalized}`,
      suggestedPhysicalUnit: null,
    }
  }

  // Case 6 / Case 12 bottles / Case of 24 / Case 6 bottles / Box of 24
  const caseCompound = text.match(
    /^(?:case|cases|carton|cartons|tray|trays|pallet|pallets|box|boxes)\s*(?:of\s*)?(\d+)?\s*(?:x\s*)?(?:bottles|bottle|cans|can|pieces|piece)?$/,
  )
  if (
    caseCompound
    && /^(?:case|cases|carton|cartons|tray|trays|pallet|pallets)\b/.test(text)
  ) {
    const count = caseCompound[1] ?? null
    const suggestsBottle = /\bbottles?\b/.test(text)
    const suggestsCan = /\bcans?\b/.test(text)
    const suggested = suggestsBottle ? 'Bottle' : suggestsCan ? 'Can' : null
    return {
      packagingEvidence: count
        ? `packaging compound; pack-size evidence ${count}${suggested ? `; suggests ${suggested}` : ''} — never multiply`
        : `packaging compound — never multiply`,
      suggestedPhysicalUnit: suggested,
    }
  }

  // Explicit "Case 6 bottles" / "case of 12" already covered; also "box of 24"
  if (/^(?:box|boxes)\s+(?:of\s+)?\d+/.test(text)) {
    return {
      packagingEvidence: 'packaging compound (box of N) — never multiply; requires review',
      suggestedPhysicalUnit: null,
    }
  }

  if (/^(?:case|cases)\b/.test(text)) {
    const bottleHint = /\bbottles?\b/.test(text) ? 'Bottle' : null
    const sizeHint = text.match(/\b(\d+)\b/)
    return {
      packagingEvidence: sizeHint
        ? `packaging compound; pack-size evidence ${sizeHint[1]}${bottleHint ? `; suggests ${bottleHint}` : ''} — never multiply`
        : 'packaging compound (case*) — never multiply',
      suggestedPhysicalUnit: bottleHint,
    }
  }

  if (/^(?:carton|tray|pallet)s?\b/.test(text)) {
    return {
      packagingEvidence: `packaging-only compound: ${normalized}`,
      suggestedPhysicalUnit: null,
    }
  }

  return null
}

/**
 * Classify inventory unit text. Pure. Deterministic. Does not accept quantity.
 *
 * @param {unknown} value
 * @returns {InventoryUnitClassificationResult}
 */
export function classifyInventoryUnit(value) {
  const normalizedInput = normalizeInventoryUnitInput(value)

  if (!normalizedInput) {
    return {
      normalizedInput: '',
      classification: 'empty_unit',
      canonicalUnit: null,
      packagingEvidence: null,
      requiresReview: true,
      reasonCode: INVENTORY_UNIT_REASON.EMPTY,
    }
  }

  const key = compactKey(normalizedInput)

  const alias = CANONICAL_PHYSICAL_UNIT_ALIASES[key]
  if (alias) {
    const exactCanonical = CANONICAL_PHYSICAL_INVENTORY_UNITS.includes(normalizedInput)
    return {
      normalizedInput,
      classification: 'canonical_physical_unit',
      canonicalUnit: alias,
      packagingEvidence: null,
      requiresReview: false,
      reasonCode: exactCanonical
        ? INVENTORY_UNIT_REASON.CANONICAL
        : INVENTORY_UNIT_REASON.CANONICAL_ALIAS,
    }
  }

  const composite = matchLegacyCompositePhysicalUnit(normalizedInput)
  if (composite) {
    return {
      normalizedInput,
      classification: 'legacy_composite_physical_unit',
      canonicalUnit: composite.canonicalUnit,
      packagingEvidence: composite.packagingEvidence,
      requiresReview: true,
      reasonCode: INVENTORY_UNIT_REASON.LEGACY_COMPOSITE,
    }
  }

  const packaging = matchPackagingOnlyUnit(normalizedInput)
  if (packaging) {
    return {
      normalizedInput,
      classification: 'packaging_only_unit',
      // Evidence only — never treat packaging as accepted canonical inventory unit.
      canonicalUnit: null,
      packagingEvidence: packaging.suggestedPhysicalUnit
        ? `${packaging.packagingEvidence}`
        : packaging.packagingEvidence,
      requiresReview: true,
      reasonCode: /compound|pack-size|Case/i.test(packaging.packagingEvidence)
        || /\d/.test(normalizedInput)
        ? INVENTORY_UNIT_REASON.PACKAGING_COMPOUND
        : INVENTORY_UNIT_REASON.PACKAGING_ONLY,
    }
  }

  if (AMBIGUOUS_INVENTORY_UNIT_TERMS.includes(key)) {
    return {
      normalizedInput,
      classification: 'ambiguous_unit',
      canonicalUnit: null,
      packagingEvidence: `ambiguous term: ${normalizedInput}; requires operator confirmation`,
      requiresReview: true,
      reasonCode: INVENTORY_UNIT_REASON.AMBIGUOUS,
    }
  }

  return {
    normalizedInput,
    classification: 'unknown_unit',
    canonicalUnit: null,
    packagingEvidence: null,
    requiresReview: true,
    reasonCode: INVENTORY_UNIT_REASON.UNKNOWN,
  }
}

/**
 * True when classification is an accepted physical inventory unit for future writers.
 * Legacy composites are NOT accepted without review.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isCanonicalPhysicalInventoryUnit(value) {
  const result = classifyInventoryUnit(value)
  return result.classification === 'canonical_physical_unit' && result.requiresReview === false
}

/**
 * True when the unit must never drive inventory operations as a stock UoM.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPackagingOnlyInventoryUnit(value) {
  return classifyInventoryUnit(value).classification === 'packaging_only_unit'
}
