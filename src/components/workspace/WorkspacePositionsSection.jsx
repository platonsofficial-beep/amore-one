import { useRef } from 'react'
import { t } from '../../i18n/i18n'
import { LoadFailureBanner } from '../shell/LoadFailureBanner'
import { isLoadFailureMessage } from '../../lib/userFacingLoadError'
import { useSettingsEditorScroll } from '../../lib/settingsEditorScroll'
import { WorkspaceSaveNotice } from './WorkspaceSaveNotice'
const POSITION_DEPARTMENTS = ['Bar', 'Service', 'Kitchen', 'Management', 'Other']

export function WorkspacePositionsSection({
  positions,
  isLoading,
  noticeMessage,
  form,
  isSaving,
  editingPositionId,
  onFormChange,
  onSubmit,
  onStartEdit,
  onCancelEdit,
  onRequestDelete,
  onMovePosition,
  getUsageCount,
  onRetry,
}) {
  const sectionRef = useRef(null)
  const editorRef = useRef(null)
  const nameRef = useRef(null)
  const beginEdit = useSettingsEditorScroll({
    editingId: editingPositionId,
    sectionRef,
    fieldRef: nameRef,
  })

  return (
    <div ref={sectionRef}>
      <div className="workspace-section-header">
        <div>
          <p className="eyebrow">{t("Venue")}</p>
          <h3 className="workspace-section-heading">
            <span className="workspace-section-icon" aria-hidden="true">👔</span>
            {t("Positions")}
          </h3>
          <p className="workspace-section-subtitle">
            {t("Create and organize custom positions for any hospitality business.")}
          </p>
        </div>
      </div>

      {isLoadFailureMessage(noticeMessage) ? (
        <LoadFailureBanner message={noticeMessage} subject="positions" onRetry={onRetry} />
      ) : null}
      {isLoading && !isLoadFailureMessage(noticeMessage) ? <div className="staff-status-banner">{t("Loading positions…")}</div> : null}

      <div className="panel staff-panel workspace-panel" ref={editorRef}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t("Manage positions")}</p>
            <h3>{editingPositionId ? t("Edit position") : t("Add position")}</h3>
          </div>
        </div>

        <form className="employee-form" onSubmit={onSubmit}>
          <div className="form-grid">
            <label className="form-field" data-help="setup.add-position">
              <span>{t("Position Name")}</span>
              <input ref={nameRef} value={form.name} onChange={(event) => onFormChange({ ...form, name: event.target.value })} placeholder={t("e.g. Mixologist")} required />
            </label>
            <label className="form-field">
              <span>{t("Department")}</span>
              <select value={form.department} onChange={(event) => onFormChange({ ...form, department: event.target.value })}>
                {POSITION_DEPARTMENTS.map((department) => (
                  <option key={department} value={department}>{t(department)}</option>
                ))}
              </select>
            </label>
          </div>

          <WorkspaceSaveNotice message={isLoadFailureMessage(noticeMessage) ? '' : noticeMessage} />
          <div className="modal-actions">
            {editingPositionId ? <button type="button" className="ghost-btn workspace-action-btn" onClick={onCancelEdit}>{t("Cancel edit")}</button> : null}
            <button type="submit" className="primary-btn workspace-action-btn" disabled={isSaving}>
              {isSaving ? t("Saving…") : editingPositionId ? t("Update Position") : t("Add Position")}
            </button>
          </div>
        </form>
      </div>

      <div className="panel staff-panel workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t("Position list")}</p>
            <h3>{t("{{count}} position", { count: positions.length })}</h3>
          </div>
        </div>

        {positions.length === 0 && !isLoading ? (
          <div className="schedule-empty-state">
            <h4>{t("No positions found.")}</h4>
            <p>{t("Add your first custom position.")}</p>
          </div>
        ) : (
          <div className="positions-list">
            {positions.map((position, index) => {
              const usage = getUsageCount(position)

              return (
                <article key={position.id} className="position-row" data-settings-row={position.id}>
                  <div>
                    <strong>{position.name}</strong>
                    <p>{t(position.department)}</p>
                    {usage > 0 ? <small>{t("Used by {{count}} employee", { count: usage })}</small> : null}
                  </div>
                  <div className="action-group">
                    <button type="button" className="ghost-btn small workspace-action-btn" onClick={() => onMovePosition(position, 'up')} disabled={index === 0}>↑</button>
                    <button type="button" className="ghost-btn small workspace-action-btn" onClick={() => onMovePosition(position, 'down')} disabled={index === positions.length - 1}>↓</button>
                    <button type="button" className="ghost-btn small workspace-action-btn" onClick={() => beginEdit(editorRef.current, () => onStartEdit(position))}>{t("Rename")}</button>
                    <button type="button" className="ghost-btn small workspace-action-btn" onClick={() => onRequestDelete(position)}>{t("Delete")}</button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
