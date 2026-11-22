import { sendBookingEmail, supabaseRpc } from './online-booking-mail.js'

// Called on a schedule. Hobby Vercel allows only one cron run per day, so the
// 15-minute expression is not in vercel.json. On Pro, schedule
// GET /api/online-booking-reminders as */15 * * * * with
// Authorization: Bearer CRON_SECRET.
// Requires CRON_SECRET, RESEND_API_KEY, ONLINE_BOOKING_FROM_EMAIL,
// SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY.
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ ok: false })
    return
  }
  const secret = process.env.CRON_SECRET
  const header = `${req.headers.authorization ?? ''}`
  if (!secret || header !== `Bearer ${secret}`) {
    res.status(401).json({ ok: false })
    return
  }
  try {
    const due = await supabaseRpc('claim_public_booking_reminders', {})
    const rows = Array.isArray(due) ? due : []
    let sent = 0
    for (const row of rows) {
      try {
        await sendBookingEmail(row, { kind: 'reminder' })
        sent += 1
      } catch {
        await supabaseRpc('release_public_booking_reminder', { p_id: row.id }).catch(() => {})
      }
    }
    res.status(200).json({ ok: true, sent })
  } catch {
    res.status(503).json({ ok: false })
  }
}
