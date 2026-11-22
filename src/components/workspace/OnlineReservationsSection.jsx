import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import {
  allocatedOnlineCovers,
  commitPublicSlug,
  draftPublicSlug,
  normalizeDailyOnlineCovers,
  normalizeOnlineCapacity,
  onlineBookingUrl,
  slugifyVenueName,
  splitExceedsDailyTotal,
} from '../../lib/onlineBooking'
import { renderBookingSocialImage } from '../../lib/bookingSocialImage'
import { seatingWindow } from '../../lib/publicBooking'
import {
  isOnlineBookingSlugTaken,
  loadOnlineBookingSettings,
  saveOnlineBookingSettings,
} from '../../services/onlineBookingService'
import { updateReservationSeating } from '../../services/reservationSeatingService'
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

function seatingRange(seating) {
  const window = seatingWindow(seating)
  if (!window) return seating?.name || ''
  return `${window.startTime}–${window.endTime}`
}

export function OnlineReservationsSection({
  workspaceId = '',
  venueName = '',
  seatings = [],
  onSeatingsSaved,
  previewSettings = null,
}) {
  const [settings, setSettings] = useState(previewSettings)
  const [notice, setNotice] = useState('')
  const [slugDraft, setSlugDraft] = useState(null)
  const [slugHint, setSlugHint] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [qr, setQr] = useState('')
  const [socialFormat, setSocialFormat] = useState('square')
  const [socialPreview, setSocialPreview] = useState('')
  const [caps, setCaps] = useState({})
  const activeSeatings = useMemo(() => (
    (seatings ?? [])
      .filter((seating) => seating && seating.isActive !== false && seating.id)
      .slice()
      .sort((left, right) => `${left.startTime ?? ''}`.localeCompare(`${right.startTime ?? ''}`))
  ), [seatings])

  useEffect(() => {
    if (previewSettings) return undefined
    let cancelled = false
    loadOnlineBookingSettings(workspaceId, venueName)
      .then((next) => { if (!cancelled) setSettings(next) })
      .catch((error) => { if (!cancelled) setNotice(error.message) })
    return () => { cancelled = true }
  }, [workspaceId, venueName, previewSettings])

  useEffect(() => {
    setCaps((current) => {
      const next = {}
      let changed = Object.keys(current).length !== activeSeatings.length
      activeSeatings.forEach((seating) => {
        const value = current[seating.id] ?? (seating.onlineCapacity ?? '')
        next[seating.id] = value
        if (current[seating.id] !== value) changed = true
      })
      return changed ? next : current
    })
  }, [activeSeatings])

  const slug = slugifyVenueName(settings?.slug || venueName)
  const slugField = slugDraft == null ? slug : slugDraft
  const link = onlineBookingUrl(slug)

  useEffect(() => {
    let cancelled = false
    if (!slug) return undefined
    QRCode.toDataURL(link, { margin: 1, width: 320 })
      .then((dataUrl) => { if (!cancelled) setQr(dataUrl) })
      .catch(() => { if (!cancelled) setQr('') })
    return () => { cancelled = true }
  }, [link, slug])

  useEffect(() => {
    let cancelled = false
    renderBookingSocialImage({
      venueName: venueName || slug,
      url: link,
      format: socialFormat,
    })
      .then((dataUrl) => { if (!cancelled) setSocialPreview(dataUrl) })
      .catch(() => { if (!cancelled) setSocialPreview('') })
    return () => { cancelled = true }
  }, [venueName, slug, link, socialFormat])

  const update = (patch) => setSettings((current) => ({ ...current, ...patch }))

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setNotice(t("Link copied."))
    } catch {
      setNotice(link)
    }
  }

  const downloadFile = (href, filename) => {
    if (!href) return
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = filename
    anchor.click()
  }

  const downloadQr = () => downloadFile(qr, `${slug}-booking-qr.png`)
  const downloadSocial = () => downloadFile(socialPreview, `${slug}-booking-${socialFormat}.png`)

  const capValues = activeSeatings.map((seating) => caps[seating.id])
  const dailyTotal = normalizeDailyOnlineCovers(settings?.dailyOnlineCovers)
  const allocated = allocatedOnlineCovers(capValues)
  const splitOver = splitExceedsDailyTotal(capValues, settings?.dailyOnlineCovers)

  const applySlugDraft = async () => {
    const committed = commitPublicSlug(slugField)
    if (!committed) {
      setSlugHint(t("Enter a link name with at least 3 characters."))
      return slug
    }
    if (committed === slug) {
      setSlugDraft(null)
      setSlugHint('')
      return slug
    }
    let taken = false
    try {
      taken = await isOnlineBookingSlugTaken(committed, workspaceId)
    } catch (error) {
      setSlugHint(error.message)
      return null
    }
    if (taken) {
      setSlugHint(t("This link name is already used."))
      return null
    }
    setSlugDraft(null)
    setSlugHint('')
    update({ slug: committed })
    return committed
  }

  const save = async (event) => {
    event.preventDefault()
    if (splitExceedsDailyTotal(capValues, settings?.dailyOnlineCovers)) {
      setNotice(t("The seating split is over the daily total."))
      return
    }
    const nextSlug = await applySlugDraft()
    if (!nextSlug) return
    setIsSaving(true)
    setNotice('')
    try {
      const saved = await saveOnlineBookingSettings(workspaceId, { ...settings, slug: nextSlug }, venueName)
      setSettings(saved)
      for (const seating of activeSeatings) {
        const nextCap = normalizeOnlineCapacity(caps[seating.id])
        if (nextCap === normalizeOnlineCapacity(seating.onlineCapacity)) continue
        await updateReservationSeating({
          workspaceId,
          id: seating.id,
          seating: { ...seating, onlineCapacity: caps[seating.id] },
        })
      }
      if (onSeatingsSaved) await onSeatingsSaved()
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

  const noticeIsError = splitOver || /used|unable|error|required/i.test(notice)

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
            className={slugHint ? 'online-booking-slug-input is-invalid' : 'online-booking-slug-input'}
            name="booking-public-slug"
            value={slugField}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="text"
            aria-label={t("Public link name")}
            aria-invalid={slugHint ? true : undefined}
            onChange={(event) => {
              setSlugHint('')
              setSlugDraft(draftPublicSlug(event.target.value))
            }}
            onBlur={() => { void applySlugDraft() }}
          />
          {slugHint ? <p className="online-booking-slug-hint" role="alert">{slugHint}</p> : null}
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
          <div className="online-booking-social">
            <div className="online-booking-social-formats" role="group" aria-label={t("Social media image")}>
              {[
                ['square', t("Square post")],
                ['story', t("Story")],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={socialFormat === id ? 'is-selected' : ''}
                  aria-pressed={socialFormat === id}
                  onClick={() => setSocialFormat(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="primary-btn" onClick={downloadSocial} disabled={!socialPreview}>
              {t("Social media image")}
            </button>
            {socialPreview ? (
              <img
                className={`online-booking-social-preview${socialFormat === 'story' ? ' is-story' : ''}`}
                src={socialPreview}
                alt={t("Social image preview")}
              />
            ) : null}
          </div>
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

        <label className="form-field">
          <span>{t("Total online covers per day")}</span>
          <input
            type="number"
            min="1"
            max="9999"
            inputMode="numeric"
            value={settings.dailyOnlineCovers ?? ''}
            aria-label={t("Total online covers per day")}
            onChange={(event) => update({ dailyOnlineCovers: event.target.value })}
          />
        </label>

        <div className="online-booking-split">
          <p className="workspace-section-subtitle">{t("Split that total across the seatings.")}</p>
          {activeSeatings.length === 0 ? (
            <p className="workspace-section-subtitle">{t("Add an active seating to split online covers.")}</p>
          ) : activeSeatings.map((seating) => {
            const label = seatingRange(seating)
            return (
              <label key={seating.id} className="online-booking-split-row">
                <span>
                  <strong>{label}</strong>
                  {seating.name ? <small>{seating.name}</small> : null}
                </span>
                <input
                  type="number"
                  min="1"
                  max="9999"
                  inputMode="numeric"
                  value={caps[seating.id] ?? ''}
                  aria-label={t("Online covers for {{window}}", { window: label })}
                  onChange={(event) => setCaps((current) => ({ ...current, [seating.id]: event.target.value }))}
                />
              </label>
            )
          })}
          <p
            className={`online-booking-allocated${splitOver ? ' is-over' : ''}`}
            role="status"
            data-step="allocated"
          >
            {dailyTotal == null
              ? t("Allocated {{used}}", { used: allocated })
              : t("Allocated {{used}} of {{total}}", { used: allocated, total: dailyTotal })}
          </p>
          {splitOver ? (
            <p className="online-booking-allocated is-over" role="alert">
              {t("The seating split is over the daily total.")}
            </p>
          ) : null}
        </div>

        {notice ? (
          <div className={`staff-status-banner${noticeIsError ? ' auth-banner-error' : ''}`} role="status">
            {notice}
          </div>
        ) : null}

        <div className="online-booking-actions">
          <button type="submit" className="primary-btn" disabled={isSaving || splitOver}>
            {isSaving ? t("Saving…") : t("Save online reservations")}
          </button>
        </div>
      </form>
    </section>
  )
}
