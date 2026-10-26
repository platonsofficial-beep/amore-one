import { InventoryImportHistoryList } from './InventoryImportHistoryList'

/**
 * Stock spreadsheet import. The legacy migration operator panel is retired.
 */
export function StockInventoryMigrationView({
  workspaceId = '',
  timeZone = '',
  historyRefresh = 0,
  onOpenInventoryImport = undefined,
  listRecentInventoryImportSessions = undefined,
  checkInventoryImportUndoEligibility = undefined,
  undoInventoryImportSession = undefined,
}) {
  return (
    <section className="stock-migration-page" aria-label="Import">
      <header className="stock-migration-header">
        <div className="stock-migration-header-copy">
          <h2 className="stock-migration-title">Spreadsheet Import</h2>
          <p className="stock-migration-subtitle">
            Bring products in from CSV or Excel. Review every row before it is applied to live stock.
          </p>
        </div>
      </header>

      <section className="stock-migration-ownership" aria-label="Spreadsheet import" data-stock-migration-landing="true">
        <article
          className="stock-migration-ownership-card is-primary"
          data-stock-migration-ownership="spreadsheet-import"
        >
          <div className="stock-migration-ownership-card-copy">
            <p className="stock-migration-ownership-description">
              Import your products from CSV or Excel using the guided import workflow.
            </p>
            <ul className="stock-migration-ownership-meta" aria-label="Spreadsheet Import capabilities">
              <li>CSV / XLSX</li>
              <li>Review before apply</li>
              <li>Product matching</li>
              <li>New product preparation</li>
            </ul>
          </div>
          <div className="stock-migration-ownership-card-action">
            <button
              type="button"
              className="primary-btn stock-migration-ownership-open-import"
              data-stock-migration-open-import="true"
              onClick={() => onOpenInventoryImport?.()}
            >
              Start Import
            </button>
          </div>
        </article>
      </section>

      <InventoryImportHistoryList
        workspaceId={workspaceId}
        timeZone={timeZone}
        refreshKey={historyRefresh}
        listRecentInventoryImportSessions={listRecentInventoryImportSessions}
        checkInventoryImportUndoEligibility={checkInventoryImportUndoEligibility}
        undoInventoryImportSession={undoInventoryImportSession}
      />
    </section>
  )
}
