import { useMemo } from 'react'
import { buildTodayStatusCardsFromSummary } from '../../lib/todayStatusPresentationUtils'
import { areaStatus, loadAreaForCard } from '../../lib/loadStatus'
import { PendingValue } from '../common/DataPending'

function TodayStatusCard({ card, status = 'ready', onSelect, onRetry }) {
  const isReady = status === 'ready'
  return (
    <button
      type="button"
      className={`today-status-premium-card tone-${isReady ? (card.tone ?? 'default') : 'default'}${isReady ? '' : ` is-${status}`}`}
      aria-busy={status === 'loading' ? 'true' : undefined}
      onClick={() => (status === 'error' ? onRetry?.() : onSelect?.(card.id))}
    >
      <div className="today-status-premium-icon" aria-hidden="true">{card.icon}</div>
      <div className="today-status-premium-copy">
        <p className="today-status-premium-title">{card.title}</p>
        {isReady ? (
          <>
            <p className="today-status-premium-primary">{card.primary}</p>
            {card.secondary ? (
              <p className="today-status-premium-secondary">{card.secondary}</p>
            ) : null}
          </>
        ) : (
          <div className="today-status-premium-primary">
            <PendingValue status={status} lines={2} insideButton />
          </div>
        )}
      </div>
    </button>
  )
}

export function TodayStatusCards({ statusSummary = {}, showStock = false, onSelect, dataStatus = null, onRetryData }) {
  const cards = useMemo(
    () => buildTodayStatusCardsFromSummary(statusSummary, { showStock }),
    [statusSummary, showStock],
  )

  return (
    <section className="today-status-premium-grid" aria-label="Business status">
      {cards.map((card) => (
        <TodayStatusCard
          key={card.id}
          card={card}
          status={areaStatus(dataStatus, loadAreaForCard(card.id))}
          onSelect={onSelect}
          onRetry={() => onRetryData?.(loadAreaForCard(card.id))}
        />
      ))}
    </section>
  )
}
