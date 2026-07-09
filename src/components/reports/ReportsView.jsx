import { useMemo, useState } from 'react'
import { TodayAttentionListItem } from '../today/TodayAttentionListItem'
import {
  REPORT_PERIOD_TODAY,
  REPORT_PERIOD_WEEK,
  buildReportsBundle,
  formatReportCurrency,
  formatReportMetricValue,
  formatReportPercent,
} from '../../lib/reportsUtils'

const EXECUTIVE_OVERVIEW_CARD_COUNT = 6
const MODULE_FOOTER = 'Powered by live ONE data'

const EMPTY_STATE_GUIDANCE = {
  reservations: 'Bookings will appear here as guests are scheduled.',
  tasks: 'Active checklists and tasks will surface here.',
  stock: 'Add inventory or stock items to track levels and orders.',
  schedule: 'Draft shifts for this period will show staffing totals here.',
  suppliers: 'Supplier records will appear once added in Stock.',
}

function ReportMetric({ label, value, emphasize = false }) {
  return (
    <article className={`reports-metric${emphasize ? ' reports-metric-emphasis' : ''}`}>
      <p className="reports-metric-label">{label}</p>
      <p className="reports-metric-value">{value}</p>
    </article>
  )
}

function ReportsLoadingState({ variant = 'overview' }) {
  const placeholderCount = variant === 'overview' ? EXECUTIVE_OVERVIEW_CARD_COUNT : 3

  return (
    <div className={`reports-loading${variant === 'section' ? ' reports-loading-section' : ''}`} aria-busy="true">
      <p className="reports-loading-text">Preparing insights…</p>
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
          <p className="eyebrow">Module summary</p>
          <h3 className="reports-section-heading">
            {icon ? <span className="reports-section-icon" aria-hidden="true">{icon}</span> : null}
            {title}
          </h3>
          {note ? <p className="reports-section-note">{note}</p> : null}
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

      <p className="reports-section-footer">{MODULE_FOOTER}</p>
    </section>
  )
}

function formatSectionMetric(value, { connected = true, format = 'count' } = {}) {
  if (!connected) return 'Not connected'
  if (value === null || value === undefined) return '—'
  if (format === 'currency') return formatReportCurrency(value)
  if (format === 'percent') return formatReportPercent(value)
  if (format === 'hours') return `${value}h`
  if (format === 'text') return `${value}`
  return `${value}`
}

function InsightsAttentionPanel({
  attentionItems,
  attentionPermissions,
  onAttentionItemClick,
  isLoading,
}) {
  if (isLoading) {
    return (
      <section className="reports-attention panel staff-panel" aria-label="Needs attention" aria-busy="true">
        <header className="reports-overview-header">
          <div>
            <p className="eyebrow">Actionable insights</p>
            <h3 className="reports-section-heading">
              <span className="reports-section-icon" aria-hidden="true">⚠️</span>
              Needs attention
            </h3>
          </div>
        </header>
        <ReportsLoadingState variant="section" />
        <p className="reports-section-footer">{MODULE_FOOTER}</p>
      </section>
    )
  }

  return (
    <section className="reports-attention panel staff-panel" aria-label="Needs attention">
      <header className="reports-overview-header">
        <div>
          <p className="eyebrow">Actionable insights</p>
          <h3 className="reports-section-heading">
            <span className="reports-section-icon" aria-hidden="true">⚠️</span>
            Needs attention
          </h3>
        </div>
      </header>

      {attentionItems.length === 0 ? (
        <div className="schedule-empty-state reports-section-empty">
          <p>No urgent issues right now.</p>
          <p className="reports-section-empty-guidance">Operational alerts from tasks, stock, schedule, and service will appear here.</p>
        </div>
      ) : (
        <ul className="today-attention-list reports-attention-list">
          {attentionItems.map((item) => (
            <TodayAttentionListItem
              key={item.key}
              item={item}
              attentionPermissions={attentionPermissions}
              onAttentionItemClick={onAttentionItemClick}
            />
          ))}
        </ul>
      )}

      <p className="reports-section-footer">{MODULE_FOOTER}</p>
    </section>
  )
}

export default function ReportsView({
  todayKey,
  weekStartDate,
  reservations,
  tasks,
  inventoryItems,
  stockItems = [],
  stockOrders = [],
  barRefills,
  suppliers,
  schedule,
  connections,
  serviceSnapshot = null,
  coverageBreakdown = null,
  attentionItems = [],
  attentionPermissions = {},
  isLoading,
  onViewModule,
  onAttentionItemClick,
}) {
  const [period, setPeriod] = useState(REPORT_PERIOD_TODAY)

  const reports = useMemo(() => buildReportsBundle({
    period,
    todayKey,
    weekStartDate,
    reservations,
    tasks,
    inventoryItems,
    stockItems,
    stockOrders,
    barRefills,
    suppliers,
    schedule,
    connections,
    serviceSnapshot,
    coverageBreakdown,
    attentionItems,
  }), [
    period,
    todayKey,
    weekStartDate,
    reservations,
    tasks,
    inventoryItems,
    stockItems,
    stockOrders,
    barRefills,
    suppliers,
    schedule,
    connections,
    serviceSnapshot,
    coverageBreakdown,
    attentionItems,
  ])

  const showAttentionPanel = period === REPORT_PERIOD_TODAY
  const stockConnected = reports.stockReport.connected
  const reservationsEmpty = reports.reservationsReport.connected
    && reports.reservationsReport.empty
    ? 'No reservations for this period.'
    : null
  const tasksEmpty = reports.tasksReport.connected && reports.tasksReport.empty
    ? 'No tasks available.'
    : null
  const stockEmpty = stockConnected && reports.stockReport.empty
    ? 'No stock items available.'
    : null
  const scheduleEmpty = reports.scheduleReport.connected && reports.scheduleReport.empty
    ? 'No draft schedule shifts for this period.'
    : null
  const suppliersEmpty = reports.suppliersReport.connected && reports.suppliersReport.empty
    ? 'No suppliers available.'
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
        label: 'Seated guests',
        value: formatSectionMetric(reports.reservationsReport.metrics.seatedGuests, {
          connected: reports.reservationsReport.connected,
        }),
      },
      {
        key: 'waiting',
        label: 'Waiting',
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
        label: 'Service status',
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
      label: 'In house',
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
      label: 'Items to order',
      value: formatSectionMetric(reports.stockReport.metrics.itemsToOrder, {
        connected: stockConnected,
      }),
    },
    {
      key: 'low-stock',
      label: 'Low stock',
      value: formatSectionMetric(reports.stockReport.metrics.lowStock, {
        connected: stockConnected,
      }),
    },
    {
      key: 'out-of-stock',
      label: 'Out of stock',
      value: formatSectionMetric(reports.stockReport.metrics.outOfStock, {
        connected: stockConnected,
      }),
    },
    {
      key: 'stock-value',
      label: 'Total stock value',
      value: formatSectionMetric(reports.stockReport.metrics.totalStockValue, {
        connected: stockConnected,
        format: 'currency',
      }),
    },
  ]

  if (reports.stockReport.stockModuleConnected && reports.stockReport.metrics.pendingOrders != null) {
    stockMetrics.push(
      {
        key: 'pending-orders',
        label: 'Pending orders',
        value: formatSectionMetric(reports.stockReport.metrics.pendingOrders, {
          connected: stockConnected,
        }),
      },
      {
        key: 'awaiting-delivery',
        label: 'Awaiting delivery',
        value: formatSectionMetric(reports.stockReport.metrics.awaitingDelivery, {
          connected: stockConnected,
        }),
      },
    )
  }

  stockMetrics.push({
    key: 'bar-refills',
    label: 'Bar refills completed',
    value: formatSectionMetric(reports.stockReport.metrics.barRefillsCompleted, {
      connected: reports.stockReport.barRefillsConnected,
    }),
  })

  const scheduleNote = [
    reports.scheduleReport.usesDraftSchedule ? 'Draft schedule data' : null,
    reports.scheduleReport.coverageDetail,
  ].filter(Boolean).join(' · ') || null

  return (
    <section className="staff-page reports-page">
      <div className="reports-period-filters" role="group" aria-label="Report period">
        <button
          type="button"
          className={`filter-chip${period === REPORT_PERIOD_TODAY ? ' active' : ''}`}
          onClick={() => setPeriod(REPORT_PERIOD_TODAY)}
        >
          Today
        </button>
        <button
          type="button"
          className={`filter-chip${period === REPORT_PERIOD_WEEK ? ' active' : ''}`}
          onClick={() => setPeriod(REPORT_PERIOD_WEEK)}
        >
          This Week
        </button>
      </div>

      <section className="reports-overview panel staff-panel" aria-label="Manager Brief">
        <header className="reports-overview-header">
          <div>
            <p className="eyebrow">Executive summary</p>
            <h3 className="reports-section-heading">
              <span className="reports-section-icon" aria-hidden="true">⚡</span>
              Manager Brief
            </h3>
            <p className="reports-overview-subtitle">
              {isLoading ? 'Loading operational overview…' : reports.healthSummary}
            </p>
          </div>
        </header>

        {isLoading ? (
          <ReportsLoadingState variant="overview" />
        ) : (
          <div className="reports-overview-grid">
            {reports.overview.map((metric) => (
              <ReportMetric
                key={metric.key}
                label={metric.label}
                value={formatReportMetricValue(metric.value, {
                  connected: metric.connected,
                  format: metric.format,
                })}
                emphasize
              />
            ))}
          </div>
        )}

        <p className="reports-section-footer">{MODULE_FOOTER}</p>
      </section>

      {showAttentionPanel ? (
        <InsightsAttentionPanel
          attentionItems={reports.insightsAttention}
          attentionPermissions={attentionPermissions}
          onAttentionItemClick={onAttentionItemClick}
          isLoading={isLoading}
        />
      ) : null}

      <div className="reports-sections">
        <ReportSection
          title="Reservations"
          icon="📅"
          metrics={reservationMetrics}
          emptyMessage={!reports.reservationsReport.connected
            ? 'Reservations module is not connected.'
            : reservationsEmpty}
          emptyGuidance={reservationsEmpty ? EMPTY_STATE_GUIDANCE.reservations : null}
          isLoading={isLoading}
          onViewModule={() => onViewModule?.('reservations')}
          viewModuleLabel="View Reservations →"
        />

        <ReportSection
          title="Tasks"
          icon="✓"
          metrics={[
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
              label: period === REPORT_PERIOD_TODAY ? 'Completed today' : 'Completed',
              value: formatSectionMetric(reports.tasksReport.metrics.completed, {
                connected: reports.tasksReport.connected,
              }),
            },
            {
              key: 'completion',
              label: 'Completion %',
              value: period === REPORT_PERIOD_TODAY
                ? formatSectionMetric(reports.tasksReport.metrics.completionPercent, {
                  connected: reports.tasksReport.connected,
                  format: 'percent',
                })
                : '—',
            },
          ]}
          emptyMessage={!reports.tasksReport.connected
            ? 'Tasks module is not connected.'
            : tasksEmpty}
          emptyGuidance={tasksEmpty ? EMPTY_STATE_GUIDANCE.tasks : null}
          isLoading={isLoading}
          onViewModule={() => onViewModule?.('tasks')}
          viewModuleLabel="View Tasks →"
        />

        <ReportSection
          title="Stock"
          icon="📦"
          metrics={stockMetrics}
          emptyMessage={!stockConnected
            ? 'Stock module is not connected.'
            : stockEmpty}
          emptyGuidance={stockEmpty ? EMPTY_STATE_GUIDANCE.stock : null}
          isLoading={isLoading}
          onViewModule={() => onViewModule?.('stock')}
          viewModuleLabel="View Stock →"
        />

        <ReportSection
          title="Schedule"
          icon="🕒"
          note={scheduleNote}
          metrics={[
            {
              key: 'scheduled-staff',
              label: 'Scheduled staff',
              value: formatSectionMetric(reports.scheduleReport.metrics.scheduledStaff, {
                connected: reports.scheduleReport.connected,
              }),
            },
            {
              key: 'scheduled-hours',
              label: 'Scheduled hours',
              value: reports.scheduleReport.connected
                ? `${reports.scheduleReport.metrics.scheduledHoursLabel ?? '—'}h`
                : 'Not connected',
            },
            {
              key: 'issues',
              label: 'Schedule issues',
              value: period === REPORT_PERIOD_TODAY
                ? formatSectionMetric(reports.scheduleReport.metrics.issues, {
                  connected: reports.scheduleReport.connected,
                })
                : '—',
            },
          ]}
          emptyMessage={!reports.scheduleReport.connected
            ? 'Schedule module is not connected.'
            : scheduleEmpty}
          emptyGuidance={scheduleEmpty ? EMPTY_STATE_GUIDANCE.schedule : null}
          isLoading={isLoading}
          onViewModule={() => onViewModule?.('schedule')}
          viewModuleLabel="View Schedule →"
        />

        <ReportSection
          title="Suppliers"
          icon="🚚"
          metrics={[
            {
              key: 'total',
              label: 'Total suppliers',
              value: formatSectionMetric(reports.suppliersReport.metrics.totalSuppliers, {
                connected: reports.suppliersReport.connected,
              }),
            },
            {
              key: 'linked',
              label: 'Linked to stock',
              value: formatSectionMetric(reports.suppliersReport.metrics.linkedToStock, {
                connected: reports.suppliersReport.connected && reports.suppliersReport.inventoryConnected,
              }),
            },
            {
              key: 'unlinked',
              label: 'Without stock items',
              value: formatSectionMetric(reports.suppliersReport.metrics.withoutStockItems, {
                connected: reports.suppliersReport.connected && reports.suppliersReport.inventoryConnected,
              }),
            },
          ]}
          emptyMessage={!reports.suppliersReport.connected
            ? 'Suppliers module is not connected.'
            : suppliersEmpty}
          emptyGuidance={suppliersEmpty ? EMPTY_STATE_GUIDANCE.suppliers : null}
          isLoading={isLoading}
          onViewModule={() => onViewModule?.('suppliers')}
          viewModuleLabel="View Suppliers →"
        />
      </div>
    </section>
  )
}
