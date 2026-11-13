import { useMemo, useState } from 'react'
import { TodayAttentionListItem } from '../today/TodayAttentionListItem'
import { useMediaQuery } from '../../lib/useMediaQuery'
import {
  REPORT_PERIOD_TODAY,
  REPORT_PERIOD_WEEK,
  buildInsightsStockRemainders,
  buildReportsBundle,
  formatReportCurrency,
  formatReportMetricValue,
  formatReportPercent,
  insightTextMatchesQuery,
  normalizeInsightSearchQuery,
  presentInsightsAttentionItem,
} from '../../lib/reportsUtils'
import { LoadFailureBanner } from '../shell/LoadFailureBanner'
import { t } from '../../i18n/i18n'

const EXECUTIVE_OVERVIEW_CARD_COUNT = 6
const MODULE_FOOTER = 'Powered by live ONE data'
const MODULE_FOOTER_UNAVAILABLE = 'Numbers appear here after today’s modules load.'

const EMPTY_STATE_GUIDANCE = {
  reservations: t("Bookings will appear here as guests are scheduled."),
  tasks: t("Active checklists and tasks will surface here."),
  stock: t("Add inventory or stock items to track levels and orders."),
  schedule: t("Draft shifts for this period will show staffing totals here."),
  suppliers: t("Supplier records will appear once added in Stock."),
}

function ReportMetric({ label, value, emphasize = false }) {
  return (
    <article className={`reports-metric${emphasize ? ' reports-metric-emphasis' : ''}`}>
      <p className="reports-metric-label">{t(label)}</p>
      <p className="reports-metric-value">{value}</p>
    </article>
  )
}

function ReportsLoadingState({ variant = 'overview' }) {
  const placeholderCount = variant === 'overview' ? EXECUTIVE_OVERVIEW_CARD_COUNT : 3

  return (
    <div className={`reports-loading${variant === 'section' ? ' reports-loading-section' : ''}`} aria-busy="true">
      <p className="reports-loading-text">{t("Preparing insights…")}</p>
      <div className={`reports-loading-grid${variant === 'overview' ? ' reports-overview-grid' : ' reports-section-metrics'}`}>
        {Array.from({ length: placeholderCount }, (_, index) => (
          <div key={index} className="reports-metric reports-metric-skeleton" aria-hidden="true">
            <span className="reports-skeleton-line reports-skeleton-line-label" />
            <span className="reports-skeleton-line reports-skeleton-line-value" />
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportSection({
  title,
  icon,
  note,
  metrics,
  emptyMessage,
  emptyGuidance,
  isLoading,
  onViewModule,
  viewModuleLabel,
}) {
  return (
    <section className="reports-section panel staff-panel">
      <header className="reports-section-header">
        <div>
          <h3 className="reports-section-heading">
            {icon ? <span className="reports-section-icon" aria-hidden="true">{icon}</span> : null}
            {typeof title === 'string' ? t(title) : title}
          </h3>
          {note ? <p className="reports-section-note">{typeof note === 'string' ? t(note) : note}</p> : null}
        </div>
        <button type="button" className="ghost-btn reports-view-module-btn" onClick={onViewModule}>
          {viewModuleLabel}
        </button>
      </header>

      {isLoading ? (
        <ReportsLoadingState variant="section" />
      ) : emptyMessage ? (
        <div className="schedule-empty-state reports-section-empty">
          <p>{emptyMessage}</p>
          {emptyGuidance ? <p className="reports-section-empty-guidance">{emptyGuidance}</p> : null}
        </div>
      ) : (
        <div className="reports-section-metrics">
          {metrics.map((metric) => (
            <ReportMetric
              key={metric.key}
              label={metric.label}
              value={metric.value}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function formatSectionMetric(value, { connected = true, format = 'count', loadFailed = false } = {}) {
  if (loadFailed) return t('Unavailable')
  if (!connected) return t('Not connected')
  if (value === null || value === undefined) return '—'
  if (format === 'currency') return formatReportCurrency(value)
  if (format === 'percent') return formatReportPercent(value)
  if (format === 'hours') return `${value}h`
  if (format === 'text') return `${value}`
  return `${value}`
}

function InsightsAttentionPanel({
  attentionItems,
  stockRemainders = [],
  attentionPermissions,
  onAttentionItemClick,
  onCompleteAttentionItem,
  onViewModule,
  isLoading,
  sourcesFailed = false,
}) {
  if (isLoading) {
    return (
      <section className="reports-attention panel staff-panel" aria-label={t("Needs attention")} aria-busy="true">
        <header className="reports-overview-header">
          <div>
            <p className="eyebrow">{t("Actionable insights")}</p>
            <h3 className="reports-section-heading">
              <span className="reports-section-icon" aria-hidden="true">⚠️</span>
              {t("Needs attention")}
            </h3>
          </div>
        </header>
        <ReportsLoadingState variant="section" />
      </section>
    )
  }

  return (
    <section className="reports-attention panel staff-panel" aria-label={t("Needs attention")}>
      <header className="reports-overview-header">
        <div>
          <p className="eyebrow">{t("Actionable insights")}</p>
          <h3 className="reports-section-heading">
            <span className="reports-section-icon" aria-hidden="true">⚠️</span>
            {t("Needs attention")}
          </h3>
        </div>
      </header>

      {attentionItems.length === 0 && stockRemainders.length === 0 ? (
        <div className="schedule-empty-state reports-section-empty">
          {sourcesFailed ? (
            <p>{t("Couldn't tell what needs attention until today's data loads.")}</p>
          ) : (
            <>
              <p>{t("No urgent issues right now.")}</p>
              <p className="reports-section-empty-guidance">{t("Operational alerts from tasks, stock, schedule, and service will appear here.")}</p>
            </>
          )}
        </div>
      ) : attentionItems.length > 0 ? (
        <ul className="today-attention-list reports-attention-list">
          {attentionItems.map((item) => (
            <TodayAttentionListItem
              key={item.key}
              item={presentInsightsAttentionItem(item)}
              attentionPermissions={attentionPermissions}
              onAttentionItemClick={onAttentionItemClick}
              onCompleteAttentionItem={onCompleteAttentionItem}
            />
          ))}
        </ul>
      ) : null}

      {stockRemainders.length > 0 ? (
        <div className="reports-stock-remainders">
          {stockRemainders.map((remainder) => (
            <button
              key={remainder.key}
              type="button"
              className="ghost-btn reports-stock-remainder-btn"
              onClick={() => onViewModule?.(remainder.moduleId)}
            >
              {remainder.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function sectionIsVisible(query, title, note, metrics, emptyMessage) {
  if (!query) return { show: true, metrics }
  if (insightTextMatchesQuery(query, title, note, emptyMessage)) return { show: true, metrics }
  if (emptyMessage) return { show: false, metrics }
  const matched = metrics.filter((metric) => insightTextMatchesQuery(query, metric.label, metric.value))
  return { show: matched.length > 0, metrics: matched }
}

export default function ReportsView({
  todayKey,
  weekStartDate,
  reservations,
  tasks,
  inventoryItems,
  stockItems = [],
  stockOrders = [],
  suppliers,
  schedule,
  connections,
  serviceSnapshot = null,
  coverageBreakdown = null,
  attentionItems = [],
  attentionPermissions = {},
  isLoading,
  loadError = '',
  onRetryLoad,
  onViewModule,
  onAttentionItemClick,
  onCompleteAttentionItem,
  timeZone = '',
  operationsTasks = [],
  announcements = [],
  searchTerm = '',
}) {
  const [period, setPeriod] = useState(REPORT_PERIOD_TODAY)
  const attentionFirst = useMediaQuery('(max-width: 640px)')
  const searchQuery = normalizeInsightSearchQuery(searchTerm)

  const reports = useMemo(() => buildReportsBundle({
    period,
    todayKey,
    weekStartDate,
    reservations,
    tasks,
    inventoryItems,
    stockItems,
    stockOrders,
    suppliers,
    schedule,
    connections,
    serviceSnapshot,
    coverageBreakdown,
    attentionItems,
    timeZone,
    operationsTasks,
    announcements,
  }), [
    period,
    todayKey,
    weekStartDate,
    reservations,
    tasks,
    inventoryItems,
    stockItems,
    stockOrders,
    suppliers,
    schedule,
    connections,
    serviceSnapshot,
    coverageBreakdown,
    attentionItems,
    timeZone,
    operationsTasks,
    announcements,
  ])

  const showAttentionPanel = period === REPORT_PERIOD_TODAY
  const stockConnected = reports.stockReport.connected
  const reservationsEmpty = reports.reservationsReport.connected
    && reports.reservationsReport.empty
    ? t("No reservations for this period.")
    : null
  const tasksEmpty = reports.tasksReport.connected && reports.tasksReport.empty
    ? t("No tasks available.")
    : null
  const stockEmpty = stockConnected && reports.stockReport.empty
    ? t("No stock items available.")
    : null
  const scheduleEmpty = reports.scheduleReport.connected && reports.scheduleReport.empty
    ? (reports.scheduleReport.usesDraftSchedule
      ? t("No draft schedule shifts for this period.")
      : t("No published schedule shifts for this period."))
    : null
  const suppliersEmpty = reports.suppliersReport.connected && reports.suppliersReport.empty
    ? t("No suppliers available.")
    : null

  const reservationMetrics = [
    {
      key: 'bookings',
      label: 'Bookings',
      value: formatSectionMetric(reports.reservationsReport.metrics.bookings, {
        connected: reports.reservationsReport.connected,
      }),
    },
    {
      key: 'guests',
      label: 'Guests',
      value: formatSectionMetric(reports.reservationsReport.metrics.guests, {
        connected: reports.reservationsReport.connected,
      }),
    },
  ]

  if (period === REPORT_PERIOD_TODAY && reports.reservationsReport.metrics.covers != null) {
    reservationMetrics.push(
      {
        key: 'covers',
        label: 'Covers',
        value: formatSectionMetric(reports.reservationsReport.metrics.covers, {
          connected: reports.reservationsReport.connected,
        }),
      },
      {
        key: 'seated',
        label: t("Seated guests"),
        value: formatSectionMetric(reports.reservationsReport.metrics.seatedGuests, {
          connected: reports.reservationsReport.connected,
        }),
      },
      {
        key: 'waiting',
        label: 'Arrived',
        value: formatSectionMetric(reports.reservationsReport.metrics.waiting, {
          connected: reports.reservationsReport.connected,
        }),
      },
      {
        key: 'late',
        label: 'Late',
        value: formatSectionMetric(reports.reservationsReport.metrics.late, {
          connected: reports.reservationsReport.connected,
        }),
      },
    )

    if (reports.reservationsReport.metrics.serviceStatus) {
      reservationMetrics.push({
        key: 'service-status',
        label: t("Service status"),
        value: formatSectionMetric(reports.reservationsReport.metrics.serviceStatus, {
          connected: reports.reservationsReport.connected,
          format: 'text',
        }),
      })
    }
  }

  reservationMetrics.push(
    {
      key: 'in-house',
      label: 'Seated',
      value: formatSectionMetric(reports.reservationsReport.metrics.inHouse, {
        connected: reports.reservationsReport.connected,
      }),
    },
    {
      key: 'completed',
      label: 'Completed',
      value: formatSectionMetric(reports.reservationsReport.metrics.completed, {
        connected: reports.reservationsReport.connected,
      }),
    },
    {
      key: 'cancelled',
      label: 'Cancelled',
      value: formatSectionMetric(reports.reservationsReport.metrics.cancelled, {
        connected: reports.reservationsReport.connected,
      }),
    },
    {
      key: 'no-show',
      label: 'No-show',
      value: formatSectionMetric(reports.reservationsReport.metrics.noShow, {
        connected: reports.reservationsReport.connected,
      }),
    },
  )

  const stockMetrics = [
    {
      key: 'items-to-order',
      label: t("Items to order"),
      value: formatSectionMetric(reports.stockReport.metrics.itemsToOrder, {
        connected: stockConnected,
      }),
    },
    {
      key: 'low-stock',
      label: t("Low stock"),
      value: formatSectionMetric(reports.stockReport.metrics.lowStock, {
        connected: stockConnected,
      }),
    },
    {
      key: 'out-of-stock',
      label: t("Out of stock"),
      value: formatSectionMetric(reports.stockReport.metrics.outOfStock, {
        connected: stockConnected,
      }),
    },
    {
      key: 'stock-value',
      label: t("Total stock value"),
      value: formatSectionMetric(reports.stockReport.metrics.totalStockValue, {
        connected: stockConnected,
        format: 'currency',
      }),
    },
  ]

  const openOrderCount = Number(reports.stockReport.metrics.pendingOrders) || 0
  const awaitingDeliveryCount = Number(reports.stockReport.metrics.awaitingDelivery) || 0
  const ordersToReviewCount = Math.max(0, openOrderCount - awaitingDeliveryCount)
  if (reports.stockReport.stockModuleConnected && reports.stockReport.metrics.pendingOrders != null) {
    stockMetrics.push(
      {
        key: 'pending-orders',
        label: t("Open orders"),
        value: formatSectionMetric(reports.stockReport.metrics.pendingOrders, {
          connected: stockConnected,
        }),
      },
      {
        key: 'orders-to-review',
        label: t("Orders to review"),
        value: formatSectionMetric(ordersToReviewCount, {
          connected: stockConnected,
        }),
      },
      {
        key: 'awaiting-delivery',
        label: t("Awaiting delivery"),
        value: formatSectionMetric(reports.stockReport.metrics.awaitingDelivery, {
          connected: stockConnected,
        }),
      },
    )
  }

  const stockOrderNote = reports.stockReport.stockModuleConnected && openOrderCount > 0
    ? t("Open orders include drafts to review and orders awaiting delivery.")
    : null

  const scheduleNote = [
    reports.scheduleReport.usesDraftSchedule ? t("Draft schedule data") : null,
    reports.scheduleReport.coverageDetail,
  ].filter(Boolean).join(' · ') || null

  const taskMetrics = [
    {
      key: 'active',
      label: 'Active',
      value: formatSectionMetric(reports.tasksReport.metrics.active, {
        connected: reports.tasksReport.connected,
      }),
    },
    {
      key: 'overdue',
      label: 'Overdue',
      value: formatSectionMetric(reports.tasksReport.metrics.overdue, {
        connected: reports.tasksReport.connected,
      }),
    },
    {
      key: 'urgent',
      label: 'Urgent',
      value: formatSectionMetric(reports.tasksReport.metrics.urgent, {
        connected: reports.tasksReport.connected,
      }),
    },
    {
      key: 'completed',
      label: period === REPORT_PERIOD_TODAY ? t("Completed today") : 'Completed',
      value: formatSectionMetric(reports.tasksReport.metrics.completed, {
        connected: reports.tasksReport.connected,
      }),
    },
    ...(period === REPORT_PERIOD_TODAY
      ? [{
        key: 'completion',
        label: t("Completion %"),
        value: formatSectionMetric(reports.tasksReport.metrics.completionPercent, {
          connected: reports.tasksReport.connected,
          format: 'percent',
        }),
      }]
      : []),
  ]

  const scheduleMetrics = [
    {
      key: 'scheduled-staff',
      label: t("Scheduled staff"),
      value: formatSectionMetric(reports.scheduleReport.metrics.scheduledStaff, {
        connected: reports.scheduleReport.connected,
      }),
    },
    {
      key: 'scheduled-hours',
      label: t("Scheduled hours"),
      value: reports.scheduleReport.connected
        ? `${reports.scheduleReport.metrics.scheduledHoursLabel || '0'}h`
        : t("Not connected"),
    },
    ...(period === REPORT_PERIOD_TODAY
      ? [{
        key: 'issues',
        label: t("Schedule issues"),
        value: formatSectionMetric(reports.scheduleReport.metrics.issues, {
          connected: reports.scheduleReport.connected,
        }),
      }]
      : []),
  ]

  const supplierMetrics = [
    {
      key: 'total',
      label: t("Total suppliers"),
      value: formatSectionMetric(reports.suppliersReport.metrics.totalSuppliers, {
        connected: reports.suppliersReport.connected,
      }),
    },
    {
      key: 'linked',
      label: t("Linked to stock"),
      value: formatSectionMetric(reports.suppliersReport.metrics.linkedToStock, {
        connected: reports.suppliersReport.connected && reports.suppliersReport.inventoryConnected,
      }),
    },
    {
      key: 'unlinked',
      label: t("Without stock items"),
      value: formatSectionMetric(reports.suppliersReport.metrics.withoutStockItems, {
        connected: reports.suppliersReport.connected && reports.suppliersReport.inventoryConnected,
      }),
    },
  ]

  const filtering = Boolean(searchQuery) && !isLoading
  const briefMatches = !filtering || insightTextMatchesQuery(
    searchQuery,
    'Manager Brief',
    'Executive summary',
    reports.healthSummary,
  )
  const visibleOverview = briefMatches
    ? reports.overview
    : reports.overview.filter((metric) => insightTextMatchesQuery(searchQuery, metric.label))
  const showBrief = isLoading || briefMatches || visibleOverview.length > 0

  const stockRemainders = showAttentionPanel
    ? buildInsightsStockRemainders(reports.insightsAttention, reports.stockReport)
    : []
  const attentionMatches = !filtering || insightTextMatchesQuery(
    searchQuery,
    'Needs attention',
    'Actionable insights',
  )
  const visibleAttention = attentionMatches
    ? reports.insightsAttention
    : reports.insightsAttention.filter((item) => insightTextMatchesQuery(searchQuery, item.label, item.detail))
  const visibleRemainders = !filtering
    ? stockRemainders
    : stockRemainders.filter((remainder) => insightTextMatchesQuery(searchQuery, remainder.label, 'low', 'out', 'stock'))
  const showAttention = showAttentionPanel && (
    isLoading || attentionMatches || visibleAttention.length > 0 || visibleRemainders.length > 0
  )

  const moduleSections = [
    {
      key: 'reservations',
      title: 'Reservations',
      icon: '📅',
      metrics: reservationMetrics,
      emptyMessage: reports.reservationsReport.loadFailed
        ? "Couldn't load reservations. Check your connection and try again."
        : !reports.reservationsReport.connected
        ? t("Reservations module is not connected.")
        : reservationsEmpty,
      emptyGuidance: reservationsEmpty ? EMPTY_STATE_GUIDANCE.reservations : null,
      viewModuleLabel: t("View Reservations →"),
      moduleId: 'reservations',
    },
    {
      key: 'tasks',
      title: 'Tasks',
      icon: '✓',
      metrics: taskMetrics,
      emptyMessage: reports.tasksReport.loadFailed
        ? "Couldn't load tasks. Check your connection and try again."
        : !reports.tasksReport.connected
        ? t("Tasks module is not connected.")
        : tasksEmpty,
      emptyGuidance: tasksEmpty ? EMPTY_STATE_GUIDANCE.tasks : null,
      viewModuleLabel: t("View Tasks →"),
      moduleId: 'tasks',
    },
    {
      key: 'stock',
      title: 'Stock',
      icon: '📦',
      note: stockOrderNote,
      metrics: stockMetrics,
      emptyMessage: reports.stockReport.loadFailed
        ? "Couldn't load stock. Check your connection and try again."
        : !stockConnected
        ? t("Stock module is not connected.")
        : stockEmpty,
      emptyGuidance: stockEmpty ? EMPTY_STATE_GUIDANCE.stock : null,
      viewModuleLabel: t("View Stock →"),
      moduleId: 'stock',
    },
    {
      key: 'schedule',
      title: 'Schedule',
      icon: '🕒',
      note: scheduleNote,
      metrics: scheduleMetrics,
      emptyMessage: reports.scheduleReport.loadFailed
        ? "Couldn't load the schedule. Check your connection and try again."
        : !reports.scheduleReport.connected
        ? t("Schedule module is not connected.")
        : scheduleEmpty,
      emptyGuidance: scheduleEmpty ? EMPTY_STATE_GUIDANCE.schedule : null,
      viewModuleLabel: t("View Schedule →"),
      moduleId: 'schedule',
    },
    {
      key: 'suppliers',
      title: 'Suppliers',
      icon: '🚚',
      metrics: supplierMetrics,
      emptyMessage: !reports.suppliersReport.connected
        ? t("Suppliers module is not connected.")
        : suppliersEmpty,
      emptyGuidance: suppliersEmpty ? EMPTY_STATE_GUIDANCE.suppliers : null,
      viewModuleLabel: t("View Suppliers →"),
      moduleId: 'suppliers',
    },
  ].map((section) => {
    const visibility = sectionIsVisible(
      filtering ? searchQuery : '',
      section.title,
      section.note,
      section.metrics,
      section.emptyMessage,
    )
    return { ...section, ...visibility }
  }).filter((section) => section.show)

  const showOpenOrderNote = !isLoading && visibleOverview.some((metric) => metric.key === 'pending-orders')
  const anyCards = showBrief || showAttention || moduleSections.length > 0

  const attentionPanel = showAttention ? (
    <InsightsAttentionPanel
      attentionItems={visibleAttention}
      stockRemainders={visibleRemainders}
      attentionPermissions={attentionPermissions}
      onAttentionItemClick={onAttentionItemClick}
      onCompleteAttentionItem={onCompleteAttentionItem}
      onViewModule={onViewModule}
      isLoading={isLoading}
      sourcesFailed={reports.sourcesFailed}
    />
  ) : null

  const briefPanel = showBrief ? (
    <section className="reports-overview panel staff-panel" aria-label={t("Manager Brief")}>
      <header className="reports-overview-header">
        <div>
          <p className="eyebrow">{t("Executive summary")}</p>
          <h3 className="reports-section-heading">
            <span className="reports-section-icon" aria-hidden="true">⚡</span>
            {t("Manager Brief")}
          </h3>
          <p className="reports-overview-subtitle">
            {isLoading ? t("Loading operational overview…") : reports.healthSummary}
          </p>
        </div>
      </header>

      {isLoading ? (
        <ReportsLoadingState variant="overview" />
      ) : (
        <div className="reports-overview-grid">
          {visibleOverview.map((metric) => (
            <ReportMetric
              key={metric.key}
              label={metric.label}
              value={formatReportMetricValue(metric.value, {
                connected: metric.connected,
                format: metric.format,
                loadFailed: metric.loadFailed,
              })}
              emphasize
            />
          ))}
        </div>
      )}

      {showOpenOrderNote ? (
        <p className="reports-overview-note">
          {t("Open orders include drafts to review and orders awaiting delivery.")}
        </p>
      ) : null}
    </section>
  ) : null

  return (
    <section className="staff-page reports-page">
      <div className="reports-period-filters" role="group" aria-label={t("Report period")}>
        <button
          type="button"
          className={`filter-chip${period === REPORT_PERIOD_TODAY ? ' active' : ''}`}
          onClick={() => setPeriod(REPORT_PERIOD_TODAY)}
        >
          {t("Today")}
        </button>
        <button
          type="button"
          className={`filter-chip${period === REPORT_PERIOD_WEEK ? ' active' : ''}`}
          onClick={() => setPeriod(REPORT_PERIOD_WEEK)}
        >
          {t("This Week")}
        </button>
      </div>

      {loadError ? (
        <LoadFailureBanner message={loadError} onRetry={onRetryLoad} className="reports-load-error" />
      ) : null}

      {filtering && !anyCards ? (
        <div className="schedule-empty-state reports-section-empty reports-search-empty">
          <p>{t("No insights match that search.")}</p>
        </div>
      ) : null}

      {attentionFirst ? attentionPanel : null}
      {briefPanel}
      {attentionFirst ? null : attentionPanel}

      {moduleSections.length > 0 ? (
        <div className="reports-sections">
          {moduleSections.map((section) => (
            <ReportSection
              key={section.key}
              title={section.title}
              icon={section.icon}
              note={section.note}
              metrics={section.metrics}
              emptyMessage={section.emptyMessage}
              emptyGuidance={section.emptyGuidance}
              isLoading={isLoading}
              onViewModule={() => onViewModule?.(section.moduleId)}
              viewModuleLabel={section.viewModuleLabel}
            />
          ))}
        </div>
      ) : null}

      <p className="reports-page-footer">{reports.sourcesFailed ? MODULE_FOOTER_UNAVAILABLE : MODULE_FOOTER}</p>
    </section>
  )
}
