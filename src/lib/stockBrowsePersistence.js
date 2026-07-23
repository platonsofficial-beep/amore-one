import {
  STOCK_GROUP_BY_OPTIONS,
  STOCK_LAYOUT_MODES,
  STOCK_SORT_OPTIONS,
  STOCK_VISIBILITY_OPTIONS,
} from './stockDashboardBrowse'

const STOCK_BROWSE_STORAGE_KEY = 'one.stock.browse.v1'

const VALID_LAYOUT_MODES = new Set(STOCK_LAYOUT_MODES.map((option) => option.id))
const VALID_GROUP_BY = new Set(STOCK_GROUP_BY_OPTIONS.map((option) => option.id))
const VALID_SORT_KEYS = new Set(STOCK_SORT_OPTIONS.map((option) => option.id))
const VALID_VISIBILITY = new Set(STOCK_VISIBILITY_OPTIONS.map((option) => option.id))

const DEFAULT_PREFERENCES = {
  layoutMode: 'cards',
  groupBy: 'none',
  sortKey: 'name-asc',
  visibilityFilter: 'active',
}

function normalizeLayoutMode(value) {
  const normalized = `${value ?? ''}`.trim()
  return VALID_LAYOUT_MODES.has(normalized) ? normalized : DEFAULT_PREFERENCES.layoutMode
}

function normalizeGroupBy(value) {
  const normalized = `${value ?? ''}`.trim()
  return VALID_GROUP_BY.has(normalized) ? normalized : DEFAULT_PREFERENCES.groupBy
}

function normalizeSortKey(value) {
  const normalized = `${value ?? ''}`.trim()
  return VALID_SORT_KEYS.has(normalized) ? normalized : DEFAULT_PREFERENCES.sortKey
}

function normalizeVisibilityFilter(value) {
  const normalized = `${value ?? ''}`.trim()
  return VALID_VISIBILITY.has(normalized) ? normalized : DEFAULT_PREFERENCES.visibilityFilter
}

export function readStockBrowsePreferences() {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PREFERENCES }
  }

  try {
    const stored = window.localStorage.getItem(STOCK_BROWSE_STORAGE_KEY)
    if (!stored) return { ...DEFAULT_PREFERENCES }

    const parsed = JSON.parse(stored)
    return {
      layoutMode: normalizeLayoutMode(parsed.layoutMode),
      groupBy: normalizeGroupBy(parsed.groupBy),
      sortKey: normalizeSortKey(parsed.sortKey),
      visibilityFilter: normalizeVisibilityFilter(parsed.visibilityFilter),
    }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function persistStockBrowsePreferences(preferences = {}) {
  if (typeof window === 'undefined') return

  const current = readStockBrowsePreferences()
  const next = {
    layoutMode: normalizeLayoutMode(preferences.layoutMode ?? current.layoutMode),
    groupBy: normalizeGroupBy(preferences.groupBy ?? current.groupBy),
    sortKey: normalizeSortKey(preferences.sortKey ?? current.sortKey),
    visibilityFilter: normalizeVisibilityFilter(
      preferences.visibilityFilter ?? current.visibilityFilter,
    ),
  }

  window.localStorage.setItem(STOCK_BROWSE_STORAGE_KEY, JSON.stringify(next))
}
