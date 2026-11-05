import { STOCK_SECTIONS } from './appNavigation'

/** Phone stock row. The rest stay reachable from More. */
export const STOCK_PHONE_PRIMARY_SECTION_IDS = ['dashboard', 'count', 'storages', 'orders']

/** Without Stock manage, staff only see Take and Counts (Platon, Nov 2026). */
export const STOCK_STAFF_SECTION_IDS = ['take', 'count']
export const STOCK_STAFF_PHONE_PRIMARY_SECTION_IDS = STOCK_STAFF_SECTION_IDS

/** Spreadsheet import is a manager tool. Staff do not see it. */
export const STOCK_MANAGER_ONLY_SECTION_IDS = ['migration']

/** Also listed in More so a clipped primary tab stays one tap away. */
const STOCK_PHONE_OVERFLOW_ORDER = ['take', 'orders', 'suppliers', 'migration']

export function isStockSectionVisible(sectionId, canManage) {
  if (!canManage && !STOCK_STAFF_SECTION_IDS.includes(sectionId)) return false
  return STOCK_SECTIONS.some((section) => section.id === sectionId)
}

export function resolvePermittedStockSection(sectionId, canManage) {
  return isStockSectionVisible(sectionId, canManage) ? sectionId : defaultStockSection(canManage)
}

/** Where Stock opens: managers on Dashboard, everyone else on Take. */
export function defaultStockSection(canManage) {
  return canManage ? 'dashboard' : 'take'
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

  const primaryIds = canManage ? STOCK_PHONE_PRIMARY_SECTION_IDS : STOCK_STAFF_PHONE_PRIMARY_SECTION_IDS
  const primary = primaryIds
    .map((id) => visible.find((section) => section.id === id))
    .filter(Boolean)

  const overflow = STOCK_PHONE_OVERFLOW_ORDER
    .filter((id) => canManage || id !== 'take')
    .filter((id) => visible.some((section) => section.id === id))
    .map((id) => visible.find((section) => section.id === id))
    .filter(Boolean)

  return { primary, overflow }
}

/**
 * Staff land on Take each time they enter Stock (and on a cold open in Stock).
 * Moving between Stock tabs afterwards is left alone.
 */
export function shouldStaffLandOnTake({ previousView = null, activeView = '', canManage = false, stockSection = '' } = {}) {
  if (canManage) return false
  if (activeView !== 'stock') return false
  if (previousView === 'stock') return false
  return stockSection !== 'take'
}
