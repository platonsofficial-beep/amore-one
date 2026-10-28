import { describe, expect, it } from 'vitest'
import {
  groupStockItemsByCategoryStatus,
  sortStockDashboardItems,
} from './stockDashboardBrowse'

describe('stock list display name and category groups', () => {
  const vodka = {
    id: 'absolut',
    brand: 'Absolut',
    name: 'Vodka',
    size: '700 ml',
    category: 'Spirits',
    status: 'ok',
  }
  const goose = {
    id: 'goose',
    brand: 'Grey Goose',
    name: 'Vodka',
    size: '700 ml',
    category: 'Spirits',
    status: 'out',
  }
  const lager = {
    id: 'lager',
    brand: 'Mythos',
    name: 'Lager',
    size: '330 ml',
    category: 'Beverages',
    status: 'low',
  }

  it('sorts All products by brand, name, and size', () => {
    const sorted = sortStockDashboardItems([goose, vodka], 'name-asc')
    expect(sorted.map((item) => item.id)).toEqual(['absolut', 'goose'])
  })

  it('groups in app category order and sorts out before low before ok', () => {
    const groups = groupStockItemsByCategoryStatus([vodka, lager, goose])
    expect(groups.map((group) => group.label)).toEqual(['Spirits', 'Beverages'])
    expect(groups[0].items.map((item) => item.id)).toEqual(['goose', 'absolut'])
  })
})
