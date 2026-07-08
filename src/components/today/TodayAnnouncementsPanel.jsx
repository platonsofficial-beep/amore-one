import {
  filterAnnouncementsForUser,
  formatAnnouncementCardFooterLine,
  getAnnouncementPriorityLabel,
  normalizeAnnouncementPriority,
} from '../../lib/operationsAnnouncementUtils'

export function TodayAnnouncementsPanel({
  announcements = [],
  role = '',
  employeeDepartment = '',
  isSaving = false,
  onMarkSeen,
}) {
  const activeAnnouncements = filterAnnouncementsForUser(announcements, {
    role,
    employeeDepartment,
  })

  if (activeAnnouncements.length === 0) return null

  return (
    <section className="today-announcements" id="today-announcements" aria-label="Announcements">
      <header className="today-announcements-header">
        <h3>Announcements</h3>
      </header>

      <div className="today-announcements-list">
        {activeAnnouncements.map((announcement) => {
          const priority = normalizeAnnouncementPriority(announcement.priority)
          const showPriorityBadge = priority === 'important' || priority === 'urgent'

          return (
            <article
              key={announcement.id}
              className={`today-announcement-card priority-${priority}${announcement.isRead ? ' is-read' : ''}`}
            >
              <div className="today-announcement-card-body">
                <div className="today-announcement-card-top">
                  <h4 className="today-announcement-title">{announcement.title}</h4>
                  {showPriorityBadge ? (
                    <span className={`today-announcement-badge priority-${priority}`}>
                      {getAnnouncementPriorityLabel(priority)}
                    </span>
                  ) : null}
                </div>

                <p className="today-announcement-message">{announcement.message}</p>

                <div className="today-announcement-meta">
                  <span className="today-announcement-footer-line">
                    {formatAnnouncementCardFooterLine(announcement)}
                  </span>
                </div>
              </div>

              {!announcement.isRead ? (
                <button
                  type="button"
                  className="primary-btn today-announcement-seen-btn"
                  onClick={() => onMarkSeen?.(announcement)}
                  disabled={isSaving}
                >
                  Seen
                </button>
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}
