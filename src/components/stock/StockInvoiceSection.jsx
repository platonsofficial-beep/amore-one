import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  compareInvoiceLines,
  draftFromScan,
  emptyInvoiceDraft,
  prepareInvoiceUpload,
} from '../../lib/stockInvoice'
import {
  buildPreviewInvoiceDraft,
  buildPreviewSavedInvoice,
  previewInvoiceThumb,
  readStockInvoicePreview,
} from '../../lib/stockInvoicePreview'
import { formatStockPurchasePrice } from '../../lib/stockUtils'
import { loadOrderInvoice, saveOrderInvoice, scanInvoiceFile } from '../../services/stockInvoiceService'
import { t } from '../../i18n/i18n'
import './stockInvoice.css'

function money(value) {
  if (value === '' || value == null) return '—'
  return formatStockPurchasePrice(value)
}

function InvoiceReview({
  order,
  draft,
  files,
  notice,
  isSaving,
  onChange,
  onAddLine,
  onAddPages,
  onSave,
  onClose,
}) {
  const compared = compareInvoiceLines(draft.lines, order.items)
  const cameraId = useId()
  const fileId = useId()
  return (
    <div className="stock-invoice-sheet" role="dialog" aria-modal="true" aria-labelledby="stock-invoice-review-title" data-testid="stock-invoice-review">
      <div className="stock-invoice-sheet-card">
        <p className="stock-order-detail-eyebrow">{t("Invoice")}</p>
        <h3 id="stock-invoice-review-title">{t("Review invoice")}</h3>
        <p className="stock-invoice-note">
          {draft.scanned
            ? t("Check these fields before saving. Highlighted lines differ from the order.")
            : 'Scan isn\'t connected. The file will be saved, and you can type the invoice yourself.'}
        </p>
        <p>{files.length} file{files.length === 1 ? '' : 's'} attached.</p>
        <div className="stock-invoice-fields">
          <label>
            {t("Supplier")}
            <input value={draft.supplierName} onChange={(event) => onChange({ supplierName: event.target.value })} />
          </label>
          <label>
            {t("Invoice number")}
            <input value={draft.invoiceNumber} onChange={(event) => onChange({ invoiceNumber: event.target.value })} />
          </label>
          <label>
            {t("Invoice date")}
            <input type="date" value={draft.invoiceDate} onChange={(event) => onChange({ invoiceDate: event.target.value })} />
          </label>
        </div>
        {compared.map((line, index) => {
          const different = line.difference?.qtyDiffers || line.difference?.priceDiffers
          return (
            <div key={`${line.name}-${index}`} className={`stock-invoice-line${different ? ' is-different' : ''}`}>
              <label>
                {t("Item")}
                <input
                  value={line.name}
                  onChange={(event) => onChange({ lineIndex: index, name: event.target.value })}
                />
              </label>
              <label>
                {t("Qty")}
                <input
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(event) => onChange({ lineIndex: index, quantity: event.target.value })}
                />
              </label>
              <label>
                {t("Unit price")}
                <input
                  inputMode="decimal"
                  value={line.unitPrice}
                  onChange={(event) => onChange({ lineIndex: index, unitPrice: event.target.value })}
                />
              </label>
              {different ? (
                <p className="stock-invoice-diff">
                  Order has {line.difference.orderQty} at {money(line.difference.orderPrice)}.
                  {line.difference.qtyDiffers ? ' Quantity differs.' : ''}
                  {line.difference.priceDiffers ? ' Price differs.' : ''}
                </p>
              ) : null}
            </div>
          )
        })}
        <div className="stock-invoice-fields">
          <label>
            {t("Subtotal")}
            <input inputMode="decimal" value={draft.subtotal} onChange={(event) => onChange({ subtotal: event.target.value })} />
          </label>
          <label>
            {t("VAT")}
            <input inputMode="decimal" value={draft.vat} onChange={(event) => onChange({ vat: event.target.value })} />
          </label>
          <label>
            {t("Total")}
            <input inputMode="decimal" value={draft.total} onChange={(event) => onChange({ total: event.target.value })} />
          </label>
        </div>
        {notice ? <p className="staff-status-banner" role="status">{notice}</p> : null}
        <div className="stock-invoice-sheet-actions">
          <button type="button" className="ghost-btn" onClick={onAddLine}>{t("Add line")}</button>
          <button type="button" className="ghost-btn" onClick={() => document.getElementById(cameraId)?.click()}>{t("Add photo")}</button>
          <button type="button" className="ghost-btn" onClick={() => document.getElementById(fileId)?.click()}>{t("Add file")}</button>
          <button type="button" className="primary-btn stock-invoice-save" onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : t("Save invoice")}
          </button>
          <button type="button" className="ghost-btn" onClick={onClose}>{t("Close")}</button>
        </div>
        <input id={cameraId} className="stock-invoice-file-input" type="file" accept="image/*" capture="environment" onChange={onAddPages} />
        <input id={fileId} className="stock-invoice-file-input" type="file" accept="image/*,application/pdf" multiple onChange={onAddPages} />
      </div>
    </div>
  )
}

export function StockInvoiceSection({
  order,
  canManage = false,
  onSaved,
  openRequest = 0,
  previewMode = '',
}) {
  const preview = previewMode || readStockInvoicePreview()
  const [invoice, setInvoice] = useState(() => (
    preview === 'saved' && order?.hasInvoice ? buildPreviewSavedInvoice() : null
  ))
  const [open, setOpen] = useState(preview === 'review' && order?.status === 'sent')
  const [draft, setDraft] = useState(() => (
    preview === 'review' ? buildPreviewInvoiceDraft() : emptyInvoiceDraft(order)
  ))
  const [files, setFiles] = useState(() => (
    preview === 'review' && order?.status === 'sent'
      ? [{ fileName: 'invoice.jpg', contentType: 'image/jpeg', localUrl: previewInvoiceThumb() }]
      : []
  ))
  const [notice, setNotice] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [viewer, setViewer] = useState(null)
  const cameraId = useId()
  const fileId = useId()

  useEffect(() => {
    if (!openRequest) return
    setOpen(true)
  }, [openRequest])

  useEffect(() => {
    if (!canManage || preview) return undefined
    let cancelled = false
    loadOrderInvoice(order?.id).then((loaded) => {
      if (!cancelled && loaded) setInvoice(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [canManage, order?.id, preview])

  if (!canManage) return null

  const updateDraft = (patch) => {
    setDraft((current) => {
      if (patch.lineIndex == null) return { ...current, ...patch }
      const lines = current.lines.map((line, index) => {
        if (index !== patch.lineIndex) return line
        return {
          name: patch.name ?? line.name,
          quantity: patch.quantity ?? line.quantity,
          unitPrice: patch.unitPrice ?? line.unitPrice,
        }
      })
      return { ...current, lines }
    })
  }

  const addFiles = async (event) => {
    const picked = [...(event.target.files ?? [])]
    event.target.value = ''
    if (picked.length === 0) return
    setNotice('')
    try {
      const prepared = []
      for (const file of picked) {
        prepared.push({ ...(await prepareInvoiceUpload(file)), localUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : '' })
      }
      setFiles((current) => [...current, ...prepared])
      const scan = await scanInvoiceFile(prepared[0])
      if (scan?.scanned && scan.fields) {
        setDraft((current) => (
          current.invoiceNumber || current.lines.length
            ? current
            : draftFromScan(scan.fields, order)
        ))
      } else if (!draft.scanned && draft.lines.length === 0 && !draft.invoiceNumber) {
        setDraft(emptyInvoiceDraft(order))
      }
      setOpen(true)
    } catch (error) {
      setNotice(error?.message || t("Could not read that file."))
    }
  }

  const save = async () => {
    if (isSaving) return
    setIsSaving(true)
    setNotice('')
    try {
      if (preview) {
        setInvoice({
          ...draft,
          id: 'local-invoice',
          files: files.map((file, index) => ({
            id: `local-${index}`,
            fileName: file.fileName,
            contentType: file.contentType,
            previewUrl: file.localUrl,
          })),
        })
        setOpen(false)
        onSaved?.()
        return
      }
      const saved = await saveOrderInvoice({
        workspaceId: order.workspaceId,
        orderId: order.id,
        draft,
        files,
      })
      setInvoice(saved)
      setOpen(false)
      onSaved?.()
    } catch (error) {
      setNotice(error?.message || t("Could not save the invoice."))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="stock-invoice-section panel staff-panel" aria-label={t("Invoice")} data-testid="stock-invoice-section">
      <h4>{t("Invoice")}</h4>
      {invoice ? (
        <>
          <p>{invoice.supplierName || t("Supplier invoice")}{invoice.invoiceNumber ? ` · ${invoice.invoiceNumber}` : ''}</p>
          <dl className="stock-invoice-totals">
            <div><dt>{t("Subtotal")}</dt><dd>{money(invoice.subtotal)}</dd></div>
            <div><dt>{t("VAT")}</dt><dd>{money(invoice.vat)}</dd></div>
            <div><dt>{t("Total")}</dt><dd>{money(invoice.total)}</dd></div>
          </dl>
          <div className="stock-invoice-thumbs">
            {(invoice.files ?? []).map((file) => (
              <button
                key={file.id}
                type="button"
                className="stock-invoice-thumb"
                onClick={() => setViewer(file)}
                aria-label={`View ${file.fileName || 'invoice file'}`}
              >
                {file.previewUrl && file.contentType !== 'application/pdf' ? (
                  <img src={file.previewUrl} alt="" />
                ) : (
                  <span>{t("PDF")}</span>
                )}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="stock-invoice-note">{t("Attach the supplier invoice when the delivery arrives.")}</p>
      )}
      <div className="stock-invoice-actions">
        <button type="button" className="primary-btn" onClick={() => document.getElementById(cameraId)?.click()}>
          {t("Add invoice")}
        </button>
        <button type="button" className="ghost-btn" onClick={() => document.getElementById(fileId)?.click()}>
          {t("Choose file")}
        </button>
      </div>
      <input id={cameraId} className="stock-invoice-file-input" data-testid="stock-invoice-camera" type="file" accept="image/*" capture="environment" onChange={addFiles} />
      <input id={fileId} className="stock-invoice-file-input" data-testid="stock-invoice-file" type="file" accept="image/*,application/pdf" multiple onChange={addFiles} />
      {notice && !open ? <p role="status">{notice}</p> : null}
      {open ? createPortal(
        <InvoiceReview
          order={order}
          draft={draft}
          files={files}
          notice={notice}
          isSaving={isSaving}
          onChange={updateDraft}
          onAddLine={() => setDraft((current) => ({ ...current, lines: [...current.lines, { name: '', quantity: '', unitPrice: '' }] }))}
          onAddPages={addFiles}
          onSave={save}
          onClose={() => setOpen(false)}
        />,
        document.body,
      ) : null}
      {viewer ? createPortal(
        <div className="stock-invoice-viewer" role="dialog" aria-modal="true" aria-label={t("Invoice file")}>
          {viewer.contentType === 'application/pdf' ? (
            <iframe title={viewer.fileName || t("Invoice PDF")} src={viewer.previewUrl} />
          ) : (
            <img src={viewer.previewUrl} alt={viewer.fileName || 'Invoice'} />
          )}
          <button type="button" className="ghost-btn" onClick={() => setViewer(null)}>{t("Close")}</button>
        </div>,
        document.body,
      ) : null}
    </section>
  )
}
