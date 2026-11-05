import { useEffect, useRef, useState } from 'react'
import { LIMITED_SETTINGS_SUBTITLE } from '../../lib/settingsSections'
import { WorkspaceBusinessProfileSection } from './WorkspaceBusinessProfileSection'
import { WorkspacePositionsSection } from './WorkspacePositionsSection'
import { WorkspaceVenueSetupSection } from './WorkspaceVenueSetupSection'
import { WorkspaceReservationSeatingsSection } from './WorkspaceReservationSeatingsSection'
import { WorkspaceTeamSection } from './WorkspaceTeamSection'
import { WorkspaceSystemSection } from './WorkspaceSystemSection'
import { PrivacySettingsSection } from '../privacy/PrivacySections'

const WORKSPACE_SECTIONS = [
  { id: 'profile', label: 'Business Profile', shortLabel: 'Profile', icon: '🏢' },
  { id: 'positions', label: 'Positions', shortLabel: 'Positions', icon: '👔' },
  { id: 'venue', label: 'Venue Setup', shortLabel: 'Venue', icon: '📍' },
  { id: 'reservations', label: 'Reservations', shortLabel: 'Seatings', icon: '🍽️' },
  { id: 'team', label: 'Team', shortLabel: 'Team', icon: '👥' },
  { id: 'notifications', label: 'Notifications', shortLabel: 'Alerts', icon: '🔔' },
  { id: 'system', label: 'System', shortLabel: 'System', icon: '⚙️' },
  { id: 'privacy', label: 'Privacy', shortLabel: 'Privacy', icon: '🔒' },
]

function readChipRow() {
  if (typeof window.matchMedia !== 'function') return false
  const wideEnoughToScroll = window.matchMedia('(max-width: 960px)').matches
  const portraitWrap = window.matchMedia('(max-width: 640px) and (orientation: portrait)').matches
  return wideEnoughToScroll && !portraitWrap
}

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
  limitedAccess = false,
}) {
  const sections = Array.isArray(visibleSectionIds)
    ? WORKSPACE_SECTIONS.filter((section) => visibleSectionIds.includes(section.id))
    : WORKSPACE_SECTIONS
  const sectionKey = sections.map((section) => section.id).join('|')
  const sectionIds = new Set(sections.map((section) => section.id))
  const resolvedSection = sectionIds.has(activeSection)
    ? activeSection
    : (sections[0]?.id ?? activeSection)
  const scrollerRef = useRef(null)
  const [chipRow, setChipRow] = useState(readChipRow)
  const [edges, setEdges] = useState({ start: false, end: false })

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const widthQuery = window.matchMedia('(max-width: 960px)')
    const portraitQuery = window.matchMedia('(max-width: 640px) and (orientation: portrait)')
    const sync = () => setChipRow(readChipRow())
    sync()
    widthQuery.addEventListener?.('change', sync)
    portraitQuery.addEventListener?.('change', sync)
    return () => {
      widthQuery.removeEventListener?.('change', sync)
      portraitQuery.removeEventListener?.('change', sync)
    }
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return undefined
    const update = () => {
      const max = el.scrollWidth - el.clientWidth
      setEdges({
        start: max > 8 && el.scrollLeft > 8,
        end: max > 8 && el.scrollLeft < max - 8,
      })
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null
    observer?.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [sectionKey, chipRow])

  const scrollNav = (direction) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollBy({ left: direction * Math.max(140, el.clientWidth * 0.6), behavior: 'smooth' })
  }

  const navClass = [
    'workspace-nav',
    chipRow && edges.start ? 'can-scroll-start' : '',
    chipRow && edges.end ? 'can-scroll-end' : '',
  ].filter(Boolean).join(' ')

  return (
    <section className="staff-page workspace-page">
      {limitedAccess ? (
        <p className="workspace-limited-note">{LIMITED_SETTINGS_SUBTITLE}.</p>
      ) : null}
      <div className="workspace-layout">
        <aside className={navClass} aria-label="Settings sections">
          {chipRow && edges.start ? (
            <button
              type="button"
              className="workspace-nav-chevron is-start"
              aria-label="Earlier settings sections"
              onClick={() => scrollNav(-1)}
            >
              ‹
            </button>
          ) : null}
          <div className="workspace-nav-links" ref={scrollerRef}>
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`workspace-nav-link${resolvedSection === section.id ? ' active' : ''}`}
                data-help={`settings.${section.id}`}
                data-help-nav=""
                onClick={() => onSectionChange(section.id)}
              >
                <span className="workspace-nav-icon" aria-hidden="true">{section.icon}</span>
                <span className="workspace-nav-label">
                  <span className="workspace-nav-label-full">{section.label}</span>
                  <span className="workspace-nav-label-short">{section.shortLabel}</span>
                </span>
              </button>
            ))}
          </div>
          {chipRow && edges.end ? (
            <button
              type="button"
              className="workspace-nav-chevron is-end"
              aria-label="More settings sections"
              onClick={() => scrollNav(1)}
            >
              ›
            </button>
          ) : null}
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
          {resolvedSection === 'privacy' ? <PrivacySettingsSection /> : null}
        </div>
      </div>
    </section>
  )
}
