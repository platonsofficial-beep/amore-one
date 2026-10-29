import { useEffect, useState } from 'react'
import {
  DEFAULT_LATE_GRACE_MINUTES,
  DEFAULT_RADIUS_M,
  RADIUS_CHOICES_M,
  attendanceErrorMessage,
  validateVenueSettings,
} from '../../lib/attendance'
import { readCurrentPositionWithNotice } from '../../lib/attendanceLocation'
import { loadAttendanceSettings, setAttendanceSettings } from '../../services/attendanceService'

export function VenueClockSettings({
  workspaceId = '',
  timeZone = 'Europe/Nicosia',
}) {
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [radiusM, setRadiusM] = useState(String(DEFAULT_RADIUS_M))
  const [lateGraceMinutes, setLateGraceMinutes] = useState(String(DEFAULT_LATE_GRACE_MINUTES))
  const [requireLocation, setRequireLocation] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!`${workspaceId ?? ''}`.trim()) return undefined
    loadAttendanceSettings(workspaceId)
      .then((settings) => {
        if (cancelled || !settings) return
        setLat(settings.venue_lat == null ? '' : String(settings.venue_lat))
        setLng(settings.venue_lng == null ? '' : String(settings.venue_lng))
        setRadiusM(String(settings.radius_m ?? DEFAULT_RADIUS_M))
        setLateGraceMinutes(String(settings.late_grace_minutes ?? DEFAULT_LATE_GRACE_MINUTES))
        setRequireLocation(settings.require_location !== false)
      })
      .catch((loadError) => {
        if (!cancelled) setError(attendanceErrorMessage(loadError))
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  async function useMyLocation() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const position = await readCurrentPositionWithNotice()
      if (position.lat == null || position.lng == null) {
        setError('We could not read this device’s location.')
        return
      }
      setLat(String(position.lat))
      setLng(String(position.lng))
      setMessage('Location filled in. Save to keep it as the venue.')
    } catch (locationError) {
      setError(locationError?.code === 'no_location'
        ? 'Location is off. Turn it on in Settings > Safari/Chrome > Location, or type the latitude and longitude.'
        : 'We could not read this device’s location. Type the latitude and longitude.')
    } finally {
      setBusy(false)
    }
  }

  async function save(event) {
    event.preventDefault()
    const validation = validateVenueSettings({
      lat,
      lng,
      radiusM: Number(radiusM),
      lateGraceMinutes: Number(lateGraceMinutes),
    })
    if (!validation.ok) {
      setError(validation.message)
      setMessage('')
      return
    }
    setBusy(true)
    setError('')
    try {
      await setAttendanceSettings({
        workspaceId,
        lat: validation.lat,
        lng: validation.lng,
        radiusM: validation.radiusM,
        lateGraceMinutes: validation.lateGraceMinutes,
        requireLocation,
        timezone: timeZone || null,
      })
      setMessage(validation.lat == null
        ? 'Saved. Venue location is still not set.'
        : 'Venue location saved.')
    } catch (saveError) {
      setError(attendanceErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="attendance-venue" onSubmit={save} aria-label="Venue location">
      <h4 className="workspace-venue-card-title">
        <span className="workspace-section-icon" aria-hidden="true">📍</span>
        Venue location
      </h4>
      <p className="workspace-section-subtitle">
        Used only when someone clocks in or out. The phone’s exact location is not saved.
      </p>
      <div className="attendance-venue-actions">
        <button type="button" className="attendance-action attendance-action-in" onClick={useMyLocation} disabled={busy}>
          📍 Use my current location
        </button>
      </div>
      <div className="attendance-venue-grid">
        <label className="attendance-field">
          Latitude
          <input inputMode="decimal" value={lat} onChange={(event) => setLat(event.target.value)} placeholder="35.1856" />
        </label>
        <label className="attendance-field">
          Longitude
          <input inputMode="decimal" value={lng} onChange={(event) => setLng(event.target.value)} placeholder="33.3823" />
        </label>
      </div>
      <fieldset className="attendance-radius">
        <legend>Radius</legend>
        <div className="attendance-person-row">
          {RADIUS_CHOICES_M.map((choice) => (
            <button
              key={choice}
              type="button"
              className={`attendance-choice${Number(radiusM) === choice ? ' is-selected' : ''}`}
              onClick={() => setRadiusM(String(choice))}
            >
              {choice} m
            </button>
          ))}
        </div>
        <label className="attendance-field">
          Metres (25–1000)
          <input
            inputMode="numeric"
            value={radiusM}
            onChange={(event) => setRadiusM(event.target.value.replace(/[^\d]/g, ''))}
          />
        </label>
      </fieldset>
      <label className="attendance-field">
        Late grace (minutes)
        <input
          inputMode="numeric"
          value={lateGraceMinutes}
          onChange={(event) => setLateGraceMinutes(event.target.value.replace(/[^\d]/g, ''))}
        />
      </label>
      <label className="attendance-toggle">
        <input
          type="checkbox"
          checked={requireLocation}
          onChange={(event) => setRequireLocation(event.target.checked)}
        />
        Require location for clock in
      </label>
      {message ? <p className="attendance-clock-message" role="status">{message}</p> : null}
      {error ? <p className="attendance-clock-banner is-alert" role="alert">{error}</p> : null}
      <button type="submit" className="attendance-action attendance-action-in" disabled={busy}>
        Save venue location
      </button>
    </form>
  )
}
