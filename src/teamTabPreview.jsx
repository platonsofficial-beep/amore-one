import { useState } from 'react'
import './App.css'
import './mobileShell.css'
import { MobileBottomNav } from './components/mobile/MobileBottomNav'
import { TeamPeopleView } from './components/team/TeamPeopleView'
import { TeamTodayView } from './components/team/TeamTodayView'
import { ModuleSectionTabs } from './components/shell/ModuleSectionTabs'
import { TEAM_SECTIONS } from './lib/appNavigation'
import { getMobileBottomTabs } from './lib/permissions'
import { setLocale, t } from './i18n/i18n'

const people = [
  { id: '1', name: 'Elena Christodoulou', department: 'Management', position: 'Owner', status: 'Working', active: true },
  { id: '2', name: 'Andreas Georgiou', department: 'Service', position: 'Waiter', status: 'Working', active: true },
  { id: '3', name: 'Anna Kyriacou', department: 'Kitchen', position: 'Chef', status: 'Working', active: true },
]

export function TeamTabPreview({ shot = 'today' }) {
  const greek = shot.endsWith('-el')
  const view = greek ? shot.slice(0, -3) : shot
  const [section, setSection] = useState(view === 'people' ? 'members' : 'today')
  setLocale(greek ? 'el' : 'en')

  return (
    <div className="mobile-app mobile-manager-app" style={{ minHeight: '100vh', background: 'var(--one-bg)' }}>
      <div className="mobile-app-content">
        <div className="manager-portrait-module">
          <header className="manager-portrait-module-header">
            <h1>{t("Team")}</h1>
          </header>
          <ModuleSectionTabs
            sections={TEAM_SECTIONS}
            activeSection={section}
            onSectionChange={setSection}
            ariaLabel="Team sections"
            helpPrefix="team"
          />
          {section === 'members' ? (
            <TeamPeopleView
              employees={people}
              rosterEmployees={people}
              totalEmployeeCount={people.length}
              activeFilter="All"
              onFilterChange={() => {}}
              onOpenAddEmployee={() => {}}
              onSelectEmployee={() => {}}
              isLoading={false}
              searchTerm=""
              searchPlaceholder={t("Search employee")}
              onSearchTermChange={() => {}}
            />
          ) : (
            <TeamTodayView
              teamTodayGroups={[]}
              isLoading={false}
              teamStatus={{
                scheduleLabel: t("Working now"),
                scheduleValue: t("No one on shift"),
                nextShiftLabel: t("Next shift"),
                nextShiftValue: t("No more shifts today"),
                coverageLabel: t("Coverage"),
                coverageValue: t("All covered"),
                coverageTone: 'ok',
              }}
            />
          )}
        </div>
      </div>
      <MobileBottomNav
        activeTab="team"
        variant="manager"
        tabs={getMobileBottomTabs('owner', 'manager')}
        onTabChange={() => {}}
      />
    </div>
  )
}
