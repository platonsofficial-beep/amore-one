import { formatPublicBookingWhen, seatingEndNotice } from './publicBooking.js'
import { venueContactLines } from './venueContact.js'

function escapeHtml(value) {
  return `${value ?? ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function publicConfirmUrl(slug, token) {
  return `https://app.onehospitality.app/book/${slug}/confirm?token=${encodeURIComponent(token)}`
}

export function buildPublicBookingEmail({
  kind = 'received',
  locale = 'en',
  venueName = '',
  guestName = '',
  date = '',
  time = '',
  party = 1,
  seatingName = '',
  startTime = '',
  endTime = '',
  areaLabel = '',
  smoking = false,
  confirmationMethod = 'instant',
  slug = '',
  token = '',
  venuePhone = '',
  contactEmail = '',
  venueAddress = '',
  city = '',
  countryName = '',
} = {}) {
  const el = locale === 'el'
  const venue = escapeHtml(venueName || 'ONE')
  const guest = escapeHtml(guestName)
  const when = escapeHtml(formatPublicBookingWhen(date, time, el ? 'el' : 'en'))
  const area = escapeHtml(areaLabel)
  const smokingLabel = smoking
    ? (el ? 'Καπνιστές' : 'Smoking')
    : (el ? 'Μη καπνιστές' : 'Non-smoking')
  const confirmUrl = token ? publicConfirmUrl(slug, token) : ''
  const hold = escapeHtml(seatingEndNotice(startTime, endTime, el ? 'el' : 'en'))
  const title = kind === 'reminder'
    ? (el ? 'Επιβεβαιώστε την κράτηση' : 'Confirm your reservation')
    : confirmationMethod === 'instant'
      ? (el ? 'Η κράτηση επιβεβαιώθηκε' : 'Your reservation is confirmed')
      : (el ? 'Λάβαμε την κράτηση' : 'We received your reservation')
  const intro = kind === 'reminder'
    ? (el
      ? 'Η κράτηση μένει σε εκκρεμότητα μέχρι να την επιβεβαιώσετε ή να την ακυρώσετε.'
      : 'This reservation stays pending until you confirm or cancel it.')
    : confirmationMethod === 'venue_call'
      ? (el ? 'Το μαγαζί θα σας καλέσει για επιβεβαίωση.' : 'The venue will call you to confirm.')
      : confirmationMethod === 'email'
        ? (el ? 'Θα σας στείλουμε υπενθύμιση για να επιβεβαιώσετε.' : 'We will email you before the booking so you can confirm.')
        : (el ? 'Σας περιμένουμε.' : 'We look forward to seeing you.')
  const contact = venueContactLines({
    phone: venuePhone,
    email: contactEmail,
    address: venueAddress,
    city,
    country: countryName,
  })
  const contactItems = [
    contact.telHref ? `<a href="${escapeHtml(contact.telHref)}" style="color:#f3d27a;text-decoration:underline;">${escapeHtml(contact.phone)}</a>` : '',
    contact.mailHref ? `<a href="${escapeHtml(contact.mailHref)}" style="color:#f3d27a;text-decoration:underline;">${escapeHtml(contact.email)}</a>` : '',
    contact.mapHref ? `<a href="${escapeHtml(contact.mapHref)}" style="color:#f3d27a;text-decoration:underline;">${escapeHtml(contact.address)}</a>` : '',
  ].filter(Boolean)
  const contactHtml = contactItems.length
    ? `<p style="margin:16px 0 0;font-family:Arial, sans-serif;font-size:15px;line-height:1.6;">${contactItems.join('<br>')}</p>`
    : ''
  const actions = kind === 'reminder' && confirmUrl
    ? `<p style="margin:24px 0;">
        <a href="${escapeHtml(`${confirmUrl}&action=confirm`)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border-radius:999px;background:#d4af37;color:#0a1628;font-weight:700;text-decoration:none;">${el ? 'Επιβεβαίωση' : 'Confirm'}</a>
        <a href="${escapeHtml(`${confirmUrl}&action=cancel`)}" style="display:inline-block;margin:0 0 8px;padding:12px 18px;border-radius:999px;background:#18283d;color:#f7f4ee;font-weight:700;text-decoration:none;">${el ? 'Ακύρωση' : 'Cancel'}</a>
      </p>`
    : ''

  const html = `<!doctype html>
<html lang="${el ? 'el' : 'en'}">
  <body style="margin:0;background:#0a1628;color:#f7f4ee;font-family:Inter, Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1628;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:480px;background:#122033;border-radius:16px;padding:28px 24px;">
          <tr><td>
            <p style="margin:0 0 8px;color:#f3d27a;letter-spacing:0.14em;font-size:12px;">${venue}</p>
            <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;font-family:Inter, Arial, Helvetica, sans-serif;">${title}</h1>
            <p style="margin:0 0 18px;color:#a9c0d6;font-family:Arial, sans-serif;font-size:15px;line-height:1.5;">${guest ? `${guest}, ` : ''}${intro}</p>
            <p style="margin:0;font-family:Arial, sans-serif;font-size:16px;"><strong>${when}</strong><br>${seatingName ? `${escapeHtml(seatingName)} · ` : ''}${escapeHtml(String(party))} · ${area}${area ? ` · ${smokingLabel}` : ''}${hold ? `<br>${hold}` : ''}</p>
            ${contactHtml}
            ${actions}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`

  return { subject: title, html }
}
