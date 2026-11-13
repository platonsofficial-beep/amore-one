import { describe, expect, it } from 'vitest'
import { HELP_ARTICLES } from './helpKnowledge'
import { helpArticlesForRole, searchHelp, supportMailto } from './searchHelp'

describe('help search', () => {
  it('finds a walk-in from a fuzzy question', () => {
    const { matches } = searchHelp('how do I add a walkin', { role: 'host' })
    expect(matches[0]?.article.id).toBe('walk-in')
    expect(matches.map((item) => item.article.id)).not.toContain('tasks')
    expect(matches.map((item) => item.article.id)).not.toContain('billing-plans')
  })

  it('finds clock-in when the spelling is off', () => {
    const { matches } = searchHelp('clok in', { role: 'staff' })
    expect(matches.some((item) => item.article.id === 'clock')).toBe(true)
  })

  it('matches a Greek reservation question', () => {
    const { matches } = searchHelp('Πώς κάνω κράτηση', { role: 'host', locale: 'el' })
    expect(matches[0]?.article.id).toBe('reservation-new')
  })

  it('hides plan prices from staff and shows them to a manager', () => {
    const staff = searchHelp('how do I choose a plan', { role: 'staff' })
    const manager = searchHelp('how do I choose a plan', { role: 'owner' })
    expect(staff.matches.some((item) => item.article.id === 'billing-plans')).toBe(false)
    expect(staff.matches.some((item) => item.article.id === 'floor-plan')).toBe(false)
    expect(staff.matches.some((item) => /€|VAT|€29/.test(JSON.stringify(item.article.steps)))).toBe(false)
    expect(manager.matches[0]?.article.id).toBe('billing-plans')
    expect(helpArticlesForRole('staff').some((article) => article.audience === 'managers')).toBe(false)
    expect(helpArticlesForRole('general_manager').some((article) => article.id === 'billing-grace')).toBe(true)
  })

  it('offers suggestions and a support email when nothing matches', () => {
    const { matches, suggestions } = searchHelp('zzzz quantum pottery', { role: 'staff' })
    expect(matches).toEqual([])
    expect(suggestions.length).toBeGreaterThan(0)
    const href = supportMailto({
      venueName: 'AMORE.NICOSIA',
      role: 'staff',
      screen: 'Today',
      question: 'zzzz quantum pottery',
    })
    expect(href.startsWith('mailto:info@onehospitality.app?')).toBe(true)
    const body = decodeURIComponent(href).replace(/\+/g, ' ')
    expect(body).toContain('AMORE.NICOSIA')
    expect(body).toContain('staff')
    expect(body).toContain('Today')
    expect(body).toContain('zzzz quantum pottery')
  })

  it('keeps the knowledge base pointed at real screens', () => {
    const walkIn = HELP_ARTICLES.find((article) => article.id === 'walk-in')
    expect(walkIn.screen).toEqual({ view: 'reservations' })
    expect(walkIn.steps.en.join(' ')).toMatch(/Walk-in/)
    expect(HELP_ARTICLES.find((article) => article.id === 'billing-plans').audience).toBe('managers')
  })
})
