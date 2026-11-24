import { useMemo, useState } from 'react'
import { sortManagerMobileAttentionFeed } from '../../lib/mobileManagerTodayUtils'
import { TodayAttentionListItem } from '../today/TodayAttentionListItem'
import { TodayAnnouncementsPanel } from '../today/TodayAnnouncementsPanel'
import { SetupGuideTodaySlot } from '../../setupGuide/SetupGuideUI'
import { StockLiveCard } from '../stock/StockLiveCard'
import { OnShiftSheet } from '../today/OnShiftSheet'
import { PendingValue } from '../common/DataPending'
import { areaStatus } from '../../lib/loadStatus'
import { TodayQuickActions } from '../today/TodayQuickActions'
import { TodayVenueControl } from '../workspace/VenueManager'
import { t } from '../../i18n/i18n'

const ATTENTION_PREVIEW_LIMIT = 3

function hasExtraAttention(count) {
  return count - ATTENTION_PREVIEW_LIMIT > 0
}

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

function MobileManagerStatusCard({ label, value, tone = 'default', onClick, status = 'ready', onRetry }) {
  const isReady = status === 'ready'
  const handleClick = status === 'error' ? onRetry : (isReady ? onClick : undefined)
  const isInteractive = typeof handleClick === 'function'
  const Tag = isInteractive ? 'button' : 'div'

  return (
    <Tag
      type={isInteractive ? 'button' : undefined}
      className={`mobile-manager-status-card tone-${isReady ? tone : 'default'}${isInteractive ? ' is-tappable' : ''}${isReady ? '' : ` is-${status}`}`}
      aria-busy={status === 'loading' ? 'true' : undefined}
      onClick={handleClick}
    >
      <span className="mobile-manager-status-label">{label}</span>
      <strong className="mobile-manager-status-value">
        <PendingValue status={status} lines={1} insideButton={isInteractive}>{value}</PendingValue>
      </strong>
      {isInteractive ? <span className="mobile-manager-status-chevron" aria-hidden="true">›</span> : null}
    </Tag>
  )
}

export function MobileManagerHomeView({
  venueName = '',
  greeting = '',
  dateLabel = '',
  roleLabel = '',
  memberships = [],
  activeWorkspaceId = '',
  onSwitchVenue,
  inviteNotice = '',
  onDismissInviteNotice,
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
  onOpenBelowPar,
  onOpenDrafts,
  onOpenCounts,
  stockLiveSnapshot = null,
  stockOrders = [],
  timeZone = '',
  onReceiveDeliveries,
  onOpenTasks,
  onOpenTeamToday,
  onOpenReservations,
  role = '',
  userId = '',
  onRunTodayShortcut,
  onAttentionItemClick,
  onCompleteAttentionItem,
  attentionPermissions = {},
  setupGuide = null,
  clockCard = null,
  reminderCard = null,
  canViewOnShift = false,
  workspaceId = '',
  onShiftEmployees = [],
  onShiftTodayShifts = [],
  dataStatus = null,
  onRetryData,
}) {
  const statusOf = (area) => areaStatus(dataStatus, area)
  const retry = (area) => () => onRetryData?.(area)
  const [showAllAttention, setShowAllAttention] = useState(false)
  const [isOnShiftOpen, setIsOnShiftOpen] = useState(false)

  const mergedAttentionItems = useMemo(
    () => sortManagerMobileAttentionFeed(attentionItems),
    [attentionItems],
  )

  const stockStatusLine = statusSummary.stockSummaryLine || '—'

  // Stock appears once: the live card (health, below par, drafts, counts) when
  // it is available, otherwise the compact status tile.
  const hasStockLiveCard = canOpenStock && Boolean(stockLiveSnapshot)
  const showStockStatus = canOpenStock && (hasStockModuleData || stockOrdersSummary?.pendingCount > 0)
  const pendingDeliveries = (Number(stockOrdersSummary?.awaitingDeliveryCount) || 0)
    + (Number(stockOrdersSummary?.partialCount) || 0)
  const hasQuickActions = canOpenStock || (canReceiveDeliveries && pendingDeliveries > 0) || canOpenTasks || canOpenTeam || canOpenReservations

  const previewAttentionItems = mergedAttentionItems.slice(0, ATTENTION_PREVIEW_LIMIT)
  const visibleAttentionItems = showAllAttention ? mergedAttentionItems : previewAttentionItems
  const hasMoreAttention = hasExtraAttention(mergedAttentionItems.length)
  return (
    <div className="mobile-screen mobile-home mobile-manager-home mobile-manager-command-center">
      {inviteNotice ? (
        <div className="staff-status-banner auth-banner-success workspace-invite-notice" role="status">
          {inviteNotice}
          <button type="button" className="ghost-btn small workspace-invite-notice-dismiss" onClick={onDismissInviteNotice}>
            {t("Dismiss")}
          </button>
        </div>
      ) : null}
      <header className="mobile-manager-command-header">
        <h1 className="mobile-manager-command-greeting" data-help="today.home">{greeting || t('Welcome')}</h1>
        <p className="mobile-manager-command-meta">
          <span className="mobile-manager-command-date">{dateLabel}</span>
          <TodayVenueControl
            venueName={venueName}
            roleLabel={roleLabel}
            memberships={memberships}
            activeWorkspaceId={activeWorkspaceId}
            onSwitch={onSwitchVenue}
          />
        </p>
      </header>

      {setupGuide ? <SetupGuideTodaySlot {...setupGuide} /> : null}

      {reminderCard}

      {clockCard}

      <section className="mobile-manager-command-primary" aria-label={t("Today overview and quick actions")}>
        <div className="mobile-manager-command-block">
          <h2 className="mobile-manager-block-title">{t("Today overview")}</h2>
          <div className="mobile-manager-status-grid">
            <MobileManagerStatusCard
              label={t("On shift")}
              value={statusSummary.onShiftSummary || '—'}
              status={statusOf('schedule')}
              onRetry={retry('schedule')}
              onClick={canViewOnShift && workspaceId ? () => setIsOnShiftOpen(true) : undefined}
            />
            <MobileManagerStatusCard
              label={t("Team")}
              value={statusSummary.teamScheduledSummary || '—'}
              status={statusOf('schedule')}
              onRetry={retry('schedule')}
              tone={/gap/i.test(`${statusSummary.teamScheduledSummary ?? ''}`) ? 'warning' : 'default'}
              onClick={canOpenTeam ? onOpenTeamToday : undefined}
            />
            {isReservationsConnected ? (
              <MobileManagerStatusCard
                label={t("Reservations")}
                value={statusSummary.reservationsSummaryLine || '—'}
                status={statusOf('reservations')}
                onRetry={retry('reservations')}
                onClick={canOpenReservations ? onOpenReservations : undefined}
              />
            ) : null}
            {isTasksConnected ? (
              <MobileManagerStatusCard
                label={t("Tasks")}
                value={statusSummary.tasksSummary || '—'}
                status={statusOf('tasks')}
                onRetry={retry('tasks')}
                onClick={canOpenTasks ? onOpenTasks : undefined}
              />
            ) : null}
            {showStockStatus && !hasStockLiveCard ? (
              <MobileManagerStatusCard
                label={t("Stock")}
                value={stockStatusLine}
                status={statusOf('stock')}
                onRetry={retry('stock')}
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
          {hasStockLiveCard ? (
            <StockLiveCard
              loadStatus={statusOf('stock')}
              onRetry={retry('stock')}
              stockSummary={stockSummary}
              belowParCount={stockLiveSnapshot.belowParCount}
              parsReady={stockLiveSnapshot.parsReady}
              parsStatus={stockLiveSnapshot.status}
              stockOrders={stockOrders}
              lastInventoryCountAt={stockLiveSnapshot.lastInventoryCountAt}
              timeZone={timeZone}
              onOpenHealth={onOpenStock}
              onOpenBelowPar={onOpenBelowPar}
              onOpenDrafts={onOpenDrafts}
              onOpenCounts={onOpenCounts}
            />
          ) : null}
        </div>

        {hasQuickActions ? (
          <>
            <div className="mobile-manager-command-divider" aria-hidden="true" />
            <div className="mobile-manager-command-block mobile-manager-command-actions-block">
              <TodayQuickActions
                access={role}
                userId={userId}
                workspaceId={workspaceId}
                onRun={onRunTodayShortcut}
                showReceiveDelivery={canReceiveDeliveries && pendingDeliveries > 0}
                onReceiveDeliveries={onReceiveDeliveries}
              />
            </div>
          </>
        ) : null}
      </section>

      <section className="mobile-manager-command-secondary mobile-manager-priority-panel" aria-label={t("Attention")}>
        <div className="mobile-manager-command-block">
          <h2 className="mobile-manager-block-title">
            {t("Attention")}
            {mergedAttentionItems.length > 0 ? (
              <span className="mobile-manager-section-count">{mergedAttentionItems.length}</span>
            ) : null}
          </h2>
          {mergedAttentionItems.length === 0 && statusOf('attention') !== 'ready' ? (
            <div className="mobile-manager-attention-empty">
              <PendingValue status={statusOf('attention')} lines={2} onRetry={retry('all')} />
            </div>
          ) : mergedAttentionItems.length === 0 ? (
            <p className="mobile-manager-attention-empty">{t("Everything looks under control today.")}</p>
          ) : (
            <>
              <ul className="mobile-manager-attention-list mobile-manager-attention-feed mobile-manager-priority-feed" aria-label={t("Attention items")}>
                {visibleAttentionItems.map((item) => (
                  <TodayAttentionListItem
                    key={item.key}
                    item={item}
                    variant="mobile"
                    category={getAttentionCategory(item)}
                    attentionPermissions={attentionPermissions}
                    onAttentionItemClick={onAttentionItemClick}
                    onCompleteAttentionItem={onCompleteAttentionItem}
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
                  {showAllAttention ? t("Show less") : t("View all attention")}
                </button>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section className="mobile-manager-command-announcements" aria-label={t("Announcements")}>
        <TodayAnnouncementsPanel
          announcements={announcements}
          role={announcementRole}
          employeeDepartment={announcementEmployeeDepartment}
          isSaving={isAnnouncementsSaving}
          onMarkSeen={onMarkAnnouncementSeen}
          loadStatus={statusOf('announcements')}
          onRetry={retry('announcements')}
        />
      </section>
      {isOnShiftOpen ? (
        <OnShiftSheet
          workspaceId={workspaceId}
          employees={onShiftEmployees}
          todayShifts={onShiftTodayShifts}
          scheduledNowCount={statusSummary.onShiftScheduledCount}
          timeZone={timeZone}
          dateLabel={dateLabel}
          onClose={() => setIsOnShiftOpen(false)}
        />
      ) : null}
    </div>
  )
}
