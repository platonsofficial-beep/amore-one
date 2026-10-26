import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../App.css'
import '../mobileShell.css'
import { StockCreateOrderModal } from '../components/stock/StockCreateOrderModal'
import { StockDashboardView } from '../components/stock/StockDashboardView'
import { StockOrderDetailDrawer } from '../components/stock/StockOrderDetailDrawer'
import { StockOrdersView } from '../components/stock/StockOrdersView'
import { StockProductHistoryDrawer } from '../components/stock/StockProductHistoryDrawer'
import { StaffShelfCountSheet } from '../components/stock/StaffShelfCountSheet'
import { StockSuppliersView } from '../components/stock/StockSuppliersView'
import { SupplyOrderDraftPreviewDialog } from '../components/stock/SupplyOrderDraftPreviewDialog'

const SUPPLIERS = [
  ['sup-1', 'MEDITERRANEAN BEVERAGE PARTNERS', 'Elena Costa', 'orders@mbp.example', '+357 99 100001'],
  ['sup-2', 'Ramnista', 'Nikos', 'orders@ramnista.example', '+357 99 100002'],
  ['sup-3', 'Aegean Olive Press', 'Maria', 'hello@aegean.example', '+357 99 100003'],
  ['sup-4', 'Cyprus Flour Mills', 'Andreas', 'mill@flour.example', '+357 99 100004'],
  ['sup-5', 'Harbour Seafood', 'Iris', 'desk@harbour.example', '+357 99 100005'],
  ['sup-6', 'Troodos Dairy', 'Costa', 'milk@troodos.example', '+357 99 100006'],
  ['sup-7', 'Kourion Coffee', 'Eleni', 'roast@kourion.example', '+357 99 100007'],
].map(([id, companyName, contactPerson, email, phone]) => ({
  id,
  companyName,
  contactPerson,
  email,
  phone,
  active: true,
}))

const STORAGES = ['Main Storage', 'Fridge', 'Wine Storage', 'Bar']
const SIZES = ['70cl', '1 L', '75cl', '']
const NAMED = [
  ['Ramnista', 'Wine', 'btl', 'sup-2', 'Ramnista', '70cl'],
  ['Ramnista', 'Wine', 'btl', 'sup-2', 'Ramnista', '1 L'],
  ['House olive oil', 'Oil', 'l', 'sup-3', 'Aegean Olive Press', '1 L'],
  ['Bread flour', 'Dry', 'kg', 'sup-4', 'Cyprus Flour Mills', ''],
  ['Sea bream', 'Fish', 'kg', 'sup-5', 'Harbour Seafood', ''],
  ['Halloumi', 'Dairy', 'kg', 'sup-6', 'Troodos Dairy', ''],
  ['Espresso beans', 'Coffee', 'kg', 'sup-7', 'Kourion Coffee', '1 kg'],
  ['Sparkling water', 'Soft', 'btl', 'sup-1', 'MEDITERRANEAN BEVERAGE PARTNERS', '75cl'],
]

const PRODUCTS = Array.from({ length: 182 }, (_, index) => {
  const named = NAMED[index]
  const supplier = named
    ? SUPPLIERS.find((entry) => entry.id === named[3])
    : SUPPLIERS[index % SUPPLIERS.length]
  const active = index < 174
  let currentQuantity = 20
  let minimumQuantity = 4
  let targetQuantity = 10
  let status = 'ok'
  if (active && index < 16) {
    currentQuantity = 0
    minimumQuantity = 2
    targetQuantity = 8
    status = 'out'
  } else if (active && index < 40) {
    currentQuantity = 1
    minimumQuantity = 4
    targetQuantity = 8
    status = 'low'
  } else if (active && index < 131) {
    currentQuantity = 6
    minimumQuantity = 4
    targetQuantity = 12
    status = 'ok'
  }
  return {
    id: `item-${index + 1}`,
    name: named ? named[0] : `House pour ${index + 1}`,
    brand: named ? '' : 'House',
    size: named ? named[5] : SIZES[index % SIZES.length],
    category: named ? named[1] : 'Wine',
    itemType: named ? named[1] : 'Wine',
    unit: named ? named[2] : 'btl',
    supplierId: supplier.id,
    supplier: named ? named[4] : supplier.companyName,
    currentQuantity,
    minimumQuantity,
    targetQuantity,
    orderQuantity: Math.max(targetQuantity - currentQuantity, 0),
    costPrice: 8,
    active,
    storageLocation: STORAGES[index % STORAGES.length],
    status,
    lastCount: { createdAt: '2026-10-01T10:00:00.000Z' },
  }
})

const ORDER = {
  id: 'order-7',
  orderNumber: 7,
  status: 'draft',
  supplier: 'MEDITERRANEAN BEVERAGE PARTNERS',
  supplierId: 'sup-1',
  notes: 'Leave at the cellar door.',
  expectedDeliveryDate: '2026-10-28',
  totalCost: 96,
  createdAt: '2026-10-26T00:13:00.000Z',
  createdByName: 'Platon Sachinis',
  items: [
    {
      id: 'line-1',
      stockItemId: 'item-8',
      itemName: 'Sparkling water',
      quantity: 18,
      receivedQuantity: 0,
      unit: 'Bottle',
      costPrice: 2,
      totalPrice: 36,
    },
    {
      id: 'line-2',
      stockItemId: 'item-1',
      itemName: 'Ramnista',
      quantity: 14,
      receivedQuantity: 0,
      unit: 'Bottle',
      costPrice: 2,
      totalPrice: 28,
    },
  ],
}

const ORDER_GROUPS = SUPPLIERS.map((supplier) => ({
  groupKey: supplier.id,
  supplier: supplier.companyName,
  supplierId: supplier.id,
  notes: '',
  expectedDeliveryDate: '',
  items: PRODUCTS.filter((item) => item.supplierId === supplier.id).concat(
    PRODUCTS.filter((item) => item.supplierId === supplier.id).length
      ? []
      : [{
        stockItemId: `${supplier.id}-extra`,
        itemName: `${supplier.companyName} house product`,
        quantity: 6,
        unit: 'Bottle',
        costPrice: 4,
      }],
  ).map((item) => ({
    stockItemId: item.id || item.stockItemId,
    itemName: item.name || item.itemName,
    quantity: item.orderQuantity || item.quantity || 6,
    unit: item.unit,
    costPrice: item.costPrice,
  })),
}))

const SUGGEST_REVIEW = SUPPLIERS.map((supplier, index) => ({
  supplier: supplier.companyName,
  items: [
    { stockItemId: `s-${index}-a`, itemName: 'House pour', quantity: 6, unit: 'Bottle' },
    { stockItemId: `s-${index}-b`, itemName: 'Backup case', quantity: 2, unit: 'Case' },
  ],
}))

function params() {
  return new URLSearchParams(window.location.search)
}

function Shell({ title, children }) {
  const shell = params().get('shell') || 'mobile'
  if (shell === 'desktop') {
    return (
      <div className="app-shell stock-focus-mode">
        <div className="main-panel main-panel-stock" style={{ minHeight: '100dvh' }}>
          <div className="stock-focus-header">
            <button type="button" className="ghost-btn stock-focus-exit-btn">← Exit Stock</button>
          </div>
          {children}
        </div>
      </div>
    )
  }

  return (
    <div
      className="app-shell is-mobile-shell is-mobile-expanded"
      style={{
        '--one-safe-area-top': '0px',
        '--one-safe-area-right': '47px',
        '--one-safe-area-bottom': '21px',
        '--one-safe-area-left': '47px',
      }}
    >
      <div className="main-panel">
        <div className="mobile-app mobile-app-expanded mobile-manager-app">
          <div className="mobile-expanded-scroll">
            <header className="mobile-expanded-header">
              <button type="button" className="mobile-back-btn">‹ Back</button>
              <h1>{title}</h1>
            </header>
            <div className="mobile-workspace-module is-mobile-expanded">
              {children}
            </div>
          </div>
          <nav className="mobile-bottom-nav" aria-label="Primary">
            {['Today', 'Stock', 'Tasks', 'Menu'].map((label) => (
              <button
                key={label}
                type="button"
                className={`mobile-bottom-nav-item${label === 'Stock' ? ' is-active' : ''}`}
              >
                <span className="mobile-bottom-nav-icon" aria-hidden="true">•</span>
                <span className="mobile-bottom-nav-label">{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  )
}

function Screen() {
  const screen = params().get('screen') || 'orders'
  const noop = () => {}

  if (screen === 'order-drawer') {
    return (
      <Shell title="Orders">
        <StockOrdersView
          orders={[ORDER]}
          stockItems={PRODUCTS}
          suppliers={SUPPLIERS}
          canManage
          isWorkspaceReady
          venueName="Amore"
          senderName="Platon Sachinis"
          timeZone="Asia/Nicosia"
          onCreateOrders={noop}
          onPrepareDrafts={noop}
          onSaveDraft={noop}
          onMarkSent={noop}
        />
        <StockOrderDetailDrawer
          order={ORDER}
          stockItems={PRODUCTS}
          suppliers={SUPPLIERS}
          venueName="Amore"
          senderName="Platon Sachinis"
          canManage
          timeZone="Asia/Nicosia"
          onClose={noop}
          onSaveDraft={noop}
          onMarkSent={noop}
        />
      </Shell>
    )
  }

  if (screen === 'create-orders') {
    return (
      <Shell title="Orders">
        <StockOrdersView
          orders={[ORDER]}
          stockItems={PRODUCTS}
          suppliers={SUPPLIERS}
          canManage
          isWorkspaceReady
          onCreateOrders={noop}
          onPrepareDrafts={noop}
        />
        <StockCreateOrderModal
          stockItems={PRODUCTS}
          initialGroups={ORDER_GROUPS}
          onClose={noop}
          onSubmit={noop}
        />
      </Shell>
    )
  }

  if (screen === 'suggest') {
    return (
      <Shell title="Stock">
        <SupplyOrderDraftPreviewDialog
          lines={[]}
          review={SUGGEST_REVIEW}
          onCancel={noop}
          onConfirm={noop}
        />
      </Shell>
    )
  }

  if (screen === 'dashboard') {
    return (
      <Shell title="Stock">
        <StockDashboardView
          stockItems={PRODUCTS}
          stockOrders={[ORDER]}
          suppliers={SUPPLIERS}
          canManage
          isWorkspaceReady
          workspaceId="ws-audit"
          onCreateOrders={noop}
          onPrepareDrafts={noop}
          onOpenOrders={noop}
          timeZone="Asia/Nicosia"
        />
      </Shell>
    )
  }

  if (screen === 'suppliers') {
    return (
      <Shell title="Suppliers">
        <StockSuppliersView
          suppliers={SUPPLIERS}
          stockItems={PRODUCTS}
          stockOrders={[ORDER]}
          canManage
          isWorkspaceReady
          onCreateSupplier={noop}
          onUpdateSupplier={noop}
          onDeleteSupplier={noop}
          onDeactivateSupplier={noop}
        />
      </Shell>
    )
  }

  if (screen === 'product') {
    return (
      <Shell title="Stock">
        <StockProductHistoryDrawer
          item={PRODUCTS[6]}
          workspaceId=""
          canManage
          showCost
          onClose={noop}
          timeZone="Asia/Nicosia"
        />
      </Shell>
    )
  }

  if (screen === 'shelf') {
    return (
      <Shell title="Shelf">
        <StaffShelfCountSheet
          workspaceId="ws-audit"
          storage={{ id: 'cellar', name: 'Main cellar' }}
          products={PRODUCTS.map((item) => ({
            stockItemId: item.id,
            displayName: item.name,
            unit: item.unit,
            quantity: item.currentQuantity,
            parQuantity: item.targetQuantity,
            active: true,
          }))}
          parsAvailable
          countAvailable={() => Promise.resolve(true)}
          submitCount={() => Promise.resolve()}
          onClose={noop}
        />
      </Shell>
    )
  }

  return (
    <Shell title="Orders">
      <StockOrdersView
        orders={[ORDER, { ...ORDER, id: 'order-8', orderNumber: 8, status: 'sent', supplier: 'Ramnista', supplierId: 'sup-2' }]}
        stockItems={PRODUCTS}
        suppliers={SUPPLIERS}
        canManage
        isWorkspaceReady
        onCreateOrders={noop}
        onPrepareDrafts={noop}
        onSaveDraft={noop}
        onMarkSent={noop}
        timeZone="Asia/Nicosia"
      />
    </Shell>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Screen />
  </StrictMode>,
)
