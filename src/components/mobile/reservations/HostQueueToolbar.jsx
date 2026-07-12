import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HOST_QUEUE_FILTER_MENU_SECTIONS } from '../../../lib/hostQueuePipeline'

const MENU_MARGIN = 8
const MENU_Z_INDEX = 11990

function computeMenuPosition(anchorRect, menuWidth, menuHeight) {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let left = anchorRect.left
  let top = anchorRect.bottom + MENU_MARGIN

  if (left + menuWidth > viewportWidth - MENU_MARGIN) {
    left = Math.max(MENU_MARGIN, anchorRect.right - menuWidth)
  }
  left = Math.max(MENU_MARGIN, left)

  if (top + menuHeight > viewportHeight - MENU_MARGIN) {
    top = Math.max(MENU_MARGIN, anchorRect.top - menuHeight - MENU_MARGIN)
  }
  top = Math.max(MENU_MARGIN, top)

  return { top, left }
}

function HostQueueToolbarMenu({
  label,
  ariaLabel,
  options = [],
  sections = null,
  selectedId = null,
  selectedIds = [],
  onSelect,
  onToggle,
  multiSelect = false,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState(null)
  const buttonRef = useRef(null)
  const panelRef = useRef(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [isPositioned, setIsPositioned] = useState(false)

  useLayoutEffect(() => {
    if (!isOpen || !anchorRect || !panelRef.current) {
      setIsPositioned(false)
      return
    }

    const { width, height } = panelRef.current.getBoundingClientRect()
    setPosition(computeMenuPosition(anchorRect, width, height))
    setIsPositioned(true)
  }, [anchorRect, isOpen, options.length, sections, selectedId, selectedIds.join('|')])

  const renderMenuOption = (option) => {
    const isSelected = multiSelect
      ? selectedIds.includes(option.id)
      : selectedId === option.id

    return (
      <li key={option.id}>
        <button
          type="button"
          role="option"
          aria-selected={isSelected}
          className={`host-queue-toolbar-menu-item${isSelected ? ' is-selected' : ''}`}
          onClick={() => {
            if (multiSelect) {
              onToggle?.(option.id)
              return
            }
            onSelect?.(option.id)
            setIsOpen(false)
          }}
        >
          <span>{option.label}</span>
          {isSelected ? <span aria-hidden="true">✓</span> : null}
        </button>
      </li>
    )
  }

  const menuOptions = sections ?? [{ options }]

  useEffect(() => {
    if (!isOpen) return undefined

    const handlePointerDown = (event) => {
      if (panelRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) {
        return
      }
      setIsOpen(false)
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleOpen = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setAnchorRect(rect)
    setIsOpen((current) => !current)
  }

  const menu = isOpen ? createPortal(
    <div
      ref={panelRef}
      className={`host-queue-toolbar-menu${isPositioned ? ' is-visible' : ''}`}
      style={{ top: position.top, left: position.left, zIndex: MENU_Z_INDEX }}
      role="dialog"
      aria-label={ariaLabel}
    >
      <ul className="host-queue-toolbar-menu-list" role="listbox" aria-label={ariaLabel}>
        {menuOptions.map((section, index) => (
          <li
            key={section.label ?? `section-${index}`}
            className={`host-queue-toolbar-menu-section${section.label ? ' has-label' : ''}`}
          >
            {section.label ? (
              <p className="host-queue-toolbar-menu-section-label">{section.label}</p>
            ) : null}
            <ul className="host-queue-toolbar-menu-section-list">
              {section.options.map((option) => renderMenuOption(option))}
            </ul>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`host-queue-toolbar-btn${isOpen ? ' is-open' : ''}`}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={handleOpen}
      >
        {label}
        <span aria-hidden="true"> ▾</span>
      </button>
      {menu}
    </>
  )
}

export function HostQueueToolbar({
  areaOptions = [],
  areaFilterId,
  onAreaFilterChange,
  activeFilterIds = [],
  onToggleFilter,
  onClearFilters,
  sortId,
  onSortChange,
  sortOptions = [],
}) {
  const activeFilterCount = activeFilterIds.filter((entry) => entry && entry !== 'all').length
  const selectedArea = areaOptions.find((entry) => entry.id === areaFilterId)
  const selectedSort = sortOptions.find((entry) => entry.id === sortId)

  return (
    <div className="host-queue-toolbar" role="toolbar" aria-label="Host queue filters">
      <HostQueueToolbarMenu
        label={`Area · ${selectedArea?.label ?? 'All areas'}`}
        ariaLabel="Area filter"
        options={areaOptions}
        selectedId={areaFilterId}
        onSelect={onAreaFilterChange}
      />
      <HostQueueToolbarMenu
        label={activeFilterCount > 0 ? `Filter · ${activeFilterCount}` : 'Filter'}
        ariaLabel="Operational filters"
        sections={HOST_QUEUE_FILTER_MENU_SECTIONS}
        selectedIds={activeFilterIds}
        onToggle={onToggleFilter}
        multiSelect
      />
      <HostQueueToolbarMenu
        label={`Sort · ${selectedSort?.label ?? 'Time'}`}
        ariaLabel="Sort reservations"
        options={sortOptions}
        selectedId={sortId}
        onSelect={onSortChange}
      />
      {activeFilterCount > 0 ? (
        <button
          type="button"
          className="host-queue-toolbar-clear"
          onClick={onClearFilters}
        >
          Clear filters
        </button>
      ) : null}
    </div>
  )
}
