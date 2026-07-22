import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MENU_Z_INDEX = 12000
const MENU_MARGIN = 8
const MOBILE_SHEET_QUERY = '(max-width: 900px)'

const MENU_ITEMS = [
  { id: 'usage', label: 'Usage' },
  { id: 'adjust', label: 'Adjust' },
  { id: 'edit', label: 'Edit' },
  { id: 'duplicate', label: 'Duplicate' },
  { id: 'history', label: 'History & details' },
  { id: 'deactivate', label: 'Deactivate' },
]

function computeMenuPosition(anchorRect, menuWidth, menuHeight) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let left = anchorRect.right - menuWidth
  let top = anchorRect.bottom + MENU_MARGIN
  let placement = 'below'

  left = Math.max(MENU_MARGIN, Math.min(left, viewportWidth - menuWidth - MENU_MARGIN))

  if (top + menuHeight > viewportHeight - MENU_MARGIN) {
    top = anchorRect.top - menuHeight - MENU_MARGIN
    placement = 'above'
  }

  top = Math.max(MENU_MARGIN, top)

  return { top, left, placement }
}

function hasValidAnchorRect(anchorEl) {
  if (!anchorEl?.getBoundingClientRect) return false

  const rect = anchorEl.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

export function StockItemMoreMenu({
  isOpen,
  onClose,
  anchorEl = null,
  itemName = 'product',
  onUsage,
  onAdjust,
  onEdit,
  onDuplicate,
  onHistory,
  onDeactivate,
}) {
  const panelRef = useRef(null)
  const [position, setPosition] = useState({ top: 0, left: 0, placement: 'below' })
  const [isMobileSheet, setIsMobileSheet] = useState(false)
  const [isPositioned, setIsPositioned] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setIsPositioned(false)
      return undefined
    }

    const mediaQuery = window.matchMedia(MOBILE_SHEET_QUERY)
    const updateMode = () => setIsMobileSheet(mediaQuery.matches)
    updateMode()
    mediaQuery.addEventListener('change', updateMode)

    return () => mediaQuery.removeEventListener('change', updateMode)
  }, [isOpen])

  useLayoutEffect(() => {
    if (!isOpen || isMobileSheet || !hasValidAnchorRect(anchorEl) || !panelRef.current) {
      setIsPositioned(false)
      return
    }

    const anchorRect = anchorEl.getBoundingClientRect()
    const { width, height } = panelRef.current.getBoundingClientRect()
    setPosition(computeMenuPosition(anchorRect, width, height))
    setIsPositioned(true)
  }, [anchorEl, isMobileSheet, isOpen, itemName])

  useEffect(() => {
    if (!isOpen) return undefined

    const handlePointerDown = (event) => {
      if (panelRef.current?.contains(event.target)) return
      if (anchorEl?.contains?.(event.target)) return
      onClose()
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    const handleReposition = () => {
      if (isMobileSheet || !hasValidAnchorRect(anchorEl) || !panelRef.current) return
      const anchorRect = anchorEl.getBoundingClientRect()
      const { width, height } = panelRef.current.getBoundingClientRect()
      setPosition(computeMenuPosition(anchorRect, width, height))
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown, { passive: true })
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleReposition)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleReposition)
    }
  }, [anchorEl, isMobileSheet, isOpen, onClose])

  useEffect(() => {
    if (!isOpen || !isMobileSheet) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isMobileSheet, isOpen])

  if (!isOpen || typeof document === 'undefined') return null
  if (!isMobileSheet && !hasValidAnchorRect(anchorEl)) return null

  const handlers = {
    usage: onUsage,
    adjust: onAdjust,
    edit: onEdit,
    duplicate: onDuplicate,
    history: onHistory,
    deactivate: onDeactivate,
  }

  const handleItemClick = (id) => {
    handlers[id]?.()
  }

  const isPopoverReady = isMobileSheet || isPositioned

  return createPortal(
    <>
      {isPopoverReady ? (
        <div
          className={`stock-item-more-menu-backdrop${isMobileSheet ? ' is-sheet' : ''}`}
          aria-hidden="true"
          onClick={onClose}
          style={{ zIndex: MENU_Z_INDEX - 1 }}
        />
      ) : null}
      <div
        ref={panelRef}
        className={`stock-item-more-menu-panel${isMobileSheet ? ' is-sheet' : ` is-popover is-${position.placement}`}${isPopoverReady ? ' is-visible' : ''}`}
        role="menu"
        aria-label={`More actions for ${itemName}`}
        style={isMobileSheet ? { zIndex: MENU_Z_INDEX } : {
          position: 'fixed',
          top: isPositioned ? `${position.top}px` : '-10000px',
          left: isPositioned ? `${position.left}px` : '-10000px',
          visibility: isPositioned ? 'visible' : 'hidden',
          zIndex: MENU_Z_INDEX,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {isMobileSheet ? (
          <header className="stock-item-more-menu-sheet-header">
            <span className="stock-item-more-menu-sheet-title">{itemName}</span>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close menu">✕</button>
          </header>
        ) : null}

        <div className="stock-item-more-menu-list">
          {MENU_ITEMS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className="stock-item-more-menu-btn"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation()
                handleItemClick(id)
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body,
  )
}
