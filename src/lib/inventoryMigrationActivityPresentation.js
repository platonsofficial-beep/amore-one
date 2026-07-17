/**
 * Presentation-only mapping for Operator Panel activity timeline rows.
 * Does not fetch, mutate, or reorder activity data.
 */

const SESSION_TYPE_LABELS = Object.freeze({
  session_started: 'Session Started',
  session_completed: 'Session Completed',
  session_cancelled: 'Session Cancelled',
})

const STAGE_COMPLETION_PATTERNS = Object.freeze([
  Object.freeze({ match: /^foundation\s+completed\b/i, stage: 'foundation', title: 'Foundation' }),
  Object.freeze({ match: /^persist\s+completed\b/i, stage: 'persist', title: 'Persist' }),
  Object.freeze({ match: /^auto\s*link\s+completed\b/i, stage: 'auto_link', title: 'Auto Link' }),
  Object.freeze({ match: /^auto\s*create\s+completed\b/i, stage: 'auto_create', title: 'Auto Create' }),
  Object.freeze({ match: /^integrity(?:\s+audit)?\s+completed\b/i, stage: 'integrity_audit', title: 'Integrity Audit' }),
  Object.freeze({ match: /^preflight\s+completed\b/i, stage: 'preflight', title: 'Preflight' }),
  Object.freeze({ match: /^preview\s+completed\b/i, stage: 'preview', title: 'Preview' }),
  Object.freeze({ match: /^phase\s*1\s+completed\b/i, stage: 'phase1', title: 'Phase 1' }),
  Object.freeze({ match: /^phase\s*2\s+completed\b/i, stage: 'phase2', title: 'Phase 2' }),
  Object.freeze({ match: /^post(?:[-\s]?apply)?(?:\s+audit)?\s+completed\b/i, stage: 'post_apply_audit', title: 'Post-Apply Audit' }),
])

const STAGE_STARTED_PATTERNS = Object.freeze([
  Object.freeze({ match: /^foundation\s+started\b/i, stage: 'foundation', title: 'Foundation' }),
  Object.freeze({ match: /^persist\s+started\b/i, stage: 'persist', title: 'Persist' }),
  Object.freeze({ match: /^auto\s*link\s+started\b/i, stage: 'auto_link', title: 'Auto Link' }),
  Object.freeze({ match: /^auto\s*create\s+started\b/i, stage: 'auto_create', title: 'Auto Create' }),
  Object.freeze({ match: /^integrity(?:\s+audit)?\s+started\b/i, stage: 'integrity_audit', title: 'Integrity Audit' }),
  Object.freeze({ match: /^preflight\s+started\b/i, stage: 'preflight', title: 'Preflight' }),
  Object.freeze({ match: /^preview\s+started\b/i, stage: 'preview', title: 'Preview' }),
  Object.freeze({ match: /^phase\s*1\s+started\b/i, stage: 'phase1', title: 'Phase 1' }),
  Object.freeze({ match: /^phase\s*2\s+started\b/i, stage: 'phase2', title: 'Phase 2' }),
  Object.freeze({ match: /^post(?:[-\s]?apply)?(?:\s+audit)?\s+started\b/i, stage: 'post_apply_audit', title: 'Post-Apply Audit' }),
])

const ATTENTION_ACK_PATTERN = /^attention\s+acknowledged:\s*([^\s→\-]+)\s*(?:→|->)\s*([^\s(]+)/i

function asText(value) {
  return `${value ?? ''}`.trim()
}

function displayOrEmpty(value) {
  const text = asText(value)
  if (!text || text === '—') return ''
  return text
}

function matchStagePattern(text, patterns) {
  for (const pattern of patterns) {
    if (pattern.match.test(text)) {
      return pattern
    }
  }
  return null
}

/**
 * Map one loaded activity row into timeline presentation fields.
 * Preserves identity; does not invent timestamps or hide rows.
 */
export function presentMigrationActivityTimelineRow(row, index = 0) {
  if (!row || typeof row !== 'object') {
    return {
      id: `activity-empty-${index}`,
      timestamp: '—',
      label: 'Activity',
      stage: '',
      description: '',
    }
  }

  const activityType = displayOrEmpty(row.activityType)
  const description = displayOrEmpty(row.activity)
  const timestamp = displayOrEmpty(row.createdAt) || '—'
  const id = row.id ?? `activity-${index}`

  if (SESSION_TYPE_LABELS[activityType]) {
    return {
      id,
      timestamp,
      label: SESSION_TYPE_LABELS[activityType],
      stage: '',
      description,
    }
  }

  if (activityType === 'note' || !activityType) {
    const attention = description.match(ATTENTION_ACK_PATTERN)
    if (attention) {
      return {
        id,
        timestamp,
        label: 'Attention Acknowledged',
        stage: `${attention[1]} → ${attention[2]}`,
        description,
      }
    }

    const completed = matchStagePattern(description, STAGE_COMPLETION_PATTERNS)
    if (completed) {
      return {
        id,
        timestamp,
        label: 'Stage Completed',
        stage: completed.title,
        description,
      }
    }

    const started = matchStagePattern(description, STAGE_STARTED_PATTERNS)
    if (started) {
      return {
        id,
        timestamp,
        label: 'Stage Started',
        stage: started.title,
        description,
      }
    }

    return {
      id,
      timestamp,
      label: 'Note',
      stage: '',
      description,
    }
  }

  return {
    id,
    timestamp,
    label: activityType || 'Activity',
    stage: '',
    description,
  }
}

/**
 * Present all activity rows in the received order. Never drops rows.
 */
export function presentMigrationActivityTimeline(rows) {
  const list = Array.isArray(rows) ? rows : []
  return list.map((row, index) => presentMigrationActivityTimelineRow(row, index))
}
