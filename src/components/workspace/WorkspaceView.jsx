import { WorkspaceBusinessProfileSection } from './WorkspaceBusinessProfileSection'
import { WorkspacePositionsSection } from './WorkspacePositionsSection'
import { WorkspaceVenueSetupSection } from './WorkspaceVenueSetupSection'
import { WorkspaceReservationSeatingsSection } from './WorkspaceReservationSeatingsSection'
import { WorkspaceTeamSection } from './WorkspaceTeamSection'
import { WorkspaceSystemSection } from './WorkspaceSystemSection'

export const WORKSPACE_SECTIONS = [
  { id: 'profile', label: 'Business Profile', icon: '🏢' },
  { id: 'positions', label: 'Positions', icon: '👔' },
  { id: 'venue', label: 'Venue Setup', icon: '📍' },
  { id: 'reservations', label: 'Reservations', icon: '🍽️' },
  { id: 'team', label: 'Team', icon: '👥' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'system', label: 'System', icon: '⚙️' },
]

export function WorkspaceView({
  activeSection,
  onSectionChange,
  workspace,
  businessProfileProps,
  positionsProps,
  venueSetupProps,
  reservationSeatingsProps,
  teamProps,
  systemProps,
  notificationSettings = null,
  visibleSectionIds = null,
}) {
  const sections = Array.isArray(visibleSectionIds)
    ? WORKSPACE_SECTIONS.filter((section) => visibleSectionIds.includes(section.id))
    : WORKSPACE_SECTIONS
  const sectionIds = new Set(sections.map((section) => section.id))
  const resolvedSection = sectionIds.has(activeSection)
    ? activeSection
    : (sections[0]?.id ?? activeSection)

  return (
    <section className="staff-page workspace-page">
      <div className="workspace-layout">
        <aside className="workspace-nav" aria-label="Settings sections">
          <div className="workspace-nav-links">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`workspace-nav-link${resolvedSection === section.id ? ' active' : ''}`}
                onClick={() => onSectionChange(section.id)}
              >
                <span className="workspace-nav-icon" aria-hidden="true">{section.icon}</span>
                {section.label}
              </button>
            ))}
          </div>
        </aside>

        <div className="workspace-content">
          {resolvedSection === 'profile' ? (
            <WorkspaceBusinessProfileSection {...businessProfileProps} />
          ) : null}
          {resolvedSection === 'positions' ? (
            <WorkspacePositionsSection {...positionsProps} />
          ) : null}
          {resolvedSection === 'venue' ? (
            <WorkspaceVenueSetupSection {...venueSetupProps} />
          ) : null}
          {resolvedSection === 'reservations' ? (
            <WorkspaceReservationSeatingsSection {...reservationSeatingsProps} />
          ) : null}
          {resolvedSection === 'team' ? (
            <WorkspaceTeamSection {...teamProps} workspace={workspace} />
          ) : null}
          {resolvedSection === 'notifications' ? notificationSettings : null}
          {resolvedSection === 'system' ? (
            <WorkspaceSystemSection {...systemProps} />
          ) : null}
        </div>
      </div>
    </section>
  )
}
