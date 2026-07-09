import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  filterPhoneCountries,
  findPhoneCountryByCode,
  sortPhoneCountriesForDisplay,
} from '../../lib/phoneCountries'
import './phoneCountryPicker.css'

const PICKER_Z_INDEX = 12150
const MOBILE_SHEET_BREAKPOINT = 760

function usePhoneCountrySheetMode() {
  const [useSheet, setUseSheet] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_SHEET_BREAKPOINT}px)`)
    const update = () => setUseSheet(mediaQuery.matches)
    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  return useSheet
}

function computeDropdownPosition(anchorRect) {
  const viewportPadding = 12
  const menuWidth = Math.min(360, window.innerWidth - viewportPadding * 2)
  const maxHeight = Math.min(420, window.innerHeight - viewportPadding * 2)
  const preferredLeft = anchorRect.left
  const maxLeft = window.innerWidth - menuWidth - viewportPadding
  const left = Math.max(viewportPadding, Math.min(preferredLeft, maxLeft))
  const preferredTop = anchorRect.bottom + 8
  const maxTop = window.innerHeight - maxHeight - viewportPadding
  const top = Math.min(preferredTop, maxTop)

  return { top, left, width: menuWidth, maxHeight }
}

function PhoneCountryOptions({
  countries,
  selectedCode,
  onSelect,
  searchQuery,
  onSearchChange,
  listId,
  searchId,
}) {
  return (
    <>
      <div className="phone-country-picker-search-wrap">
        <input
          id={searchId}
          type="search"
          className="phone-country-picker-search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search country or code"
          autoComplete="off"
          enterKeyHint="search"
        />
      </div>

      <ul id={listId} className="phone-country-picker-list" role="listbox">
        {countries.length === 0 ? (
          <li className="phone-country-picker-empty" role="presentation">
            No countries found
          </li>
        ) : countries.map((country) => (
          <li key={`${country.iso2}-${country.code}`} role="presentation">
            <button
              type="button"
              className={`phone-country-picker-option${selectedCode === country.code ? ' is-selected' : ''}`}
              role="option"
              aria-selected={selectedCode === country.code}
              onClick={() => onSelect(country.code)}
            >
              <span className="phone-country-picker-option-flag" aria-hidden="true">{country.flag}</span>
              <span className="phone-country-picker-option-copy">
                <span className="phone-country-picker-option-name">{country.name}</span>
                <span className="phone-country-picker-option-code">{country.code}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

export function PhoneCountryPicker({
  value,
  onChange,
  disabled = false,
  className = 'phone-country-picker',
  ariaLabel = 'Phone country code',
}) {
  const generatedId = useId()
  const listId = `${generatedId}-list`
  const searchId = `${generatedId}-search`
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [menuPosition, setMenuPosition] = useState(null)
  const useSheet = usePhoneCountrySheetMode()

  const selectedCountry = findPhoneCountryByCode(value)
  const filteredCountries = useMemo(
    () => sortPhoneCountriesForDisplay(filterPhoneCountries(searchQuery), value),
    [searchQuery, value],
  )

  const closePicker = () => {
    setIsOpen(false)
    setSearchQuery('')
  }

  const openPicker = () => {
    if (disabled) return
    setIsOpen(true)
  }

  const handleSelect = (nextCode) => {
    onChange?.(nextCode)
    closePicker()
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!isOpen || useSheet) return undefined

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
  }, [isOpen, useSheet])

  useEffect(() => {
    if (!isOpen) return undefined

    const handlePointerDown = (event) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('.phone-country-picker-portal')) return
      closePicker()
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') closePicker()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined

    const focusTimer = window.setTimeout(() => {
      document.getElementById(searchId)?.focus()
    }, 0)

    return () => window.clearTimeout(focusTimer)
  }, [isOpen, searchId])

  const triggerLabel = selectedCountry
    ? `${selectedCountry.flag} ${selectedCountry.code}`
    : '🏳️ +---'

  const portal = isOpen && typeof document !== 'undefined'
    ? createPortal(
      useSheet ? (
        <div className="phone-country-picker-portal is-sheet">
          <button
            type="button"
            className="phone-country-picker-backdrop"
            aria-label="Close country picker"
            onClick={closePicker}
          />
          <div className="phone-country-picker-sheet" role="dialog" aria-modal="true" aria-label="Choose country code">
            <header className="phone-country-picker-sheet-header">
              <h3>Country code</h3>
              <button type="button" className="phone-country-picker-close" onClick={closePicker} aria-label="Close">
                ✕
              </button>
            </header>
            <PhoneCountryOptions
              countries={filteredCountries}
              selectedCode={value}
              onSelect={handleSelect}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              listId={listId}
              searchId={searchId}
            />
          </div>
        </div>
      ) : (
        <div
          className="phone-country-picker-portal is-dropdown"
          style={{
            position: 'fixed',
            top: `${menuPosition?.top ?? 0}px`,
            left: `${menuPosition?.left ?? 0}px`,
            width: `${menuPosition?.width ?? 360}px`,
            zIndex: PICKER_Z_INDEX,
          }}
        >
          <div
            className="phone-country-picker-menu"
            style={{ maxHeight: `${menuPosition?.maxHeight ?? 420}px` }}
            role="dialog"
            aria-label="Choose country code"
          >
            <PhoneCountryOptions
              countries={filteredCountries}
              selectedCode={value}
              onSelect={handleSelect}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              listId={listId}
              searchId={searchId}
            />
          </div>
        </div>
      ),
      document.body,
    )
    : null

  return (
    <div className={className} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${className}-trigger`}
        onClick={() => (isOpen ? closePicker() : openPicker())}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
      >
        <span className={`${className}-trigger-label`}>{triggerLabel}</span>
        <span className={`${className}-trigger-chevron`} aria-hidden="true">▾</span>
      </button>
      {portal}
    </div>
  )
}
