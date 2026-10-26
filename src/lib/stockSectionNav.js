import { STOCK_SECTIONS } from './appNavigation'

/** Phone stock row. The rest stay reachable from More. */
export const STOCK_PHONE_PRIMARY_SECTION_IDS = ['dashboard', 'count', 'storages', 'orders']

/** Spreadsheet import is a manager tool. Staff do not see it. */
export const STOCK_MANAGER_ONLY_SECTION_IDS = ['migration']

const STOCK_PHONE_OVERFLOW_ORDER = ['suppliers', 'migration']

export function isStockSectionVisible(sectionId, canManage) {
  if (!canManage && STOCK_MANAGER_ONLY_SECTION_IDS.includes(sectionId)) return false
  return STOCK_SECTIONS.some((section) => section.id === sectionId)
}

export function resolvePermittedStockSection(sectionId, canManage) {
  return isStockSectionVisible(sectionId, canManage) ? sectionId : 'dashboard'
}

/**
 * Stock search is one field shared by every stock tab.
 * A dashboard product search must not hide storages, so the text clears
 * when the tab actually changes and stays put when the same tab is selected again.
 */
export function nextStockSearchTerm(currentSection, nextSection, searchTerm = '') {
  if (`${currentSection ?? ''}` === `${nextSection ?? ''}`) return `${searchTerm ?? ''}`
  return ''
}

/**
 * Managers on iPad/desktop keep every stock section.
 * Staff never see Import.
 * Compact phone layouts keep four primary tabs on one row and park the rest in More.
 */
export function resolveStockSectionNav({ canManage = false, compactPhone = false } = {}) {
  const visible = STOCK_SECTIONS.filter((section) => isStockSectionVisible(section.id, canManage))

  if (!compactPhone) {
    return { primary: visible, overflow: [] }
  }

  const primary = STOCK_PHONE_PRIMARY_SECTION_IDS
    .map((id) => visible.find((section) => section.id === id))
    .filter(Boolean)

  const overflow = STOCK_PHONE_OVERFLOW_ORDER
    .filter((id) => visible.some((section) => section.id === id))
    .filter((id) => !STOCK_PHONE_PRIMARY_SECTION_IDS.includes(id))
    .map((id) => visible.find((section) => section.id === id))
    .filter(Boolean)

  return { primary, overflow }
}
