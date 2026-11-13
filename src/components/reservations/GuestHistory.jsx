import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  blacklistConfirmState,
  buildGuestDirectory,
  canBlacklistGuest,
  canEditGuestNotes,
  findGuestByPhone,
  searchGuests,
} from '../../lib/guestHistory'
import {
  buildGuestPreviewProfiles,
  buildGuestPreviewReservations,
  readGuestPreview,
} from '../../lib/guestHistoryPreview'
import { loadGuestProfiles, saveGuestProfile, setGuestBlacklist } from '../../services/guestProfileService'
import './guestHistory.css'

function useDebounced(value, delay = 400) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useGuestDirectory({
  workspaceId = '',
  reservations = [],
  countryCode = '+357',
  enabled = true,
  profiles: seedProfiles = [],
} = {}) {
  const preview = readGuestPreview()
  const [remote, setRemote] = useState({ available: false, profiles: [] })
  const [localProfiles, setLocalProfiles] = useState([])

  useEffect(() => {
    if (!enabled || preview || !workspaceId) return undefined
    let cancelled = false
    loadGuestProfiles(workspaceId).then((result) => {
      if (!cancelled) setRemote(result)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, preview, workspaceId])

  const profiles = preview
    ? buildGuestPreviewProfiles()
    : [...remote.profiles, ...localProfiles, ...seedProfiles]
  const sourceReservations = preview ? buildGuestPreviewReservations() : reservations
  const directory = useMemo(
    () => buildGuestDirectory(sourceReservations, profiles, countryCode),
    [sourceReservations, profiles, countryCode],
  )
  const available = Boolean(preview) || remote.available || localProfiles.length > 0

  const remember = (profile) => {
    if (!profile) return
    setLocalProfiles((current) => {
      const rest = current.filter((entry) => entry.phone !== profile.phone)
      return [...rest, profile]
    })
  }

  return {
    directory,
    available,
    preview: Boolean(preview),
    countryCode,
    remember,
    sourceReservations,
  }
}

function GuestStats({ guest }) {
  return (
    <dl className="guest-card-stats">
      <div><dt>Visits</dt><dd>{guest.visits}</dd></div>
      <div><dt>No-shows</dt><dd>{guest.noShows}</dd></div>
      <div><dt>Cancellations</dt><dd>{guest.cancellations}</dd></div>
      <div><dt>Last visit</dt><dd>{guest.lastVisit || '—'}</dd></div>
      <div><dt>Usual party</dt><dd>{guest.usualPartySize || '—'}</dd></div>
      <div><dt>Favourite</dt><dd>{guest.favouriteTables.join(', ') || guest.favouriteArea || '—'}</dd></div>
    </dl>
  )
}

export function GuestPhoneInsight({
  phone = '',
  reservations = [],
  workspaceId = '',
  role = '',
  countryCode = '+357',
  profiles = [],
  lookupDelay = 400,
  onBlockedChange,
}) {
  const debouncedPhone = useDebounced(phone, lookupDelay)
  const directoryState = useGuestDirectory({
    workspaceId,
    reservations,
    countryCode,
    profiles,
    enabled: Boolean(debouncedPhone),
  })
  const guest = findGuestByPhone(directoryState.directory, debouncedPhone, countryCode)
  const confirm = blacklistConfirmState({ ...(guest || {}), role })
  const [notes, setNotes] = useState(guest?.notes || '')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setNotes(guest?.notes || '')
  }, [guest?.phone, guest?.notes])

  useEffect(() => {
    onBlockedChange?.(confirm.blocked)
  }, [confirm.blocked, onBlockedChange])

  if (!guest || (guest.visits + guest.noShows + guest.cancellations === 0 && !guest.blacklisted && !guest.notes)) {
    return null
  }

  const saveNotes = async () => {
    setNotice('')
    try {
      if (directoryState.preview) {
        directoryState.remember({ ...guest, displayName: guest.guestName, notes, phone: guest.phone })
        setNotice('Notes saved.')
        return
      }
      const saved = await saveGuestProfile({
        workspaceId,
        phone: guest.phone,
        notes,
        displayName: guest.guestName,
      })
      directoryState.remember(saved)
      setNotice('Notes saved.')
    } catch (error) {
      setNotice(error?.message || 'Could not save the guest notes.')
    }
  }

  return (
    <section className="guest-card" data-testid="guest-card" aria-label="Guest history">
      {confirm.warning ? <p className="guest-blacklist-warning" role="alert">{confirm.warning}</p> : null}
      <div className="guest-actions">
        <h3>{guest.guestName || guest.phone}</h3>
        {guest.blacklisted ? <span className="guest-blacklist-badge">Blacklisted</span> : null}
      </div>
      {confirm.blocked ? <p>Ask a manager before booking this guest.</p> : null}
      <GuestStats guest={guest} />
      {guest.favouriteArea ? <p>{guest.favouriteArea}</p> : null}
      {guest.notes && !(canEditGuestNotes(role) && directoryState.available) ? <p>{guest.notes}</p> : null}
      {canEditGuestNotes(role) && directoryState.available ? (
        <label>
          Notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
        </label>
      ) : null}
      <div className="guest-actions">
        {canEditGuestNotes(role) && directoryState.available ? (
          <button type="button" onClick={saveNotes}>Save notes</button>
        ) : null}
        {canBlacklistGuest(role) && directoryState.available && !guest.blacklisted ? (
          <button type="button" onClick={() => setDialogOpen(true)}>Blacklist</button>
        ) : null}
        {canBlacklistGuest(role) && directoryState.available && guest.blacklisted ? (
          <button type="button" onClick={async () => {
            const saved = directoryState.preview
              ? { ...guest, blacklisted: false, blacklistReason: '', displayName: guest.guestName }
              : await setGuestBlacklist({ workspaceId, phone: guest.phone, displayName: guest.guestName, blacklisted: false, reason: '' })
            directoryState.remember(saved)
          }}
          >
            Remove blacklist
          </button>
        ) : null}
      </div>
      {notice ? <p role="status">{notice}</p> : null}
      {!directoryState.available ? <p>Notes and blacklist turn on when guest profiles are saved.</p> : null}
      {dialogOpen ? (
        <BlacklistDialog
          guestName={guest.guestName}
          reason={reason}
          onReason={setReason}
          onClose={() => setDialogOpen(false)}
          onSave={async () => {
            const saved = directoryState.preview
              ? { ...guest, phone: guest.phone, displayName: guest.guestName, blacklisted: true, blacklistReason: reason }
              : await setGuestBlacklist({
                workspaceId,
                phone: guest.phone,
                displayName: guest.guestName,
                blacklisted: true,
                reason,
              })
            directoryState.remember(saved)
            setDialogOpen(false)
          }}
        />
      ) : null}
    </section>
  )
}

export function BlacklistDialog({ guestName, reason, onReason, onClose, onSave }) {
  const dialog = (
    <div className="guest-blacklist-dialog-backdrop" role="presentation">
      <div className="guest-blacklist-dialog" role="dialog" aria-modal="true" aria-labelledby="guest-blacklist-title" data-testid="guest-blacklist-dialog">
        <h3 id="guest-blacklist-title">Blacklist {guestName || 'guest'}</h3>
        <label>
          Reason
          <textarea value={reason} onChange={(event) => onReason(event.target.value)} rows={3} />
        </label>
        <div className="guest-actions">
          <button type="button" className="primary-btn" onClick={onSave}>Save blacklist</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
  return createPortal(dialog, document.body)
}

export function GuestDirectory({
  workspaceId = '',
  reservations = [],
  profiles = [],
  role = '',
  countryCode = '+357',
  initialPhone = '',
  startWithBlacklist = false,
  onClose,
}) {
  const directoryState = useGuestDirectory({ workspaceId, reservations, profiles, countryCode })
  const [query, setQuery] = useState('')
  const [selectedPhone, setSelectedPhone] = useState(initialPhone)
  const [dialogOpen, setDialogOpen] = useState(startWithBlacklist)
  const [reason, setReason] = useState('')
  const results = searchGuests(directoryState.directory, query, countryCode)
  const selected = directoryState.directory.find((guest) => guest.phone === selectedPhone) || null

  const sheet = (
    <div className="guest-directory" role="dialog" aria-modal="true" aria-label="Guests" data-testid="guest-directory">
      <div className="guest-directory-card">
        <div className="guest-actions">
          <h2>Guests</h2>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <label>
          Search name or phone
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or phone" />
        </label>
        {selected ? (
          <article>
            <button type="button" onClick={() => setSelectedPhone('')}>Back to list</button>
            <h3>{selected.guestName || selected.phone}</h3>
            <p>{selected.phone}</p>
            {selected.blacklisted ? <span className="guest-blacklist-badge">Blacklisted</span> : null}
            {selected.blacklistReason ? <p className="guest-blacklist-warning">{`Blacklisted guest — ${selected.blacklistReason}`}</p> : null}
            <GuestStats guest={selected} />
            {selected.notes ? <p>{selected.notes}</p> : null}
            <h3>Bookings</h3>
            <ul className="guest-booking-list">
              {selected.bookings.map((booking) => (
                <li key={booking.id}>
                  <span>{booking.date} · {booking.guests} guests · {booking.tableNumber || 'No table'}</span>
                  <span>{booking.status}</span>
                </li>
              ))}
            </ul>
            {canBlacklistGuest(role) && !selected.blacklisted ? (
              <button type="button" onClick={() => setDialogOpen(true)}>Blacklist</button>
            ) : null}
          </article>
        ) : (
          <div className="guest-directory-list">
            {results.map((guest) => (
              <button key={guest.phone} type="button" className="guest-directory-row" onClick={() => setSelectedPhone(guest.phone)}>
                <span>
                  <strong>{guest.guestName || guest.phone}</strong>
                  <br />
                  {guest.phone} · {guest.visits} visits
                </span>
                {guest.blacklisted ? <span className="guest-blacklist-badge">Blacklisted</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>
      {dialogOpen && selected ? (
        <BlacklistDialog
          guestName={selected.guestName}
          reason={reason}
          onReason={setReason}
          onClose={() => setDialogOpen(false)}
          onSave={() => {
            directoryState.remember({
              ...selected,
              displayName: selected.guestName,
              blacklisted: true,
              blacklistReason: reason || 'No reason given',
            })
            setDialogOpen(false)
          }}
        />
      ) : null}
    </div>
  )
  return createPortal(sheet, document.body)
}

export function GuestsButton({ onClick }) {
  return (
    <button type="button" className="guest-history-open" onClick={onClick} data-testid="guests-open">
      Guests
    </button>
  )
}
