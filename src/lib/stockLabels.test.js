import { describe, expect, it } from 'vitest'
import el from '../i18n/locales/el.json'
import { setLocale } from '../i18n/i18n'
import {
  translateStockCatalogLine,
  translateStockCatalogTerm,
  translateStockPlaceName,
} from './stockLabels'

describe('stock display labels', () => {
  it('translates seeded place names and leaves custom names', () => {
    expect(translateStockPlaceName('Bar')).toBe('Bar')
    expect(translateStockPlaceName('Cellar')).toBe('Cellar')
    expect(translateStockPlaceName('Storage')).toBe('Storage')
    expect(translateStockPlaceName('Kitchen')).toBe('Kitchen')
    expect(translateStockPlaceName('Main Storage')).toBe('Main Storage')
    expect(translateStockPlaceName('Main Bar')).toBe('Main Bar')
    expect(translateStockPlaceName('Old Cellar')).toBe('Old Cellar')
  })

  it('translates default catalog terms and leaves custom ones', () => {
    expect(translateStockCatalogTerm('Bar')).toBe('Bar')
    expect(translateStockCatalogTerm('Kitchen')).toBe('Kitchen')
    expect(translateStockCatalogTerm('Spirits')).toBe('Spirits')
    expect(translateStockCatalogTerm('Bottle')).toBe('Bottle')
    expect(translateStockCatalogTerm('House blend')).toBe('House blend')
    expect(translateStockCatalogLine('Spirits · Vodka')).toBe('Spirits · Vodka')
    expect(translateStockCatalogLine('House · Special')).toBe('House · Special')
  })

  it('translates place-named categories when the app is in Greek', () => {
    setLocale('el')
    expect(translateStockCatalogTerm('Bar')).toBe('Μπαρ')
    expect(translateStockCatalogTerm('Kitchen')).toBe('Κουζίνα')
    setLocale('en')
  })

  it('has Greek copy for seeded places, catalog terms, par, and relative time', () => {
    expect(el.Bar).toBe('Μπαρ')
    expect(el.Cellar).toBe('Κάβα')
    expect(el.Storage).toBe('Αποθήκη')
    expect(el.Kitchen).toBe('Κουζίνα')
    expect(el.Spirits).toBe('Αποστάγματα')
    expect(el.Bottle).toBe('Φιάλη')
    expect(el['{{count}} items below storage par_one']).toBe('{{count}} είδος κάτω από το par αποθήκης')
    expect(el['{{count}} items below storage par_other']).toBe('{{count}} είδη κάτω από το par αποθήκης')
    expect(el['{{count}} days ago_one']).toBe('πριν από {{count}} ημέρα')
    expect(el['{{count}} days ago_other']).toBe('πριν από {{count}} ημέρες')
    expect(el['{{count}} products_one']).toBe('{{count}} προϊόν')
    expect(el['{{count}} products_other']).toBe('{{count}} προϊόντα')
    expect(el['+ Create stock item']).toBe('+ Δημιουργία είδους αποθέματος')
  })
})
