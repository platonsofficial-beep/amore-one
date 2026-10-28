import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function FloorAreaSelect({
  zones = [],
  value = '',
  onChange,
  label = 'Restaurant area',
}) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const listId = useId()
  const active = zones.find((zone) => zone.id === value) ?? zones[0]

  useEffect(() => {
    if (!open) return undefined
    const place = () => {
      const button = buttonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const width = Math.max(rect.width, 180)
      const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8))
      const top = Math.min(rect.bottom + 6, Math.max(8, window.innerHeight - 280))
      setMenuStyle({ top, left, width })
    }
    place()
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointer = (event) => {
      if (buttonRef.current?.contains(event.target)) return
      if (menuRef.current?.contains(event.target)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('resize', place)
    }
  }, [open])

  return (
    <div className="floor-plan-area-select">
      <button
        ref={buttonRef}
        type="button"
        className="floor-plan-area-select-input"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="floor-plan-area-select-value">{active?.label || 'Area'}</span>
      </button>
      <span className="floor-plan-area-select-chevron" aria-hidden="true">▾</span>
      {open && menuStyle ? createPortal(
        <div
          ref={menuRef}
          id={listId}
          className="floor-plan-area-menu"
          role="listbox"
          aria-label={label}
          style={menuStyle}
        >
          {zones.map((zone) => (
            <button
              key={zone.id}
              type="button"
              role="option"
              aria-selected={zone.id === active?.id}
              className={zone.id === active?.id ? 'is-selected' : ''}
              onClick={() => {
                onChange?.(zone.id)
                setOpen(false)
              }}
            >
              {zone.label}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
