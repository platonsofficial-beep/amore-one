import { TodayAnnouncementsPanel } from '../today/TodayAnnouncementsPanel'

export function MobileHomeView({
  venueName = '',
  greeting = '',
  dateLabel = '',
  shiftSummary = {},
  tasksSummary = {},
  announcements = [],
  announcementRole = '',
  announcementEmployeeDepartment = '',
  isAnnouncementsSaving = false,
  onMarkAnnouncementSeen,
}) {
  const {
    active = 0,
    overdue = 0,
    completedToday = 0,
    completionPercent = 0,
    showEmptyToday = true,
  } = tasksSummary

  return (
    <div className="mobile-screen mobile-home">
      <header className="mobile-screen-header">
        <p className="mobile-screen-eyebrow">{dateLabel}</p>
        <h1 className="mobile-screen-title">{greeting || 'Welcome'}</h1>
        {venueName ? <p className="mobile-screen-subtitle">{venueName}</p> : null}
      </header>

      <section className={`mobile-card mobile-shift-card tone-${shiftSummary.tone ?? 'neutral'}`} aria-label="Today shift status">
        <p className="mobile-card-label">Today shift</p>
        <h2 className="mobile-card-headline">{shiftSummary.headline ?? 'Checking schedule…'}</h2>
        <p className="mobile-card-detail">{shiftSummary.detail ?? ''}</p>
      </section>

      <section className="mobile-card" aria-label="Today tasks summary">
        <p className="mobile-card-label">Tasks today</p>
        {showEmptyToday ? (
          <p className="mobile-card-detail">No tasks due today.</p>
        ) : (
          <div className="mobile-task-summary-grid">
            <div className="mobile-task-summary-item">
              <strong>{active}</strong>
              <span>Active</span>
            </div>
            <div className={`mobile-task-summary-item${overdue > 0 ? ' is-alert' : ''}`}>
              <strong>{overdue}</strong>
              <span>Overdue</span>
            </div>
            <div className="mobile-task-summary-item">
              <strong>{completedToday}</strong>
              <span>Done</span>
            </div>
            <div className="mobile-task-summary-item">
              <strong>{completionPercent}%</strong>
              <span>Complete</span>
            </div>
          </div>
        )}
      </section>

      <TodayAnnouncementsPanel
        announcements={announcements}
        role={announcementRole}
        employeeDepartment={announcementEmployeeDepartment}
        isSaving={isAnnouncementsSaving}
        onMarkSeen={onMarkAnnouncementSeen}
      />
    </div>
  )
}
