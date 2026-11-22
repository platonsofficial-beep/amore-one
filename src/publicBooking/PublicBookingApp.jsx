import { useEffect, useMemo, useState } from 'react'
import { useLocale } from '../i18n/i18n'
import { isLastSeatingOfDay, listBookableDateKeys, suggestBookingAlternatives } from '../lib/publicBooking'
import {
  confirmPublicReservation,
  createPublicReservation,
  fetchPublicAvailability,
  fetchPublicBookingInfo,
} from '../services/publicBookingService'
import { PublicBookingView } from './PublicBookingView'
import './publicBooking.css'

const STEPS = ['date', 'party', 'time', 'area', 'details']

export function PublicBookingApp({
  slug,
  confirm = false,
  token = '',
  preview = null,
}) {
  useLocale()
  const [info, setInfo] = useState(preview?.info ?? null)
  const [phase, setPhase] = useState(preview?.phase ?? (preview ? 'book' : 'loading'))
  const [step, setStep] = useState(preview?.step ?? 'date')
  const [date, setDate] = useState(preview?.date ?? '')
  const [party, setParty] = useState(preview?.party ?? 2)
  const [times, setTimes] = useState(preview?.times ?? [])
  const [timesReady, setTimesReady] = useState(preview ? true : false)
  const [seatingId, setSeatingId] = useState(preview?.seatingId ?? '')
  const [arrival, setArrival] = useState(preview?.arrival ?? '')
  const [startTime, setStartTime] = useState(preview?.startTime ?? '')
  const [endTime, setEndTime] = useState(preview?.endTime ?? '')
  const [seatingName, setSeatingName] = useState(preview?.seatingName ?? '')
  const [areaId, setAreaId] = useState(preview?.areaId ?? '')
  const [form, setForm] = useState(preview?.form ?? { dial: '' })
  const [error, setError] = useState(preview?.error ?? '')
  const [fullNotice, setFullNotice] = useState(Boolean(preview?.showFull))
  const [upcomingCards, setUpcomingCards] = useState(preview?.upcoming ?? [])
  const [result, setResult] = useState(preview?.result ?? null)
  const [confirmState, setConfirmState] = useState(preview?.confirm ?? null)

  useEffect(() => {
    if (preview) return undefined
    let cancelled = false
    fetchPublicBookingInfo(slug)
      .then((next) => {
        if (cancelled) return
        setInfo(next?.ok ? next : { ...next, venuePhone: next?.venuePhone })
        setPhase(next?.ok ? (confirm ? 'confirm' : 'book') : 'unavailable')
        if (next?.ok) {
          const dates = listBookableDateKeys({
            timeZone: next.timeZone,
            bookingWindowDays: next.bookingWindowDays,
          })
          setDate(dates[0] || '')
          setForm((current) => ({ ...current, dial: next.phoneCountryCode || current.dial }))
        }
      })
      .catch(() => {
        if (!cancelled) setPhase('unavailable')
      })
    return () => { cancelled = true }
  }, [slug, confirm, preview])

  useEffect(() => {
    if (preview || phase !== 'book' || !date || party > (info?.maxPartySize || 8)) return undefined
    let cancelled = false
    setTimesReady(false)
    fetchPublicAvailability(slug, date, party)
      .then((next) => {
        if (cancelled) return
        setTimes(next?.ok ? (next.seatings || next.times || []) : [])
        setTimesReady(true)
      })
      .catch(() => {
        if (!cancelled) {
          setTimes([])
          setTimesReady(true)
        }
      })
    return () => { cancelled = true }
  }, [slug, date, party, phase, info?.maxPartySize, preview])

  const dates = useMemo(() => (
    preview?.dates || listBookableDateKeys({
      timeZone: info?.timeZone,
      bookingWindowDays: info?.bookingWindowDays ?? 30,
    })
  ), [preview, info])

  const selectedCard = times.find((slot) => slot.seatingId === seatingId)
  const showFull = fullNotice || error === 'full' || selectedCard?.state === 'full'
  const suggestions = useMemo(() => suggestBookingAlternatives({
    dayCards: times,
    chosenSeatingId: seatingId,
    areaId,
    upcoming: upcomingCards,
  }), [times, seatingId, areaId, upcomingCards])

  useEffect(() => {
    if (preview || !showFull || suggestions.seatings.length > 0) return undefined
    const future = dates.filter((day) => day > date).slice(0, 6)
    if (!future.length) return undefined
    let cancelled = false
    Promise.all(future.map(async (day) => {
      const next = await fetchPublicAvailability(slug, day, party)
      return { date: day, cards: next?.seatings || next?.times || [] }
    })).then((rows) => {
      if (!cancelled) setUpcomingCards(rows)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [preview, showFull, suggestions.seatings.length, dates, date, party, slug])

  const goNext = () => {
    if (step === 'party' && party > (info?.maxPartySize || 8)) {
      setStep('call')
      return
    }
    const index = STEPS.indexOf(step)
    if (index >= 0 && index < STEPS.length - 1) setStep(STEPS[index + 1])
  }

  const goBack = () => {
    if (step === 'call') {
      setStep('party')
      return
    }
    const index = STEPS.indexOf(step)
    if (index > 0) setStep(STEPS[index - 1])
  }

  const submit = async () => {
    setError('')
    if (!form.understand) {
      setError('understand')
      return
    }
    const firstName = `${form.firstName || ''}`.trim()
    const lastName = `${form.lastName || ''}`.trim()
    if (!firstName || !lastName) {
      setError('name')
      return
    }
    const phone = `${form.dial || ''}${form.localPhone || ''}`.replace(/[^\d+]/g, '')
    const response = await createPublicReservation(slug, {
      date,
      party,
      time: arrival,
      seatingId,
      areaId,
      name: `${firstName} ${lastName}`,
      phone,
      email: form.email,
      note: form.note,
      consent: form.consent,
      understand: form.understand,
      honeypot: form.honeypot,
    })
    if (!response?.ok) {
      setError(response?.reason || 'unavailable')
      if (response?.reason === 'full') {
        setFullNotice(true)
        setStep('time')
        const fresh = await fetchPublicAvailability(slug, date, party).catch(() => null)
        if (fresh?.ok) setTimes(fresh.seatings || fresh.times || [])
      }
      return
    }
    const card = times.find((slot) => slot.seatingId === seatingId)
    const area = card?.areas?.find((entry) => entry.id === areaId)
    if (response.ignored) {
      setResult({
        confirmationMethod: info?.confirmationMethod,
        date,
        time: arrival,
        seatingName,
        startTime: card?.startTime || startTime,
        endTime,
        lastSeating: isLastSeatingOfDay(times, times.find((slot) => slot.seatingId === seatingId)),
        party,
        areaLabel: area?.label,
        smoking: area?.smoking,
      })
    } else {
      setResult({
        ...response,
        seatingName: response.seatingName || seatingName,
        startTime: response.startTime || card?.startTime || startTime,
        endTime: response.endTime || endTime,
        lastSeating: isLastSeatingOfDay(times, times.find((slot) => slot.seatingId === (response.seatingId || seatingId))),
        time: response.time || arrival,
      })
    }
    setPhase('done')
  }

  const chooseConfirm = async (action) => {
    const response = await confirmPublicReservation(slug, token, action)
    setConfirmState(response?.ok ? response : { reason: response?.reason || 'invalid' })
  }

  return (
    <PublicBookingView
      phase={phase}
      info={info}
      step={step === 'party' && party > (info?.maxPartySize || 8) ? 'call' : step}
      dates={dates}
      date={date}
      party={party}
      times={times}
      timesReady={timesReady}
      seatingId={seatingId}
      arrival={arrival}
      endTime={endTime}
      areaId={areaId}
      form={form}
      error={error}
      result={result}
      confirm={confirmState}
      onDate={(next) => { setDate(next); setSeatingId(''); setAreaId('') }}
      onParty={(next) => { setParty(next); setSeatingId(''); setAreaId(''); setStep(next > (info?.maxPartySize || 8) ? 'call' : 'party') }}
      onTime={(slot) => {
        setSeatingId(slot.seatingId)
        setArrival(slot.startTime || slot.slots?.[0] || '')
        setStartTime(slot.startTime || '')
        setEndTime(slot.endTime || '')
        setSeatingName(slot.name || '')
        setFullNotice(slot.state === 'full')
        if (slot.state === 'full') setError('full')
        else setError('')
      }}
      onArrival={(choice) => {
        const card = times.find((slot) => slot.seatingId === choice.seatingId)
        setSeatingId(choice.seatingId || '')
        setArrival(choice.time || '')
        setStartTime(choice.startTime || card?.startTime || '')
        setEndTime(choice.endTime || card?.endTime || '')
        setSeatingName(choice.seatingName || card?.name || '')
        setAreaId('')
      }}
      onArea={(area) => { setAreaId(area.id); setStep('details') }}
      onForm={(patch) => setForm((current) => ({ ...current, ...patch }))}
      onBack={goBack}
      onNext={goNext}
      onTryDate={() => setStep('date')}
      showFull={showFull}
      suggestions={suggestions}
      onPickAlternative={(slot) => {
        const keepsArea = (slot.areas ?? []).some((area) => area.id === areaId)
        setSeatingId(slot.seatingId)
        setSeatingName(slot.name || '')
        setStartTime(slot.startTime || '')
        setEndTime(slot.endTime || '')
        setArrival(slot.slots?.[0] || '')
        setFullNotice(false)
        setError('')
        if (!keepsArea) setAreaId('')
        setStep(keepsArea && areaId ? 'details' : 'area')
      }}
      onPickSuggestedDate={(next) => {
        setDate(next)
        setSeatingId('')
        setArrival('')
        setFullNotice(false)
        setError('')
        setUpcomingCards([])
        setStep('time')
      }}
      onSubmit={submit}
      onConfirmChoice={chooseConfirm}
    />
  )
}
