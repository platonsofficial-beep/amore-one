import { describe, expect, it } from 'vitest'
import { HELP_ARTICLES } from './helpKnowledge'
import { helpArticlesForRole, helpSectionsForRole, searchHelp, supportMailto } from './searchHelp'

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
    expect(staff.matches.map((item) => item.article.id)).toEqual(['billing-staff'])
    expect(staff.matches.some((item) => /€|VAT|€29/.test(JSON.stringify(item.article.steps)))).toBe(false)
    expect(manager.matches[0]?.article.id).toBe('billing-plans')
    expect(manager.matches.every((item) => item.article.id.startsWith('billing'))).toBe(true)
    expect(searchHelp('how do I use the floor plan', { role: 'staff' }).matches[0]?.article.id).toBe('floor-plan')
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

  it('offers role-aware topics and Greek copy for every article', () => {
    const owner = helpSectionsForRole('owner', 'en').map((section) => section.id)
    const staff = helpSectionsForRole('staff', 'en').map((section) => section.id)
    expect(owner).toContain('billing')
    expect(owner).toEqual(expect.arrayContaining(['reservations', 'schedule', 'stock', 'tasks', 'chat', 'settings']))
    expect(staff).not.toContain('billing')
    expect(staff).not.toContain('stock')
    for (const article of HELP_ARTICLES) {
      expect(article.title.el, article.id).toBeTruthy()
      expect(article.summary.el, article.id).toBeTruthy()
      expect(article.questions.el?.length, article.id).toBeGreaterThan(0)
      expect(article.steps.el?.length, article.id).toBeGreaterThan(0)
    }
    expect(helpSectionsForRole('owner', 'el').find((section) => section.id === 'reservations')?.label).toBe('Κρατήσεις')
  })

  it('keeps the knowledge base pointed at real screens', () => {
    const walkIn = HELP_ARTICLES.find((article) => article.id === 'walk-in')
    expect(walkIn.screen).toEqual({ view: 'reservations' })
    expect(walkIn.steps.en.join(' ')).toMatch(/Walk-in/)
    expect(HELP_ARTICLES.find((article) => article.id === 'billing-plans').audience).toBe('managers')
  })
})
