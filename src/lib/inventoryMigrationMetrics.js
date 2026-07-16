/**
 * Pure helpers for Inventory Migration dashboard metrics.
 * Read-only aggregation only — no writes.
 */

export function createEmptyInventoryMigrationMetrics() {
  return {
    legacyItems: 0,
    classified: 0,
    autoLink: 0,
    autoCreate: 0,
    manualReview: 0,
    completed: 0,
    total: 0,
  }
}

export function aggregateInventoryMigrationMetrics(rows = []) {
  const metrics = createEmptyInventoryMigrationMetrics()
  const list = Array.isArray(rows) ? rows : []

  metrics.legacyItems = list.length
  metrics.total = list.length

  for (const row of list) {
    const status = `${row?.status ?? ''}`.trim()
    const resolutionType = `${row?.resolution_type ?? row?.resolutionType ?? ''}`.trim()

    if (status === 'classified') metrics.classified += 1
    if (resolutionType === 'auto_link') metrics.autoLink += 1
    if (resolutionType === 'auto_create') metrics.autoCreate += 1
    if (status === 'manual') metrics.manualReview += 1
    if (status === 'created' || status === 'linked') metrics.completed += 1
  }

  return metrics
}

export function resolveInventoryMigrationStatus(metrics) {
  const completed = Number(metrics?.completed ?? 0)
  const total = Number(metrics?.total ?? metrics?.legacyItems ?? 0)

  if (completed === 0) return 'Not Started'
  if (total > 0 && completed === total) return 'Completed'
  if (completed > 0 && completed < total) return 'In Progress'
  return 'Not Started'
}
