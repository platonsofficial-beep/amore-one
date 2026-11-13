import { useEffect } from 'react'
import { t } from '../../i18n/i18n'

export function ManagerMoreSheet({
  isOpen = false,
  items = [],
  onClose,
  onSelect,
}) {
  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose?.()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="manager-more-sheet" role="presentation">
      <button type="button" className="manager-more-backdrop" aria-label={t("Close more")} onClick={onClose} />
      <section className="manager-more-card" role="dialog" aria-modal="true" aria-labelledby="manager-more-title">
        <header className="manager-more-header">
          <h2 id="manager-more-title">{t("More")}</h2>
          <button type="button" className="manager-more-close" onClick={onClose} aria-label={t("Close")}>
            ×
          </button>
        </header>
        <ul className="manager-more-list">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`manager-more-item${item.tone === 'danger' ? ' is-danger' : ''}`}
                onClick={() => onSelect?.(item.id)}
              >
                <span className="manager-more-item-icon" aria-hidden="true">{item.icon}</span>
                <span className="manager-more-item-copy">
                  <strong>{t(item.label)}</strong>
                  {item.subtitle ? <span>{t(item.subtitle)}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
