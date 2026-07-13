import { useMemo, useState } from 'react'
import {
  filterAnnouncementsForUser,
  formatAnnouncementCardFooterLine,
  getAnnouncementPriorityLabel,
  normalizeAnnouncementPriority,
} from '../../lib/operationsAnnouncementUtils'
import { shouldShowAnnouncementPreviewToggle } from '../../lib/todayStatusPresentationUtils'

const PREVIEW_CHAR_LIMIT = 120

function TodayAnnouncementCard({
  announcement,
  isSaving,
  onMarkSeen,
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const priority = normalizeAnnouncementPriority(announcement.priority)
  const showPriorityBadge = priority === 'important' || priority === 'urgent'
  const message = `${announcement.message ?? ''}`.trim()
  const canExpand = shouldShowAnnouncementPreviewToggle(message, PREVIEW_CHAR_LIMIT)

  return (
    <article
      className={`today-announcement-card priority-${priority}${announcement.isRead ? ' is-read' : ''}${isExpanded ? ' is-expanded' : ''}`}
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

        <p className="today-announcement-message">{message}</p>

        {canExpand ? (
          <button
            type="button"
            className="today-announcement-more-btn"
            onClick={() => setIsExpanded((current) => !current)}
            aria-expanded={isExpanded}
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        ) : null}

        <p className="today-announcement-meta">
          <span className="today-announcement-footer-line">
            {formatAnnouncementCardFooterLine(announcement)}
          </span>
        </p>
      </div>

      {!announcement.isRead ? (
        <button
          type="button"
          className="ghost-btn today-announcement-seen-btn"
          onClick={() => onMarkSeen?.(announcement)}
          disabled={isSaving}
        >
          Seen
        </button>
      ) : null}
    </article>
  )
}

export function TodayAnnouncementsPanel({
  announcements = [],
  role = '',
  employeeDepartment = '',
  isSaving = false,
  onMarkSeen,
}) {
  const activeAnnouncements = useMemo(() => (
    filterAnnouncementsForUser(announcements, {
      role,
      employeeDepartment,
    })
  ), [announcements, role, employeeDepartment])

  if (activeAnnouncements.length === 0) return null

  return (
    <section className="today-announcements" id="today-announcements" aria-label="Announcements">
      <header className="today-announcements-header">
        <h3>Announcements</h3>
      </header>

      <div className="today-announcements-list">
        {activeAnnouncements.map((announcement) => (
          <TodayAnnouncementCard
            key={announcement.id}
            announcement={announcement}
            isSaving={isSaving}
            onMarkSeen={onMarkSeen}
          />
        ))}
      </div>
    </section>
  )
}
