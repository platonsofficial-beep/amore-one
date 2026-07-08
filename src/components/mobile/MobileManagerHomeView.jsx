import { useMemo, useState } from 'react'
import { sortManagerMobileAttentionFeed } from '../../lib/mobileManagerTodayUtils'
import { isTodayAttentionItemActionable } from '../../lib/todayAttentionNavigation'
import { TodayAnnouncementsPanel } from '../today/TodayAnnouncementsPanel'

const ATTENTION_PREVIEW_LIMIT = 3

function getAttentionCategory(item) {
  const key = `${item?.key ?? ''}`

  if (key === 'schedule-issues' || key.startsWith('schedule')) {
    return 'schedule'
  }

  if (key.startsWith('task:') || key.startsWith('task-due:')) {
    return 'task'
  }

  if (key.startsWith('reservation:')) {
    return 'reservation'
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

function MobileManagerAttentionItem({ item, isActionable, onClick }) {
  const category = getAttentionCategory(item)
  const Tag = isActionable ? 'button' : 'li'

  return (
    <Tag
      type={isActionable ? 'button' : undefined}
      className={`mobile-manager-attention-item mobile-manager-priority-item tone-${item.tone} category-${category}${isActionable ? ' is-tappable' : ''}`}
      onClick={isActionable ? onClick : undefined}
    >
      <span className="mobile-manager-priority-dot" aria-hidden="true" />
      <div className="mobile-manager-attention-copy">
        <strong>{item.label}</strong>
        <span>{item.detail}</span>
      </div>
    </Tag>
  )
}

function MobileManagerQuickActions({
  canOpenReservations,
  canOpenTasks,
  canOpenStock,
  canOpenTeam,
  canReceiveDeliveries,
  pendingDeliveries,
  onOpenReservations,
  onOpenTasks,
  onOpenStock,
  onOpenTeamToday,
  onReceiveDeliveries,
}) {
  return (
    <div className="mobile-manager-quick-actions is-dense">
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
  onAttentionItemClick,
  attentionPermissions = {},
}) {
  const [showAllAttention, setShowAllAttention] = useState(false)

  const mergedAttentionItems = useMemo(
    () => sortManagerMobileAttentionFeed(attentionItems),
    [attentionItems],
  )

  const stockStatusLine = statusSummary.stockSummaryLine || '—'

  const showStockStatus = canOpenStock && (hasStockModuleData || stockOrdersSummary?.pendingCount > 0)
  const pendingDeliveries = (Number(stockOrdersSummary?.awaitingDeliveryCount) || 0)
    + (Number(stockOrdersSummary?.partialCount) || 0)
  const hasQuickActions = canOpenStock || (canReceiveDeliveries && pendingDeliveries > 0) || canOpenTasks || canOpenTeam || canOpenReservations

  const previewAttentionItems = mergedAttentionItems.slice(0, ATTENTION_PREVIEW_LIMIT)
  const visibleAttentionItems = showAllAttention ? mergedAttentionItems : previewAttentionItems
  const hasMoreAttention = mergedAttentionItems.length > ATTENTION_PREVIEW_LIMIT
  const workspaceContext = [venueName, roleLabel].filter(Boolean).join(' · ')

  return (
    <div className="mobile-screen mobile-home mobile-manager-home mobile-manager-command-center">
      <header className="mobile-manager-command-header">
        <h1 className="mobile-manager-command-greeting">{greeting || 'Welcome'}</h1>
        <p className="mobile-manager-command-meta">
          <span className="mobile-manager-command-date">{dateLabel}</span>
          {workspaceContext ? (
            <span className="mobile-manager-command-workspace">{workspaceContext}</span>
          ) : null}
        </p>
      </header>

      <section className="mobile-manager-command-primary" aria-label="Today overview and quick actions">
        <div className="mobile-manager-command-block">
          <h2 className="mobile-manager-block-title">Today overview</h2>
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
        </div>

        {hasQuickActions ? (
          <>
            <div className="mobile-manager-command-divider" aria-hidden="true" />
            <div className="mobile-manager-command-block mobile-manager-command-actions-block">
              <h2 className="mobile-manager-block-title">Quick actions</h2>
              <MobileManagerQuickActions
                canOpenReservations={canOpenReservations}
                canOpenTasks={canOpenTasks}
                canOpenStock={canOpenStock}
                canOpenTeam={canOpenTeam}
                canReceiveDeliveries={canReceiveDeliveries}
                pendingDeliveries={pendingDeliveries}
                onOpenReservations={onOpenReservations}
                onOpenTasks={onOpenTasks}
                onOpenStock={onOpenStock}
                onOpenTeamToday={onOpenTeamToday}
                onReceiveDeliveries={onReceiveDeliveries}
              />
            </div>
          </>
        ) : null}
      </section>

      <section className="mobile-manager-command-secondary mobile-manager-priority-panel" aria-label="Attention">
        <div className="mobile-manager-command-block">
          <h2 className="mobile-manager-block-title">
            Attention
            {mergedAttentionItems.length > 0 ? (
              <span className="mobile-manager-section-count">{mergedAttentionItems.length}</span>
            ) : null}
          </h2>
          {mergedAttentionItems.length === 0 ? (
            <p className="mobile-manager-attention-empty">Everything looks under control today.</p>
          ) : (
            <>
              <ul className="mobile-manager-attention-list mobile-manager-attention-feed mobile-manager-priority-feed">
                {visibleAttentionItems.map((item) => (
                  <MobileManagerAttentionItem
                    key={item.key}
                    item={item}
                    isActionable={isTodayAttentionItemActionable(item, attentionPermissions)}
                    onClick={() => onAttentionItemClick?.(item)}
                  />
                ))}
              </ul>
              {hasMoreAttention ? (
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
        </div>
      </section>

      <section className="mobile-manager-command-announcements" aria-label="Announcements">
        <TodayAnnouncementsPanel
          announcements={announcements}
          role={announcementRole}
          employeeDepartment={announcementEmployeeDepartment}
          isSaving={isAnnouncementsSaving}
          onMarkSeen={onMarkAnnouncementSeen}
        />
      </section>
    </div>
  )
}
