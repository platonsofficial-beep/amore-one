import { MobileBottomNav } from './MobileBottomNav'
import { MobileManagerHomeView } from './MobileManagerHomeView'
import { MobileManagerLeaveInboxView } from './MobileManagerLeaveInboxView'
import { MobileManagerStockView } from './MobileManagerStockView'
import { MobileManagerTasksView } from './MobileManagerTasksView'
import { MobileMenuView } from './MobileMenuView'
import { MobileProfileView } from './MobileProfileView'

export function MobileManagerApp({
  activeTab,
  onTabChange,
  noticeMessage = '',
  onDismissNotice,
  homeProps,
  stockProps,
  managerTasksProps,
  menuProps,
  expandedView = null,
  expandedTitle = '',
  onBackFromExpanded,
  expandedModuleContent = null,
  isReservationsHostMode = false,
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

  if (expandedView && isReservationsHostMode) {
    return (
      <div className="mobile-app mobile-app-host-mode mobile-manager-app is-reservations-host-mode">
        {noticeBanner}
        <div className="mobile-host-mode-screen">
          {expandedModuleContent ? (
            <div className="mobile-workspace-module is-host-mode-module">
              {expandedModuleContent}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  if (expandedView) {
    return (
      <div className="mobile-app mobile-app-expanded mobile-manager-app">
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
        <MobileBottomNav activeTab={activeTab} onTabChange={onTabChange} variant="manager" tabs={bottomTabs} />
      </div>
    )
  }

  return (
    <div className="mobile-app mobile-manager-app">
      {noticeBanner}
      <div className="mobile-app-content">
        {activeTab === 'today' ? <MobileManagerHomeView {...homeProps} /> : null}
        {activeTab === 'stock' ? <MobileManagerStockView {...stockProps} /> : null}
        {activeTab === 'tasks' ? <MobileManagerTasksView {...managerTasksProps} /> : null}
        {activeTab === 'menu' ? (
          menuProps?.screen === 'leave-inbox' ? (
            <MobileManagerLeaveInboxView
              {...(menuProps.leaveInboxProps ?? {})}
              onBack={menuProps.onBackFromLeaveInbox}
            />
          ) : menuProps?.screen === 'profile' ? (
            <MobileProfileView {...(menuProps.profileProps ?? {})} onBack={menuProps.onBackFromProfile} />
          ) : (
            <MobileMenuView {...menuProps} />
          )
        ) : null}
      </div>
      <MobileBottomNav activeTab={activeTab} onTabChange={onTabChange} variant="manager" tabs={bottomTabs} />
    </div>
  )
}
