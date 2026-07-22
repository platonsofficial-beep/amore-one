/**
 * Read-only Inventory Migration Preflight Workspace.
 * Presentation only — answers "Is this workspace safe to migrate?"
 * Uses existing dashboard inputs. No RPCs, writes, or execution.
 */

export const PREFLIGHT_CHECK_STATUS = {
  PASS: 'PASS',
  WARNING: 'WARNING',
  BLOCKED: 'BLOCKED',
  UNKNOWN: 'UNKNOWN',
}

function asCount(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function formatCount(value, available) {
  if (!available) return 'Unknown'
  return `${asCount(value)}`
}

function checkIcon(status) {
  switch (status) {
    case PREFLIGHT_CHECK_STATUS.PASS:
      return '✓'
    case PREFLIGHT_CHECK_STATUS.WARNING:
      return '!'
    case PREFLIGHT_CHECK_STATUS.BLOCKED:
      return '✕'
    default:
      return '?'
  }
}

/**
 * Derive readiness checks from existing health/metrics/audit inputs only.
 * Does not invent backend values.
 */
export function buildPreflightChecks({
  metrics = null,
  metricsAvailable = false,
  tableReachable = false,
  health = null,
  auditEvidence = null,
  attentionCount = 0,
} = {}) {
  if (!metricsAvailable) {
    return [
      {
        id: 'map-reachability',
        title: 'Migration map',
        description: 'Live migration map metrics are not available yet.',
        status: PREFLIGHT_CHECK_STATUS.UNKNOWN,
      },
      {
        id: 'manual-review',
        title: 'Manual review queue',
        description: 'Manual review queue size cannot be determined.',
        status: PREFLIGHT_CHECK_STATUS.UNKNOWN,
      },
      {
        id: 'attention',
        title: 'Attention items',
        description: 'Attention items cannot be determined.',
        status: PREFLIGHT_CHECK_STATUS.UNKNOWN,
      },
      {
        id: 'integrity-audit',
        title: 'Integrity audit',
        description: 'Integrity audit evidence is unknown without live metrics.',
        status: PREFLIGHT_CHECK_STATUS.UNKNOWN,
      },
      {
        id: 'preflight-evidence',
        title: 'Preflight evidence',
        description: 'Preflight evidence is unknown without live metrics.',
        status: PREFLIGHT_CHECK_STATUS.UNKNOWN,
      },
      {
        id: 'auto-link',
        title: 'Auto-link readiness',
        description: 'Auto-link remaining rows cannot be determined.',
        status: PREFLIGHT_CHECK_STATUS.UNKNOWN,
      },
      {
        id: 'auto-create',
        title: 'Auto-create readiness',
        description: 'Auto-create remaining rows cannot be determined.',
        status: PREFLIGHT_CHECK_STATUS.UNKNOWN,
      },
    ]
  }

  const manual = asCount(health?.manualQueueSize ?? metrics?.manualReview)
  const attention = asCount(health?.attentionQueueSize ?? attentionCount)
  const unknownStages = asCount(health?.unknownPipelineStages)
  const remainingAutoLink = asCount(metrics?.remainingClassifiedAutoLink)
  const remainingAutoCreate = asCount(metrics?.remainingClassifiedAutoCreate)
  const integrityStatus = `${auditEvidence?.integrityAudit ?? 'Unknown'}`.trim() || 'Unknown'
  const preflightStatus = `${auditEvidence?.preflight ?? 'Unknown'}`.trim() || 'Unknown'

  const mapStatus = tableReachable
    ? PREFLIGHT_CHECK_STATUS.PASS
    : PREFLIGHT_CHECK_STATUS.BLOCKED

  const integrityCheckStatus = integrityStatus === 'Completed'
    ? PREFLIGHT_CHECK_STATUS.PASS
    : integrityStatus === 'Waiting'
      ? PREFLIGHT_CHECK_STATUS.WARNING
      : PREFLIGHT_CHECK_STATUS.UNKNOWN

  const preflightCheckStatus = preflightStatus === 'Completed'
    ? PREFLIGHT_CHECK_STATUS.PASS
    : preflightStatus === 'Waiting'
      ? PREFLIGHT_CHECK_STATUS.WARNING
      : PREFLIGHT_CHECK_STATUS.UNKNOWN

  return [
    {
      id: 'map-reachability',
      title: 'Migration map',
      description: tableReachable
        ? 'Migration map is reachable for this workspace.'
        : 'Migration map is not reachable.',
      status: mapStatus,
    },
    {
      id: 'manual-review',
      title: 'Manual review queue',
      description: manual === 0
        ? 'No manual review rows are blocking readiness.'
        : `${manual} map row${manual === 1 ? '' : 's'} require operator resolution.`,
      status: manual === 0 ? PREFLIGHT_CHECK_STATUS.PASS : PREFLIGHT_CHECK_STATUS.BLOCKED,
    },
    {
      id: 'attention',
      title: 'Attention items',
      description: attention === 0
        ? 'No attention items remain.'
        : `${attention} attention item${attention === 1 ? '' : 's'} require acknowledgement.`,
      status: attention === 0 ? PREFLIGHT_CHECK_STATUS.PASS : PREFLIGHT_CHECK_STATUS.BLOCKED,
    },
    {
      id: 'pipeline-clarity',
      title: 'Pipeline clarity',
      description: unknownStages === 0
        ? 'Pipeline stages are resolved from live metrics.'
        : `${unknownStages} pipeline stage${unknownStages === 1 ? '' : 's'} are unknown.`,
      status: unknownStages === 0 ? PREFLIGHT_CHECK_STATUS.PASS : PREFLIGHT_CHECK_STATUS.UNKNOWN,
    },
    {
      id: 'integrity-audit',
      title: 'Integrity audit',
      description: integrityStatus === 'Completed'
        ? 'Integrity audit evidence is complete.'
        : integrityStatus === 'Waiting'
          ? 'Integrity audit has not completed yet.'
          : 'Integrity audit evidence is unknown.',
      status: integrityCheckStatus,
    },
    {
      id: 'preflight-evidence',
      title: 'Preflight evidence',
      description: preflightStatus === 'Completed'
        ? 'Preflight evidence is complete.'
        : preflightStatus === 'Waiting'
          ? 'Preflight has not completed yet.'
          : 'Preflight evidence is unknown.',
      status: preflightCheckStatus,
    },
    {
      id: 'auto-link',
      title: 'Auto-link readiness',
      description: remainingAutoLink === 0
        ? 'No classified auto-link rows remain.'
        : `${remainingAutoLink} classified auto-link row${remainingAutoLink === 1 ? '' : 's'} remain.`,
      status: remainingAutoLink === 0
        ? PREFLIGHT_CHECK_STATUS.PASS
        : PREFLIGHT_CHECK_STATUS.WARNING,
    },
    {
      id: 'auto-create',
      title: 'Auto-create readiness',
      description: remainingAutoCreate === 0
        ? 'No classified auto-create rows remain.'
        : `${remainingAutoCreate} classified auto-create row${remainingAutoCreate === 1 ? '' : 's'} remain.`,
      status: remainingAutoCreate === 0
        ? PREFLIGHT_CHECK_STATUS.PASS
        : PREFLIGHT_CHECK_STATUS.WARNING,
    },
  ]
}

export function summarizePreflightChecks(checks = []) {
  const list = Array.isArray(checks) ? checks : []
  return {
    passed: list.filter((item) => item.status === PREFLIGHT_CHECK_STATUS.PASS).length,
    warnings: list.filter((item) => item.status === PREFLIGHT_CHECK_STATUS.WARNING).length,
    blocked: list.filter((item) => item.status === PREFLIGHT_CHECK_STATUS.BLOCKED).length,
    unknown: list.filter((item) => item.status === PREFLIGHT_CHECK_STATUS.UNKNOWN).length,
  }
}

export function resolvePreflightHeadline({ metricsAvailable = false, health = null, summary = null } = {}) {
  if (!metricsAvailable) {
    return {
      label: 'Unknown',
      tone: 'unknown',
      detail: 'Migration readiness cannot yet be determined.',
    }
  }

  const readiness = `${health?.readiness ?? 'Unknown'}`.trim() || 'Unknown'
  if (readiness === 'Ready' && (summary?.blocked ?? 0) === 0) {
    return {
      label: 'Ready',
      tone: 'ready',
      detail: health?.summary || 'Migration is ready for execution.',
    }
  }

  if (readiness === 'Unknown' || (summary?.unknown ?? 0) > 0 && (summary?.blocked ?? 0) === 0 && (summary?.warnings ?? 0) === 0) {
    return {
      label: 'Unknown',
      tone: 'unknown',
      detail: health?.summary || 'Migration readiness cannot yet be determined.',
    }
  }

  return {
    label: 'Needs Attention',
    tone: 'attention',
    detail: health?.summary || 'Resolve blocking issues before migrating.',
  }
}

export function buildPreflightRecommendations({
  metricsAvailable = false,
  checks = [],
  headline = null,
} = {}) {
  if (!metricsAvailable) {
    return ['Refresh migration metrics to evaluate preflight readiness.']
  }

  const recommendations = []
  const byId = new Map((Array.isArray(checks) ? checks : []).map((item) => [item.id, item]))

  const manual = byId.get('manual-review')
  if (manual?.status === PREFLIGHT_CHECK_STATUS.BLOCKED) {
    recommendations.push('Resolve manual review rows before proceeding.')
  }

  const attention = byId.get('attention')
  if (attention?.status === PREFLIGHT_CHECK_STATUS.BLOCKED) {
    recommendations.push('Acknowledge or clear attention items.')
  }

  const integrity = byId.get('integrity-audit')
  if (integrity?.status === PREFLIGHT_CHECK_STATUS.WARNING) {
    recommendations.push('Run Integrity Audit.')
  }

  const preflight = byId.get('preflight-evidence')
  if (preflight?.status === PREFLIGHT_CHECK_STATUS.WARNING) {
    recommendations.push('Complete Preflight when prior stages allow.')
  }

  const autoLink = byId.get('auto-link')
  if (autoLink?.status === PREFLIGHT_CHECK_STATUS.WARNING) {
    recommendations.push('Clear remaining auto-link classified rows.')
  }

  const autoCreate = byId.get('auto-create')
  if (autoCreate?.status === PREFLIGHT_CHECK_STATUS.WARNING) {
    recommendations.push('Clear remaining auto-create classified rows.')
  }

  if (recommendations.length === 0) {
    if (headline?.tone === 'ready') {
      return ['No action required']
    }
    return ['Review readiness checks before migration execution.']
  }

  return recommendations
}

export function StockMigrationPreflightWorkspace({
  workspaceLabel = '—',
  metrics = null,
  metricsAvailable = false,
  tableReachable = false,
  health = null,
  auditEvidence = null,
  attentionCount = 0,
  acknowledgementCount = 0,
  isLoading = false,
}) {
  const checks = buildPreflightChecks({
    metrics,
    metricsAvailable,
    tableReachable,
    health,
    auditEvidence,
    attentionCount,
  })
  const summary = summarizePreflightChecks(checks)
  const headline = resolvePreflightHeadline({ metricsAvailable, health, summary })
  const recommendations = buildPreflightRecommendations({
    metricsAvailable,
    checks,
    headline,
  })

  const environmentRows = [
    { id: 'workspace', label: 'Workspace', value: `${workspaceLabel ?? ''}`.trim() || '—' },
    {
      id: 'legacy',
      label: 'Legacy rows',
      value: formatCount(metrics?.legacyItems ?? metrics?.total, metricsAvailable),
    },
    {
      id: 'auto-link',
      label: 'Auto-link remaining',
      value: formatCount(metrics?.remainingClassifiedAutoLink, metricsAvailable),
    },
    {
      id: 'auto-create',
      label: 'Auto-create remaining',
      value: formatCount(metrics?.remainingClassifiedAutoCreate, metricsAvailable),
    },
    {
      id: 'manual',
      label: 'Manual review',
      value: formatCount(health?.manualQueueSize ?? metrics?.manualReview, metricsAvailable),
    },
    {
      id: 'attention',
      label: 'Attention items',
      value: formatCount(health?.attentionQueueSize ?? attentionCount, metricsAvailable),
    },
    {
      id: 'acknowledgements',
      label: 'Operator acknowledgements',
      value: metricsAvailable ? formatCount(acknowledgementCount, true) : 'Unknown',
    },
    {
      id: 'readiness',
      label: 'Health readiness',
      value: metricsAvailable ? (`${health?.readiness ?? 'Unknown'}`.trim() || 'Unknown') : 'Unknown',
    },
  ]

  return (
    <section
      className="panel staff-panel stock-migration-panel stock-migration-preflight-workspace"
      aria-label="Migration preflight workspace"
      aria-busy={isLoading ? 'true' : undefined}
    >
      <header className="stock-migration-preflight-header">
        <div className="stock-migration-preflight-header-copy">
          <p className="stock-migration-preflight-eyebrow">Preflight</p>
          <h3 className="stock-migration-panel-title">Preflight Workspace</h3>
          <p className="stock-migration-panel-copy">
            Read-only readiness review. Confirms whether this workspace is safe to migrate.
          </p>
        </div>
        <span
          className={`stock-migration-preflight-overall-badge is-${headline.tone}`}
          aria-label={`Overall readiness ${headline.label}`}
        >
          {headline.label}
        </span>
      </header>

      <article
        className={`stock-migration-preflight-summary is-${headline.tone}`}
        aria-label="Overall readiness summary"
      >
        <div className="stock-migration-preflight-summary-copy">
          <p className="stock-migration-preflight-summary-label">Overall readiness</p>
          <p className="stock-migration-preflight-summary-value">{headline.label}</p>
          <p className="stock-migration-preflight-summary-detail">{headline.detail}</p>
        </div>
        <dl className="stock-migration-preflight-summary-stats">
          <div className="stock-migration-preflight-summary-stat is-pass">
            <dt>Passed</dt>
            <dd>{summary.passed}</dd>
          </div>
          <div className="stock-migration-preflight-summary-stat is-warning">
            <dt>Warnings</dt>
            <dd>{summary.warnings}</dd>
          </div>
          <div className="stock-migration-preflight-summary-stat is-blocked">
            <dt>Blocking</dt>
            <dd>{summary.blocked}</dd>
          </div>
        </dl>
      </article>

      <section className="stock-migration-preflight-section" aria-label="Readiness checks">
        <div className="stock-migration-preflight-section-header">
          <h4 className="stock-migration-preflight-section-title">Readiness checks</h4>
          <p className="stock-migration-preflight-section-copy">
            Live checks from existing migration map and health inputs.
          </p>
        </div>
        <ul className="stock-migration-preflight-checklist">
          {checks.map((item) => (
            <li
              key={item.id}
              className={`stock-migration-preflight-check is-${item.status.toLowerCase()}`}
            >
              <span className="stock-migration-preflight-check-icon" aria-hidden="true">
                {checkIcon(item.status)}
              </span>
              <div className="stock-migration-preflight-check-copy">
                <p className="stock-migration-preflight-check-title">{item.title}</p>
                <p className="stock-migration-preflight-check-description">{item.description}</p>
              </div>
              <span className={`stock-migration-preflight-check-badge is-${item.status.toLowerCase()}`}>
                {item.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="stock-migration-preflight-section" aria-label="Environment information">
        <div className="stock-migration-preflight-section-header">
          <h4 className="stock-migration-preflight-section-title">Environment information</h4>
          <p className="stock-migration-preflight-section-copy">
            Read-only workspace context. Unavailable values show as Unknown.
          </p>
        </div>
        <dl className="stock-migration-preflight-environment">
          {environmentRows.map((row) => (
            <div key={row.id} className="stock-migration-preflight-environment-row">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="stock-migration-preflight-section" aria-label="Recommendations">
        <div className="stock-migration-preflight-section-header">
          <h4 className="stock-migration-preflight-section-title">Recommendations</h4>
          <p className="stock-migration-preflight-section-copy">
            Guidance only. No migration actions run from this workspace.
          </p>
        </div>
        <ul className="stock-migration-preflight-recommendations">
          {recommendations.map((item) => (
            <li key={item} className="stock-migration-preflight-recommendation">
              {item}
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}
