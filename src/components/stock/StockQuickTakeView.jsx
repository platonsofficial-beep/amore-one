import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  QUICK_TAKE_UNDO_WINDOW_MS,
  canUndoQuickTake,
  formatBalanceWithPack,
  formatQuantityWithUnit,
  planQuickTake,
  resolveItemPack,
} from '../../lib/stockPackUnits'
import { getWorkspaceStorageProducts, getWorkspaceStorageSummaries } from '../../services/stockStorageCenterService'
import {
  QuickTakeUnavailableError,
  newQuickTakeKey,
  quickTakeErrorText,
  quickTakeAvailable,
  takeStockFromStorage,
  undoQuickTake,
} from '../../services/stockQuickTakeService'
import './stockQuickTake.css'

const LAST_STORAGE_KEY = 'one.quickTake.lastStorage'
const LAST_MODE_KEY = 'one.quickTake.lastMode'

function readLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode */ }
}

function productName(row) {
  const name = `${row?.name ?? ''}`.trim() || 'Product'
  const brand = `${row?.brand ?? ''}`.trim()
  const size = `${row?.size ?? ''}`.trim()
  const withBrand = brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}` : name
  return size ? `${withBrand} ${size}` : withBrand
}

/**
 * Stock → Take. Storage → Category → Product → quantity → Done.
 * No prices, costs or supplier contacts are shown here (staff safe).
 */
export function StockQuickTakeView({ workspaceId = '', stockItems = [], searchTerm = '', onStockItemsChanged, canManage = false }) {
  const [available, setAvailable] = useState(null)
  const [storageState, setStorageState] = useState({ status: 'loading', storages: [], error: '' })
  const [storageId, setStorageId] = useState('')
  const [productsState, setProductsState] = useState({ status: 'idle', rows: [], error: '' })
  const [category, setCategory] = useState('')
  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState(null)
  const [toast, setToast] = useState(null)
  const [reload, setReload] = useState(0)
  const toastTimer = useRef(null)

  const packById = useMemo(() => {
    const map = new Map()
    for (const item of stockItems) {
      const pack = resolveItemPack(item)
      if (pack) map.set(item.id, pack)
    }
    return map
  }, [stockItems])

  useEffect(() => {
    let alive = true
    quickTakeAvailable().then((ok) => { if (alive) setAvailable(ok) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!workspaceId) return undefined
    let alive = true
    setStorageState((s) => ({ ...s, status: s.storages.length ? 'ready' : 'loading', error: '' }))
    getWorkspaceStorageSummaries(workspaceId)
      .then((payload) => {
        if (!alive) return
        const last = readLocal(LAST_STORAGE_KEY, '')
        const storages = [...(payload?.storages ?? [])].filter((s) => s.isActive !== false)
          .sort((a, b) => (b.id === last) - (a.id === last))
        setStorageState({ status: storages.length ? 'ready' : 'empty', storages, error: '' })
      })
      .catch((error) => { if (alive) setStorageState({ status: 'error', storages: [], error: error?.message || '' }) })
    return () => { alive = false }
  }, [workspaceId, reload])

  const loadProducts = useCallback((id) => {
    setProductsState({ status: 'loading', rows: [], error: '' })
    return getWorkspaceStorageProducts(workspaceId, id)
      .then((payload) => setProductsState({ status: 'ready', rows: (payload?.products ?? []).filter((r) => r.active !== false), error: '' }))
      .catch((error) => setProductsState({ status: 'error', rows: [], error: error?.message || '' }))
  }, [workspaceId])

  const openStorage = (id) => {
    setStorageId(id); setCategory(''); setQuery(''); writeLocal(LAST_STORAGE_KEY, id); loadProducts(id)
  }

  const storage = storageState.storages.find((s) => s.id === storageId) ?? null
  const search = `${query || searchTerm || ''}`.trim().toLowerCase()

  const categories = useMemo(() => {
    const map = new Map()
    for (const row of productsState.rows) {
      const key = row.category || 'Other'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [productsState.rows])

  const visibleRows = useMemo(() => {
    let rows = productsState.rows
    if (search) rows = rows.filter((r) => productName(r).toLowerCase().includes(search))
    else if (category) rows = rows.filter((r) => (r.category || 'Other') === category)
    return [...rows].sort((a, b) => productName(a).localeCompare(productName(b)))
  }, [productsState.rows, category, search])

  const showToast = (next) => {
    clearTimeout(toastTimer.current)
    setToast(next)
    toastTimer.current = setTimeout(() => setToast(null), 12000)
  }
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const openSheet = (row) => {
    const pack = packById.get(row.stockItemId) ?? resolveItemPack(row.item)
    const lastMode = readLocal(LAST_MODE_KEY, {})[row.stockItemId]
    setSheet({ row, pack, mode: pack ? (lastMode === 'unit' ? 'unit' : 'pack') : 'unit', quantity: 1, saving: false, error: '', key: newQuickTakeKey() })
  }

  const setRowBalance = (stockItemId, quantity) => {
    setProductsState((s) => ({ ...s, rows: s.rows.map((r) => (r.stockItemId === stockItemId ? { ...r, quantity } : r)) }))
  }

  const submit = async () => {
    if (!sheet || sheet.saving) return
    const plan = planQuickTake({ balance: sheet.row.quantity, quantity: sheet.quantity, mode: sheet.mode, pack: sheet.pack, unit: sheet.row.unit })
    if (plan.baseQuantity <= 0) return
    setSheet((s) => ({ ...s, saving: true, error: '' }))
    try {
      const result = await takeStockFromStorage({ workspaceId, storageId, stockItemId: sheet.row.stockItemId, quantity: plan.baseQuantity, idempotencyKey: sheet.key })
      const after = result.quantityAfter ?? plan.after
      setRowBalance(sheet.row.stockItemId, after)
      const modes = readLocal(LAST_MODE_KEY, {}); modes[sheet.row.stockItemId] = sheet.mode; writeLocal(LAST_MODE_KEY, modes)
      showToast({ name: productName(sheet.row), label: plan.enteredLabel, after, unit: sheet.row.unit, storageName: storage?.name ?? '', movementId: result.movementId, takenAt: Date.now(), stockItemId: sheet.row.stockItemId, before: plan.before, negative: plan.goesNegative })
      setSheet(null)
      onStockItemsChanged?.()
    } catch (error) {
      if (error instanceof QuickTakeUnavailableError) setAvailable(false)
      setSheet((s) => (s ? { ...s, saving: false, error: quickTakeErrorText(error, { canManage }) } : s))
    }
  }

  const undo = async () => {
    if (!toast || toast.undoing) return
    if (!canUndoQuickTake(toast.takenAt)) { setToast((t) => ({ ...t, error: `Undo is only possible for ${QUICK_TAKE_UNDO_WINDOW_MS / 60000} minutes.` })); return }
    setToast((t) => ({ ...t, undoing: true, error: '' }))
    try {
      const result = await undoQuickTake(toast.movementId)
      setRowBalance(toast.stockItemId, result.quantityAfter ?? toast.before)
      showToast({ undone: true, name: toast.name, label: toast.label })
      onStockItemsChanged?.()
    } catch (error) {
      setToast((t) => ({ ...t, undoing: false, error: quickTakeErrorText(error, { canManage }) }))
    }
  }

  if (available === false) {
    return (
      <section className="stock-quick-take" aria-label="Take from storage">
        <div className="stock-quick-take-empty" role="status">
          <strong>Take from storage is not switched on yet</strong>
          <span>Ask a manager. Counts and the rest of Stock work as usual.</span>
        </div>
      </section>
    )
  }

  const plan = sheet ? planQuickTake({ balance: sheet.row.quantity, quantity: sheet.quantity, mode: sheet.mode, pack: sheet.pack, unit: sheet.row.unit }) : null
  const stepUnit = sheet ? (sheet.mode === 'pack' && sheet.pack ? sheet.pack.packUnit : sheet.row.unit) : ''
  const back = () => { if (category && !search) setCategory(''); else if (storageId) { setStorageId(''); setQuery('') } }

  return (
    <section className="stock-quick-take" aria-label="Take from storage">
      {!storageId ? (
        <>
          <header className="stock-quick-take-head">
            <h2>Take from storage</h2>
            <p>Where are you taking from?</p>
          </header>
          {storageState.status === 'loading' ? <p className="stock-quick-take-note" role="status">Loading storages…</p> : null}
          {storageState.status === 'error' ? (
            <div className="stock-quick-take-empty" role="alert">
              <strong>Storages couldn&apos;t be loaded</strong>
              <button type="button" className="stock-quick-take-ghost" onClick={() => setReload((n) => n + 1)}>Retry</button>
            </div>
          ) : null}
          {storageState.status === 'empty' ? <p className="stock-quick-take-note">No storages yet. A manager can add them in Storages.</p> : null}
          <ul className="stock-quick-take-list">
            {storageState.storages.map((s, index) => (
              <li key={s.id}>
                <button type="button" className="stock-quick-take-tile" onClick={() => openStorage(s.id)}>
                  <span>
                    <strong>{s.name}</strong>
                    <small>{index === 0 && readLocal(LAST_STORAGE_KEY, '') === s.id ? 'Last used · ' : ''}{s.productCount ?? 0} products</small>
                  </span>
                  <span className="stock-quick-take-chevron" aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <button type="button" className="stock-quick-take-back" onClick={back}>‹ {category && !search ? storage?.name : 'Storages'}</button>
          <header className="stock-quick-take-head">
            <h2>{category && !search ? category : storage?.name}</h2>
            <p>{category || search ? 'Tap what you take' : 'Choose a category'}</p>
          </header>
          <input
            type="search"
            className="stock-quick-take-search"
            placeholder={`Search in ${category && !search ? category : storage?.name ?? 'storage'}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search products"
          />
          {productsState.status === 'loading' ? <p className="stock-quick-take-note" role="status">Loading products…</p> : null}
          {productsState.status === 'error' ? (
            <div className="stock-quick-take-empty" role="alert">
              <strong>Products couldn&apos;t be loaded</strong>
              <button type="button" className="stock-quick-take-ghost" onClick={() => loadProducts(storageId)}>Retry</button>
            </div>
          ) : null}
          {productsState.status === 'ready' && !category && !search ? (
            <ul className="stock-quick-take-list">
              {categories.length === 0 ? <li className="stock-quick-take-note">No products in this storage yet.</li> : null}
              {categories.map(([name, count]) => (
                <li key={name}>
                  <button type="button" className="stock-quick-take-tile" onClick={() => setCategory(name)}>
                    <span><strong>{name}</strong></span>
                    <span className="stock-quick-take-count">{count} ›</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {productsState.status === 'ready' && (category || search) ? (
            <ul className="stock-quick-take-list stock-quick-take-products">
              {visibleRows.length === 0 ? <li className="stock-quick-take-note">Nothing matches.</li> : null}
              {visibleRows.map((row) => {
                const pack = packById.get(row.stockItemId) ?? resolveItemPack(row.item)
                return (
                  <li key={row.stockItemId}>
                    <button type="button" className="stock-quick-take-row" onClick={() => openSheet(row)}>
                      <span>
                        <strong>{productName(row)}</strong>
                        <small>{pack ? `${pack.packUnit} of ${pack.unitsPerPack}` : formatQuantityWithUnit(1, row.unit).replace(/^1 /, '')}</small>
                      </span>
                      <span className={`stock-quick-take-balance${row.quantity < 0 ? ' is-negative' : ''}`}>{formatBalanceWithPack(row.quantity, row.unit, pack)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </>
      )}

      {sheet && plan ? (
        <div className="stock-quick-take-scrim" onClick={() => !sheet.saving && setSheet(null)}>
          <div className="stock-quick-take-sheet" role="dialog" aria-modal="true" aria-label={`Take ${productName(sheet.row)}`} onClick={(event) => event.stopPropagation()}>
            <div className="stock-quick-take-grip" aria-hidden="true" />
            <button type="button" className="stock-quick-take-close" aria-label="Close" onClick={() => setSheet(null)} disabled={sheet.saving}>×</button>
            <h3>{productName(sheet.row)}</h3>
            <p className="stock-quick-take-sub">{storage?.name}{sheet.pack ? ` · 1 ${sheet.pack.packUnit} = ${formatQuantityWithUnit(sheet.pack.unitsPerPack, sheet.row.unit)}` : ''}</p>
            {sheet.pack ? (
              <div className="stock-quick-take-seg" role="group" aria-label="Unit">
                <button type="button" className={sheet.mode === 'pack' ? 'is-on' : ''} aria-pressed={sheet.mode === 'pack'} onClick={() => setSheet((s) => ({ ...s, mode: 'pack' }))}>{formatQuantityWithUnit(2, sheet.pack.packUnit).replace(/^2 /, '')}</button>
                <button type="button" className={sheet.mode === 'unit' ? 'is-on' : ''} aria-pressed={sheet.mode === 'unit'} onClick={() => setSheet((s) => ({ ...s, mode: 'unit' }))}>{formatQuantityWithUnit(2, sheet.row.unit || 'Unit').replace(/^2 /, '')}</button>
              </div>
            ) : null}
            <div className="stock-quick-take-stepper">
              <button type="button" aria-label="One less" disabled={sheet.quantity <= 1 || sheet.saving} onClick={() => setSheet((s) => ({ ...s, quantity: Math.max(1, s.quantity - 1) }))}>−</button>
              <input
                type="text"
                inputMode="decimal"
                aria-label={`Quantity in ${stepUnit}`}
                value={sheet.quantity}
                onChange={(event) => {
                  const value = event.target.value.replace(',', '.')
                  if (/^\d*\.?\d{0,3}$/.test(value)) setSheet((s) => ({ ...s, quantity: value === '' ? '' : value }))
                }}
              />
              <button type="button" aria-label="One more" disabled={sheet.saving} onClick={() => setSheet((s) => ({ ...s, quantity: (Number(s.quantity) || 0) + 1 }))}>+</button>
            </div>
            <p className="stock-quick-take-unitline">{formatQuantityWithUnit(Number(sheet.quantity) || 0, stepUnit).replace(/^[\d.]+ /, '')}</p>
            <p className="stock-quick-take-math">
              {sheet.mode === 'pack' && sheet.pack ? `${plan.enteredLabel} = ${plan.baseLabel} · ` : ''}
              {storage?.name} {formatQuantityWithUnit(plan.before, sheet.row.unit)} → {formatQuantityWithUnit(plan.after, sheet.row.unit)}
            </p>
            {plan.goesNegative ? (
              <p className="stock-quick-take-warn" role="status">
                ⚠ {plan.before > 0 ? 'Stock shows only' : 'Stock already shows'} {formatQuantityWithUnit(plan.before, sheet.row.unit)}. You can still take it. It will show {formatQuantityWithUnit(plan.after, sheet.row.unit)} and a manager will see it.
              </p>
            ) : null}
            {sheet.error ? <p className="stock-quick-take-error" role="alert">{sheet.error}</p> : null}
            <button type="button" className="stock-quick-take-done" onClick={submit} disabled={sheet.saving || plan.baseQuantity <= 0}>
              {sheet.saving ? 'Saving…' : 'Done'}
            </button>
          </div>
        </div>
      ) : null}

      {toast && !sheet ? (
        <div className={`stock-quick-take-toast${toast.undone ? ' is-undone' : ''}`} role="status" aria-live="polite">
          <span>
            <strong>{toast.undone ? `Undone · ${toast.name}` : `✓ Took ${toast.label} · ${toast.name}`}</strong>
            {toast.undone ? <small>Stock is back as it was.</small> : (
              <small>{toast.negative ? '⚠ More than stock showed · ' : ''}{toast.storageName} now {formatQuantityWithUnit(toast.after, toast.unit)}</small>
            )}
            {toast.error ? <small className="stock-quick-take-error">{toast.error}</small> : null}
          </span>
          {!toast.undone && toast.movementId ? (
            <button type="button" onClick={undo} disabled={toast.undoing}>{toast.undoing ? '…' : 'Undo'}</button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
