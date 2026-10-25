import { useEffect, useRef, useState } from 'react'
import { ModuleSectionTabs } from './ModuleSectionTabs'

export function StockSectionNav({
  primary = [],
  overflow = [],
  activeSection,
  onSectionChange,
}) {
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const moreRef = useRef(null)
  const overflowActive = overflow.some((section) => section.id === activeSection)

  useEffect(() => {
    if (!isMoreOpen) return undefined

    const handlePointerDown = (event) => {
      if (!moreRef.current?.contains(event.target)) setIsMoreOpen(false)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsMoreOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMoreOpen])

  if (!overflow.length) {
    return (
      <ModuleSectionTabs
        sections={primary}
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        ariaLabel="Stock sections"
      />
    )
  }

  return (
    <div className="stock-section-nav">
      <ModuleSectionTabs
        sections={primary}
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        ariaLabel="Stock sections"
      />
      <div className="stock-section-more" ref={moreRef}>
        <button
          type="button"
          className={`module-section-tab stock-section-more-btn${overflowActive ? ' active' : ''}`}
          aria-haspopup="menu"
          aria-expanded={isMoreOpen}
          aria-controls="stock-section-more-menu"
          data-testid="stock-section-more"
          onClick={() => setIsMoreOpen((open) => !open)}
        >
          More
        </button>
        {isMoreOpen ? (
          <div
            id="stock-section-more-menu"
            className="stock-section-more-menu"
            role="menu"
            aria-label="More stock sections"
          >
            {overflow.map((section) => (
              <button
                key={section.id}
                type="button"
                role="menuitem"
                className={`stock-section-more-item${activeSection === section.id ? ' active' : ''}`}
                aria-current={activeSection === section.id ? 'page' : undefined}
                onClick={() => {
                  onSectionChange(section.id)
                  setIsMoreOpen(false)
                }}
              >
                {section.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
