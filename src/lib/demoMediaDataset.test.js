import { describe, expect, it } from 'vitest'
import cast from './demoMediaCast.json'
import { applyDemoProfile, demoManagerName, demoVenueName, isDemoMode } from './demoMediaDataset'

describe('demo media dataset', () => {
  it('stays out of the way when login is on', () => {
    const env = { VITE_AUTH_DISABLED: 'false' }
    expect(isDemoMode(env)).toBe(false)
    expect(demoVenueName('en', env)).toBeNull()
    expect(demoManagerName('el', env)).toBeNull()
    const profile = { businessName: 'Real Venue', managerName: 'Alex', city: 'Athens' }
    expect(applyDemoProfile(profile, 'en', env)).toBe(profile)
  })

  it('uses Greek names in Greek and international names in English', () => {
    const env = { VITE_AUTH_DISABLED: 'true' }
    expect(demoVenueName('el', env)).toBe('Kafeneio Laiki')
    expect(demoVenueName('en', env)).toBe('The Harbour Kitchen')
    expect(demoManagerName('el', env)).toBe('Elena Christodoulou')
    expect(demoManagerName('en', env)).toBe('Elena')
    expect(applyDemoProfile({ businessName: 'Other' }, 'en', env)).toMatchObject({
      businessName: 'The Harbour Kitchen',
      managerName: 'Elena',
      city: 'Lisbon',
    })
    expect(applyDemoProfile({ businessName: 'Other' }, 'el', env)).toMatchObject({
      businessName: 'Kafeneio Laiki',
      managerName: 'Elena Christodoulou',
      city: 'Nicosia',
    })
  })

  it('gives the English demo international suppliers', () => {
    const names = cast.en.suppliers.map((supplier) => supplier.name)
    expect(names).toEqual(['Harbour Wines', 'Fresh Market Co.', 'City Bakery'])
    const blob = JSON.stringify(cast.en)
    expect(blob).not.toMatch(/Laiki|KEO|Ouzo|Halloumi|Commandaria|Nicosia|Λαϊκ/)
  })
})
