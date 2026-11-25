import { useEffect, useState } from 'react'
import './App.css'
import './mobileShell.css'
import { AttendanceBoard } from './components/attendance/AttendanceBoard'
import { WorkspaceView } from './components/workspace/WorkspaceView'
import { AuthProvider } from './context/AuthContext'
import { setLocale } from './i18n/i18n'

const entries = [
  {
    id: 'e1',
    personName: 'Nina',
    member_id: 'm-nina',
    work_date: '2026-11-25',
    clock_in_at: '2026-11-25T16:00:00Z',
    clock_out_at: '2026-11-25T21:30:00Z',
    is_unscheduled: true,
    shift_id: null,
    review_status: 'pending',
    scheduledLabel: '',
  },
  {
    id: 'e2',
    personName: 'Alex',
    member_id: 'm-alex',
    work_date: '2026-11-25',
    clock_in_at: '2026-11-25T16:05:00Z',
    clock_out_at: null,
    is_unscheduled: false,
    shift_id: 'shift-1',
    review_status: 'pending',
    is_late: true,
    late_minutes: 5,
    scheduledLabel: '18:00–00:00',
  },
]

function HoursTab() {
  return (
    <div className="app-shell is-mobile-shell is-attendance-view" style={{ minHeight: '100vh', background: 'var(--one-bg)', padding: 12 }}>
      <AttendanceBoard
        isOwner
        timeZone="Europe/Nicosia"
        initialTab="hours"
        hoursFixture={{ range: 'today', entries }}
      />
    </div>
  )
}

function SettingsShot({ onOpen }) {
  useEffect(() => {
    document.querySelector('.workspace-nav-link.active')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [])

  return (
    <div className="app-shell is-mobile-shell is-settings-view" style={{ minHeight: '100vh', background: 'var(--one-bg)' }}>
      <WorkspaceView
        activeSection="team"
        onSectionChange={() => {}}
        workspace={{ id: 'ws', name: 'SENTIO' }}
        teamProps={{
          employees: [
            { id: 'emp-1', name: 'Nina', status: 'active' },
            { id: 'emp-2', name: 'Alex', status: 'active' },
          ],
          managerName: 'Platon',
          workspaceProfile: { businessName: 'SENTIO', managerName: 'Platon' },
          pendingHours: 2,
          timeZone: 'Europe/Nicosia',
          onManageStaff: () => {},
          onOpenStaffHours: onOpen,
        }}
      />
    </div>
  )
}

export function StaffHoursSettingsPreview({ shot = 'settings' }) {
  const greek = shot.endsWith('-el')
  const view = greek ? shot.slice(0, -3) : shot
  const [opened, setOpened] = useState(view === 'hours')
  setLocale(greek ? 'el' : 'en')
  if (view === 'staff' && typeof window !== 'undefined') {
    const url = new URL(window.location.href)
    url.searchParams.set('devRole', 'staff')
    window.history.replaceState({}, '', url)
  }
  function openHours() {
    setOpened(true)
  }
  if (opened) {
    return (
      <HoursTab />
    )
  }
  return (
    <AuthProvider>
      <SettingsShot onOpen={openHours} />
    </AuthProvider>
  )
}
