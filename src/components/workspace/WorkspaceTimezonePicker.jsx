import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  buildTimezonePickerSections,
  flattenTimezonePickerSections,
  getTimezoneOptionLabel,
  getTimezonePickerValueForSelection,
  resolveTimezoneDisplay,
  searchTimezoneOptions,
} from '../../lib/workspaceTimezoneUtils'
import './workspaceTimezonePicker.css'

const PICKER_Z_INDEX = 12140

function computeDropdownPosition(anchorRect) {
  const viewportPadding = 12
  const menuWidth = Math.min(420, window.innerWidth - viewportPadding * 2)
  const maxHeight = Math.min(460, window.innerHeight - viewportPadding * 2)
  const preferredLeft = anchorRect.left
  const maxLeft = window.innerWidth - menuWidth - viewportPadding
  const left = Math.max(viewportPadding, Math.min(preferredLeft, maxLeft))
  const preferredTop = anchorRect.bottom + 8
  const maxTop = window.innerHeight - maxHeight - viewportPadding
  const top = Math.min(preferredTop, Math.max(viewportPadding, maxTop))

  return { top, left, width: menuWidth, maxHeight }
}

function TimezoneOptionButton({
  option,
  isSelected,
  isHighlighted,
  onSelect,
  onHighlight,
  optionId,
}) {
  const primary = getTimezoneOptionLabel(option)
  const subtitle = option.subtitle ? (
    <span className="workspace-timezone-picker-option-subtitle">{option.subtitle}</span>
  ) : null

  return (
    <li role="presentation">
      <button
        id={optionId}
        type="button"
        className={`workspace-timezone-picker-option${isSelected ? ' is-selected' : ''}${isHighlighted ? ' is-highlighted' : ''}`}
        role="option"
        aria-selected={isSelected}
        onMouseEnter={onHighlight}
        onClick={() => onSelect(option)}
      >
        <span className="workspace-timezone-picker-option-primary">
          {primary}
          {subtitle}
        </span>
        <span className="workspace-timezone-picker-option-secondary">{option.secondaryLabel}</span>
      </button>
    </li>
  )
}

function TimezonePickerPanel({
  sections,
  flatOptions,
  selectedValue,
  highlightedIndex,
  onHighlight,
  onSelect,
  searchQuery,
  onSearchChange,
  searchId,
  listId,
  isSearching,
}) {
  return (
    <>
      <div className="workspace-timezone-picker-search-wrap">
        <input
          id={searchId}
          type="search"
          className="workspace-timezone-picker-search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search city, country, or timezone"
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>

      <div className="workspace-timezone-picker-scroll">
        {isSearching ? (
          <ul id={listId} className="workspace-timezone-picker-list" role="listbox" aria-label="Timezone search results">
            {flatOptions.length === 0 ? (
              <li className="workspace-timezone-picker-empty" role="presentation">No timezones found</li>
            ) : flatOptions.map((option, index) => (
              <TimezoneOptionButton
                key={`${option.value}-${option.kind ?? 'search'}-${index}`}
                option={option}
                optionId={`${listId}-option-${index}`}
                isSelected={option.value === selectedValue || (option.kind === 'browser-default' && !selectedValue)}
                isHighlighted={highlightedIndex === index}
                onHighlight={() => onHighlight(index)}
                onSelect={onSelect}
              />
            ))}
          </ul>
        ) : (
          <div id={listId} role="listbox" aria-label="Timezone options">
            {sections.map((section) => (
              <section key={section.id} className="workspace-timezone-picker-group" aria-label={section.label}>
                <p className="workspace-timezone-picker-group-label">{section.label}</p>
                <ul className="workspace-timezone-picker-list">
                  {section.options.map((option) => {
                    const flatIndex = flatOptions.findIndex((entry) => (
                      entry.value === option.value && entry.kind === option.kind
                    ))
                    const isSelected = option.kind === 'browser-default'
                      ? !selectedValue
                      : option.value === selectedValue

                    return (
                      <TimezoneOptionButton
                        key={`${section.id}-${option.kind ?? 'option'}-${option.value}`}
                        option={option}
                        optionId={`${listId}-option-${flatIndex}`}
                        isSelected={isSelected}
                        isHighlighted={highlightedIndex === flatIndex}
                        onHighlight={() => onHighlight(flatIndex)}
                        onSelect={onSelect}
                      />
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export function WorkspaceTimezonePicker({
  value,
  onChange,
  disabled = false,
  countryCode = '',
  countryName = '',
  city = '',
}) {
  const generatedId = useId()
  const listId = `${generatedId}-list`
  const searchId = `${generatedId}-search`
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [menuPosition, setMenuPosition] = useState(null)

  const display = useMemo(() => resolveTimezoneDisplay(value), [value])

  const sections = useMemo(() => buildTimezonePickerSections({
    savedValue: value,
    countryCode,
    countryName,
    city,
  }), [city, countryCode, countryName, value])

  const searchResults = useMemo(
    () => searchTimezoneOptions(searchQuery),
    [searchQuery],
  )

  const isSearching = Boolean(`${searchQuery}`.trim())
  const flatOptions = useMemo(
    () => (isSearching ? searchResults : flattenTimezonePickerSections(sections)),
    [isSearching, searchResults, sections],
  )

  const closePicker = () => {
    setIsOpen(false)
    setSearchQuery('')
    setHighlightedIndex(0)
  }

  const openPicker = () => {
    if (disabled) return
    setIsOpen(true)
  }

  const handleSelect = (option) => {
    onChange?.(getTimezonePickerValueForSelection(option))
    closePicker()
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!isOpen) return undefined

    const updatePosition = () => {
      if (!triggerRef.current) return
      setMenuPosition(computeDropdownPosition(triggerRef.current.getBoundingClientRect()))
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined

    const handlePointerDown = (event) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('.workspace-timezone-picker-portal')) return
      closePicker()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined

    const focusTimer = window.setTimeout(() => {
      document.getElementById(searchId)?.focus()
    }, 0)

    return () => window.clearTimeout(focusTimer)
  }, [isOpen, searchId])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [searchQuery, isOpen])

  const handleTriggerKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (isOpen) return
      openPicker()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!isOpen) {
        openPicker()
      }
    }
  }

  const handlePanelKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePicker()
      triggerRef.current?.focus()
      return
    }

    if (!flatOptions.length) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((current) => (current + 1) % flatOptions.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((current) => (
        current <= 0 ? flatOptions.length - 1 : current - 1
      ))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const option = flatOptions[highlightedIndex]
      if (option) handleSelect(option)
    }
  }

  const portal = isOpen && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="workspace-timezone-picker-portal is-dropdown"
        style={{
          position: 'fixed',
          top: `${menuPosition?.top ?? 0}px`,
          left: `${menuPosition?.left ?? 0}px`,
          width: `${menuPosition?.width ?? 420}px`,
          zIndex: PICKER_Z_INDEX,
        }}
        onKeyDown={handlePanelKeyDown}
      >
        <div
          className="workspace-timezone-picker-menu"
          style={{ maxHeight: `${menuPosition?.maxHeight ?? 460}px` }}
          role="dialog"
          aria-label="Choose timezone"
        >
          <TimezonePickerPanel
            sections={sections}
            flatOptions={flatOptions}
            selectedValue={value}
            highlightedIndex={highlightedIndex}
            onHighlight={setHighlightedIndex}
            onSelect={handleSelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchId={searchId}
            listId={listId}
            isSearching={isSearching}
          />
        </div>
      </div>,
      document.body,
    )
    : null

  return (
    <div className="workspace-timezone-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="workspace-timezone-picker-trigger"
        onClick={() => (isOpen ? closePicker() : openPicker())}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        disabled={disabled}
      >
        <span className="workspace-timezone-picker-trigger-copy">
          <span className="workspace-timezone-picker-trigger-primary">{display.cityLabel}</span>
          <span className="workspace-timezone-picker-trigger-secondary">{display.secondaryLabel}</span>
        </span>
        <span className="workspace-timezone-picker-trigger-chevron" aria-hidden="true">▾</span>
      </button>
      <small className="workspace-timezone-picker-hint">
        Used for reservations, schedules, reports, and opening hours.
      </small>
      {portal}
    </div>
  )
}
