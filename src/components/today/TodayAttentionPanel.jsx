import { useMemo } from 'react'
import { groupTodayAttentionItems } from '../../lib/todayAttentionPresentationUtils'
import { TodayAttentionListItem } from './TodayAttentionListItem'

export function TodayAttentionPanel({
  attentionItems = [],
  attentionPermissions = {},
  onAttentionItemClick,
  showReservationAttention = false,
  showStockAttention = false,
  showTasksAttention = false,
  showScheduleAttention = false,
  onViewReservations,
  onViewStock,
  onViewTasks,
  onViewSchedule,
}) {
  const groups = useMemo(
    () => groupTodayAttentionItems(attentionItems),
    [attentionItems],
  )

  const showAttentionActions = showReservationAttention
    || showStockAttention
    || showTasksAttention
    || showScheduleAttention

  if (attentionItems.length === 0) {
    return (
      <p className="today-empty-note today-empty-note-clear">
        Nothing needs your attention right now.
      </p>
    )
  }

  return (
    <div className="today-attention-panel">
      <div className="today-attention-groups" aria-label="Attention groups">
        {groups.map((group) => (
          <section
            key={group.id}
            className={`today-attention-group accent-${group.accent}`}
            aria-label={group.title}
          >
            <header className="today-attention-group-header">
              <span className="today-attention-group-icon" aria-hidden="true">{group.icon}</span>
              <h4 className="today-attention-group-title">{group.title}</h4>
            </header>

            <ul className="today-attention-group-list">
              {group.items.map((item) => (
                <TodayAttentionListItem
                  key={item.key}
                  item={item}
                  attentionPermissions={attentionPermissions}
                  onAttentionItemClick={onAttentionItemClick}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {showAttentionActions ? (
        <div className="today-attention-actions" aria-label="Attention quick filters">
          {showReservationAttention ? (
            <button type="button" className="today-attention-pill" onClick={onViewReservations}>
              Reservations
            </button>
          ) : null}
          {showStockAttention ? (
            <button type="button" className="today-attention-pill" onClick={onViewStock}>
              Stock
            </button>
          ) : null}
          {showTasksAttention ? (
            <button type="button" className="today-attention-pill" onClick={onViewTasks}>
              Tasks
            </button>
          ) : null}
          {showScheduleAttention ? (
            <button type="button" className="today-attention-pill" onClick={onViewSchedule}>
              Schedule
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
