// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  presentMigrationActivityTimeline,
  presentMigrationActivityTimelineRow,
} from './inventoryMigrationActivityPresentation'

describe('inventoryMigrationActivityPresentation', () => {
  it('preserves order and presents session lifecycle labels', () => {
    const rows = [
      {
        id: 'a1',
        activityType: 'session_completed',
        activity: 'Session completed',
        createdAt: 'Later',
      },
      {
        id: 'a2',
        activityType: 'session_started',
        activity: 'Session started',
        createdAt: 'Earlier',
      },
    ]

    const presented = presentMigrationActivityTimeline(rows)
    expect(presented.map((row) => row.id)).toEqual(['a1', 'a2'])
    expect(presented[0]).toMatchObject({
      label: 'Session Completed',
      timestamp: 'Later',
      description: 'Session completed',
    })
    expect(presented[1].label).toBe('Session Started')
  })

  it('presents stage completed / started and attention acknowledgement', () => {
    expect(presentMigrationActivityTimelineRow({
      id: 'n1',
      activityType: 'note',
      activity: 'Preflight completed: passed (result_id=x).',
      createdAt: 'T1',
    })).toMatchObject({
      label: 'Stage Completed',
      stage: 'Preflight',
      description: 'Preflight completed: passed (result_id=x).',
    })

    expect(presentMigrationActivityTimelineRow({
      id: 'n2',
      activityType: 'note',
      activity: 'Phase 1 started',
      createdAt: 'T2',
    })).toMatchObject({
      label: 'Stage Started',
      stage: 'Phase 1',
    })

    expect(presentMigrationActivityTimelineRow({
      id: 'n3',
      activityType: 'note',
      activity: 'Attention acknowledged: integrity_audit → preflight (result_id=r1, ack_id=a1).',
      createdAt: 'T3',
    })).toMatchObject({
      label: 'Attention Acknowledged',
      stage: 'integrity_audit → preflight',
    })
  })

  it('falls back safely for notes and unknown types without dropping rows', () => {
    expect(presentMigrationActivityTimelineRow({
      id: 'n4',
      activityType: 'note',
      activity: 'Operator reminder about maintenance window.',
      createdAt: 'T4',
    })).toMatchObject({
      label: 'Note',
      stage: '',
      description: 'Operator reminder about maintenance window.',
    })

    expect(presentMigrationActivityTimelineRow({
      id: 'u1',
      activityType: 'custom_event',
      activity: 'Custom event detail',
      createdAt: 'T5',
    })).toMatchObject({
      label: 'custom_event',
      description: 'Custom event detail',
    })

    expect(presentMigrationActivityTimeline([null, { id: 'ok', activityType: 'session_cancelled', activity: 'Session cancelled', createdAt: 'T6' }]))
      .toHaveLength(2)
  })
})
