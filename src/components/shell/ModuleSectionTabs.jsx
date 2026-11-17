import { useEffect, useRef } from 'react'
import { t } from '../../i18n/i18n'

export function tabRowOverflows(nav) {
  if (!nav) return false
  return nav.scrollWidth > nav.clientWidth + 1
}

export function ModuleSectionTabs({
  sections,
  activeSection,
  onSectionChange,
  ariaLabel = 'Module sections',
  helpPrefix = '',
}) {
  const navRef = useRef(null)

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return undefined
    const update = () => {
      if (tabRowOverflows(nav)) nav.setAttribute('data-overflow', 'true')
      else nav.removeAttribute('data-overflow')
    }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(nav)
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [sections, activeSection])

  if (!sections?.length || sections.length < 2) return null

  return (
    <nav ref={navRef} className="module-section-tabs" aria-label={ariaLabel}>
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          className={`module-section-tab${activeSection === section.id ? ' active' : ''}`}
          data-help={helpPrefix ? `${helpPrefix}.${section.id}` : undefined}
          data-help-nav={helpPrefix ? '' : undefined}
          onClick={() => onSectionChange(section.id)}
          aria-current={activeSection === section.id ? 'page' : undefined}
        >
          {t(section.label)}
        </button>
      ))}
    </nav>
  )
}
