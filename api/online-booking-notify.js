import { sendBookingEmail, supabaseRpc } from './online-booking-mail.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false })
    return
  }
  const id = `${req.body?.id ?? ''}`
  const token = `${req.body?.token ?? ''}`
  if (!id || !token) {
    res.status(400).json({ ok: false })
    return
  }
  try {
    const payload = await supabaseRpc('public_booking_email_payload', { p_id: id, p_token: token })
    if (!payload?.ok) {
      res.status(202).json({ ok: true })
      return
    }
    await sendBookingEmail(payload, { kind: 'received' })
    await supabaseRpc('mark_public_booking_email_sent', { p_id: id, p_token: token })
    res.status(200).json({ ok: true })
  } catch {
    res.status(503).json({ ok: false })
  }
}
