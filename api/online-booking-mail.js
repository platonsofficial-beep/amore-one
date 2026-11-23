import { buildPublicBookingEmail } from '../src/lib/publicBookingEmail.js'

function serviceHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }
}

export async function supabaseRpc(name, args) {
  const base = `${process.env.SUPABASE_URL ?? ''}`.replace(/\/$/, '')
  if (!base || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role is not configured.')
  }
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(args),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text.slice(0, 180) || 'Supabase request failed.')
  return text ? JSON.parse(text) : null
}

export async function sendBookingEmail(payload, { kind = 'received', locale = 'en' } = {}) {
  const key = process.env.RESEND_API_KEY
  const from = process.env.ONLINE_BOOKING_FROM_EMAIL
  if (!key || !from) throw new Error('Email is not configured.')
  const mail = buildPublicBookingEmail({
    kind,
    locale: payload.locale || locale,
    venueName: payload.venueName,
    guestName: payload.guestName,
    date: payload.date,
    time: payload.time,
    party: payload.party,
    seatingName: payload.seatingName,
    startTime: payload.startTime,
    endTime: payload.endTime,
    areaLabel: payload.areaLabel,
    smoking: Boolean(payload.smoking),
    confirmationMethod: payload.confirmationMethod,
    slug: payload.slug,
    token: payload.token,
    venuePhone: payload.venuePhone,
    contactEmail: payload.contactEmail,
    venueAddress: payload.venueAddress,
    city: payload.city,
    countryName: payload.countryName,
  })
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [payload.email],
      subject: mail.subject,
      html: mail.html,
    }),
  })
  if (!response.ok) throw new Error('Email could not be sent.')
}
