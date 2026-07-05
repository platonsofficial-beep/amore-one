import { useMemo, useState } from 'react'
import {
  REPORT_PERIOD_TODAY,
  REPORT_PERIOD_WEEK,
  buildReportsBundle,
  formatReportCurrency,
  formatReportMetricValue,
  formatReportPercent,
} from '../../lib/reportsUtils'

function ReportMetric({ label, value, emphasize = false }) {
  return (
    <article className={`reports-metric${emphasize ? ' reports-metric-emphasis' : ''}`}>
      <p className="reports-metric-label">{label}</p>
      <p className="reports-metric-value">{value}</p>
    </article>
  )
}

function ReportSection({
  title,
  note,
  metrics,
  emptyMessage,
  isLoading,
  onViewModule,
  viewModuleLabel,
}) {
  return (
    <section className="reports-section panel staff-panel">
      <header className="reports-section-header">
        <div>
          <p className="eyebrow">Module summary</p>
          <h3>{title}</h3>
          {note ? <p className="reports-section-note">{note}</p> : null}
        </div>
        <button type="button" className="ghost-btn reports-view-module-btn" onClick={onViewModule}>
          {viewModuleLabel}
        </button>
      </header>

      {isLoading ? (
        <p className="staff-status-banner">Loading report data…</p>
      ) : emptyMessage ? (
        <div className="schedule-empty-state reports-section-empty">
          <p>{emptyMessage}</p>
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

function formatSectionMetric(value, { connected = true, format = 'count' } = {}) {
  if (!connected) return 'Not connected'
  if (value === null || value === undefined) return '—'
  if (format === 'currency') return formatReportCurrency(value)
  if (format === 'percent') return formatReportPercent(value)
  if (format === 'hours') return `${value}h`
  return `${value}`
}

export default function ReportsView({
  todayKey,
  weekStartDate,
  reservations,
  tasks,
  inventoryItems,
  barRefills,
  suppliers,
  schedule,
  connections,
  isLoading,
  onViewModule,
}) {
  const [period, setPeriod] = useState(REPORT_PERIOD_TODAY)

  const reports = useMemo(() => buildReportsBundle({
    period,
    todayKey,
    weekStartDate,
    reservations,
    tasks,
    inventoryItems,
    barRefills,
    suppliers,
    schedule,
    connections,
  }), [
    period,
    todayKey,
    weekStartDate,
    reservations,
    tasks,
    inventoryItems,
    barRefills,
    suppliers,
    schedule,
    connections,
  ])

  const reservationsEmpty = reports.reservationsReport.connected
    && reports.reservationsReport.empty
    ? 'No reservations for this period.'
    : null
  const tasksEmpty = reports.tasksReport.connected && reports.tasksReport.empty
    ? 'No tasks available.'
    : null
  const stockEmpty = reports.stockReport.inventoryConnected && reports.stockReport.empty
    ? 'No stock items available.'
    : null
  const scheduleEmpty = reports.scheduleReport.connected && reports.scheduleReport.empty
    ? 'No draft schedule shifts for this period.'
    : null
  const suppliersEmpty = reports.suppliersReport.connected && reports.suppliersReport.empty
    ? 'No suppliers available.'
    : null

  return (
    <section className="staff-page reports-page">
      <div className="staff-header-card reports-header-card">
        <div>
          <p className="eyebrow">Operational reporting</p>
          <h3>Reports</h3>
          <p className="staff-subtitle">Operational summaries from your connected modules.</p>
        </div>
      </div>

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

      <section className="reports-overview panel staff-panel" aria-label="Overview KPIs">
        <header className="reports-section-header">
          <div>
            <p className="eyebrow">Overview</p>
            <h3>{period === REPORT_PERIOD_TODAY ? 'Today at a glance' : 'This week at a glance'}</h3>
          </div>
        </header>

        {isLoading ? (
          <p className="staff-status-banner">Loading report data…</p>
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
      </section>

      <div className="reports-sections">
        <ReportSection
          title="Reservations"
          metrics={[
            {
              key: 'bookings',
              label: 'Bookings',
              value: formatSectionMetric(reports.reservationsReport.metrics.bookings, {
                connected: reports.reservationsReport.connected,
              }),
              connected: reports.reservationsReport.connected,
            },
            {
              key: 'guests',
              label: 'Guests',
              value: formatSectionMetric(reports.reservationsReport.metrics.guests, {
                connected: reports.reservationsReport.connected,
              }),
              connected: reports.reservationsReport.connected,
            },
            {
              key: 'in-house',
              label: 'In house',
              value: formatSectionMetric(reports.reservationsReport.metrics.inHouse, {
                connected: reports.reservationsReport.connected,
              }),
              connected: reports.reservationsReport.connected,
            },
            {
              key: 'completed',
              label: 'Completed',
              value: formatSectionMetric(reports.reservationsReport.metrics.completed, {
                connected: reports.reservationsReport.connected,
              }),
              connected: reports.reservationsReport.connected,
            },
            {
              key: 'cancelled',
              label: 'Cancelled',
              value: formatSectionMetric(reports.reservationsReport.metrics.cancelled, {
                connected: reports.reservationsReport.connected,
              }),
              connected: reports.reservationsReport.connected,
            },
            {
              key: 'no-show',
              label: 'No-show',
              value: formatSectionMetric(reports.reservationsReport.metrics.noShow, {
                connected: reports.reservationsReport.connected,
              }),
              connected: reports.reservationsReport.connected,
            },
          ]}
          emptyMessage={!reports.reservationsReport.connected
            ? 'Reservations module is not connected.'
            : reservationsEmpty}
          isLoading={isLoading}
          onViewModule={() => onViewModule?.('reservations')}
          viewModuleLabel="View Reservations →"
        />

        <ReportSection
          title="Tasks"
          metrics={[
            {
              key: 'active',
              label: 'Active',
              value: formatSectionMetric(reports.tasksReport.metrics.active, {
                connected: reports.tasksReport.connected,
              }),
              connected: reports.tasksReport.connected,
            },
            {
              key: 'overdue',
              label: 'Overdue',
              value: formatSectionMetric(reports.tasksReport.metrics.overdue, {
                connected: reports.tasksReport.connected,
              }),
              connected: reports.tasksReport.connected,
            },
            {
              key: 'urgent',
              label: 'Urgent',
              value: formatSectionMetric(reports.tasksReport.metrics.urgent, {
                connected: reports.tasksReport.connected,
              }),
              connected: reports.tasksReport.connected,
            },
            {
              key: 'completed',
              label: period === REPORT_PERIOD_TODAY ? 'Completed today' : 'Completed',
              value: formatSectionMetric(reports.tasksReport.metrics.completed, {
                connected: reports.tasksReport.connected,
              }),
              connected: reports.tasksReport.connected,
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
              connected: reports.tasksReport.connected,
            },
          ]}
          emptyMessage={!reports.tasksReport.connected
            ? 'Tasks module is not connected.'
            : tasksEmpty}
          isLoading={isLoading}
          onViewModule={() => onViewModule?.('tasks')}
          viewModuleLabel="View Tasks →"
        />

        <ReportSection
          title="Stock"
          metrics={[
            {
              key: 'items-to-order',
              label: 'Items to order',
              value: formatSectionMetric(reports.stockReport.metrics.itemsToOrder, {
                connected: reports.stockReport.inventoryConnected,
              }),
              connected: reports.stockReport.inventoryConnected,
            },
            {
              key: 'low-stock',
              label: 'Low stock',
              value: formatSectionMetric(reports.stockReport.metrics.lowStock, {
                connected: reports.stockReport.inventoryConnected,
              }),
              connected: reports.stockReport.inventoryConnected,
            },
            {
              key: 'out-of-stock',
              label: 'Out of stock',
              value: formatSectionMetric(reports.stockReport.metrics.outOfStock, {
                connected: reports.stockReport.inventoryConnected,
              }),
              connected: reports.stockReport.inventoryConnected,
            },
            {
              key: 'stock-value',
              label: 'Total stock value',
              value: formatSectionMetric(reports.stockReport.metrics.totalStockValue, {
                connected: reports.stockReport.inventoryConnected,
                format: 'currency',
              }),
              connected: reports.stockReport.inventoryConnected,
            },
            {
              key: 'bar-refills',
              label: 'Bar refills completed',
              value: formatSectionMetric(reports.stockReport.metrics.barRefillsCompleted, {
                connected: reports.stockReport.barRefillsConnected,
              }),
              connected: reports.stockReport.barRefillsConnected,
            },
          ]}
          emptyMessage={!reports.stockReport.inventoryConnected
            ? 'Stock module is not connected.'
            : stockEmpty}
          isLoading={isLoading}
          onViewModule={() => onViewModule?.('stock')}
          viewModuleLabel="View Stock →"
        />

        <ReportSection
          title="Schedule"
          note={reports.scheduleReport.usesDraftSchedule ? 'Draft schedule data' : null}
          metrics={[
            {
              key: 'scheduled-staff',
              label: 'Scheduled staff',
              value: formatSectionMetric(reports.scheduleReport.metrics.scheduledStaff, {
                connected: reports.scheduleReport.connected,
              }),
              connected: reports.scheduleReport.connected,
            },
            {
              key: 'scheduled-hours',
              label: 'Scheduled hours',
              value: reports.scheduleReport.connected
                ? `${reports.scheduleReport.metrics.scheduledHoursLabel ?? '—'}h`
                : 'Not connected',
              connected: reports.scheduleReport.connected,
            },
            {
              key: 'issues',
              label: 'Schedule issues',
              value: period === REPORT_PERIOD_TODAY
                ? formatSectionMetric(reports.scheduleReport.metrics.issues, {
                  connected: reports.scheduleReport.connected,
                })
                : '—',
              connected: reports.scheduleReport.connected,
            },
          ]}
          emptyMessage={!reports.scheduleReport.connected
            ? 'Schedule module is not connected.'
            : scheduleEmpty}
          isLoading={isLoading}
          onViewModule={() => onViewModule?.('schedule')}
          viewModuleLabel="View Schedule →"
        />

        <ReportSection
          title="Suppliers"
          metrics={[
            {
              key: 'total',
              label: 'Total suppliers',
              value: formatSectionMetric(reports.suppliersReport.metrics.totalSuppliers, {
                connected: reports.suppliersReport.connected,
              }),
              connected: reports.suppliersReport.connected,
            },
            {
              key: 'linked',
              label: 'Linked to stock',
              value: formatSectionMetric(reports.suppliersReport.metrics.linkedToStock, {
                connected: reports.suppliersReport.connected && reports.suppliersReport.inventoryConnected,
              }),
              connected: reports.suppliersReport.connected && reports.suppliersReport.inventoryConnected,
            },
            {
              key: 'unlinked',
              label: 'Without stock items',
              value: formatSectionMetric(reports.suppliersReport.metrics.withoutStockItems, {
                connected: reports.suppliersReport.connected && reports.suppliersReport.inventoryConnected,
              }),
              connected: reports.suppliersReport.connected && reports.suppliersReport.inventoryConnected,
            },
          ]}
          emptyMessage={!reports.suppliersReport.connected
            ? 'Suppliers module is not connected.'
            : suppliersEmpty}
          isLoading={isLoading}
          onViewModule={() => onViewModule?.('suppliers')}
          viewModuleLabel="View Suppliers →"
        />
      </div>
    </section>
  )
}

