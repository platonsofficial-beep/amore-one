import { PhoneCountryPicker } from '../components/reservations/PhoneCountryPicker'
import { findPhoneCountryByIso2 } from '../lib/phoneCountries'
import {
  arrivalHourOptions,
  arrivalMinuteOptions,
  assignSeatingForArrival,
  confirmationCopyKey,
  formatPublicBookingWhen,
  isLastSeatingOfDay,
  seatingContainsTime,
  seatingWindow,
} from '../lib/publicBooking'
import { getLocale, setLocale, t } from '../i18n/i18n'
import { venueContactLines } from '../lib/venueContact'

function formatDateChip(dateKey, timeZone) {
  const at = new Date(`${dateKey}T12:00:00Z`)
  try {
    const parts = new Intl.DateTimeFormat(getLocale() === 'el' ? 'el-GR' : 'en-GB', {
      timeZone: timeZone || 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).formatToParts(at)
    const value = (type) => parts.find((part) => part.type === type)?.value || ''
    return { weekday: value('weekday'), day: value('day'), month: value('month') }
  } catch {
    return { weekday: '', day: dateKey, month: '' }
  }
}

function AreaIcon({ smoking }) {
  if (smoking) {
    return (
      <svg className="public-booking-chip-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M3 15h11v3H3zm12 0h2.2c.5 0 .8.4.8 1s-.3 1-.8 1H15zm3.2-5.2c1.4 0 2.6 1.2 2.6 2.7V15h-2v-2.2c0-.5-.4-.8-.8-.8-.5 0-.8.4-.8.9V15h-2v-2.6c0-1.4 1.2-2.6 2.6-2.6z" />
      </svg>
    )
  }
  return (
    <svg className="public-booking-chip-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M7.5 16.5 L16.5 7.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

function AreaChip({ smoking }) {
  return (
    <span className={`public-booking-chip${smoking ? ' is-smoking' : ''}`}>
      <AreaIcon smoking={smoking} />
      {smoking ? t('Smoking section') : t('Non-smoking section')}
    </span>
  )
}

function SeatingEndNotice({ start, end, last = false }) {
  if (last || !start || !end) return null
  return (
    <p className="public-booking-end-notice" data-step="end-notice">
      {t('Your booking is for the {{window}} seating. Please have the table free by {{end}} for the next guests.', {
        window: `${start}–${end}`,
        end,
      })}
    </p>
  )
}

function BookingSummary({
  venue,
  date,
  time,
  party,
  areaLabel,
  smoking,
  status,
  timeZone,
  seatingName = '',
  startTime = '',
  endTime = '',
  lastSeating = false,
}) {
  const confirmed = status === 'Confirmed'
  return (
    <div className="public-booking-summary-card">
      <p className="public-booking-summary-venue">{venue}</p>
      <p className="public-booking-summary-when">{formatPublicBookingWhen(date, time, getLocale(), timeZone)}</p>
      {seatingName ? <p>{seatingName}</p> : null}
      <SeatingEndNotice start={startTime} end={endTime} last={lastSeating} />
      <p>{t('{{count}} guest', { count: party || 0 })}</p>
      {areaLabel ? <p>{areaLabel}</p> : null}
      <AreaChip smoking={smoking} />
      <span className={`public-booking-status-pill${confirmed ? ' is-confirmed' : ''}`}>
        {confirmed ? t('Confirmed') : t('To confirm')}
      </span>
    </div>
  )
}

function reasonText(reason, maxParty) {
  if (reason === 'email') return t('Enter an email address so we can confirm the reservation.')
  if (reason === 'phone') return t('Enter a phone number.')
  if (reason === 'consent') return t('Please agree so the venue can handle the reservation.')
  if (reason === 'understand') return t('Please confirm that you understand when the table must be free.')
  if (reason === 'name') return t('Enter a first name and a last name.')
  if (reason === 'time') return t('Choose an arrival time during this seating.')
  if (reason === 'area') return t('Choose an area that is open for online booking.')
  if (reason === 'full') return t('This seating is full')
  if (reason === 'rate') return t('Please wait a few minutes and try again.')
  if (reason === 'call_us') return t('Parties larger than {{count}} should call the venue.', { count: maxParty })
  return t('Online reservations are not available right now.')
}

function VenueContact({ info }) {
  const lines = venueContactLines({
    phone: info?.venuePhone,
    email: info?.contactEmail,
    address: info?.venueAddress,
    city: info?.city,
    country: info?.countryName,
    lat: info?.venueLat,
    lng: info?.venueLng,
    mapsUrl: info?.mapsUrl,
  })
  if (!lines.phone && !lines.email && !lines.address && !lines.mapHref) return null
  return (
    <div className="public-booking-contact">
      {lines.telHref ? <a href={lines.telHref}>{lines.phone}</a> : null}
      {lines.mailHref ? <a href={lines.mailHref}>{lines.email}</a> : null}
      {lines.address ? <span>{lines.address}</span> : null}
      {lines.mapHref ? (
        <a className="public-booking-directions" href={lines.mapHref} target="_blank" rel="noreferrer">{t('Get directions')}</a>
      ) : null}
    </div>
  )
}

export function PublicBookingView({
  phase = 'book',
  info = null,
  step = 'date',
  dates = [],
  date = '',
  party = 2,
  times = [],
  timesReady = true,
  seatingId = '',
  arrival = '',
  endTime = '',
  areaId = '',
  form = {},
  error = '',
  result = null,
  confirm = null,
  onDate,
  onParty,
  onTime,
  onArrival,
  onArea,
  onForm,
  onBack,
  onNext,
  onTryDate,
  showFull = false,
  suggestions = null,
  onPickAlternative,
  onPickSuggestedDate,
  onSubmit,
  onConfirmChoice,
}) {
  const locale = getLocale()
  function chooseDirectTime(value) {
    const assigned = assignSeatingForArrival(times, value)
    if (!assigned.contained || !seatingContainsTime(assigned.seating, value)) return
    const window = seatingWindow(assigned.seating)
    onArrival?.({
      time: value,
      seatingId: assigned.seating?.seatingId || assigned.seating?.id || '',
      startTime: window?.startTime || '',
      endTime: window?.endTime || '',
      seatingName: assigned.seating?.name || '',
      contained: true,
    })
  }
  const selectedCard = (times ?? []).find((slot) => slot.seatingId === seatingId)
  const areaChoices = selectedCard?.areas ?? []
  const lastSeating = isLastSeatingOfDay(times, selectedCard)
  const hourOptions = arrivalHourOptions(selectedCard)
  const minuteOptions = arrivalMinuteOptions(selectedCard, arrival.slice(0, 2) || hourOptions[0])
  const noticeStart = selectedCard?.startTime || ''
  const noticeEnd = selectedCard?.endTime || endTime || ''
  const venue = info?.venueName || t('Reservations')
  const dialDefault = info?.phoneCountryCode
    || findPhoneCountryByIso2(info?.countryCode)?.code
    || '+30'

  return (
    <main className="public-booking">
      <header className="public-booking-top">
        <div className="public-booking-brand">
          {info?.logoUrl ? <img src={info.logoUrl} alt="" /> : <span className="public-booking-mark">{'ONE'}</span>}
          <div>
            <p>{t('Reservations')}</p>
            <h1>{venue}</h1>
          </div>
        </div>
        <div className="public-booking-lang" role="group" aria-label={t('Language')}>
          <button type="button" aria-pressed={locale === 'el'} onClick={() => setLocale('el')}>{'EL'}</button>
          <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>{'EN'}</button>
        </div>
      </header>
      <VenueContact info={info} />

      {phase === 'loading' ? <p className="public-booking-status">{t('Loading online reservations…')}</p> : null}

      {phase === 'unavailable' ? (
        <section className="public-booking-card">
          <h2>{t('Online reservations are not available right now.')}</h2>
          {info?.venuePhone ? (
            <a className="public-booking-primary" href={`tel:${info.venuePhone}`}>{t('Call us')}</a>
          ) : null}
        </section>
      ) : null}

      {phase === 'confirm' ? (
        <section className="public-booking-card" data-step="confirm">
          <h2>{confirm?.status === 'Cancelled' ? t('This reservation is cancelled.') : confirm?.status === 'Confirmed' ? t('This reservation is confirmed.') : t('Confirm reservation')}</h2>
          {confirm?.reason === 'expired' || confirm?.reason === 'invalid' ? (
            <p>{t('This link is no longer valid.')}</p>
          ) : (
            <>
              <BookingSummary
                venue={info?.venueName}
                date={confirm?.date}
                time={confirm?.time}
                party={confirm?.party}
                areaLabel={confirm?.areaLabel}
                smoking={confirm?.smoking}
                status={confirm?.status === 'Confirmed' ? 'Confirmed' : 'Pending'}
                timeZone={info?.timeZone}
                seatingName={confirm?.seatingName}
                startTime={confirm?.startTime}
                endTime={confirm?.endTime}
                lastSeating={Boolean(confirm?.lastSeating)}
              />
              {confirm?.status !== 'Confirmed' && confirm?.status !== 'Cancelled' ? (
                <div className="public-booking-actions">
                  <button type="button" className="public-booking-primary" onClick={() => onConfirmChoice?.('confirm')}>{t('Confirm')}</button>
                  <button type="button" className="public-booking-secondary" onClick={() => onConfirmChoice?.('cancel')}>{t('Cancel')}</button>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {phase === 'done' && result ? (
        <section className="public-booking-card" data-step="done">
          <h2>{t(confirmationCopyKey(result.confirmationMethod || info?.confirmationMethod))}</h2>
          <BookingSummary
            venue={info?.venueName}
            date={result.date}
            time={result.time}
            party={result.party}
            areaLabel={result.areaLabel}
            smoking={result.smoking}
            status={result.status || (result.confirmationMethod === 'instant' ? 'Confirmed' : 'Pending')}
            timeZone={info?.timeZone}
            seatingName={result.seatingName}
            startTime={result.startTime}
            endTime={result.endTime}
            lastSeating={Boolean(result.lastSeating)}
          />
        </section>
      ) : null}

      {phase === 'book' ? (
        <form className="public-booking-card" data-step={step} onSubmit={(event) => { event.preventDefault(); onSubmit?.() }}>
          <p className="public-booking-step">{t('Book a table')}</p>
          {step === 'date' ? (
            <>
              <h2>{t('Choose a date')}</h2>
              <div className="public-booking-dates">
                <div className="public-booking-dates-scroll">
                  {dates.map((key) => {
                    const chip = formatDateChip(key, info?.timeZone)
                    return (
                      <button key={key} type="button" className={key === date ? 'is-selected' : ''} onClick={() => onDate?.(key)}>
                        <span>{chip.weekday}</span>
                        <strong>{chip.day}</strong>
                        <span>{chip.month}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          ) : null}
          {step === 'party' || step === 'call' ? (
            <>
              <h2>{t('Party size')}</h2>
              <div className="public-booking-choice-row">
                {Array.from({ length: Math.max(1, info?.maxPartySize || 8) }, (_, index) => index + 1).map((count) => {
                  return (
                    <button key={count} type="button" className={count === party ? 'is-selected' : ''} onClick={() => onParty?.(count)}>{count}</button>
                  )
                })}
                <button type="button" className={step === 'call' ? 'is-selected' : ''} onClick={() => onParty?.((info?.maxPartySize || 8) + 1)}>
                  {(info?.maxPartySize || 8) + 1}+
                </button>
              </div>
              {step === 'call' ? (
                <div data-step="call">
                  <p>{t('Parties larger than {{count}} should call the venue.', { count: info?.maxPartySize || 8 })}</p>
                  {info?.venuePhone ? <a className="public-booking-primary" href={`tel:${info.venuePhone}`}>{t('Call us')}</a> : null}
                </div>
              ) : null}
            </>
          ) : null}
          {step === 'time' ? (
            <>
              <h2>{t('Choose a seating')}</h2>
              {!timesReady ? <p>{t('Loading online reservations…')}</p> : null}
              {timesReady && times.length === 0 ? <p data-step="empty">{t('No times are available on this day.')}</p> : null}
              <div className="public-booking-stack" data-step="seatings">
                {times.map((slot) => {
                  const stateLabel = slot.state === 'full'
                    ? t('Seating full')
                    : slot.state === 'few'
                      ? t('Few seats left')
                      : t('Available')
                  return (
                    <button
                      key={slot.seatingId}
                      type="button"
                      className={`public-booking-seating${slot.seatingId === seatingId ? ' is-selected' : ''}${slot.state === 'full' ? ' is-full' : ''}`}
                      onClick={function pickSeating() { onTime?.(slot) }}
                    >
                      <span>
                        <strong>{slot.name}</strong>
                        <small>{slot.startTime}–{slot.endTime}</small>
                      </span>
                      <span className={`public-booking-state is-${slot.state || 'available'}`}>{stateLabel}</span>
                    </button>
                  )
                })}
              </div>
              {seatingId ? (
                <>
                  <h2>{t('Arrival time')}</h2>
                  <div className="public-booking-choice-row" data-step="slots">
                    {(times.find((slot) => slot.seatingId === seatingId)?.slots ?? []).map((slotTime) => {
                      return (
                        <button key={slotTime} type="button" className={slotTime === arrival ? 'is-selected' : ''} onClick={function pickSlot() { onArrival?.({ time: slotTime, seatingId }) }}>
                          {slotTime}
                        </button>
                      )
                    })}
                  </div>
                  <label>
                    <span>{t('Or choose a time')}</span>
                <span className="public-booking-phone" data-step="direct-time">
                  <select
                    aria-label={t('Arrival time')}
                    value={hourOptions.includes(arrival.slice(0, 2)) ? arrival.slice(0, 2) : (hourOptions[0] || '')}
                    onChange={function chooseHour(event) {
                      const minutes = arrivalMinuteOptions(selectedCard, event.target.value)
                      const minute = minutes.includes(arrival.slice(3, 5)) ? arrival.slice(3, 5) : (minutes[0] || '00')
                      chooseDirectTime(`${event.target.value}:${minute}`)
                    }}
                  >
                    {hourOptions.map((label) => <option key={label} value={label}>{label}</option>)}
                  </select>
                  <select
                    aria-label={t('Arrival time')}
                    value={minuteOptions.includes(arrival.slice(3, 5)) ? arrival.slice(3, 5) : (minuteOptions[0] || '')}
                    onChange={function chooseMinute(event) {
                      const hour = hourOptions.includes(arrival.slice(0, 2)) ? arrival.slice(0, 2) : (hourOptions[0] || '00')
                      chooseDirectTime(`${hour}:${event.target.value}`)
                    }}
                  >
                    {minuteOptions.map((label) => <option key={label} value={label}>{label}</option>)}
                  </select>
                </span>
              </label>
                </>
              ) : null}
              {noticeStart && noticeEnd && !showFull ? <SeatingEndNotice start={noticeStart} end={noticeEnd} last={lastSeating} /> : null}
              {showFull ? (
                <div data-step="full" className="public-booking-full">
                  <p>{t('This seating is full')}</p>
                  {(suggestions?.seatings ?? []).length > 0 ? (
                    <div className="public-booking-stack">
                      {(suggestions.seatings ?? []).map((slot) => {
                        return (
                          <button key={slot.seatingId} type="button" onClick={function pickAlternative() { onPickAlternative?.(slot) }}>
                            <strong>{slot.name}</strong>
                            <span>{slot.startTime}–{slot.endTime}</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="public-booking-stack">
                      {(suggestions?.dates ?? []).map((day) => {
                        return (
                          <button key={day.date} type="button" onClick={function pickDay() { onPickSuggestedDate?.(day.date) }}>
                            {formatPublicBookingWhen(day.date, '', getLocale(), info?.timeZone)}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {info?.venuePhone ? <a className="public-booking-primary" href={`tel:${info.venuePhone}`}>{t('Call us')}</a> : null}
                </div>
              ) : null}
            </>
          ) : null}
          {step === 'area' ? (
            <>
              <h2>{t('Choose an area')}</h2>
              {areaChoices.length === 0 ? (
                <p data-step="no-areas">{t('No areas are open for online booking.')}</p>
              ) : null}
              <div className="public-booking-stack" data-step="areas">
                {areaChoices.map((area) => {
                  return (
                    <button key={area.id} type="button" className={area.id === areaId ? 'is-selected' : ''} onClick={function pickArea() { onArea?.(area) }}>
                    <strong>{area.label}</strong>
                    <AreaChip smoking={area.smoking} />
                    </button>
                  )
                })}
              </div>
            </>
          ) : null}
          {step === 'details' ? (
            <>
              <h2>{t('Your details')}</h2>
              <label>
                <span>{t('First name')}</span>
                <input value={form.firstName || ''} autoComplete="given-name" onChange={(event) => onForm?.({ firstName: event.target.value })} required />
              </label>
              <label>
                <span>{t('Last name')}</span>
                <input value={form.lastName || ''} autoComplete="family-name" onChange={(event) => onForm?.({ lastName: event.target.value })} required />
              </label>
              <label>
                <span>{t('Phone')}</span>
                <span className="public-booking-phone">
                  <span className="public-booking-country">
                    <PhoneCountryPicker
                      value={form.dial || dialDefault}
                      onChange={(code) => onForm?.({ dial: code })}
                      ariaLabel={t('Phone')}
                    />
                  </span>
                  <input value={form.localPhone || ''} inputMode="tel" autoComplete="tel-national" onChange={(event) => onForm?.({ localPhone: event.target.value })} />
                </span>
              </label>
              <label>
                <span>{t('Email')}{info?.confirmationMethod === 'email' ? '' : ` (${t('Optional')})`}</span>
                <input type="email" value={form.email || ''} autoComplete="email" onChange={(event) => onForm?.({ email: event.target.value })} required={info?.confirmationMethod === 'email'} />
              </label>
              <label>
                <span>{t('Note')}</span>
                <textarea value={form.note || ''} maxLength={500} onChange={(event) => onForm?.({ note: event.target.value })} />
              </label>
              <SeatingEndNotice start={noticeStart} end={noticeEnd} last={lastSeating} />
              <label className="public-booking-consent">
                <input type="checkbox" checked={Boolean(form.consent)} onChange={(event) => onForm?.({ consent: event.target.checked })} />
                <span className="public-booking-check" aria-hidden="true" />
                <span>{t('I agree that the venue may use my name, phone, and email to handle this reservation.')}</span>
              </label>
              <label className="public-booking-consent">
                <input
                  type="checkbox"
                  checked={Boolean(form.understand)}
                  onChange={(event) => onForm?.({ understand: event.target.checked })}
                />
                <span className="public-booking-check" aria-hidden="true" />
                <span>{t('I understand')}</span>
              </label>
              <label className="public-booking-honeypot" aria-hidden="true">
                <span>{'Company'}</span>
                <input tabIndex={-1} autoComplete="off" value={form.honeypot || ''} onChange={(event) => onForm?.({ honeypot: event.target.value })} />
              </label>
            </>
          ) : null}
          {error ? <p className="public-booking-error" role="alert">{reasonText(error, info?.maxPartySize)}</p> : null}
          <div className={`public-booking-actions${step === 'time' && timesReady && times.length === 0 ? ' is-empty' : ''}`}>
            {step !== 'date' ? <button type="button" className="public-booking-secondary" onClick={onBack}>{t('Back')}</button> : null}
            {step === 'time' && timesReady && times.length === 0 ? (
              <>
                <button type="button" className="public-booking-secondary" onClick={onTryDate}>{t('Try another date')}</button>
                {info?.venuePhone ? <a className="public-booking-primary" href={`tel:${info.venuePhone}`}>{t('Call us')}</a> : null}
              </>
            ) : null}
            {step === 'details' ? (
              <button type="submit" className="public-booking-primary" disabled={!form.understand}>{t('Request booking')}</button>
            ) : step === 'area' && (areaChoices.length === 0 || !areaId) ? (
              info?.venuePhone ? <a className="public-booking-primary" href={`tel:${info.venuePhone}`}>{t('Call us')}</a> : null
            ) : step !== 'call' && !(step === 'time' && (timesReady && times.length === 0 || !arrival)) ? (
              <button type="button" className="public-booking-primary" onClick={onNext}>{t('Continue')}</button>
            ) : null}
          </div>
        </form>
      ) : null}
    </main>
  )
}
