/**
 * One place for the legal identity of the provider.
 * Change this if the trading address or status changes (for example, a
 * registered company or a VAT number later). Do not publish a phone number.
 */
export const LEGAL_PROVIDER = {
  name: 'Platon Sachinis',
  tradingAs: 'ONE Hospitality',
  person: 'natural person',
  addressLine: 'Spyrou Hadjiyiakoumi 20A',
  postalCode: '2416',
  city: 'Nicosia',
  country: 'Cyprus',
  email: 'info@onehospitality.app',
  companyRegistered: false,
  vatRegistered: false,
}

export function providerAddress(provider = LEGAL_PROVIDER) {
  return `${provider.addressLine}, ${provider.postalCode} ${provider.city}, ${provider.country}`
}

export const LEGAL_BUNDLE = {
  id: '2026-11-15.1',
  effectiveDate: '2026-11-15',
  documents: {
    terms: 'terms-2026-11-15.1',
    privacy: 'privacy-2026-11-15.1',
    dpa: 'dpa-2026-11-15.1',
    cookies: 'cookies-2026-11-15.1',
  },
}

export const LEGAL_DOC_IDS = ['terms', 'privacy', 'dpa', 'cookies']

const BILLING_ROLES = new Set(['owner', 'general_manager', 'manager'])

export function requiresDpa(role) {
  return BILLING_ROLES.has(`${role ?? ''}`.trim())
}
