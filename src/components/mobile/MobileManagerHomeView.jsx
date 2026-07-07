import { TodayAnnouncementsPanel } from '../today/TodayAnnouncementsPanel'

export function MobileManagerHomeView({
  venueName = '',
  greeting = '',
  dateLabel = '',
  roleLabel = '',
  announcements = [],
  announcementRole = '',
  announcementEmployeeDepartment = '',
  isAnnouncementsSaving = false,
  onMarkAnnouncementSeen,
}) {
  return (
    <div className="mobile-screen mobile-home mobile-manager-home">
      <header className="mobile-screen-header">
        <p className="mobile-screen-eyebrow">{dateLabel}</p>
        <h1 className="mobile-screen-title">{greeting || 'Welcome'}</h1>
        {venueName ? <p className="mobile-screen-subtitle">{venueName}</p> : null}
        {roleLabel ? <p className="mobile-manager-role-label">{roleLabel}</p> : null}
      </header>

      <section className="mobile-card mobile-manager-today-placeholder" aria-label="Today overview">
        <p className="mobile-card-label">Today</p>
        <h2 className="mobile-card-headline">Operations overview</h2>
        <p className="mobile-card-detail">
          Manager home is coming next. Use Menu to open workspace modules for now.
        </p>
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
