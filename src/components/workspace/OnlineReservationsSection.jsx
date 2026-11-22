import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import {
  onlineBookingUrl,
  slugifyVenueName,
} from '../../lib/onlineBooking'
import {
  isOnlineBookingSlugTaken,
  loadOnlineBookingSettings,
  saveOnlineBookingSettings,
} from '../../services/onlineBookingService'
import { t } from '../../i18n/i18n'
import './onlineReservations.css'

function Toggle({ pressed, label, onClick }) {
  return (
    <button
      type="button"
      className={`online-booking-toggle${pressed ? ' is-on' : ''}`}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span>{label}</span>
      <strong>{pressed ? t("Yes") : t("No")}</strong>
    </button>
  )
}

export function OnlineReservationsSection({
  workspaceId = '',
  venueName = '',
}) {
  const [settings, setSettings] = useState(null)
  const [notice, setNotice] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [qr, setQr] = useState('')

  useEffect(() => {
    let cancelled = false
    loadOnlineBookingSettings(workspaceId, venueName)
      .then((next) => { if (!cancelled) setSettings(next) })
      .catch((error) => { if (!cancelled) setNotice(error.message) })
    return () => { cancelled = true }
  }, [workspaceId, venueName])

  const slug = slugifyVenueName(settings?.slug || venueName)
  const link = onlineBookingUrl(slug)

  useEffect(() => {
    let cancelled = false
    if (!slug) return undefined
    QRCode.toDataURL(link, { margin: 1, width: 320 })
      .then((dataUrl) => { if (!cancelled) setQr(dataUrl) })
      .catch(() => { if (!cancelled) setQr('') })
    return () => { cancelled = true }
  }, [link, slug])

  const update = (patch) => setSettings((current) => ({ ...current, ...patch }))

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setNotice(t("Link copied."))
    } catch {
      setNotice(link)
    }
  }

  const downloadQr = () => {
    if (!qr) return
    const anchor = document.createElement('a')
    anchor.href = qr
    anchor.download = `${slug}-booking-qr.png`
    anchor.click()
  }

  const save = async (event) => {
    event.preventDefault()
    setIsSaving(true)
    setNotice('')
    try {
      const taken = await isOnlineBookingSlugTaken(slug, workspaceId)
      if (taken) {
        setNotice(t("This link name is already used."))
        return
      }
      const saved = await saveOnlineBookingSettings(workspaceId, { ...settings, slug }, venueName)
      setSettings(saved)
      setNotice(t("Online reservations saved."))
    } catch (error) {
      setNotice(error.code === 'slug-taken' ? t("This link name is already used.") : error.message)
    } finally {
      setIsSaving(false)
    }
  }

  if (!settings) {
    return <div className="staff-status-banner">{t("Loading online reservations…")}</div>
  }

  const noticeIsError = /used|unable|error|required/i.test(notice)

  return (
    <section className="online-booking-panel" aria-label={t("Online reservations")}>
      <div className="workspace-section-header">
        <div>
          <p className="eyebrow">{t("Reservations")}</p>
          <h3 className="workspace-section-heading">{t("Online reservations")}</h3>
          <p className="workspace-section-subtitle">
            {t("Guests book from a public link. Confirm instantly, after the venue calls, or after the guest confirms by email.")}
          </p>
        </div>
      </div>

      <form className="panel staff-panel workspace-panel employee-form" onSubmit={save}>
        <Toggle
          pressed={settings.enabled}
          label={t("Enable online reservations")}
          onClick={() => update({ enabled: !settings.enabled })}
        />

        <fieldset className="online-booking-methods">
          <legend>{t("Confirmation method")}</legend>
          {[
            ['instant', t("Instant auto-confirm")],
            ['venue_call', t("Venue calls the guest")],
            ['email', t("Email before the booking")],
          ].map(([id, label]) => (
            <label key={id} className={`online-booking-method${settings.confirmationMethod === id ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="confirmation-method"
                checked={settings.confirmationMethod === id}
                onChange={() => update({ confirmationMethod: id })}
              />
              <span>{label}</span>
            </label>
          ))}
          {settings.confirmationMethod === 'email' ? (
            <label className="form-field">
              <span>{t("Hours before the booking")}</span>
              <input
                type="number"
                min="1"
                max="168"
                value={settings.emailConfirmHours}
                onChange={(event) => update({ emailConfirmHours: event.target.value })}
              />
            </label>
          ) : null}
        </fieldset>

        <label className="form-field">
          <span>{t("Public link name")}</span>
          <input
            value={settings.slug}
            onChange={(event) => update({ slug: slugifyVenueName(event.target.value) })}
            aria-label={t("Public link name")}
            required
          />
        </label>

        <div className="online-booking-link-row">
          <a className="online-booking-link" href={link}>{link}</a>
          <button type="button" className="ghost-btn" onClick={copyLink}>{t("Copy link")}</button>
        </div>

        <div className="online-booking-qr">
          {qr ? <img src={qr} alt={t("Booking QR code")} /> : null}
          <button type="button" className="ghost-btn" onClick={downloadQr} disabled={!qr}>
            {t("Download QR code")}
          </button>
        </div>

        <div className="online-booking-grid">
          <label className="form-field">
            <span>{t("Max party size online")}</span>
            <input
              type="number"
              min="1"
              max="100"
              value={settings.maxPartySize}
              onChange={(event) => update({ maxPartySize: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>{t("Days guests can book ahead")}</span>
            <input
              type="number"
              min="1"
              max="365"
              value={settings.bookingWindowDays}
              onChange={(event) => update({ bookingWindowDays: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>{t("Minimum notice (hours)")}</span>
            <input
              type="number"
              min="0"
              max="72"
              value={Math.round(Number(settings.minNoticeMinutes) / 60)}
              onChange={(event) => update({ minNoticeMinutes: Number(event.target.value) * 60 })}
            />
          </label>
          <label className="form-field">
            <span>{t("Venue phone")}</span>
            <input
              type="tel"
              value={settings.venuePhone}
              placeholder={t("Call us")}
              onChange={(event) => update({ venuePhone: event.target.value })}
            />
          </label>
        </div>
        <p className="workspace-section-subtitle">
          {t("Parties larger than the online limit are asked to call the venue.")}
        </p>

        {notice ? (
          <div className={`staff-status-banner${noticeIsError ? ' auth-banner-error' : ''}`} role="status">
            {notice}
          </div>
        ) : null}

        <div className="online-booking-actions">
          <button type="submit" className="primary-btn" disabled={isSaving}>
            {isSaving ? t("Saving…") : t("Save online reservations")}
          </button>
        </div>
      </form>
    </section>
  )
}
