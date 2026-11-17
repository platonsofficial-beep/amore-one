import { VenueManager } from './VenueManager'
import { t } from '../../i18n/i18n'
const PRESET_AREA_LABELS = new Set([
  'Bar', 'Service', 'Kitchen', 'Management', 'Other',
  'Terrace', 'VIP', 'Lounge', 'Garden', 'Reception', 'Host', 'Private',
  'Main Dining',
])

function displayPresetLabel(value) {
  const text = `${value ?? ''}`.trim()
  return PRESET_AREA_LABELS.has(text) ? t(text) : text
}

function WorkspaceVenueCard({ title, icon, items, fallbackNote }) {
  const hasItems = Array.isArray(items) && items.length > 0

  return (
    <article className="workspace-venue-card panel staff-panel">
      <header className="workspace-venue-card-header">
        <h4 className="workspace-venue-card-title">
          <span className="workspace-section-icon" aria-hidden="true">{icon}</span>
          {title}
        </h4>
      </header>
      {hasItems ? (
        <ul className="workspace-tag-list">
          {items.map((item) => (
            <li key={item} className="workspace-tag">{displayPresetLabel(item)}</li>
          ))}
        </ul>
      ) : (
        <p className="workspace-venue-fallback">{fallbackNote}</p>
      )}
    </article>
  )
}

export function WorkspaceVenueSetupSection({
  staffDepartments = [],
  scheduleAreas = [],
  reservationAreas = [],
  taskBoards = [],
  clockLocation = null,
}) {
  return (
    <>
      <VenueManager />
      <div className="workspace-section-header">
        <div>
          <p className="eyebrow">{t("Venue")}</p>
          <h3 className="workspace-section-heading">
            <span className="workspace-section-icon" aria-hidden="true">📍</span>
            {t("Venue Setup")}
          </h3>
          <p className="workspace-section-subtitle">
            {t("Operational structure across departments and areas. Edit in each module.")}
          </p>
        </div>
      </div>

      {clockLocation}

      <div className="workspace-venue-grid">
        <WorkspaceVenueCard
          title={t("Departments")}
          icon="🏷️"
          items={staffDepartments}
          fallbackNote={t("Add departments in Team → People when creating employees.")}
        />
        <WorkspaceVenueCard
          title={t("Schedule Areas")}
          icon="🕒"
          items={scheduleAreas}
          fallbackNote={t("Set schedule areas in Team → Schedule.")}
        />
        <WorkspaceVenueCard
          title={t("Reservation Areas")}
          icon="🍽️"
          items={reservationAreas}
          fallbackNote={t("Configure service seatings in Settings → Reservations.")}
        />
        <WorkspaceVenueCard
          title={t("Task Boards")}
          icon="✓"
          items={taskBoards.map((item) => t(item))}
          fallbackNote={t("Create task boards in Operations → Tasks.")}
        />
      </div>
    </>
  )
}
