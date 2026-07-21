import { useMemo } from 'react'
import { StockMigrationGuidedHeader } from './StockMigrationGuidedHeader'
import { StockMigrationStageNavigator } from './StockMigrationStageNavigator'
import { buildGuidedMigrationWorkflowModel } from './stockMigrationGuidedWorkflowModel'

/**
 * Guided Migration Workflow Shell — presentation-only foundation.
 * Mounts above existing migration diagnostic panels.
 */
export function StockMigrationGuidedWorkflow({
  operator = null,
  sessionSummary = null,
  health = null,
  metrics = null,
  metricsAvailable = false,
  manualReviewCount = 0,
  attentionCount = 0,
}) {
  const model = useMemo(
    () => buildGuidedMigrationWorkflowModel({
      operator,
      sessionSummary,
      health,
      metrics,
      metricsAvailable,
      manualReviewCount,
      attentionCount,
    }),
    [
      operator,
      sessionSummary,
      health,
      metrics,
      metricsAvailable,
      manualReviewCount,
      attentionCount,
    ],
  )

  return (
    <section
      className="panel staff-panel stock-migration-panel stock-migration-guided-workflow"
      aria-label="Guided migration workflow"
    >
      <div className="stock-migration-panel-header stock-migration-guided-workflow-header">
        <h3 className="stock-migration-panel-title">Guided workflow</h3>
        <p className="stock-migration-panel-copy">
          Orientation for the current migration session. Existing operator controls stay below.
        </p>
      </div>

      <StockMigrationGuidedHeader model={model} />
      <StockMigrationStageNavigator model={model} />
    </section>
  )
}
