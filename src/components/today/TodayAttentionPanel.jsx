import { useMemo } from 'react'
import { groupTodayAttentionItems } from '../../lib/todayAttentionPresentationUtils'
import { TodayAttentionListItem } from './TodayAttentionListItem'
import { t } from '../../i18n/i18n'

export function TodayAttentionPanel({
  attentionItems = [],
  attentionPermissions = {},
  onAttentionItemClick,
  onCompleteAttentionItem,
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
        {t("Nothing needs your attention right now.")}
      </p>
    )
  }

  return (
    <div className="today-attention-panel">
      <div className="today-attention-groups" aria-label={t("Attention groups")}>
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
                  onCompleteAttentionItem={onCompleteAttentionItem}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {showAttentionActions ? (
        <div className="today-attention-actions" aria-label={t("Attention quick filters")}>
          {showReservationAttention ? (
            <button type="button" className="today-attention-pill" onClick={onViewReservations}>
              {t("Reservations")}
            </button>
          ) : null}
          {showStockAttention ? (
            <button type="button" className="today-attention-pill" onClick={onViewStock}>
              {t("Stock")}
            </button>
          ) : null}
          {showTasksAttention ? (
            <button type="button" className="today-attention-pill" onClick={onViewTasks}>
              {t("Tasks")}
            </button>
          ) : null}
          {showScheduleAttention ? (
            <button type="button" className="today-attention-pill" onClick={onViewSchedule}>
              {t("Schedule")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
