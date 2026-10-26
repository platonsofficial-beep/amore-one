import { useMemo } from 'react'
import { buildTodayStatusCardsFromSummary } from '../../lib/todayStatusPresentationUtils'

function TodayStatusCard({ card, onSelect }) {
  return (
    <button
      type="button"
      className={`today-status-premium-card tone-${card.tone ?? 'default'}`}
      onClick={() => onSelect?.(card.id)}
    >
      <div className="today-status-premium-icon" aria-hidden="true">{card.icon}</div>
      <div className="today-status-premium-copy">
        <p className="today-status-premium-title">{card.title}</p>
        <p className="today-status-premium-primary">{card.primary}</p>
        {card.secondary ? (
          <p className="today-status-premium-secondary">{card.secondary}</p>
        ) : null}
      </div>
    </button>
  )
}

export function TodayStatusCards({ statusSummary = {}, showStock = false, onSelect }) {
  const cards = useMemo(
    () => buildTodayStatusCardsFromSummary(statusSummary, { showStock }),
    [statusSummary, showStock],
  )

  return (
    <section className="today-status-premium-grid" aria-label="Business status">
      {cards.map((card) => (
        <TodayStatusCard key={card.id} card={card} onSelect={onSelect} />
      ))}
    </section>
  )
}
