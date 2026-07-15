import { useEffect } from 'react'

export function ManagerLeaveDetailsDrawer({
  leaveDetail,
  onClose,
}) {
  useEffect(() => {
    if (!leaveDetail) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [leaveDetail, onClose])

  if (!leaveDetail) return null

  const noteText = `${leaveDetail.note ?? ''}`.trim()

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside
        className="employee-drawer manager-leave-details-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manager-leave-details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <style>{`
          .manager-leave-details-drawer {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }

          .manager-leave-details-drawer-top {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 0.75rem;
          }

          .manager-leave-details-drawer-identity {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 0.75rem;
          }

          .manager-leave-details-drawer-name {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 600;
          }

          .manager-leave-details-drawer-body {
            display: grid;
            gap: 1rem;
          }

          .manager-leave-details-drawer-section-title {
            margin: 0 0 0.5rem;
            font-size: 0.875rem;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--text-muted, #9aa3b2);
          }

          .manager-leave-details-drawer-fields {
            display: grid;
            gap: 0.5rem;
            margin: 0;
          }

          .manager-leave-details-drawer-field {
            display: grid;
            grid-template-columns: 7.5rem 1fr;
            gap: 0.5rem;
            margin: 0;
          }

          .manager-leave-details-drawer-field dt {
            margin: 0;
            color: var(--text-muted, #9aa3b2);
            font-size: 0.8125rem;
          }

          .manager-leave-details-drawer-field dd {
            margin: 0;
            font-size: 0.875rem;
          }

          .manager-leave-details-drawer-note {
            margin: 0;
            font-size: 0.875rem;
            line-height: 1.5;
          }

          .manager-leave-details-drawer-note.is-empty {
            color: var(--text-muted, #9aa3b2);
            font-style: italic;
          }
        `}</style>

        <div className="manager-leave-details-drawer-top">
          <p className="eyebrow">Leave request</p>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close leave request details"
          >
            ✕
          </button>
        </div>

        <header className="manager-leave-details-drawer-identity">
          <h3 id="manager-leave-details-title" className="manager-leave-details-drawer-name">
            {leaveDetail.employeeName}
          </h3>
          <span className="status-pill pending">{leaveDetail.statusLabel}</span>
        </header>

        <div className="manager-leave-details-drawer-body">
          <section>
            <h4 className="manager-leave-details-drawer-section-title">Request details</h4>
            <dl className="manager-leave-details-drawer-fields">
              <div className="manager-leave-details-drawer-field">
                <dt>Leave type</dt>
                <dd>{leaveDetail.leaveTypeLabel}</dd>
              </div>
              <div className="manager-leave-details-drawer-field">
                <dt>Start date</dt>
                <dd>{leaveDetail.startDate}</dd>
              </div>
              <div className="manager-leave-details-drawer-field">
                <dt>End date</dt>
                <dd>{leaveDetail.endDate}</dd>
              </div>
              <div className="manager-leave-details-drawer-field">
                <dt>Duration</dt>
                <dd>{leaveDetail.durationLabel}</dd>
              </div>
              {leaveDetail.submittedDate ? (
                <div className="manager-leave-details-drawer-field">
                  <dt>Submitted</dt>
                  <dd>{leaveDetail.submittedDate}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section>
            <h4 className="manager-leave-details-drawer-section-title">Note</h4>
            <p className={`manager-leave-details-drawer-note${noteText ? '' : ' is-empty'}`}>
              {noteText || 'No note provided.'}
            </p>
          </section>
        </div>
      </aside>
    </>
  )
}
