import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import el from './locales/el.json'
import en from './locales/en.json'
import { translate } from './i18n'

const GREEK = /[Α-ωΆ-ώ]/

/** Strings that were still English on the Greek website-media capture. */
const LEFTOVERS = [
  'Walk-in',
  'Clock in',
  'Clock out',
  'Seating',
  'Seating hours',
  'Services',
  'Timers',
  'Stock',
  'Fit',
  'Reservation service',
  'Service status',
  'Available',
  'Reserved',
  'Seated',
  '{{count}} on shift_other',
  '{{count}} clocked in_other',
  '{{count}} scheduled today_other',
  '{{count}} open task_other',
  '{{count}} done today_other',
  '{{count}} out_other',
  '{{count}} low_other',
  '{{count}} open draft_other',
  '{{name}} seated {{count}} min',
  '{{count}} visits',
  '{{count}} no-show',
  '{{available}}/{{total}} available',
  'Order has {{qty}} at {{price}}.',
  'Quantity differs.',
  'Next {{time}}',
  'Attention needed',
]

describe('Greek sweep', () => {
  it('translates the leftover English labels into Greek', () => {
    for (const key of LEFTOVERS) {
      expect(el[key], key).toBeTruthy()
      expect(el[key], key).not.toBe(en[key])
      expect(el[key], key).toMatch(GREEK)
      expect(translate(key.replace(/_one$|_other$/, ''), key.includes('{{count}}') ? { count: 3 } : {}, 'el')).toMatch(GREEK)
    }
  })

  it('does not leave the captured English sentences hardcoded', () => {
    const files = [
      'src/lib/todayViewUtils.js',
      'src/lib/onShiftText.js',
      'src/lib/stockUtils.js',
      'src/lib/stockLiveCard.js',
      'src/lib/mobileManagerTodayUtils.js',
      'src/lib/reservationServiceIntelligence.js',
      'src/lib/tableAvailability.js',
      'src/components/stock/StockInvoiceSection.jsx',
      'src/components/stock/StockOrdersView.jsx',
      'src/components/stock/StockCreateOrderModal.jsx',
      'src/components/mobile/MobileManagerHomeView.jsx',
      'src/components/mobile/reservations/HostQueueToolbar.jsx',
      'src/components/floor/FloorPlanLegend.jsx',
      'src/lib/stockOrderBrowse.js',
    ]
    const banned = [
      '⏱ Timers',
      'Create ${orderCount}',
      'Showing {visibleOrders',
      "'1 open draft'",
      "'Order has '",
    ]
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const phrase of banned) {
        expect(source.includes(phrase), `${file} still has ${phrase}`).toBe(false)
      }
    }
  })
})
