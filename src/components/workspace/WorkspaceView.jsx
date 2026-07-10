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
}) {
  return (
    <section className="staff-page workspace-page">
      <div className="workspace-layout">
        <aside className="workspace-nav" aria-label="Settings sections">
          <div className="workspace-nav-links">
            {WORKSPACE_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`workspace-nav-link${activeSection === section.id ? ' active' : ''}`}
                onClick={() => onSectionChange(section.id)}
              >
                <span className="workspace-nav-icon" aria-hidden="true">{section.icon}</span>
                {section.label}
              </button>
            ))}
          </div>
        </aside>

        <div className="workspace-content">
          {activeSection === 'profile' ? (
            <WorkspaceBusinessProfileSection {...businessProfileProps} />
          ) : null}
          {activeSection === 'positions' ? (
            <WorkspacePositionsSection {...positionsProps} />
          ) : null}
          {activeSection === 'venue' ? (
            <WorkspaceVenueSetupSection {...venueSetupProps} />
          ) : null}
          {activeSection === 'reservations' ? (
            <WorkspaceReservationSeatingsSection {...reservationSeatingsProps} />
          ) : null}
          {activeSection === 'team' ? (
            <WorkspaceTeamSection {...teamProps} workspace={workspace} />
          ) : null}
          {activeSection === 'system' ? (
            <WorkspaceSystemSection {...systemProps} />
          ) : null}
        </div>
      </div>
    </section>
  )
}
