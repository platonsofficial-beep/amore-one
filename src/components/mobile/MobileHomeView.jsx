import { TodayAnnouncementsPanel } from '../today/TodayAnnouncementsPanel'

export function MobileHomeView({
  venueName = '',
  greeting = '',
  dateLabel = '',
  roleLabel = '',
  shiftSummary = {},
  tasksSummary = {},
  needsEmployeeLink = false,
  announcements = [],
  announcementRole = '',
  announcementEmployeeDepartment = '',
  isAnnouncementsSaving = false,
  onMarkAnnouncementSeen,
  clockCard = null,
  reminderCard = null,
  onOpenTasks,
}) {
  const {
    active = 0,
    overdue = 0,
    completedToday = 0,
    completionPercent = 0,
    showEmptyToday = true,
    needsEmployeeLink: tasksNeedEmployeeLink = false,
  } = tasksSummary

  const shiftNeedsLink = needsEmployeeLink || shiftSummary?.needsEmployeeLink
  const tasksNeedsLink = needsEmployeeLink || tasksNeedEmployeeLink
  const workspaceContext = [venueName, roleLabel].filter(Boolean).join(' · ')

  return (
    <div className="mobile-screen mobile-home">
      {/* Same Today header as managers: greeting, then date and venue · role. */}
      <header className="mobile-manager-command-header">
        <h1 className="mobile-manager-command-greeting">{greeting || 'Welcome'}</h1>
        <p className="mobile-manager-command-meta">
          <span className="mobile-manager-command-date">{dateLabel}</span>
          {workspaceContext ? (
            <span className="mobile-manager-command-workspace">{workspaceContext}</span>
          ) : null}
        </p>
      </header>

      {reminderCard}

      {clockCard}

      <section className={`mobile-card mobile-shift-card tone-${shiftSummary.tone ?? 'neutral'}`} aria-label="Today shift status">
        <p className="mobile-card-label">Today shift</p>
        {shiftNeedsLink ? (
          <>
            <h2 className="mobile-card-headline">Employee profile required</h2>
            <p className="mobile-card-detail">Link your employee profile to view your shift.</p>
          </>
        ) : (
          <>
            <h2 className="mobile-card-headline">{shiftSummary.headline ?? 'Checking schedule…'}</h2>
            <p className="mobile-card-detail">{shiftSummary.detail ?? ''}</p>
          </>
        )}
      </section>

      {onOpenTasks ? (
        <button type="button" className="mobile-card mobile-home-tasks-link" onClick={onOpenTasks} aria-label={`Operations, ${active} active`}>
          <p className="mobile-card-label">Operations · {tasksNeedsLink ? '—' : active}</p>
          {tasksNeedsLink ? (
            <p className="mobile-card-detail">Link your employee profile to view your tasks.</p>
          ) : showEmptyToday ? (
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
        </button>
      ) : (
      <section className="mobile-card" aria-label="Today tasks summary">
        <p className="mobile-card-label">Tasks today</p>
        {tasksNeedsLink ? (
          <p className="mobile-card-detail">Link your employee profile to view your tasks.</p>
        ) : showEmptyToday ? (
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
      )}

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
