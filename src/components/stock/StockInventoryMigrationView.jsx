import { InventoryImportHistoryList } from './InventoryImportHistoryList'
import { t } from '../../i18n/i18n'

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
    <section className="stock-migration-page" aria-label={t("Import")}>
      <header className="stock-migration-header">
        <div className="stock-migration-header-copy">
          <h2 className="stock-migration-title">{t("Spreadsheet Import")}</h2>
          <p className="stock-migration-subtitle">
            {t("Bring products in from CSV or Excel. Review every row before it is applied to live stock.")}
          </p>
        </div>
      </header>

      <section className="stock-migration-ownership" aria-label={t("Spreadsheet import")} data-stock-migration-landing="true">
        <article
          className="stock-migration-ownership-card is-primary"
          data-stock-migration-ownership="spreadsheet-import"
        >
          <div className="stock-migration-ownership-card-copy">
            <p className="stock-migration-ownership-description">
              {t("Import your products from CSV or Excel using the guided import workflow.")}
            </p>
            <p className="stock-migration-ownership-meta-copy">
              {t("Upload a CSV or Excel file. You check every product and match before anything is saved.")}
            </p>
          </div>
          <div className="stock-migration-ownership-card-action">
            <button
              type="button"
              className="primary-btn stock-migration-ownership-open-import"
              data-stock-migration-open-import="true"
              onClick={() => onOpenInventoryImport?.()}
            >
              {t("Start Import")}
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
