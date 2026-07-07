import { useMemo, useState } from 'react'
import {
  filterAnnouncementsForUser,
  formatAnnouncementCardFooterLine,
  formatAnnouncementSeenLabel,
  getAnnouncementPriorityLabel,
  getAnnouncementPriorityTone,
  isAnnouncementCurrentlyActive,
  normalizeAnnouncementPriority,
  truncateAnnouncementMessage,
} from '../../lib/operationsAnnouncementUtils'
import { OperationsAnnouncementFormModal } from './OperationsAnnouncementFormModal'

function OperationsAnnouncementCard({
  announcement,
  isSaving,
  onEdit,
  onHide,
  onPublish,
}) {
  const priority = normalizeAnnouncementPriority(announcement.priority)
  const priorityTone = getAnnouncementPriorityTone(priority)
  const showPriorityBadge = priority === 'important' || priority === 'urgent'
  const isActive = isAnnouncementCurrentlyActive(announcement)

  return (
    <article className={`operations-announcement-card${!isActive ? ' is-inactive' : ''}${announcement.isRead ? ' is-read' : ''}`}>
      <div className="operations-announcement-card-main">
        <div className="operations-announcement-card-top">
          {showPriorityBadge ? (
            <span className={`operations-announcement-badge tone-${priorityTone}`}>
              {getAnnouncementPriorityLabel(priority)}
            </span>
          ) : null}
          {!isActive ? <span className="operations-announcement-status">Hidden from team</span> : null}
        </div>

        <div className="operations-announcement-card-heading">
          <span className="operations-announcement-icon" aria-hidden="true">📢</span>
          <h4 className="operations-announcement-title">{announcement.title}</h4>
        </div>
        <p className="operations-announcement-message">
          {truncateAnnouncementMessage(announcement.message, 100)}
        </p>

        <div className="operations-announcement-meta">
          <span className="operations-announcement-footer-line">
            {formatAnnouncementCardFooterLine(announcement)}
          </span>
          <span className="operations-announcement-seen-meta">
            {formatAnnouncementSeenLabel(announcement.readCount, announcement.eligibleCount)}
          </span>
        </div>
      </div>

      <div className="operations-announcement-card-actions">
        <button
          type="button"
          className="ghost-btn operations-announcement-action"
          onClick={() => onEdit?.(announcement)}
          disabled={isSaving}
        >
          Edit
        </button>
        {isActive ? (
          <button
            type="button"
            className="ghost-btn operations-announcement-action"
            onClick={() => onHide?.(announcement)}
            disabled={isSaving}
          >
            Hide
          </button>
        ) : (
          <button
            type="button"
            className="ghost-btn operations-announcement-action"
            onClick={() => onPublish?.(announcement)}
            disabled={isSaving}
          >
            Publish
          </button>
        )}
      </div>
    </article>
  )
}

export function OperationsAnnouncementsSection({
  announcements = [],
  canManageAnnouncements: canManage = false,
  isSaving = false,
  isLoading = false,
  role = '',
  employeeDepartment = '',
  onCreate,
  onUpdate,
  onHide,
  onPublish,
}) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState(null)

  const visibleAnnouncements = useMemo(() => (
    filterAnnouncementsForUser(announcements, {
      role,
      employeeDepartment,
      includeInactive: canManage,
    })
  ), [announcements, canManage, role, employeeDepartment])

  if (!canManage) return null

  const handleSubmit = async (payload) => {
    if (editingAnnouncement) {
      await onUpdate?.(editingAnnouncement.id, payload)
    } else {
      await onCreate?.(payload)
    }
    setEditingAnnouncement(null)
    setIsFormOpen(false)
  }

  return (
    <section className="operations-section panel staff-panel" aria-label="Announcements">
      <header className="operations-section-header">
        <div>
          <p className="eyebrow">Announcements</p>
          <h3>Team updates</h3>
        </div>
        <button
          type="button"
          className="primary-btn operations-dashboard-action operations-announcement-new-btn"
          onClick={() => {
            setEditingAnnouncement(null)
            setIsFormOpen(true)
          }}
          disabled={isSaving}
        >
          + Announcement
        </button>
      </header>

      {visibleAnnouncements.length === 0 && !isLoading ? (
        <div className="operations-empty-state">
          <h4>No announcements yet</h4>
          <p>Share important updates with your team.</p>
        </div>
      ) : (
        <div className="operations-announcement-list">
          {visibleAnnouncements.map((announcement) => (
            <OperationsAnnouncementCard
              key={announcement.id}
              announcement={announcement}
              isSaving={isSaving}
              onEdit={(item) => {
                setEditingAnnouncement(item)
                setIsFormOpen(true)
              }}
              onHide={onHide}
              onPublish={onPublish}
            />
          ))}
        </div>
      )}

      {isFormOpen ? (
        <OperationsAnnouncementFormModal
          key={editingAnnouncement?.id ?? 'new'}
          isOpen={isFormOpen}
          announcement={editingAnnouncement}
          isSaving={isSaving}
          onClose={() => {
            if (isSaving) return
            setIsFormOpen(false)
            setEditingAnnouncement(null)
          }}
          onSubmit={handleSubmit}
        />
      ) : null}
    </section>
  )
}
