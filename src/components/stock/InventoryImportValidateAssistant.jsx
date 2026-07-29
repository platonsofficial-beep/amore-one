/**
 * P8.28.0 — Validate Import guided assistant presentation.
 *
 * Presentation only. Consumes buildInventoryImportValidateAssistant output
 * and wraps existing match-resolution / new-product children.
 */

/**
 * @param {{
 *   assistant?: {
 *     state?: string,
 *     guidance?: { headline?: string, supporting?: string, status?: string },
 *     progress?: { resolved?: number, remaining?: number, ready?: number },
 *     blockers?: Array<{
 *       id: string,
 *       title: string,
 *       count: number,
 *       items: string[],
 *       explanation: string,
 *       actionHint?: string|null,
 *     }>,
 *     decisions?: { count?: number, hasDecisions?: boolean },
 *     warnings?: Array<{
 *       id: string,
 *       title: string,
 *       count: number,
 *       items: string[],
 *       explanation: string,
 *     }>,
 *   }|null,
 *   decisionsContent?: import('react').ReactNode,
 *   newProductsContent?: import('react').ReactNode,
 * }} props
 */
export function InventoryImportValidateAssistant({
  assistant = null,
  decisionsContent = null,
  newProductsContent = null,
} = {}) {
  if (!assistant) return null

  const {
    state = 'ready',
    guidance = {},
    progress = {},
    blockers = [],
    decisions = {},
    warnings = [],
  } = assistant

  const hasDecisions = decisions.hasDecisions === true
  const decisionCount = Number(decisions.count) || 0
  const decisionTotal = Number(decisions.total) || decisionCount

  return (
    <div
      className={`inventory-import-validate-assistant is-${state}`}
      data-assistant-state={state}
    >
      <section
        className={`inventory-import-validate-guidance is-${state}`}
        aria-label="Import guidance"
      >
        <div className="inventory-import-validate-guidance-copy">
          <p className="inventory-import-validate-guidance-status">
            {guidance.status}
          </p>
          <h4 className="inventory-import-validate-guidance-headline">
            {guidance.headline}
          </h4>
          <p className="inventory-import-validate-guidance-supporting">
            {guidance.supporting}
          </p>
        </div>
        <div
          className="inventory-import-validate-progress"
          aria-label="Validation progress"
        >
          <div className="inventory-import-validate-progress-item">
            <span className="inventory-import-validate-progress-label">Resolved</span>
            <span className="inventory-import-validate-progress-value">
              {Number(progress.resolved) || 0}
            </span>
          </div>
          <div className="inventory-import-validate-progress-item">
            <span className="inventory-import-validate-progress-label">Remaining</span>
            <span className="inventory-import-validate-progress-value">
              {Number(progress.remaining) || 0}
            </span>
          </div>
          <div className="inventory-import-validate-progress-item is-ready">
            <span className="inventory-import-validate-progress-label">Ready</span>
            <span className="inventory-import-validate-progress-value">
              {Number(progress.ready) || 0}
            </span>
          </div>
        </div>
      </section>

      <section
        className="inventory-import-validate-section is-blockers"
        aria-label="Blockers"
      >
        <header className="inventory-import-validate-section-header">
          <h4 className="inventory-import-validate-section-title">Blockers</h4>
          <p className="inventory-import-validate-section-copy">
            Required fixes before this import is fully ready.
          </p>
        </header>
        {blockers.length === 0 ? (
          <p className="inventory-import-validate-section-empty" role="status">
            No blockers.
          </p>
        ) : (
          <div className="inventory-import-validate-groups is-blockers">
            {blockers.map((group) => (
              <details
                key={group.id}
                className="inventory-import-validate-group is-blocker has-items"
                open={group.id === 'missing_units' || group.id === 'blocked_rows'}
              >
                <summary className="inventory-import-validate-group-summary">
                  <span className="inventory-import-validate-group-title">
                    {group.title}
                  </span>
                  <span className="inventory-import-validate-group-count">
                    {group.count}
                  </span>
                </summary>
                <p className="inventory-import-validate-group-explanation">
                  {group.explanation}
                </p>
                {group.actionHint ? (
                  <p className="inventory-import-validate-group-hint">
                    {group.actionHint}
                  </p>
                ) : null}
                <ul className="inventory-import-validate-group-list">
                  {group.items.map((item) => (
                    <li key={`${group.id}-${item}`}>{item}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </section>

      <section
        className="inventory-import-validate-section is-decisions"
        aria-label="Decisions"
      >
        <header className="inventory-import-validate-section-header">
          <h4 className="inventory-import-validate-section-title">Decisions</h4>
          <p className="inventory-import-validate-section-copy">
            {hasDecisions
              ? (decisionCount > 0
                ? (decisionCount === 1
                  ? '1 product still needs a link, create, or skip choice.'
                  : `${decisionCount} products still need a link, create, or skip choice.`)
                : (decisionTotal === 1
                  ? '1 possible match has been reviewed.'
                  : `${decisionTotal} possible matches have been reviewed.`))
              : 'Manager choices required for uncertain matches.'}
          </p>
        </header>
        {hasDecisions ? (
          <div className="inventory-import-validate-decisions-body">
            {decisionsContent}
          </div>
        ) : (
          <p className="inventory-import-validate-section-empty is-positive" role="status">
            No decisions required.
          </p>
        )}
      </section>

      <section
        className="inventory-import-validate-section is-warnings"
        aria-label="Warnings"
      >
        <header className="inventory-import-validate-section-header">
          <h4 className="inventory-import-validate-section-title">Warnings</h4>
          <p className="inventory-import-validate-section-copy">
            Non-blocking items worth a quick review.
          </p>
        </header>
        {warnings.length === 0 ? (
          <p className="inventory-import-validate-section-empty" role="status">
            No warnings.
          </p>
        ) : (
          <div className="inventory-import-validate-groups is-warnings">
            {warnings.map((group) => (
              <details
                key={group.id}
                className="inventory-import-validate-group is-warning has-items"
              >
                <summary className="inventory-import-validate-group-summary">
                  <span className="inventory-import-validate-group-title">
                    {group.title}
                  </span>
                  <span className="inventory-import-validate-group-count">
                    {group.count}
                  </span>
                </summary>
                <p className="inventory-import-validate-group-explanation">
                  {group.explanation}
                </p>
                <ul className="inventory-import-validate-group-list">
                  {group.items.map((item) => (
                    <li key={`${group.id}-${item}`}>{item}</li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        )}
      </section>

      {newProductsContent ? (
        <div className="inventory-import-validate-new-products-body">
          {newProductsContent}
        </div>
      ) : null}
    </div>
  )
}
