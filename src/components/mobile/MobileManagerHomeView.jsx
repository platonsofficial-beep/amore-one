import { useMemo } from 'react'
import {
  buildManagerMobileAttentionItems,
  buildManagerMobileStockStatusLine,
} from '../../lib/mobileManagerTodayUtils'
import { TodayAnnouncementsPanel } from '../today/TodayAnnouncementsPanel'

function MobileManagerStatusCard({ label, value, tone = 'default' }) {
  return (
    <div className={`mobile-manager-status-card tone-${tone}`}>
      <span className="mobile-manager-status-label">{label}</span>
      <strong className="mobile-manager-status-value">{value}</strong>
    </div>
  )
}

function MobileManagerAttentionItem({ item }) {
  return (
    <li className={`mobile-manager-attention-item tone-${item.tone}`}>
      <strong>{item.label}</strong>
      <span>{item.detail}</span>
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
  const mergedAttentionItems = useMemo(() => buildManagerMobileAttentionItems({
    attentionItems,
    stockOrdersSummary,
    stockSummary,
    hasStockModuleData,
  }), [attentionItems, stockOrdersSummary, stockSummary, hasStockModuleData])

  const stockStatusLine = useMemo(
    () => buildManagerMobileStockStatusLine(stockSummary, stockOrdersSummary),
    [stockSummary, stockOrdersSummary],
  )

  const showStockStatus = canOpenStock && (hasStockModuleData || stockOrdersSummary?.pendingCount > 0)
  const pendingDeliveries = (Number(stockOrdersSummary?.awaitingDeliveryCount) || 0)
    + (Number(stockOrdersSummary?.partialCount) || 0)
  const hasQuickActions = canOpenStock || (canReceiveDeliveries && pendingDeliveries > 0) || canOpenTasks || canOpenTeam || canOpenReservations

  return (
    <div className="mobile-screen mobile-home mobile-manager-home">
      <header className="mobile-screen-header">
        <p className="mobile-screen-eyebrow">{dateLabel}</p>
        <h1 className="mobile-screen-title">{greeting || 'Welcome'}</h1>
        {venueName ? <p className="mobile-screen-subtitle">{venueName}</p> : null}
        {roleLabel ? <p className="mobile-manager-role-label">{roleLabel}</p> : null}
      </header>

      <section className="mobile-card mobile-manager-status-section" aria-label="Today status">
        <p className="mobile-card-label">Today</p>
        <div className="mobile-manager-status-grid">
          <MobileManagerStatusCard
            label="On shift"
            value={statusSummary.onShiftSummary || '—'}
          />
          <MobileManagerStatusCard
            label="Team"
            value={statusSummary.teamScheduledSummary || '—'}
          />
          {isReservationsConnected ? (
            <MobileManagerStatusCard
              label="Reservations"
              value={statusSummary.reservationsSummaryLine || '—'}
            />
          ) : null}
          {isTasksConnected ? (
            <MobileManagerStatusCard
              label="Tasks"
              value={statusSummary.tasksSummary || '—'}
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
            />
          ) : null}
        </div>
      </section>

      <section className="mobile-card mobile-manager-attention-section" aria-label="Needs attention">
        <p className="mobile-card-label">Attention</p>
        {mergedAttentionItems.length === 0 ? (
          <p className="mobile-manager-attention-empty">Everything looks under control today.</p>
        ) : (
          <ul className="mobile-manager-attention-list">
            {mergedAttentionItems.map((item) => (
              <MobileManagerAttentionItem key={item.key} item={item} />
            ))}
          </ul>
        )}
      </section>

      {hasQuickActions ? (
        <section className="mobile-card mobile-manager-actions-section" aria-label="Quick actions">
          <p className="mobile-card-label">Quick actions</p>
          <div className="mobile-manager-actions">
            {canOpenStock ? (
              <button type="button" className="mobile-manager-action-btn" onClick={onOpenStock}>
                Open stock
              </button>
            ) : null}
            {canReceiveDeliveries && pendingDeliveries > 0 ? (
              <button
                type="button"
                className="mobile-manager-action-btn mobile-manager-action-btn-primary"
                onClick={onReceiveDeliveries}
              >
                Receive deliveries
              </button>
            ) : null}
            {canOpenTasks ? (
              <button type="button" className="mobile-manager-action-btn" onClick={onOpenTasks}>
                Open tasks
              </button>
            ) : null}
            {canOpenTeam ? (
              <button type="button" className="mobile-manager-action-btn" onClick={onOpenTeamToday}>
                Team today
              </button>
            ) : null}
            {canOpenReservations ? (
              <button type="button" className="mobile-manager-action-btn" onClick={onOpenReservations}>
                Reservations
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <TodayAnnouncementsPanel
        announcements={announcements}
        role={announcementRole}
        employeeDepartment={announcementEmployeeDepartment}
        isSaving={isAnnouncementsSaving}
        onMarkSeen={onMarkAnnouncementSeen}
      />
    </div>
  )
}
