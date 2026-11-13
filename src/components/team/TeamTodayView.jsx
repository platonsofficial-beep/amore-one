import { TeamTodayGroupsList } from './TeamTodayGroupsList'
import { LoadFailureBanner } from '../shell/LoadFailureBanner'
import { isLoadFailureMessage } from '../../lib/userFacingLoadError'
import { t } from '../../i18n/i18n'

export function TeamTodayView({
  teamStatus,
  teamTodayGroups,
  isLoading,
  noticeMessage,
}) {
  const status = teamStatus ?? {
    scheduleLabel: t("Working now"),
    scheduleValue: t("No one on shift"),
    nextShiftLabel: t("Next shift"),
    nextShiftValue: t("No more shifts today"),
    coverageLabel: 'Coverage',
    coverageValue: t("All covered"),
    coverageTone: 'ok',
    coverageDetail: '',
  }

  return (
    <section className="team-today-page" aria-label={t("Team today")}>
      {isLoadFailureMessage(noticeMessage) ? (
        <LoadFailureBanner message={noticeMessage} subject="the team" />
      ) : noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {isLoading ? <div className="staff-status-banner">{t("Loading today's team…")}</div> : null}

      <section className="team-today-status-card" aria-label={t("Team status")}>
        <div className="team-today-status-row">
          <span className="team-today-status-label">{status.scheduleLabel}</span>
          <span className="team-today-status-value">{status.scheduleValue}</span>
        </div>
        <div className="team-today-status-row">
          <span className="team-today-status-label">{status.nextShiftLabel}</span>
          <span className="team-today-status-value">{status.nextShiftValue}</span>
        </div>
        <div className="team-today-status-row">
          <span className="team-today-status-label">{status.coverageLabel}</span>
          <span className={`team-today-status-value tone-${status.coverageTone}`}>
            {status.coverageValue}
          </span>
        </div>
        {status.coverageDetail && status.coverageTone !== 'ok' && status.coverageDetail !== status.coverageValue ? (
          <p className="team-today-status-detail">{status.coverageDetail}</p>
        ) : null}
      </section>

      {isLoading ? null : (teamTodayGroups ?? []).length === 0 ? (
        <p className="team-today-empty">{t("No shifts scheduled today.")}</p>
      ) : (
        <TeamTodayGroupsList groups={teamTodayGroups} />
      )}
    </section>
  )
}
