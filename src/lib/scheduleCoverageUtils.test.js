import { describe, expect, it } from 'vitest'
import { formatScheduleCoverageStatusLabel } from './scheduleCoverageUtils'

describe('scheduleCoverageUtils', () => {
  describe('formatScheduleCoverageStatusLabel', () => {
    it('renders Missing state when assigned is below required', () => {
      expect(formatScheduleCoverageStatusLabel({ requiredCount: 1, assignedCount: 0 })).toEqual({
        label: 'Missing 1',
        tone: 'understaffed',
        show: true,
      })
    })

    it('renders Covered state when assigned matches required', () => {
      expect(formatScheduleCoverageStatusLabel({ requiredCount: 2, assignedCount: 2 })).toEqual({
        label: '✓ Covered',
        tone: 'covered',
        show: true,
      })
    })

    it('renders Covered extra state when assigned exceeds required', () => {
      expect(formatScheduleCoverageStatusLabel({ requiredCount: 1, assignedCount: 2 })).toEqual({
        label: '✓ Covered +1 extra',
        tone: 'covered',
        show: true,
      })
    })

    it('renders Conflict state when hasConflict is true', () => {
      expect(formatScheduleCoverageStatusLabel({
        requiredCount: 1,
        assignedCount: 1,
        hasConflict: true,
      })).toEqual({
        label: 'Conflict',
        tone: 'conflict',
        show: true,
      })
    })

    it('hides footer label when no required staff is configured', () => {
      expect(formatScheduleCoverageStatusLabel({ requiredCount: 0, assignedCount: 0 })).toEqual({
        label: '',
        tone: 'empty',
        show: false,
      })
    })
  })
})
