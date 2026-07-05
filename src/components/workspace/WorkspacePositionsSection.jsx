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
}) {
  return (
    <>
      <div className="workspace-section-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h3 className="workspace-section-heading">
            <span className="workspace-section-icon" aria-hidden="true">👔</span>
            Positions
          </h3>
          <p className="workspace-section-subtitle">
            Create and organize custom positions for any hospitality business.
          </p>
        </div>
      </div>

      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">Loading positions…</div> : null}

      <div className="panel staff-panel workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Manage positions</p>
            <h3>{editingPositionId ? 'Edit position' : 'Add position'}</h3>
          </div>
        </div>

        <form className="employee-form" onSubmit={onSubmit}>
          <div className="form-grid">
            <label className="form-field">
              <span>Position Name</span>
              <input value={form.name} onChange={(event) => onFormChange({ ...form, name: event.target.value })} placeholder="e.g. Mixologist" required />
            </label>
            <label className="form-field">
              <span>Department</span>
              <select value={form.department} onChange={(event) => onFormChange({ ...form, department: event.target.value })}>
                {POSITION_DEPARTMENTS.map((department) => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="modal-actions">
            {editingPositionId ? <button type="button" className="ghost-btn workspace-action-btn" onClick={onCancelEdit}>Cancel edit</button> : null}
            <button type="submit" className="primary-btn workspace-action-btn" disabled={isSaving}>
              {isSaving ? 'Saving…' : editingPositionId ? 'Update Position' : 'Add Position'}
            </button>
          </div>
        </form>
      </div>

      <div className="panel staff-panel workspace-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Position list</p>
            <h3>{positions.length} positions</h3>
          </div>
        </div>

        {positions.length === 0 && !isLoading ? (
          <div className="schedule-empty-state">
            <h4>No positions found.</h4>
            <p>Add your first custom position.</p>
          </div>
        ) : (
          <div className="positions-list">
            {positions.map((position, index) => {
              const usage = getUsageCount(position)

              return (
                <article key={position.id} className="position-row">
                  <div>
                    <strong>{position.name}</strong>
                    <p>{position.department}</p>
                    {usage > 0 ? <small>Used by {usage} employee{usage === 1 ? '' : 's'}</small> : null}
                  </div>
                  <div className="action-group">
                    <button type="button" className="ghost-btn small workspace-action-btn" onClick={() => onMovePosition(position, 'up')} disabled={index === 0}>↑</button>
                    <button type="button" className="ghost-btn small workspace-action-btn" onClick={() => onMovePosition(position, 'down')} disabled={index === positions.length - 1}>↓</button>
                    <button type="button" className="ghost-btn small workspace-action-btn" onClick={() => onStartEdit(position)}>Rename</button>
                    <button type="button" className="ghost-btn small workspace-action-btn" onClick={() => onRequestDelete(position)}>Delete</button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
