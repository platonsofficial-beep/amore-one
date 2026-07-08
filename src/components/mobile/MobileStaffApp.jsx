import { MobileBottomNav } from './MobileBottomNav'
import { MobileHomeView } from './MobileHomeView'
import { MobileMenuView } from './MobileMenuView'
import { MobileProfileView } from './MobileProfileView'
import { MobileScheduleView } from './MobileScheduleView'
import { MobileTasksView } from './MobileTasksView'

export function MobileStaffApp({
  activeTab,
  onTabChange,
  noticeMessage = '',
  onDismissNotice,
  homeProps,
  scheduleProps,
  tasksProps,
  menuProps,
  expandedView = null,
  expandedTitle = '',
  onBackFromExpanded,
  expandedModuleContent = null,
  bottomTabs,
}) {
  const noticeBanner = noticeMessage ? (
    <div className="mobile-notice-banner auth-banner auth-banner-error" role="alert">
      <p>{noticeMessage}</p>
      {onDismissNotice ? (
        <button type="button" className="mobile-notice-dismiss" onClick={onDismissNotice} aria-label="Dismiss">
          ✕
        </button>
      ) : null}
    </div>
  ) : null

  if (expandedView) {
    return (
      <div className="mobile-app mobile-app-expanded">
        {noticeBanner}
        <div className="mobile-expanded-scroll">
          <header className="mobile-expanded-header">
            <button type="button" className="mobile-back-btn" onClick={onBackFromExpanded}>
              ‹ Back
            </button>
            <h1>{expandedTitle}</h1>
          </header>
          {expandedModuleContent ? (
            <div className="mobile-workspace-module is-mobile-expanded">
              {expandedModuleContent}
            </div>
          ) : null}
        </div>
        <MobileBottomNav activeTab={activeTab} onTabChange={onTabChange} tabs={bottomTabs} />
      </div>
    )
  }

  return (
    <div className="mobile-app">
      {noticeBanner}
      <div className="mobile-app-content">
        {activeTab === 'home' ? <MobileHomeView {...homeProps} /> : null}
        {activeTab === 'schedule' ? <MobileScheduleView {...scheduleProps} /> : null}
        {activeTab === 'tasks' ? <MobileTasksView {...tasksProps} /> : null}
        {activeTab === 'menu' ? (
          menuProps?.screen === 'profile' ? (
            <MobileProfileView {...(menuProps.profileProps ?? {})} onBack={menuProps.onBackFromProfile} />
          ) : (
            <MobileMenuView {...menuProps} />
          )
        ) : null}
      </div>
      <MobileBottomNav activeTab={activeTab} onTabChange={onTabChange} tabs={bottomTabs} />
    </div>
  )
}
