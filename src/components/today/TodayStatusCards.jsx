import { useMemo } from 'react'
import { buildTodayStatusCardsFromSummary } from '../../lib/todayStatusPresentationUtils'
import { areaStatus, loadAreaForCard } from '../../lib/loadStatus'
import { PendingValue } from '../common/DataPending'
import { t } from '../../i18n/i18n'

function TodayStatusCard({ card, status = 'ready', onSelect, onRetry, selectable = true }) {
  const isReady = status === 'ready'
  const interactive = status === 'error' ? typeof onRetry === 'function' : selectable && typeof onSelect === 'function'
  const Tag = interactive ? 'button' : 'div'
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      className={`today-status-premium-card tone-${isReady ? (card.tone ?? 'default') : 'default'}${isReady ? '' : ` is-${status}`}${interactive ? '' : ' is-static'}`}
      aria-busy={status === 'loading' ? 'true' : undefined}
      onClick={interactive ? () => (status === 'error' ? onRetry?.() : onSelect?.(card.id)) : undefined}
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
    </Tag>
  )
}

export function TodayStatusCards({ statusSummary = {}, showStock = false, onSelect, canSelectCard, dataStatus = null, onRetryData }) {
  const cards = useMemo(
    () => buildTodayStatusCardsFromSummary(statusSummary, { showStock }),
    [statusSummary, showStock],
  )

  return (
    <section className="today-status-premium-grid" aria-label={t("Business status")}>
      {cards.map((card) => (
        <TodayStatusCard
          key={card.id}
          card={card}
          status={areaStatus(dataStatus, loadAreaForCard(card.id))}
          onSelect={onSelect}
          selectable={typeof canSelectCard === 'function' ? canSelectCard(card.id) : true}
          onRetry={() => onRetryData?.(loadAreaForCard(card.id))}
        />
      ))}
    </section>
  )
}
