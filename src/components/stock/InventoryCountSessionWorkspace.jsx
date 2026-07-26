import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  completeInventoryCountLocation,
  getInventoryCountSession,
  getInventoryCountSessionItems,
  getInventoryCountSessionLocations,
  postInventoryCountFinish,
  previewInventoryCountFinish,
  setInventoryCountSessionPauseState,
  updateInventoryCountItem,
} from '../../services/inventoryCountService'

const LOCATION_STATE_LABEL = {
  completed: 'Completed',
  current: 'Current',
  not_started: 'Not started',
}

const LINE_STATUS_LABEL = {
  pending: 'Pending',
  counted: 'Counted',
  skipped: 'Skipped',
}

const AUTOSAVE_DEBOUNCE_MS = 400

/** Shared column contract for the active counting spreadsheet (header + rows). */
export const INVENTORY_COUNT_SPREADSHEET_COLUMNS = {
  '--ic-col-item': 'minmax(0, 3.2fr)',
  '--ic-col-unit': 'minmax(7rem, 1fr)',
  '--ic-col-expected': 'minmax(64px, 0.75fr)',
  '--ic-col-counted': 'minmax(88px, 1.1fr)',
  '--ic-col-status': 'minmax(52px, 0.48fr)',
  '--ic-cols':
    'var(--ic-col-item) var(--ic-col-unit) var(--ic-col-expected) var(--ic-col-counted) var(--ic-col-status)',
}

function formatItemMetaLine(category, itemType) {
  const parts = []
  const normalizedCategory = `${category ?? ''}`.trim()
  const normalizedType = `${itemType ?? ''}`.trim()
  if (normalizedCategory) parts.push(normalizedCategory)
  if (normalizedType && normalizedType.toLowerCase() !== normalizedCategory.toLowerCase()) {
    parts.push(normalizedType)
  }
  return parts.join(' • ')
}

function formatQuantity(value) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '—'
  }
  if (Number.isInteger(numeric)) {
    return `${numeric}`
  }
  return `${numeric}`
}

function formatVariance(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '—'
  }
  if (numeric > 0) {
    return `+${formatQuantity(numeric)}`
  }
  return formatQuantity(numeric)
}

function varianceTone(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric === 0) {
    return 'neutral'
  }
  return numeric > 0 ? 'positive' : 'negative'
}

function formatLineStatus(lineStatus) {
  const normalized = `${lineStatus ?? 'pending'}`.trim().toLowerCase() || 'pending'
  return LINE_STATUS_LABEL[normalized] ?? 'Pending'
}

function mapItemForDisplay(item) {
  const lineStatus = `${item.lineStatus ?? 'pending'}`.trim().toLowerCase() || 'pending'
  const category = `${item.category ?? ''}`.trim() || 'Other'
  const itemType = `${item.itemType ?? ''}`.trim() || 'Other'
  return {
    id: item.id,
    name: item.itemName || 'Untitled item',
    meta: formatItemMetaLine(category, itemType),
    unit: item.unit || '—',
    expected: formatQuantity(item.expectedSnapshot),
    counted: item.countedQuantity === null || item.countedQuantity === undefined
      ? ''
      : formatQuantity(item.countedQuantity),
    status: formatLineStatus(lineStatus),
    storageLocation: item.storageLocation || 'Other',
    lineStatus,
  }
}

function recountLocationItems(items) {
  const countedItems = items.filter((item) => (
    item.lineStatus === 'counted' || item.lineStatus === 'skipped'
  )).length
  return {
    countedItems,
    totalItems: items.length,
  }
}

function buildLocationsFromSession(sessionLocations, sessionItems) {
  const itemsByLocation = new Map()

  sessionItems.forEach((item) => {
    const key = item.storageLocation || 'Other'
    if (!itemsByLocation.has(key)) {
      itemsByLocation.set(key, [])
    }
    itemsByLocation.get(key).push(mapItemForDisplay(item))
  })

  const orderedKeys = sessionLocations.length > 0
    ? sessionLocations.map((location) => location.locationKey)
    : Array.from(itemsByLocation.keys()).sort((a, b) => a.localeCompare(b))

  const seen = new Set()
  const locations = []

  orderedKeys.forEach((locationKey, index) => {
    if (!locationKey || seen.has(locationKey)) return
    seen.add(locationKey)

    const sessionLocation = sessionLocations.find((location) => location.locationKey === locationKey)
    const items = itemsByLocation.get(locationKey) ?? []
    const { countedItems, totalItems } = recountLocationItems(items)

    let status = sessionLocation?.status ?? 'not_started'
    if (!sessionLocation) {
      if (totalItems > 0 && countedItems >= totalItems) {
        status = 'completed'
      } else if (index === 0) {
        status = 'current'
      } else {
        status = 'not_started'
      }
    }

    locations.push({
      id: sessionLocation?.id || locationKey,
      name: locationKey,
      locationKey,
      status,
      countedItems,
      totalItems,
      items,
    })
  })

  itemsByLocation.forEach((items, locationKey) => {
    if (seen.has(locationKey)) return
    const { countedItems, totalItems } = recountLocationItems(items)
    locations.push({
      id: locationKey,
      name: locationKey,
      locationKey,
      status: 'not_started',
      countedItems,
      totalItems,
      items,
    })
  })

  return locations
}

function getSessionProgress(locations) {
  const totalCounted = locations.reduce((sum, location) => sum + location.countedItems, 0)
  const totalIncluded = locations.reduce((sum, location) => sum + location.totalItems, 0)
  const completedLocations = locations.filter((location) => location.status === 'completed').length
  const percentage = totalIncluded === 0
    ? 0
    : Math.round((totalCounted / totalIncluded) * 100)

  return {
    totalCounted,
    totalIncluded,
    completedLocations,
    totalLocations: locations.length,
    remainingItems: Math.max(0, totalIncluded - totalCounted),
    percentage,
    skipped: locations.reduce((sum, location) => (
      sum + location.items.filter((item) => item.lineStatus === 'skipped').length
    ), 0),
  }
}

/**
 * Visible reason when Finish Count is disabled (UX only).
 */
export function getFinishCountDisabledReason(sessionStatus, locations = []) {
  const status = `${sessionStatus ?? ''}`.trim()
  if (status === 'counting_complete') return ''
  if (status === 'paused') {
    return 'Resume this count before finishing.'
  }

  const progress = getSessionProgress(locations)
  if (progress.remainingItems > 0) {
    return progress.remainingItems === 1
      ? '1 item is still pending.'
      : `${progress.remainingItems} items are still pending.`
  }

  if (progress.totalLocations > 0 && progress.completedLocations < progress.totalLocations) {
    const currentName = `${locations.find((location) => location.status === 'current')?.name ?? ''}`.trim()
    if (currentName) {
      return `Complete all locations before finishing this count. Current location: ${currentName}.`
    }
    return 'Complete all locations before finishing this count.'
  }

  return 'Complete all locations before finishing this count.'
}

/**
 * P8.19.5 — Show Finish Count banner only for actionable/blocking copy.
 * Routine pending-item text duplicates the progress KPI and stays on the button title.
 */
export function shouldShowFinishCountDisabledBanner(reason) {
  const text = `${reason ?? ''}`.trim()
  if (!text) return false
  if (/^\d+ items? (?:is|are) still pending\.$/.test(text)) return false
  return true
}

/**
 * Location readiness copy (UX only). Does not change stored progress.
 */
export function getLocationReadinessLabel(location) {
  if (!location) return ''
  const status = `${location.status ?? ''}`.trim()
  if (status === 'completed') return 'Location completed'

  const totalItems = Number(location.totalItems) || 0
  const countedItems = Number(location.countedItems) || 0
  const allItemsCounted = totalItems > 0 && countedItems >= totalItems

  if (allItemsCounted && status === 'current') {
    return 'All items counted · Ready to complete location'
  }
  if (allItemsCounted && status !== 'current') {
    return 'All items counted · Waiting to become current'
  }

  return LOCATION_STATE_LABEL[status] || 'Not started'
}

/**
 * Visible reason when Complete Location is disabled (UX only).
 */
export function getCompleteLocationDisabledReason({
  sessionStatus,
  selectedLocation,
  currentLocationName = '',
  isCompletingLocation = false,
} = {}) {
  if (isCompletingLocation) return 'Completing location…'

  const status = `${sessionStatus ?? ''}`.trim()
  if (status === 'paused') {
    return 'Resume this count before completing locations.'
  }
  if (status === 'counting_complete') {
    return 'This location is already complete.'
  }
  if (!selectedLocation) return ''

  const locationStatus = `${selectedLocation.status ?? ''}`.trim()
  if (locationStatus === 'completed') {
    return 'This location is already complete.'
  }
  if (locationStatus !== 'current') {
    const name = `${currentLocationName || 'the current location'}`.trim() || 'the current location'
    return `Complete “${name}” first.`
  }

  const remaining = Math.max(
    0,
    (Number(selectedLocation.totalItems) || 0) - (Number(selectedLocation.countedItems) || 0),
  )
  if (remaining > 0) {
    return remaining === 1
      ? '1 item is still pending.'
      : `${remaining} items are still pending.`
  }

  return ''
}

function pickInitialLocationId(locations) {
  const current = locations.find((location) => location.status === 'current')
  if (current) return current.id
  const incomplete = locations.find((location) => location.status !== 'completed')
  return incomplete?.id ?? locations[0]?.id ?? ''
}

function findItemSnapshot(locations, itemId) {
  for (const location of locations) {
    const item = location.items.find((entry) => entry.id === itemId)
    if (item) {
      return {
        counted: item.counted,
        lineStatus: item.lineStatus,
        status: item.status,
      }
    }
  }
  return null
}

function parseCountedDraft(rawValue) {
  const trimmed = `${rawValue ?? ''}`.trim()
  if (trimmed === '') {
    return { ready: true, countedQuantity: null }
  }

  if (!/^\d*(\.\d*)?$/.test(trimmed)) {
    return { ready: false, invalid: true }
  }

  if (trimmed === '.' || trimmed.endsWith('.')) {
    return { ready: false, invalid: false }
  }

  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return { ready: false, invalid: true }
  }

  return { ready: true, countedQuantity: numeric }
}

/** Displayed item order after location search (exact list order, name substring match). */
export function getDisplayedLocationItems(items, searchTerm = '') {
  const list = Array.isArray(items) ? items : []
  const query = `${searchTerm ?? ''}`.trim().toLowerCase()
  if (!query) return list
  return list.filter((item) => `${item.name ?? ''}`.toLowerCase().includes(query))
}

/**
 * Next eligible item for Enter navigation:
 * first pending item after the current row in the currently displayed list.
 */
export function findNextEligibleCountItem(displayedItems, currentItemId) {
  const list = Array.isArray(displayedItems) ? displayedItems : []
  const currentIndex = list.findIndex((item) => item.id === currentItemId)
  if (currentIndex < 0) return null
  for (let index = currentIndex + 1; index < list.length; index += 1) {
    if (list[index].lineStatus === 'pending') {
      return list[index]
    }
  }
  return null
}

/**
 * Available height for the nested Inventory Count session while the soft keyboard is open.
 * Uses visual-viewport bottom minus the session's top — never raw visualViewport.height alone.
 */
export function getInventoryCountKeyboardAvailableHeight({
  sessionTop,
  visualViewportOffsetTop = 0,
  visualViewportHeight,
  padding = 8,
  minimum = 200,
}) {
  const top = Number(sessionTop)
  const offsetTop = Number(visualViewportOffsetTop) || 0
  const height = Number(visualViewportHeight)
  if (!Number.isFinite(top) || !Number.isFinite(height) || height <= 0) {
    return minimum
  }
  const viewportBottom = offsetTop + height
  return Math.max(minimum, Math.floor(viewportBottom - top - padding))
}

/** Keep Counted inputs clear of the frozen-header edge inside the row scroller. */
export const INVENTORY_COUNT_USABLE_TOP_INSET_PX = 8
/** Keep Counted inputs clear of the raw scroller bottom (footer already excluded by flex). */
export const INVENTORY_COUNT_USABLE_BOTTOM_INSET_PX = 16
/**
 * End clearance inside the row scroller (~one row + bottom inset).
 * Applied via --inventory-count-sheet-end-clearance in App.css.
 */
export const INVENTORY_COUNT_SHEET_END_CLEARANCE_PX = 56
/** Initial Enter reveal + nested settled-layout verification frames. */
export const INVENTORY_COUNT_ENTER_REVEAL_MAX_LAYOUT_FRAMES = 2

/** Usable band inside the dedicated row scroller (does not subtract footer). */
export function getInventoryCountUsableViewportRect(container, options = {}) {
  const rect = container.getBoundingClientRect()
  const topInset = Number.isFinite(Number(options.topInset))
    ? Math.max(0, Number(options.topInset))
    : INVENTORY_COUNT_USABLE_TOP_INSET_PX
  const bottomInset = Number.isFinite(Number(options.bottomInset))
    ? Math.max(0, Number(options.bottomInset))
    : INVENTORY_COUNT_USABLE_BOTTOM_INSET_PX
  return {
    top: rect.top + topInset,
    bottom: rect.bottom - bottomInset,
    left: rect.left,
    right: rect.right,
  }
}

/** True when the Counted input is outside the usable row-scroller band. */
export function isInventoryCountCountedInputOutsideUsableViewport(input, container, options = {}) {
  if (!input || !container) return false
  const slack = Number.isFinite(Number(options.slack)) ? Math.max(0, Number(options.slack)) : 1
  const usable = getInventoryCountUsableViewportRect(container, options)
  const inputRect = input.getBoundingClientRect()
  return inputRect.top < (usable.top - slack) || inputRect.bottom > (usable.bottom + slack)
}

function clampInventoryCountScrollTop(container, nextScrollTop) {
  const scrollHeight = Number(container.scrollHeight)
  const clientHeight = Number(container.clientHeight)
  let next = Number(nextScrollTop)
  if (!Number.isFinite(next)) return container.scrollTop
  if (Number.isFinite(scrollHeight) && Number.isFinite(clientHeight)) {
    const maxScroll = Math.max(0, scrollHeight - clientHeight)
    next = Math.min(maxScroll, Math.max(0, next))
  } else {
    next = Math.max(0, next)
  }
  return next
}

/**
 * Scroll only enough to place a Counted input inside the usable row-scroller band.
 * No-ops when already usable. Clamps to [0, scrollHeight - clientHeight].
 */
export function scrollInventoryCountCountedInputIntoView(input, container, options = {}) {
  if (!input || !container) return false
  if (!options.force && !isInventoryCountCountedInputOutsideUsableViewport(input, container, options)) {
    return false
  }

  const usable = getInventoryCountUsableViewportRect(container, options)
  const inputRect = input.getBoundingClientRect()
  let nextScrollTop = container.scrollTop

  if (inputRect.top < usable.top) {
    nextScrollTop -= (usable.top - inputRect.top)
  } else if (inputRect.bottom > usable.bottom) {
    nextScrollTop += (inputRect.bottom - usable.bottom)
  }

  nextScrollTop = clampInventoryCountScrollTop(container, nextScrollTop)
  if (nextScrollTop === container.scrollTop) return false
  container.scrollTop = nextScrollTop
  return true
}

/** True when the row is outside the visible band of the dedicated row scroll owner. */
export function isInventoryCountRowOutsideViewport(row, container, options = {}) {
  if (!row || !container) return false

  const explicitOffset = Number(options.stickyOffset)
  const stickyHeader = container.querySelector?.('.inventory-count-session-table-head')
  const stickyOffset = Number.isFinite(explicitOffset)
    ? Math.max(0, explicitOffset)
    : (stickyHeader?.getBoundingClientRect().height ?? 0)
  const slack = Number.isFinite(Number(options.slack)) ? Math.max(0, Number(options.slack)) : 1

  const rowRect = row.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const visibleTop = containerRect.top + stickyOffset
  const visibleBottom = containerRect.bottom

  return rowRect.top < (visibleTop - slack) || rowRect.bottom > (visibleBottom + slack)
}

/**
 * Scroll a row inside the dedicated item workspace without moving the page.
 * No-ops when the row is already fully visible in the row scroll owner.
 * Prefer scrollInventoryCountCountedInputIntoView for Enter/focus navigation.
 */
export function scrollInventoryCountRowIntoView(row, container, options = {}) {
  if (!row || !container) return false
  if (!options.force && !isInventoryCountRowOutsideViewport(row, container, options)) {
    return false
  }

  const explicitOffset = Number(options.stickyOffset)
  // Frozen spreadsheet head sits outside the scroll body → default offset 0.
  // Legacy sticky-in-scroll mode still measures `.inventory-count-session-table-head` when present inside.
  const stickyHeader = container.querySelector?.('.inventory-count-session-table-head')
  const stickyOffset = Number.isFinite(explicitOffset)
    ? Math.max(0, explicitOffset)
    : (stickyHeader?.getBoundingClientRect().height ?? 0)

  const rowRect = row.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const visibleTop = containerRect.top + stickyOffset

  if (rowRect.top < visibleTop) {
    container.scrollTop = clampInventoryCountScrollTop(
      container,
      container.scrollTop - (visibleTop - rowRect.top),
    )
  } else if (rowRect.bottom > containerRect.bottom) {
    container.scrollTop = clampInventoryCountScrollTop(
      container,
      container.scrollTop + (rowRect.bottom - containerRect.bottom),
    )
  }
  return true
}

const STOCK_SCROLL_LOCK_CLASS = 'is-inventory-count-session-lock'

function patchItemInLocations(locations, itemId, patch) {
  return locations.map((location) => {
    const itemIndex = location.items.findIndex((item) => item.id === itemId)
    if (itemIndex < 0) return location

    const items = location.items.map((item, index) => (
      index === itemIndex
        ? { ...item, ...patch }
        : item
    ))
    const { countedItems, totalItems } = recountLocationItems(items)
    return {
      ...location,
      items,
      countedItems,
      totalItems,
    }
  })
}

export function InventoryCountSessionWorkspace({
  onExit,
  onPosted,
  sessionId: sessionIdProp = '',
  workspaceId: workspaceIdProp = '',
}) {
  const { workspace } = useAuth()
  const [locations, setLocations] = useState([])
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isCompletingLocation, setIsCompletingLocation] = useState(false)
  const [sessionStatus, setSessionStatus] = useState('in_progress')
  const [isTogglingPause, setIsTogglingPause] = useState(false)
  const [isFinishPreviewOpen, setIsFinishPreviewOpen] = useState(false)
  const [isLoadingFinishPreview, setIsLoadingFinishPreview] = useState(false)
  const [isPostingFinish, setIsPostingFinish] = useState(false)
  const [hasPostedFinish, setHasPostedFinish] = useState(false)
  const [finishPreview, setFinishPreview] = useState(null)
  const [finishPreviewError, setFinishPreviewError] = useState('')
  const [itemSearch, setItemSearch] = useState('')
  const [isKeyboardCompact, setIsKeyboardCompact] = useState(false)
  const loadRequestIdRef = useRef(0)
  const locationsRef = useRef(locations)
  const sessionStatusRef = useRef(sessionStatus)
  const itemSearchRef = useRef(itemSearch)
  const debounceTimersRef = useRef(new Map())
  const inFlightRef = useRef(new Map())
  const queuedSaveRef = useRef(new Map())
  const rollbackRef = useRef(new Map())
  const savingCountRef = useRef(0)
  const isPostingFinishRef = useRef(false)
  const enterLockRef = useRef(null)
  const tableWrapRef = useRef(null)
  const sessionRootRef = useRef(null)
  const selectedLocationIdRef = useRef(selectedLocationId)
  const keyboardCompactRef = useRef(false)
  const keyboardHeightCssRef = useRef('')
  const settleRevealFrameRef = useRef(0)
  const resizeRevealFrameRef = useRef(0)

  useEffect(() => {
    locationsRef.current = locations
  }, [locations])

  useEffect(() => {
    sessionStatusRef.current = sessionStatus
  }, [sessionStatus])

  useEffect(() => {
    itemSearchRef.current = itemSearch
  }, [itemSearch])

  useEffect(() => {
    selectedLocationIdRef.current = selectedLocationId
  }, [selectedLocationId])

  // P8.18.2a — Explicit Stock shell scroll lock (do not rely only on :has()).
  useEffect(() => {
    const root = sessionRootRef.current
    if (!root || typeof document === 'undefined') return undefined

    const shell = root.closest('.main-panel-stock, .main-panel')
    if (!shell) return undefined

    shell.classList.add(STOCK_SCROLL_LOCK_CLASS)
    shell.setAttribute('data-inventory-count-scroll-lock', 'true')

    return () => {
      shell.classList.remove(STOCK_SCROLL_LOCK_CLASS)
      shell.removeAttribute('data-inventory-count-scroll-lock')
    }
  }, [])

  // P8.17.4a / P8.18.3 — Keyboard-open height from session top → visualViewport bottom.
  // Do not restore stale scrollTop (fights Safari momentum / max-scroll clamp).
  // After layout settles, reveal the focused Counted input only when outside usable bounds.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const viewport = window.visualViewport
    let frameId = 0

    const revealFocusedCountedInputIfNeeded = () => {
      const scrollOwner = tableWrapRef.current
      const active = typeof document !== 'undefined' ? document.activeElement : null
      const itemId = active?.getAttribute?.('data-count-item-id')
      if (
        !scrollOwner
        || !active
        || !itemId
        || !active.classList?.contains('inventory-count-session-counted-input')
        || !scrollOwner.contains(active)
      ) {
        return
      }
      scrollInventoryCountCountedInputIntoView(active, scrollOwner)
    }

    const updateKeyboardCompact = () => {
      window.cancelAnimationFrame(frameId)
      window.cancelAnimationFrame(resizeRevealFrameRef.current)
      frameId = window.requestAnimationFrame(() => {
        const root = sessionRootRef.current
        const layoutHeight = window.innerHeight || 0
        const visibleHeight = viewport?.height ?? layoutHeight
        const keyboardOpen = layoutHeight > 0 && (layoutHeight - visibleHeight) > 120

        if (keyboardCompactRef.current !== keyboardOpen) {
          keyboardCompactRef.current = keyboardOpen
          setIsKeyboardCompact(keyboardOpen)
        }

        if (!root) return

        if (!keyboardOpen) {
          if (keyboardHeightCssRef.current !== '') {
            root.style.removeProperty('--inventory-count-session-available-height')
            keyboardHeightCssRef.current = ''
          }
        } else {
          const available = getInventoryCountKeyboardAvailableHeight({
            sessionTop: root.getBoundingClientRect().top,
            visualViewportOffsetTop: viewport?.offsetTop ?? 0,
            visualViewportHeight: visibleHeight,
          })
          const nextHeight = `${available}px`
          if (keyboardHeightCssRef.current !== nextHeight) {
            root.style.setProperty('--inventory-count-session-available-height', nextHeight)
            keyboardHeightCssRef.current = nextHeight
          }
        }

        // One settled-layout check only — never rewrite scrollTop blindly.
        resizeRevealFrameRef.current = window.requestAnimationFrame(() => {
          revealFocusedCountedInputIfNeeded()
        })
      })
    }

    updateKeyboardCompact()
    window.addEventListener('resize', updateKeyboardCompact)
    viewport?.addEventListener('resize', updateKeyboardCompact)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.cancelAnimationFrame(resizeRevealFrameRef.current)
      window.cancelAnimationFrame(settleRevealFrameRef.current)
      window.removeEventListener('resize', updateKeyboardCompact)
      viewport?.removeEventListener('resize', updateKeyboardCompact)
      sessionRootRef.current?.style.removeProperty('--inventory-count-session-available-height')
      keyboardHeightCssRef.current = ''
      keyboardCompactRef.current = false
    }
  }, [])

  useEffect(() => {
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId

    let cancelled = false

    const loadSessionItems = async () => {
      setIsLoading(true)
      setLoadError('')
      setSaveError('')
      setSessionStatus('in_progress')
      setIsCompletingLocation(false)
      setIsTogglingPause(false)
      setIsFinishPreviewOpen(false)
      setIsLoadingFinishPreview(false)
      setIsPostingFinish(false)
      setHasPostedFinish(false)
      setFinishPreview(null)
      setFinishPreviewError('')
      isPostingFinishRef.current = false

      try {
        const sessionId = `${sessionIdProp || ''}`.trim()
        if (!sessionId) {
          setLocations([])
          setSelectedLocationId('')
          setLoadError('Inventory count session was not found.')
          return
        }

        const workspaceId = `${workspaceIdProp || workspace?.id || ''}`.trim()
        if (!workspaceId) {
          throw new Error('Workspace is required.')
        }

        const [session, sessionLocations, sessionItems] = await Promise.all([
          getInventoryCountSession({ workspaceId, sessionId }),
          getInventoryCountSessionLocations({ workspaceId, sessionId }),
          getInventoryCountSessionItems({ workspaceId, sessionId }),
        ])

        if (cancelled || loadRequestIdRef.current !== requestId) return

        const nextStatus = `${session?.status || ''}`.trim() || 'in_progress'
        setSessionStatus(nextStatus)
        setHasPostedFinish(nextStatus === 'posted')

        const nextLocations = buildLocationsFromSession(sessionLocations, sessionItems)
        setLocations(nextLocations)
        setSelectedLocationId(pickInitialLocationId(nextLocations))
      } catch (error) {
        if (cancelled || loadRequestIdRef.current !== requestId) return
        setLocations([])
        setSelectedLocationId('')
        setLoadError(error?.message || 'Unable to load inventory count items right now.')
      } finally {
        if (!cancelled && loadRequestIdRef.current === requestId) {
          setIsLoading(false)
        }
      }
    }

    void loadSessionItems()

    const debounceTimers = debounceTimersRef.current

    return () => {
      cancelled = true
      debounceTimers.forEach((timerId) => clearTimeout(timerId))
      debounceTimers.clear()
    }
  }, [sessionIdProp, workspaceIdProp, workspace?.id])

  const beginSaving = () => {
    savingCountRef.current += 1
    setIsSaving(true)
  }

  const endSaving = () => {
    savingCountRef.current = Math.max(0, savingCountRef.current - 1)
    if (savingCountRef.current === 0) {
      setIsSaving(false)
    }
  }

  const persistCountedQuantity = async (itemId, countedQuantity) => {
    if (sessionStatusRef.current !== 'in_progress') {
      return false
    }

    if (inFlightRef.current.get(itemId)) {
      queuedSaveRef.current.set(itemId, countedQuantity)
      return false
    }

    const workspaceId = `${workspaceIdProp || workspace?.id || ''}`.trim()
    const sessionId = `${sessionIdProp || ''}`.trim()
    if (!workspaceId || !sessionId) {
      setSaveError('Unable to save counted quantity right now.')
      return false
    }

    inFlightRef.current.set(itemId, true)
    beginSaving()
    setSaveError('')

    try {
      const saved = await updateInventoryCountItem({
        workspaceId,
        sessionId,
        sessionItemId: itemId,
        countedQuantity,
      })

      const nextLineStatus = saved.lineStatus
      const nextCounted = saved.countedQuantity === null || saved.countedQuantity === undefined
        ? ''
        : formatQuantity(saved.countedQuantity)

      setLocations((current) => patchItemInLocations(current, itemId, {
        counted: nextCounted,
        lineStatus: nextLineStatus,
        status: formatLineStatus(nextLineStatus),
      }))
      rollbackRef.current.delete(itemId)
      return true
    } catch (error) {
      const rollback = rollbackRef.current.get(itemId)
      if (rollback) {
        setLocations((current) => patchItemInLocations(current, itemId, rollback))
      }
      setSaveError(error?.message || 'Unable to save counted quantity right now.')
      return false
    } finally {
      inFlightRef.current.set(itemId, false)
      endSaving()

      if (queuedSaveRef.current.has(itemId)) {
        const queuedValue = queuedSaveRef.current.get(itemId)
        queuedSaveRef.current.delete(itemId)
        void persistCountedQuantity(itemId, queuedValue)
      }
    }
  }

  const waitForItemSaveIdle = async (itemId) => {
    const deadline = Date.now() + 10000
    while (
      Date.now() < deadline
      && (inFlightRef.current.get(itemId) || queuedSaveRef.current.has(itemId))
    ) {
      await new Promise((resolve) => {
        setTimeout(resolve, 25)
      })
    }
  }

  const revealCountedInputById = (itemId) => {
    const container = tableWrapRef.current
    const input = container?.querySelector(`input[data-count-item-id="${itemId}"]`)
    if (!input || !container) return false
    return scrollInventoryCountCountedInputIntoView(input, container)
  }

  const scheduleSettledCountedInputReveal = (itemId) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      revealCountedInputById(itemId)
      return
    }

    window.cancelAnimationFrame(settleRevealFrameRef.current)
    let layoutFrames = 0

    const runSettledFrame = () => {
      layoutFrames += 1
      const container = tableWrapRef.current
      const input = container?.querySelector(`input[data-count-item-id="${itemId}"]`)
      if (!input || !container) return

      if (!isInventoryCountCountedInputOutsideUsableViewport(input, container)) {
        return
      }

      scrollInventoryCountCountedInputIntoView(input, container)

      if (layoutFrames < INVENTORY_COUNT_ENTER_REVEAL_MAX_LAYOUT_FRAMES) {
        settleRevealFrameRef.current = window.requestAnimationFrame(runSettledFrame)
      }
    }

    settleRevealFrameRef.current = window.requestAnimationFrame(runSettledFrame)
  }

  const focusCountedInput = (itemId, options = {}) => {
    const container = tableWrapRef.current
    const input = container?.querySelector(`input[data-count-item-id="${itemId}"]`)
    if (!input) return
    // preventScroll stops iOS from scrolling outer Stock/session ancestors on focus.
    if (typeof input.focus === 'function') {
      try {
        input.focus({ preventScroll: true })
      } catch {
        input.focus()
      }
    }
    scrollInventoryCountCountedInputIntoView(input, container)
    if (options.verifyAfterLayout) {
      scheduleSettledCountedInputReveal(itemId)
    }
  }

  const handleCountedKeyDown = async (event, itemId) => {
    if (event.key !== 'Enter') return
    event.preventDefault()

    if (sessionStatusRef.current !== 'in_progress') return
    if (enterLockRef.current) return

    const inputEl = event.currentTarget
    const existingTimer = debounceTimersRef.current.get(itemId)
    if (existingTimer) {
      clearTimeout(existingTimer)
      debounceTimersRef.current.delete(itemId)
    }

    const rawValue = `${inputEl?.value ?? ''}`
    const parsed = parseCountedDraft(rawValue)
    if (!parsed.ready) {
      if (parsed.invalid) {
        setSaveError('Counted quantity must be a valid non-negative number.')
      }
      return
    }

    enterLockRef.current = itemId
    try {
      await waitForItemSaveIdle(itemId)
      // Keep the typed value if save fails (Enter must not wipe the operator's entry).
      rollbackRef.current.set(itemId, {
        counted: rawValue,
        lineStatus: parsed.countedQuantity === null ? 'pending' : 'counted',
        status: formatLineStatus(parsed.countedQuantity === null ? 'pending' : 'counted'),
      })
      const saved = await persistCountedQuantity(itemId, parsed.countedQuantity)
      if (!saved) return

      const selected = locationsRef.current.find((location) => location.id === selectedLocationIdRef.current)
        ?? locationsRef.current.find((location) => location.status === 'current')
        ?? locationsRef.current[0]
        ?? null
      const displayed = getDisplayedLocationItems(selected?.items ?? [], itemSearchRef.current)
      const nextItem = findNextEligibleCountItem(displayed, itemId)
      if (!nextItem) {
        inputEl?.blur?.()
        return
      }

      queueMicrotask(() => {
        focusCountedInput(nextItem.id, { verifyAfterLayout: true })
      })
    } finally {
      enterLockRef.current = null
    }
  }

  const scheduleCountedSave = (itemId, rawValue) => {
    const existingTimer = debounceTimersRef.current.get(itemId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timerId = setTimeout(() => {
      debounceTimersRef.current.delete(itemId)
      const parsed = parseCountedDraft(rawValue)
      if (!parsed.ready) {
        if (parsed.invalid) {
          const rollback = rollbackRef.current.get(itemId)
          if (rollback) {
            setLocations((current) => patchItemInLocations(current, itemId, rollback))
          }
          setSaveError('Counted quantity must be a valid non-negative number.')
        }
        return
      }

      void persistCountedQuantity(itemId, parsed.countedQuantity)
    }, AUTOSAVE_DEBOUNCE_MS)

    debounceTimersRef.current.set(itemId, timerId)
  }

  const handleCountedChange = (itemId, nextValue) => {
    if (sessionStatus !== 'in_progress') {
      return
    }

    if (!rollbackRef.current.has(itemId)) {
      const snapshot = findItemSnapshot(locationsRef.current, itemId)
      if (snapshot) {
        rollbackRef.current.set(itemId, snapshot)
      }
    }

    const trimmed = `${nextValue ?? ''}`
    if (trimmed !== '' && !/^\d*\.?\d*$/.test(trimmed)) {
      return
    }

    const parsed = parseCountedDraft(trimmed)
    const optimisticLineStatus = parsed.ready && parsed.countedQuantity === null
      ? 'pending'
      : parsed.ready
        ? 'counted'
        : (findItemSnapshot(locationsRef.current, itemId)?.lineStatus ?? 'pending')

    setLocations((current) => patchItemInLocations(current, itemId, {
      counted: trimmed,
      lineStatus: optimisticLineStatus,
      status: formatLineStatus(optimisticLineStatus),
    }))
    setSaveError('')
    scheduleCountedSave(itemId, trimmed)
  }

  const selectedIndex = locations.findIndex((location) => location.id === selectedLocationId)
  const selectedLocation = locations[selectedIndex] ?? locations[0] ?? null
  const currentLocation = locations.find((location) => location.status === 'current') ?? null
  const progress = getSessionProgress(locations)

  const canGoPrevious = selectedIndex > 0
  const canGoNext = selectedIndex >= 0 && selectedIndex < locations.length - 1
  const isSessionPaused = sessionStatus === 'paused'
  const isCountEditable = sessionStatus === 'in_progress'
  // Empty locations (0 items / 0 pending) remain explicitly completable — never auto-completed.
  const canCompleteLocation = Boolean(selectedLocation)
    && selectedLocation.status === 'current'
    && isCountEditable
    && !isCompletingLocation
  const completeLocationDisabledReason = getCompleteLocationDisabledReason({
    sessionStatus,
    selectedLocation,
    currentLocationName: currentLocation?.name || '',
    isCompletingLocation,
  })
  const showInactiveLocationGuidance = Boolean(
    selectedLocation
    && currentLocation
    && selectedLocation.id !== currentLocation.id
    && selectedLocation.status !== 'completed'
    && sessionStatus !== 'counting_complete',
  )
  const bannerError = saveError || loadError
  const unsavedLabel = isSaving
    ? 'Saving…'
    : saveError
      ? 'Save failed'
      : 'All changes saved'
  const sessionStatusLabel = sessionStatus === 'counting_complete'
    ? 'Counting Complete'
    : sessionStatus === 'paused'
      ? 'Paused'
      : 'In Progress'
  const showCountingCompleteBanner = sessionStatus === 'counting_complete'
  const showPausedBanner = isSessionPaused
  const canOpenFinishCount = sessionStatus === 'counting_complete'
  const finishCountDisabledReason = canOpenFinishCount
    ? ''
    : getFinishCountDisabledReason(sessionStatus, locations)
  const showFinishCountDisabledBanner = shouldShowFinishCountDisabledBanner(finishCountDisabledReason)
  const canTogglePause = (sessionStatus === 'in_progress' || sessionStatus === 'paused')
    && !isTogglingPause
    && !isCompletingLocation
    && !(sessionStatus === 'in_progress' && isSaving)
  const pauseButtonLabel = isTogglingPause
    ? (sessionStatus === 'paused' ? 'Resuming…' : 'Pausing…')
    : (isSessionPaused ? 'Resume' : 'Pause')

  const selectLocation = (locationId) => {
    setSelectedLocationId(locationId)
    setItemSearch('')
  }

  const handleGoToCurrentLocation = () => {
    if (!currentLocation?.id) return
    selectLocation(currentLocation.id)
  }

  const handlePrevious = () => {
    if (!canGoPrevious) return
    selectLocation(locations[selectedIndex - 1].id)
  }

  const handleNext = () => {
    if (!canGoNext) return
    selectLocation(locations[selectedIndex + 1].id)
  }

  const waitForPendingAutosaves = async () => {
    const pendingTimers = [...debounceTimersRef.current.entries()]
    for (const [itemId, timerId] of pendingTimers) {
      clearTimeout(timerId)
      debounceTimersRef.current.delete(itemId)

      const snapshot = findItemSnapshot(locationsRef.current, itemId)
      if (!snapshot) continue

      const parsed = parseCountedDraft(snapshot.counted)
      if (!parsed.ready) {
        if (parsed.invalid) {
          const rollback = rollbackRef.current.get(itemId)
          if (rollback) {
            setLocations((current) => patchItemInLocations(current, itemId, rollback))
          }
          setSaveError('Counted quantity must be a valid non-negative number.')
        }
        continue
      }

      await persistCountedQuantity(itemId, parsed.countedQuantity)
    }

    const deadline = Date.now() + 10000
    while (
      Date.now() < deadline
      && (
        savingCountRef.current > 0
        || [...inFlightRef.current.values()].some(Boolean)
        || queuedSaveRef.current.size > 0
        || debounceTimersRef.current.size > 0
      )
    ) {
      await new Promise((resolve) => {
        setTimeout(resolve, 25)
      })
    }
  }

  const handleTogglePause = async () => {
    if (!canTogglePause) return

    const shouldPause = sessionStatus === 'in_progress'
    const workspaceId = `${workspaceIdProp || workspace?.id || ''}`.trim()
    const sessionId = `${sessionIdProp || ''}`.trim()
    if (!workspaceId || !sessionId) {
      setSaveError(shouldPause
        ? 'Unable to pause inventory count right now.'
        : 'Unable to resume inventory count right now.')
      return
    }

    setIsTogglingPause(true)
    setSaveError('')

    try {
      if (shouldPause) {
        await waitForPendingAutosaves()
        if (sessionStatusRef.current !== 'in_progress') {
          return
        }
      }

      const result = await setInventoryCountSessionPauseState({
        workspaceId,
        sessionId,
        pause: shouldPause,
      })

      const nextStatus = `${result.status || ''}`.trim()
      if (nextStatus) {
        setSessionStatus(nextStatus)
      }
    } catch (error) {
      setSaveError(error?.message || (
        shouldPause
          ? 'Unable to pause inventory count right now.'
          : 'Unable to resume inventory count right now.'
      ))
    } finally {
      setIsTogglingPause(false)
    }
  }

  const handleCompleteLocation = async () => {
    if (!canCompleteLocation || !selectedLocation) return

    const workspaceId = `${workspaceIdProp || workspace?.id || ''}`.trim()
    const sessionId = `${sessionIdProp || ''}`.trim()
    if (!workspaceId || !sessionId) {
      setSaveError('Unable to complete inventory count location right now.')
      return
    }

    setIsCompletingLocation(true)
    setSaveError('')

    try {
      const result = await completeInventoryCountLocation({
        workspaceId,
        sessionId,
        locationId: selectedLocation.id,
      })

      const nextSessionStatus = `${result.sessionStatus || ''}`.trim() || 'in_progress'
      setSessionStatus(nextSessionStatus)
      setLocations((current) => current.map((location) => {
        if (location.id === result.completedLocationId) {
          return {
            ...location,
            status: 'completed',
          }
        }
        if (result.nextLocationId && location.id === result.nextLocationId) {
          return {
            ...location,
            status: 'current',
          }
        }
        if (
          location.status === 'current'
          && location.id !== result.completedLocationId
          && location.id !== result.nextLocationId
        ) {
          return {
            ...location,
            status: 'not_started',
          }
        }
        return location
      }))

      if (result.nextLocationId) {
        setSelectedLocationId(result.nextLocationId)
      }
    } catch (error) {
      setSaveError(error?.message || 'Unable to complete inventory count location right now.')
    } finally {
      setIsCompletingLocation(false)
    }
  }

  const handleOpenFinishPreview = async () => {
    if (!canOpenFinishCount || isLoadingFinishPreview) return

    const workspaceId = `${workspaceIdProp || workspace?.id || ''}`.trim()
    const sessionId = `${sessionIdProp || ''}`.trim()
    if (!workspaceId || !sessionId) {
      setSaveError('Unable to preview inventory count finish right now.')
      return
    }

    setIsFinishPreviewOpen(true)
    setIsLoadingFinishPreview(true)
    setFinishPreviewError('')
    setFinishPreview(null)
    setSaveError('')

    try {
      const preview = await previewInventoryCountFinish({
        workspaceId,
        sessionId,
      })
      setFinishPreview(preview)
    } catch (error) {
      setFinishPreviewError(error?.message || 'Unable to preview inventory count finish right now.')
    } finally {
      setIsLoadingFinishPreview(false)
    }
  }

  const handleCloseFinishPreview = () => {
    if (isLoadingFinishPreview || isPostingFinish) return
    setIsFinishPreviewOpen(false)
    setFinishPreview(null)
    setFinishPreviewError('')
  }

  const refreshSessionAfterPost = async ({ workspaceId, sessionId }) => {
    const [sessionLocations, sessionItems] = await Promise.all([
      getInventoryCountSessionLocations({ workspaceId, sessionId }),
      getInventoryCountSessionItems({ workspaceId, sessionId }),
    ])
    const nextLocations = buildLocationsFromSession(sessionLocations, sessionItems)
    setLocations(nextLocations)
    setSelectedLocationId((current) => {
      if (current && nextLocations.some((location) => location.id === current)) {
        return current
      }
      return nextLocations[0]?.id || ''
    })
  }

  const handleConfirmFinishCount = async () => {
    if (
      isPostingFinishRef.current
      || isPostingFinish
      || hasPostedFinish
      || isLoadingFinishPreview
      || !finishPreview?.canPost
    ) {
      return
    }

    const workspaceId = `${workspaceIdProp || workspace?.id || ''}`.trim()
    const sessionId = `${sessionIdProp || ''}`.trim()
    if (!workspaceId || !sessionId) {
      setFinishPreviewError('Unable to post inventory count right now.')
      return
    }

    isPostingFinishRef.current = true
    setIsPostingFinish(true)
    setFinishPreviewError('')
    setSaveError('')

    try {
      const result = await postInventoryCountFinish({
        workspaceId,
        sessionId,
      })

      setHasPostedFinish(true)
      setSessionStatus(result.status || 'posted')

      try {
        await refreshSessionAfterPost({ workspaceId, sessionId })
      } catch {
        // Session is already posted; refresh is best-effort before exit.
      }

      setIsFinishPreviewOpen(false)
      setFinishPreview(null)
      setFinishPreviewError('')

      if (typeof onPosted === 'function') {
        onPosted({
          sessionId: result.sessionId,
          workspaceId: result.workspaceId,
          status: result.status,
          message: result.message,
        })
      } else if (typeof onExit === 'function') {
        onExit()
      }
    } catch (error) {
      setFinishPreviewError(error?.message || 'Unable to post inventory count right now.')
      setIsPostingFinish(false)
      isPostingFinishRef.current = false
    }
  }

  const selectedLocationName = selectedLocation?.name ?? 'Location'
  const displayedLocationItems = getDisplayedLocationItems(selectedLocation?.items ?? [], itemSearch)
  const canConfirmFinish = Boolean(
    finishPreview?.canPost
    && !isLoadingFinishPreview
    && !isPostingFinish
    && !hasPostedFinish,
  )
  const sessionClassName = [
    'inventory-count-session',
    'is-high-density',
    isKeyboardCompact ? 'is-keyboard-compact' : '',
  ].filter(Boolean).join(' ')

  return (
    <section
      ref={sessionRootRef}
      className={sessionClassName}
      aria-label="Inventory Count Session Workspace"
      data-inventory-count-session="true"
      data-inventory-count-scroll-shell="locked"
    >
      <header className="inventory-count-session-header">
        <div className="inventory-count-session-header-copy">
          <p className="inventory-count-session-eyebrow">Inventory Count Session</p>
          <div className="inventory-count-session-meta">
            <span className="inventory-count-session-pill is-status">{sessionStatusLabel}</span>
            <span className="inventory-count-session-meta-item">
              <span className="inventory-count-session-meta-label">Count Type</span>
              <span className="inventory-count-session-meta-value">New Count</span>
            </span>
            <span className="inventory-count-session-meta-item">
              <span className="inventory-count-session-meta-label">Mode</span>
              <span className="inventory-count-session-meta-value">Blind Count</span>
            </span>
            <span className="inventory-count-session-meta-item inventory-count-session-meta-secondary">
              <span className="inventory-count-session-meta-label">Started</span>
              <span className="inventory-count-session-meta-value">Just now</span>
            </span>
            <span className="inventory-count-session-meta-item inventory-count-session-meta-secondary">
              <span className="inventory-count-session-meta-label">Operator</span>
              <span className="inventory-count-session-meta-value">Current signed-in operator</span>
            </span>
          </div>
        </div>
        <div className="inventory-count-session-header-actions">
          <button
            type="button"
            className="ghost-btn inventory-count-session-action-btn"
            disabled={!canTogglePause}
            aria-disabled={!canTogglePause}
            onClick={() => {
              void handleTogglePause()
            }}
          >
            {pauseButtonLabel}
          </button>
          <button
            type="button"
            className="ghost-btn inventory-count-session-action-btn"
            disabled={!canOpenFinishCount || isLoadingFinishPreview}
            aria-disabled={!canOpenFinishCount || isLoadingFinishPreview}
            title={finishCountDisabledReason || undefined}
            onClick={() => {
              void handleOpenFinishPreview()
            }}
          >
            {isLoadingFinishPreview ? 'Loading…' : 'Finish Count'}
          </button>
          <button
            type="button"
            className="ghost-btn inventory-count-session-action-btn"
            onClick={onExit}
          >
            Exit
          </button>
        </div>
      </header>

      {showFinishCountDisabledBanner ? (
        <p className="inventory-count-finish-disabled-reason" role="status">
          <strong>Finish Count</strong>
          {' '}
          {finishCountDisabledReason}
        </p>
      ) : null}

      {isLoading ? (
        <div className="staff-status-banner" role="status">
          Loading inventory count…
        </div>
      ) : null}

      {bannerError ? (
        <div className="staff-status-banner" role="alert">
          {bannerError}
        </div>
      ) : null}

      {showPausedBanner ? (
        <div className="staff-status-banner" role="status">
          This inventory count is paused. Resume to continue counting.
        </div>
      ) : null}

      {!isLoading && !loadError && locations.length === 0 ? (
        <div className="stock-empty-state">
          <h4>No items in this session</h4>
          <p>This inventory count has no snapshot items yet.</p>
        </div>
      ) : null}

      {!isLoading && !loadError && locations.length > 0 ? (
        <>
          <div className="inventory-count-session-body">
            <aside className="inventory-count-session-rail" aria-label="Locations">
              {locations.map((location) => {
                const isSelected = location.id === selectedLocation?.id
                const readinessLabel = getLocationReadinessLabel(location)
                return (
                  <button
                    key={location.id}
                    type="button"
                    className={`inventory-count-session-rail-item is-${location.status}${isSelected ? ' is-selected' : ''}`}
                    aria-current={isSelected ? 'true' : undefined}
                    aria-pressed={isSelected}
                    onClick={() => selectLocation(location.id)}
                  >
                    <span className={`inventory-count-session-rail-badge is-${location.status}`} aria-hidden="true">
                      {location.status === 'completed' ? '✓' : location.status === 'current' ? '●' : '○'}
                    </span>
                    <span className="inventory-count-session-rail-copy">
                      <span className="inventory-count-session-rail-title-row">
                        <span className="inventory-count-session-rail-title">{location.name}</span>
                        {location.status === 'current' ? (
                          <span className="inventory-count-session-rail-current-badge">Current</span>
                        ) : null}
                      </span>
                      <span className="inventory-count-session-rail-state">
                        {readinessLabel}
                      </span>
                    </span>
                    <span className="inventory-count-session-rail-progress">
                      {location.countedItems} / {location.totalItems}
                    </span>
                  </button>
                )
              })}
            </aside>

            <div className="inventory-count-session-main">
              <div className="inventory-count-session-toolbar">
                <div className="inventory-count-session-toolbar-left">
                  <label className="inventory-count-session-search">
                    <span className="sr-only">Search items</span>
                    <input
                      type="search"
                      className="inventory-count-session-search-input"
                      placeholder={`Search ${selectedLocationName} items...`}
                      value={itemSearch}
                      onChange={(event) => setItemSearch(event.target.value)}
                      autoComplete="off"
                    />
                  </label>
                  <button
                    type="button"
                    className="ghost-btn inventory-count-session-filter-btn"
                    disabled
                    aria-disabled="true"
                  >
                    Filter
                  </button>
                </div>

                <article className="inventory-count-session-progress-card" aria-label="Session progress">
                  <p className="inventory-count-session-progress-percent">{progress.percentage}%</p>
                  <p className="inventory-count-session-progress-primary">
                    {progress.totalCounted} / {progress.totalIncluded} counted
                  </p>
                  <p className="inventory-count-session-progress-secondary">
                    {progress.completedLocations} / {progress.totalLocations} locations complete
                  </p>
                  <p className="inventory-count-session-progress-secondary">
                    {progress.skipped} skipped
                  </p>
                </article>
              </div>

              {selectedLocation ? (
                <p
                  className="inventory-count-session-location-readiness"
                  role="status"
                  aria-label="Selected location readiness"
                >
                  {getLocationReadinessLabel(selectedLocation)}
                </p>
              ) : null}

              {showInactiveLocationGuidance ? (
                <div
                  className="inventory-count-inactive-location-guidance"
                  role="status"
                  aria-label="Location not active yet"
                >
                  <div className="inventory-count-inactive-location-guidance-copy">
                    <strong>Location not active yet</strong>
                    <p>
                      You may review or count items here, but this location cannot be completed
                      until the current location is finished.
                    </p>
                    <p>
                      <span className="inventory-count-inactive-location-guidance-label">Current location:</span>
                      {' '}
                      {currentLocation?.name || '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="primary-btn inventory-count-session-action-btn"
                    onClick={handleGoToCurrentLocation}
                  >
                    Go to Current Location
                  </button>
                </div>
              ) : null}

              <div
                className="inventory-count-session-spreadsheet"
                style={INVENTORY_COUNT_SPREADSHEET_COLUMNS}
                aria-label={`${selectedLocationName} items`}
              >
                {selectedLocation?.items.length === 0 ? (
                  <div className="stock-empty-state inventory-count-session-table-wrap">
                    <h4>No items in this location</h4>
                    <p>No snapshot items were found for {selectedLocationName}.</p>
                  </div>
                ) : displayedLocationItems.length === 0 ? (
                  <div className="stock-empty-state inventory-count-session-table-wrap">
                    <h4>No matching items</h4>
                    <p>No items match the current search in {selectedLocationName}.</p>
                  </div>
                ) : (
                  <>
                    <div
                      className="inventory-count-session-table-head inventory-count-session-sheet-frozen-head"
                      role="row"
                      data-inventory-count-frozen-header="true"
                    >
                      <div className="inventory-count-session-spreadsheet-cell is-head" role="columnheader">
                        Item
                      </div>
                      <div className="inventory-count-session-spreadsheet-cell is-head" role="columnheader">
                        Unit
                      </div>
                      <div className="inventory-count-session-spreadsheet-cell is-head" role="columnheader">
                        Expected
                      </div>
                      <div className="inventory-count-session-spreadsheet-cell is-head" role="columnheader">
                        Counted
                      </div>
                      <div className="inventory-count-session-spreadsheet-cell is-head" role="columnheader">
                        Status
                      </div>
                    </div>
                    <div
                      ref={tableWrapRef}
                      className="inventory-count-session-table-wrap inventory-count-session-sheet-scroll"
                      role="rowgroup"
                      data-inventory-count-row-scroll="true"
                    >
                      {displayedLocationItems.map((item) => (
                        <div
                          key={item.id}
                          role="row"
                          className={`inventory-count-session-spreadsheet-row is-status-${item.status.toLowerCase()}`}
                          data-count-item-id={item.id}
                        >
                          <div className="inventory-count-session-spreadsheet-cell inventory-count-session-item-cell">
                            <span className="inventory-count-session-item-name">{item.name}</span>
                            {item.meta ? (
                              <span className="inventory-count-session-item-meta">{item.meta}</span>
                            ) : null}
                          </div>
                          <div className="inventory-count-session-spreadsheet-cell is-unit">{item.unit}</div>
                          <div className="inventory-count-session-spreadsheet-cell is-expected">{item.expected}</div>
                          <div className="inventory-count-session-spreadsheet-cell is-counted">
                            <input
                              type="text"
                              className="inventory-count-session-counted-input"
                              inputMode="decimal"
                              enterKeyHint="next"
                              data-count-item-id={item.id}
                              aria-label={`Counted quantity for ${item.name}`}
                              value={item.counted}
                              disabled={!isCountEditable}
                              aria-disabled={!isCountEditable}
                              onChange={(event) => handleCountedChange(item.id, event.target.value)}
                              onKeyDown={(event) => {
                                void handleCountedKeyDown(event, item.id)
                              }}
                              autoComplete="off"
                            />
                          </div>
                          <div className="inventory-count-session-spreadsheet-cell is-status">
                            <span className={`inventory-count-session-status-pill is-${item.status.toLowerCase()}`}>
                              {item.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <footer
            className="inventory-count-session-footer"
            data-inventory-count-footer="true"
          >
            <div className="inventory-count-session-footer-middle">
              <span className="inventory-count-session-footer-label">Unsaved changes</span>
              <span className="inventory-count-session-footer-value">{unsavedLabel}</span>
            </div>
            <div className="inventory-count-session-footer-right">
              <button
                type="button"
                className="ghost-btn inventory-count-session-action-btn inventory-count-session-nav-btn"
                disabled={!canGoPrevious}
                aria-disabled={!canGoPrevious}
                onClick={handlePrevious}
              >
                Previous
              </button>
              <button
                type="button"
                className="ghost-btn inventory-count-session-action-btn inventory-count-session-nav-btn"
                disabled={!canGoNext}
                aria-disabled={!canGoNext}
                onClick={handleNext}
              >
                Next
              </button>
              <button
                type="button"
                className="primary-btn inventory-count-session-action-btn inventory-count-session-complete-btn"
                disabled={!canCompleteLocation}
                aria-disabled={!canCompleteLocation}
                title={completeLocationDisabledReason || undefined}
                onClick={() => {
                  void handleCompleteLocation()
                }}
              >
                {isCompletingLocation ? 'Completing…' : 'Complete Location'}
              </button>
            </div>
          </footer>
          {completeLocationDisabledReason ? (
            <p className="inventory-count-complete-disabled-reason" role="status">
              <strong>Complete Location</strong>
              {' '}
              {completeLocationDisabledReason}
            </p>
          ) : null}
        </>
      ) : null}

      {showCountingCompleteBanner ? (
        <p className="inventory-count-session-completion-message" role="status">
          All locations are complete. Review variances with Finish Count.
        </p>
      ) : null}

      {isFinishPreviewOpen ? (
        <div
          className="employee-modal-backdrop inventory-count-wizard-backdrop inventory-count-finish-preview-overlay"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Finish Count Preview"
            className="inventory-count-finish-preview"
          >
            <header className="inventory-count-wizard-header inventory-count-finish-preview-header">
              <div className="inventory-count-wizard-header-copy">
                <p className="inventory-count-wizard-step-label">Session</p>
                <h2 className="inventory-count-wizard-title">Finish Count Preview</h2>
                <p className="inventory-count-wizard-subtitle">
                  Counting Complete · Review variances before posting. No stock changes yet.
                </p>
              </div>
              <div className="inventory-count-wizard-header-actions">
                <span className="inventory-count-session-pill is-status">Counting Complete</span>
              </div>
            </header>

            {finishPreview?.summary ? (
              <div
                className="inventory-count-finish-preview-summary"
                aria-label="Finish count summary"
              >
                {[
                  ['Total lines', finishPreview.summary.totalLines, ''],
                  ['Counted', finishPreview.summary.countedLines, ''],
                  ['Skipped', finishPreview.summary.skippedLines, finishPreview.summary.skippedLines > 0 ? 'is-warning' : ''],
                  ['Changed', finishPreview.summary.changedItems, ''],
                  ['Unchanged', finishPreview.summary.unchangedItems, ''],
                  ['Positive', finishPreview.summary.positiveVariances, 'is-positive'],
                  ['Negative', finishPreview.summary.negativeVariances, 'is-negative'],
                  ['Zero', finishPreview.summary.zeroVariances, 'is-neutral'],
                ].map(([label, value, toneClass]) => (
                  <article
                    key={label}
                    className={`inventory-count-finish-preview-summary-card ${toneClass}`.trim()}
                  >
                    <span className="inventory-count-session-meta-label">{label}</span>
                    <span className="inventory-count-finish-preview-summary-value">
                      {value}
                    </span>
                  </article>
                ))}
              </div>
            ) : null}

            <div className="inventory-count-finish-preview-body">
              {isLoadingFinishPreview ? (
                <div className="staff-status-banner inventory-count-finish-preview-banner" role="status">
                  Loading finish preview…
                </div>
              ) : null}

              {finishPreviewError ? (
                <div
                  className="staff-status-banner inventory-count-finish-preview-banner is-error"
                  role="alert"
                >
                  {finishPreviewError}
                </div>
              ) : null}

              {!isLoadingFinishPreview && !finishPreviewError && finishPreview ? (
                <>
                  <div className="inventory-count-finish-preview-intro">
                    <p className="inventory-count-wizard-subtitle">
                      Expected at Count includes stock activity recorded after the snapshot and before this item was counted.
                    </p>
                    <ol className="inventory-count-finish-preview-flow" aria-label="Reconciliation column flow">
                      <li>Snapshot</li>
                      <li>Activity</li>
                      <li>Expected at Count</li>
                      <li>Counted</li>
                      <li>Variance</li>
                      <li>Current Live</li>
                      <li>Result After Post</li>
                    </ol>
                  </div>

                  {(finishPreview.blockingIssues ?? []).length > 0 ? (
                    <div className="inventory-count-finish-preview-alerts" aria-label="Blocking issues">
                      {(finishPreview.blockingIssues ?? []).map((issue) => (
                        <div
                          key={`${issue.code}-${issue.sessionItemId || issue.message}`}
                          className="staff-status-banner inventory-count-finish-preview-banner is-blocker"
                          role="alert"
                        >
                          {issue.message}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {(finishPreview.skipped ?? []).length > 0 ? (
                    <div className="inventory-count-finish-preview-alerts" aria-label="Skipped lines">
                      {(finishPreview.skipped ?? []).map((line) => (
                        <div
                          key={`skipped-${line.sessionItemId}`}
                          className="staff-status-banner inventory-count-finish-preview-banner is-skipped"
                          role="status"
                        >
                          Skipped: {line.itemName}
                          {line.storageLocation ? ` · ${line.storageLocation}` : ''}
                          . {line.warning}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {finishPreview.lines.length === 0 ? (
                    <div className="stock-empty-state inventory-count-finish-preview-empty">
                      <h4>No counted items</h4>
                      <p>There are no counted lines to preview for this session.</p>
                    </div>
                  ) : (
                    <div className="inventory-count-finish-preview-table-wrap">
                      <table className="inventory-count-session-table inventory-count-finish-preview-table">
                        <thead>
                          <tr>
                            <th scope="col">Item</th>
                            <th scope="col">Location</th>
                            <th scope="col" className="is-numeric" title="Snapshot quantity">Snapshot</th>
                            <th scope="col" className="is-numeric" title="Activity since snapshot">Activity</th>
                            <th scope="col" className="is-numeric" title="Expected at count">Expected at Count</th>
                            <th scope="col" className="is-numeric">Counted</th>
                            <th scope="col" className="is-numeric">Variance</th>
                            <th scope="col" className="is-numeric" title="Current live quantity">Current Live</th>
                            <th scope="col" className="is-numeric" title="Result after post">Result After Post</th>
                          </tr>
                        </thead>
                        <tbody>
                          {finishPreview.lines.map((line) => {
                            const varianceToneClass = varianceTone(line.varianceQuantity)
                            const activityToneClass = varianceTone(line.movementDeltaSinceSnapshot)
                            return (
                              <tr key={line.sessionItemId}>
                                <td className="inventory-count-session-item-name">
                                  <span className="inventory-count-finish-preview-item-name">
                                    {line.itemName}
                                  </span>
                                  {line.unit ? (
                                    <span className="inventory-count-finish-preview-item-unit">
                                      {line.unit}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="inventory-count-finish-preview-location">
                                  {line.storageLocation || '—'}
                                </td>
                                <td className="is-numeric">
                                  {formatQuantity(line.expectedSnapshot)}
                                </td>
                                <td className={`is-numeric is-activity is-${activityToneClass}`}>
                                  {formatVariance(line.movementDeltaSinceSnapshot)}
                                </td>
                                <td className="is-numeric">
                                  {formatQuantity(line.expectedAtCount)}
                                </td>
                                <td className="is-numeric">
                                  {formatQuantity(line.countedQuantity)}
                                </td>
                                <td className="is-numeric is-variance">
                                  <span className={`inventory-count-finish-preview-variance is-${varianceToneClass}`}>
                                    {formatVariance(line.varianceQuantity)}
                                  </span>
                                </td>
                                <td className="is-numeric">
                                  {formatQuantity(line.currentLiveQuantity)}
                                </td>
                                <td className="is-numeric is-result">
                                  {formatQuantity(line.resultingQuantityAfterPost)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <footer className="inventory-count-finish-preview-footer">
              <p className="inventory-count-finish-preview-footer-note">
                {isPostingFinish
                  ? 'Posting inventory count…'
                  : hasPostedFinish
                    ? 'Inventory count posted.'
                    : finishPreview?.canPost
                      ? 'Confirm posts stock adjustments and finalizes this count.'
                      : 'Resolve blocking issues before Confirm Finish Count is available.'}
              </p>
              <div className="inventory-count-finish-preview-footer-actions">
                <button
                  type="button"
                  className="ghost-btn inventory-count-session-action-btn"
                  disabled={isLoadingFinishPreview || isPostingFinish}
                  aria-disabled={isLoadingFinishPreview || isPostingFinish}
                  onClick={handleCloseFinishPreview}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-btn inventory-count-session-action-btn inventory-count-finish-preview-confirm"
                  disabled={!canConfirmFinish}
                  aria-disabled={!canConfirmFinish}
                  title={
                    hasPostedFinish
                      ? 'Inventory count already posted'
                      : finishPreview?.canPost
                        ? 'Post inventory count'
                        : 'Posting unavailable until blockers are resolved'
                  }
                  aria-label={
                    isPostingFinish
                      ? 'Posting inventory count'
                      : 'Confirm Finish Count'
                  }
                  onClick={() => {
                    void handleConfirmFinishCount()
                  }}
                >
                  {isPostingFinish ? 'Posting…' : 'Confirm Finish Count'}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  )
}
