import { useMemo, useState } from 'react'
import {
  buildManagerMobileAttentionItems,
  buildManagerMobileStockStatusLine,
  sortManagerMobileAttentionFeed,
} from '../../lib/mobileManagerTodayUtils'
import { TodayAnnouncementsPanel } from '../today/TodayAnnouncementsPanel'

const ATTENTION_PREVIEW_LIMIT = 3

function getAttentionCategory(item) {
  const key = `${item?.key ?? ''}`

  if (key === 'schedule-issues' || key.startsWith('schedule')) {
    return 'schedule'
  }

  if (key.startsWith('task:')) {
    return 'task'
  }

  return 'stock'
}

function MobileManagerStatusCard({ label, value, tone = 'default', onClick }) {
  const isInteractive = typeof onClick === 'function'
  const Tag = isInteractive ? 'button' : 'div'

  return (
    <Tag
      type={isInteractive ? 'button' : undefined}
      className={`mobile-manager-status-card tone-${tone}${isInteractive ? ' is-tappable' : ''}`}
      onClick={onClick}
    >
      <span className="mobile-manager-status-label">{label}</span>
      <strong className="mobile-manager-status-value">{value}</strong>
      {isInteractive ? <span className="mobile-manager-status-chevron" aria-hidden="true">›</span> : null}
    </Tag>
  )
}

function MobileManagerAttentionItem({ item }) {
  const category = getAttentionCategory(item)

  return (
    <li className={`mobile-manager-attention-item tone-${item.tone} category-${category}`}>
      <span className="mobile-manager-attention-rank" aria-hidden="true" />
      <div className="mobile-manager-attention-copy">
        <strong>{item.label}</strong>
        <span>{item.detail}</span>
      </div>
    </li>
  )
}

export function MobileManagerHomeView({
  venueName = '',
  greeting = '',
  dateLabel = '',
  roleLabel = '',
  statusSummary = {},
  attentionItems = [],
  stockSummary = null,
  stockOrdersSummary = null,
  hasStockModuleData = false,
  isReservationsConnected = false,
  isTasksConnected = false,
  canOpenStock = false,
  canOpenTasks = false,
  canOpenTeam = false,
  canOpenReservations = false,
  canReceiveDeliveries = false,
  announcements = [],
  announcementRole = '',
  announcementEmployeeDepartment = '',
  isAnnouncementsSaving = false,
  onMarkAnnouncementSeen,
  onOpenStock,
  onReceiveDeliveries,
  onOpenTasks,
  onOpenTeamToday,
  onOpenReservations,
}) {
  const [showAllAttention, setShowAllAttention] = useState(false)

  const mergedAttentionItems = useMemo(() => {
    const merged = buildManagerMobileAttentionItems({
      attentionItems,
      stockOrdersSummary,
      stockSummary,
      hasStockModuleData,
    })

    return sortManagerMobileAttentionFeed(merged)
  }, [attentionItems, stockOrdersSummary, stockSummary, hasStockModuleData])

  const stockStatusLine = useMemo(
    () => buildManagerMobileStockStatusLine(stockSummary, stockOrdersSummary),
    [stockSummary, stockOrdersSummary],
  )

  const showStockStatus = canOpenStock && (hasStockModuleData || stockOrdersSummary?.pendingCount > 0)
  const pendingDeliveries = (Number(stockOrdersSummary?.awaitingDeliveryCount) || 0)
    + (Number(stockOrdersSummary?.partialCount) || 0)
  const hasQuickActions = canOpenStock || (canReceiveDeliveries && pendingDeliveries > 0) || canOpenTasks || canOpenTeam || canOpenReservations

  const visibleAttentionItems = showAllAttention
    ? mergedAttentionItems
    : mergedAttentionItems.slice(0, ATTENTION_PREVIEW_LIMIT)
  const hiddenAttentionCount = Math.max(0, mergedAttentionItems.length - ATTENTION_PREVIEW_LIMIT)
  const workspaceContext = [venueName, roleLabel].filter(Boolean).join(' · ')

  return (
    <div className="mobile-screen mobile-home mobile-manager-home">
      <header className="mobile-manager-home-header">
        <p className="mobile-manager-home-date">{dateLabel}</p>
        <h1 className="mobile-manager-home-greeting">{greeting || 'Welcome'}</h1>
        {workspaceContext ? (
          <p className="mobile-manager-home-context">{workspaceContext}</p>
        ) : null}
      </header>

      <section className="mobile-manager-panel mobile-manager-overview-section" aria-label="Today overview">
        <div className="mobile-manager-section-heading">
          <p className="mobile-manager-section-title">Today overview</p>
        </div>
        <div className="mobile-manager-status-grid">
          <MobileManagerStatusCard
            label="On shift"
            value={statusSummary.onShiftSummary || '—'}
          />
          <MobileManagerStatusCard
            label="Team"
            value={statusSummary.teamScheduledSummary || '—'}
            onClick={canOpenTeam ? onOpenTeamToday : undefined}
          />
          {isReservationsConnected ? (
            <MobileManagerStatusCard
              label="Reservations"
              value={statusSummary.reservationsSummaryLine || '—'}
              onClick={canOpenReservations ? onOpenReservations : undefined}
            />
          ) : null}
          {isTasksConnected ? (
            <MobileManagerStatusCard
              label="Tasks"
              value={statusSummary.tasksSummary || '—'}
              onClick={canOpenTasks ? onOpenTasks : undefined}
            />
          ) : null}
          {showStockStatus ? (
            <MobileManagerStatusCard
              label="Stock"
              value={stockStatusLine}
              tone={
                (stockSummary?.outOfStock ?? 0) > 0
                  ? 'critical'
                  : (stockSummary?.lowStock ?? 0) > 0 || (stockOrdersSummary?.pendingCount ?? 0) > 0
                    ? 'warning'
                    : 'default'
              }
              onClick={canOpenStock ? onOpenStock : undefined}
            />
          ) : null}
        </div>
      </section>

      {hasQuickActions ? (
        <section className="mobile-manager-panel mobile-manager-actions-section" aria-label="Quick actions">
          <div className="mobile-manager-section-heading">
            <p className="mobile-manager-section-title">Quick actions</p>
          </div>
          <div className="mobile-manager-actions">
            {canReceiveDeliveries && pendingDeliveries > 0 ? (
              <button
                type="button"
                className="mobile-manager-action-btn mobile-manager-action-btn-primary mobile-manager-action-btn-featured"
                onClick={onReceiveDeliveries}
              >
                Receive deliveries
              </button>
            ) : null}
            <div className="mobile-manager-actions-grid">
              {canOpenReservations ? (
                <button type="button" className="mobile-manager-action-btn" onClick={onOpenReservations}>
                  Reservations
                </button>
              ) : null}
              {canOpenTasks ? (
                <button type="button" className="mobile-manager-action-btn" onClick={onOpenTasks}>
                  Tasks
                </button>
              ) : null}
              {canOpenStock ? (
                <button type="button" className="mobile-manager-action-btn" onClick={onOpenStock}>
                  Stock
                </button>
              ) : null}
              {canOpenTeam ? (
                <button type="button" className="mobile-manager-action-btn" onClick={onOpenTeamToday}>
                  Team today
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="mobile-manager-panel mobile-manager-attention-section" aria-label="Priority attention">
        <div className="mobile-manager-section-heading">
          <p className="mobile-manager-section-title">
            Priority
            {mergedAttentionItems.length > 0 ? (
              <span className="mobile-manager-section-count">{mergedAttentionItems.length}</span>
            ) : null}
          </p>
          <p className="mobile-manager-section-subtitle">What needs you now</p>
        </div>
        {mergedAttentionItems.length === 0 ? (
          <p className="mobile-manager-attention-empty">Everything looks under control today.</p>
        ) : (
          <>
            <ul className="mobile-manager-attention-list mobile-manager-attention-feed">
              {visibleAttentionItems.map((item) => (
                <MobileManagerAttentionItem key={item.key} item={item} />
              ))}
            </ul>
            {hiddenAttentionCount > 0 ? (
              <button
                type="button"
                className="mobile-manager-attention-more"
                onClick={() => setShowAllAttention((current) => !current)}
                aria-expanded={showAllAttention}
              >
                {showAllAttention ? 'Show less' : 'View all attention'}
              </button>
            ) : null}
          </>
        )}
      </section>

      <div className="mobile-manager-announcements-wrap">
        <TodayAnnouncementsPanel
          announcements={announcements}
          role={announcementRole}
          employeeDepartment={announcementEmployeeDepartment}
          isSaving={isAnnouncementsSaving}
          onMarkSeen={onMarkAnnouncementSeen}
        />
      </div>
    </div>
  )
}
