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
            <li key={item} className="workspace-tag">{item}</li>
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
}) {
  return (
    <>
      <div className="workspace-section-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h3 className="workspace-section-heading">
            <span className="workspace-section-icon" aria-hidden="true">📍</span>
            Venue Setup
          </h3>
          <p className="workspace-section-subtitle">
            Operational structure across departments and areas. Edit in each module.
          </p>
        </div>
      </div>

      <div className="workspace-venue-grid">
        <WorkspaceVenueCard
          title="Departments"
          icon="🏷️"
          items={staffDepartments}
          fallbackNote="Configured in module"
        />
        <WorkspaceVenueCard
          title="Schedule Areas"
          icon="🕒"
          items={scheduleAreas}
          fallbackNote="Configured in module"
        />
        <WorkspaceVenueCard
          title="Reservation Areas"
          icon="🍽️"
          items={reservationAreas}
          fallbackNote="Configured in module"
        />
        <WorkspaceVenueCard
          title="Task Boards"
          icon="✓"
          items={taskBoards}
          fallbackNote="Configured in module"
        />
      </div>
    </>
  )
}
