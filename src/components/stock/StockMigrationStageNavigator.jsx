import { GUIDED_STAGE_VISUAL } from './stockMigrationGuidedWorkflowModel'

function scrollToManualReview() {
  const target = document.querySelector('.stock-migration-review-workspace')
  if (target && typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

function MissionMarker({ visual, index, isLast }) {
  const completed = visual === GUIDED_STAGE_VISUAL.COMPLETED
  const current = visual === GUIDED_STAGE_VISUAL.CURRENT
  const attention = visual === GUIDED_STAGE_VISUAL.ATTENTION

  return (
    <div className="stock-migration-mission-rail" aria-hidden="true">
      <span
        className={[
          'stock-migration-mission-marker',
          `is-${visual}`,
          current ? 'is-dominant' : '',
        ].filter(Boolean).join(' ')}
        data-mission-marker="true"
      >
        {completed ? (
          <span className="stock-migration-mission-marker-check">✓</span>
        ) : (
          <span className="stock-migration-mission-marker-index">{index + 1}</span>
        )}
      </span>
      {!isLast ? (
        <span
          className={[
            'stock-migration-mission-connector',
            completed ? 'is-completed' : '',
            current || attention ? 'is-active' : '',
          ].filter(Boolean).join(' ')}
          data-mission-connector="true"
        />
      ) : null}
    </div>
  )
}

/**
 * Mission Timeline — canonical migration stage journey.
 * Presentation only — no mutation controls.
 * Manual Review is an intervention checkpoint, not a canonical stage.
 */
export function StockMigrationStageNavigator({ model }) {
  const stages = Array.isArray(model?.stages) ? model.stages : []
  const manualCount = Number(model?.manualReviewCount ?? 0) || 0
  const needsAttention = Boolean(model?.manualReviewNeedsAttention ?? manualCount > 0)

  return (
    <div className="stock-migration-guided-navigator stock-migration-mission">
      <div className="stock-migration-guided-navigator-header">
        <h3 className="stock-migration-guided-navigator-title">Mission timeline</h3>
        <p className="stock-migration-guided-navigator-copy">
          Canonical migration sequence. The current stage leads; completed stages become history.
        </p>
      </div>

      <div
        className={[
          'stock-migration-guided-checkpoint',
          needsAttention ? 'is-attention' : 'is-clear',
        ].join(' ')}
        role="status"
        aria-label="Manual review checkpoint"
      >
        <div className="stock-migration-guided-checkpoint-copy">
          <p className="stock-migration-guided-checkpoint-title">Manual Review</p>
          <p className="stock-migration-guided-checkpoint-body">
            {needsAttention
              ? (
                manualCount === 1
                  ? '1 map row requires operator resolution before proceeding.'
                  : `${manualCount} map rows require operator resolution before proceeding.`
              )
              : 'No attention required'}
          </p>
        </div>
        {needsAttention ? (
          <button
            type="button"
            className="ghost-btn stock-migration-guided-checkpoint-link"
            onClick={scrollToManualReview}
          >
            View manual review
          </button>
        ) : null}
      </div>

      <ol
        className="stock-migration-guided-stages stock-migration-mission-timeline"
        aria-label="Migration stages"
      >
        {stages.map((stage, index) => {
          const visual = stage.visualState ?? GUIDED_STAGE_VISUAL.WAITING
          return (
            <li
              key={stage.id}
              className={[
                'stock-migration-guided-stage',
                'stock-migration-mission-step',
                `is-${visual}`,
                stage.isCurrent ? 'is-emphasized' : '',
              ].filter(Boolean).join(' ')}
              aria-current={stage.isCurrent ? 'step' : undefined}
            >
              <MissionMarker
                visual={visual}
                index={index}
                isLast={index >= stages.length - 1}
              />
              <div className="stock-migration-guided-stage-body stock-migration-mission-body">
                <div className="stock-migration-guided-stage-top">
                  <p className="stock-migration-guided-stage-name">{stage.title}</p>
                  <span className={`stock-migration-guided-stage-badge is-${visual}`}>
                    {stage.statusLabel}
                  </span>
                </div>
                <p className="stock-migration-guided-stage-description">{stage.description}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
