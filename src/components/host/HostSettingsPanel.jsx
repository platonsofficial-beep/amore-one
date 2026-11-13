import { findPhoneCountryByIso2 } from '../../lib/phoneCountries'
import { useState } from 'react'
import {
  readHostDiningTimerDurationPolicy,
  writeHostDiningTimerDurationPolicy,
} from '../../lib/hostDiningTimer'
import { resolveSupplierOrderVenueName } from '../../lib/stockOrderSend'
import { t } from '../../i18n/i18n'

export function HostSettingsPanel({
  profile = {},
  workspace = null,
  workspaceProfile = {},
  membership = null,
  onClose,
  onSignOut,
}) {
  const [timerPolicy, setTimerPolicy] = useState(() => readHostDiningTimerDurationPolicy())
  const country = findPhoneCountryByIso2(workspaceProfile.countryCode)
  const phoneDefault = workspaceProfile.defaultPhoneCountryCode || country?.code || ''
  const venueName = resolveSupplierOrderVenueName(
    workspace?.name,
    workspaceProfile.businessName,
    membership?.workspaceName,
    membership?.workspace?.name,
  )

  return (
    <div className="host-settings-panel" role="dialog" aria-modal="true" aria-labelledby="host-settings-title">
      <header className="host-settings-header">
        <h2 id="host-settings-title">{t("Host settings")}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t("Close settings")}>
          ✕
        </button>
      </header>

      <div className="host-settings-scroll">
        <section className="host-settings-section">
          <h3>{t("Profile")}</h3>
          <p><strong>{profile.name || 'Host user'}</strong></p>
          {profile.email ? <p>{profile.email}</p> : null}
          {profile.phone ? <p>{profile.phone}</p> : null}
          {membership?.employeeName ? <p>Linked employee: {membership.employeeName}</p> : null}
        </section>

        <section className="host-settings-section">
          <h3>{t("Venue")}</h3>
          <p>{venueName || '—'}</p>
          {workspaceProfile.city || workspaceProfile.countryName ? (
            <p>
              {[workspaceProfile.city, workspaceProfile.countryName].filter(Boolean).join(', ')}
            </p>
          ) : null}
          {workspaceProfile.timezone ? <p>Timezone: {workspaceProfile.timezone}</p> : null}
          {phoneDefault ? <p>Default phone: {phoneDefault}</p> : null}
        </section>

        <section className="host-settings-section" data-testid="host-dining-timer-settings">
          <h3>{t("Table timers")}</h3>
          <p>{t("Saved on this device until a venue-wide setting is approved.")}</p>
          <label>
            {t("Dinner minutes")}
            <input
              type="number"
              min="15"
              max="1440"
              value={timerPolicy.dinner}
              data-testid="host-timer-dinner-minutes"
              onChange={(event) => {
                setTimerPolicy(writeHostDiningTimerDurationPolicy({
                  ...timerPolicy,
                  dinner: event.target.value,
                }))
              }}
            />
          </label>
          <label>
            {t("Drinks minutes")}
            <input
              type="number"
              min="15"
              max="1440"
              value={timerPolicy.drinks}
              data-testid="host-timer-drinks-minutes"
              onChange={(event) => {
                setTimerPolicy(writeHostDiningTimerDurationPolicy({
                  ...timerPolicy,
                  drinks: event.target.value,
                }))
              }}
            />
          </label>
        </section>
      </div>

      <footer className="host-settings-footer">
        <button type="button" className="host-settings-signout" onClick={onSignOut}>
          {t("Sign out")}
        </button>
      </footer>
    </div>
  )
}
